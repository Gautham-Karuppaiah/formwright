// formwright_fill: many form fields in one call. The model gives each field's target and answer; what kind of control
// it is (text box, native or custom dropdown, checkbox, radio group, file input) is read from the page, never taken
// from the model, so a wrong guess about the kind can't send a field down the wrong procedure. Each field is read
// back afterwards and the reply says, per field, what was done and what the field shows now (facts, no verdicts
// beyond "shows what was asked / doesn't / can't tell").
const { READ } = require('./read');

// FORMWRIGHT_FILL_DEBUG=1: each step with its time, to the server's stderr
const DEBUG = process.env.FORMWRIGHT_FILL_DEBUG === '1';
const T0 = Date.now();
const dbg = (...a) => { if (DEBUG) process.stderr.write(`[fill ${((Date.now() - T0) / 1000).toFixed(2)}s] ${a.join(' ')}\n`); };
const ACTION_MS = 3000;     // Playwright's wait for one action (visible, enabled, not covered)
const FIELD_MS = 25000;
const EVAL_MS = 4000;       // one call into the page     // one field, all its steps: past this the batch stops (the field may still be changing)

// ---- page-side helpers (run in the element's own frame) ----

// A label, a wrapper (react-select's container, a .row) or the control itself -> the control to work on.
function CONTROL_OF(el) {
  const C = 'input:not([type=hidden]),select,textarea,[role=combobox],[role=textbox],[role=searchbox],' +
            '[role=spinbutton],[role=checkbox],[role=radio],[role=switch],[contenteditable=true]';
  if (el.tagName === 'LABEL' && el.control) return el.control;
  if (el.matches(C)) return el;
  const role = el.getAttribute('role');
  const choices = el.querySelectorAll('input[type=radio],input[type=checkbox],[role=radio],[role=checkbox]');
  if ((el.tagName === 'FIELDSET' || role === 'radiogroup' || role === 'group') && choices.length > 1) return el;
  const vis = e => e.type === 'file' || !!(e.offsetParent || e.getClientRects().length);
  const inside = [...el.querySelectorAll(C)].filter(vis);
  if (inside.length === 1) return inside[0];
  if (choices.length > 1) return el;
  return inside[0] || el;
}

function KIND(el) {
  const tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase();
  const role = el.getAttribute('role') || '';
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const label = clean((el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(i => i && i !== el.id).map(i => document.getElementById(i)?.innerText || '').join(' ') ||
    (tag === 'fieldset' ? el.querySelector('legend')?.innerText : '') || el.getAttribute('placeholder') || '').slice(0, 80);
  const base = { tag, type, role, label };
  if ((tag === 'input' && (type === 'checkbox' || type === 'radio')) ||
      ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role))
    return { ...base, kind: 'check' };
  if (tag === 'fieldset' || role === 'radiogroup' || role === 'group' ||
      el.querySelectorAll('input[type=radio],input[type=checkbox],[role=radio],[role=checkbox]').length > 1) {
    const items = [...el.querySelectorAll('input[type=radio],input[type=checkbox],[role=radio],[role=checkbox]')];
    return { ...base, kind: 'group', many: items.some(i => i.type === 'checkbox' || i.getAttribute('role') === 'checkbox') };
  }
  if (tag === 'select') return { ...base, kind: 'select', many: el.multiple,
                                  options: [...el.options].map(o => clean(o.text)) };
  if (tag === 'input' && type === 'file') return { ...base, kind: 'file' };
  if ((tag === 'input' && type === 'range') || role === 'slider')
    return { ...base, kind: 'slider', min: el.getAttribute('min') ?? el.getAttribute('aria-valuemin'),
             max: el.getAttribute('max') ?? el.getAttribute('aria-valuemax') };
  const pop = el.getAttribute('aria-haspopup'), auto = el.getAttribute('aria-autocomplete');
  const typeable = (tag === 'input' && !el.readOnly) || tag === 'textarea' || el.isContentEditable;
  if (role === 'combobox' || (pop && pop !== 'false' && pop !== 'dialog') || (auto && auto !== 'none'))
    return { ...base, kind: 'choice', typeable,
             many: el.getAttribute('aria-multiselectable') === 'true' ||
                   !!document.getElementById(el.getAttribute('aria-controls') || '-')?.matches('[aria-multiselectable=true]') };
  if (typeable || role === 'textbox' || role === 'searchbox' || role === 'spinbutton') return { ...base, kind: 'text' };
  // a button-like control with no role that opens something: worth trying as a dropdown, the reply says so
  return { ...base, kind: 'other' };
}

// The open popup's option texts (ARIA listbox/grid/tree/menu items), from the list the control names
// (aria-controls / aria-owns), else every visible one in the frame. With mark: that item's element, or null.
function ITEMS(el, mark) {
  const box = el.matches('input,[role=combobox],button') ? el : (el.querySelector('input,[role=combobox]') || el);
  const vis = o => !!(o.offsetParent || o.getClientRects().length);
  const SEL = '[role=option],[role=gridcell],[role=treeitem],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]';
  const roots = [];
  for (const a of ['aria-controls', 'aria-owns'])
    for (const id of (box.getAttribute(a) || '').split(/\s+/).filter(Boolean)) {
      const d = document.getElementById(id); if (d) roots.push(d); }
  let items = [];
  for (const r of roots) items.push(...r.querySelectorAll(SEL));
  if (!items.length) items = [...document.querySelectorAll(SEL)];
  items = items.filter(vis);
  const seen = new Set(), out = [];
  for (const o of items) {
    const t = (o.innerText || o.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t); out.push(t);
    if (mark != null && t === mark) return o;
  }
  return mark != null ? null : out.slice(0, 300);
}

// Scroll the open list one screen down (lists that draw only the rows in view). true when it moved.
function SCROLL(el, toTop) {
  const vis = e => e.offsetParent || e.getClientRects().length;
  let opts = [];
  for (const a of ['aria-controls', 'aria-owns']) {
    const id = el.getAttribute(a) || el.querySelector('[' + a + ']')?.getAttribute(a);
    const box = id && document.getElementById(id);
    if (box) opts = [...box.querySelectorAll('[role=option],[role=treeitem],[role=menuitem]')].filter(vis);
    if (opts.length) break;
  }
  if (!opts.length) opts = [...document.querySelectorAll('[role=option],[role=menuitem]')].filter(vis);
  if (!opts.length) return false;
  for (let p = opts[0].parentElement; p && p !== document.body; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(st.overflowY)) {
      const top = p.scrollTop;
      if (toTop) { p.scrollTop = 0; return top > 0; }
      p.scrollTop = top + Math.max(p.clientHeight - 20, 20);
      return p.scrollTop > top;
    }
  }
  return false;
}

// A cheap fingerprint of the frame: when it stops changing, the page has settled. Polled from Node, never with a
// timer inside the page: a page's timers can be held back for many seconds (seen after a native select).
function SIG() {
  const a = document.activeElement;
  return document.getElementsByTagName('*').length + '|' + (document.body ? document.body.innerText.length : 0) + '|' +
    (a ? a.tagName + (a.id || '') + ('value' in a ? a.value : '') : '');
}

// Focus the control and select what it holds (so typing replaces it): 'clear' (it held text), 'empty', or false
// when it won't take the focus. Empty matters: a Backspace in an empty multi-select deletes its last choice.
function FOCUS(el) {
  const box = el.matches('input,textarea,select,[contenteditable]') ? el : (el.querySelector('input,textarea,[contenteditable]') || el);
  box.scrollIntoView({ block: 'center' });
  box.focus();
  const a = box.getRootNode().activeElement;
  if (a !== box && !box.contains(a)) return false;
  if (!(box.value ?? box.textContent ?? '')) return 'empty';
  if (box.select) box.select();
  return 'clear';
}

// The one file input that belongs to a button / drop zone: the nearest ancestor that holds exactly one.
function FILE_NEAR(el) {
  for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
    const f = a.querySelectorAll('input[type=file]');
    if (f.length) return f.length === 1 ? f[0] : null;
  }
  return null;
}

// The radio/checkbox items of a group, each with its label text.
function GROUP_ITEMS(el, mark) {
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const items = [...el.querySelectorAll('input[type=radio],input[type=checkbox],[role=radio],[role=checkbox]')];
  const out = items.map(i => {
    let t = (i.labels && i.labels[0] && i.labels[0].innerText) || i.getAttribute('aria-label') || '';
    if (!t && i.getAttribute('aria-labelledby')) t = document.getElementById(i.getAttribute('aria-labelledby'))?.innerText;
    if (!t) t = i.closest('label')?.innerText || i.parentElement?.innerText || i.value || '';
    const checked = 'checked' in i && i.type ? i.checked : i.getAttribute('aria-checked') === 'true';
    return { text: clean(t), checked };
  });
  if (mark != null) return items[out.findIndex(o => o.text === mark)] || null;
  return out;
}

// Visible form controls in this frame, by label: to tell the model what appeared or went away during the batch.
function CONTROLS() {
  const clean = t => (t || '').replace(/[*\s]+/g, ' ').trim();
  const vis = e => !!(e.offsetParent || e.getClientRects().length);
  const out = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]),select,textarea,[role=combobox],[role=checkbox],[role=radio],[role=switch]')) {
    if (!vis(el) && el.type !== 'file') continue;
    // aria-labelledby without the control's own id (MUI Select names itself by its label AND its current value)
    let t = (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(i => i && i !== el.id).map(i => document.getElementById(i)?.innerText || '').join(' ') ||
      el.getAttribute('placeholder') || el.closest('fieldset')?.querySelector('legend')?.innerText || '';
    t = clean(t);
    if (t && (el.type === 'radio' || el.type === 'checkbox') && el.closest('fieldset'))
      t = clean(el.closest('fieldset').querySelector('legend')?.innerText) || t;
    if (t) out.push(t.slice(0, 60));
  }
  return [...new Set(out)];
}

// A page call that doesn't return in time is an error, not a hang.
function capped(p, what, ms = EVAL_MS) {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(`${what}: no answer from the page in ${ms / 1000}s`)), ms); })])
    .finally(() => clearTimeout(t));
}

// ---- matching an answer to the options on offer ----

const norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The option that is the answer: the same text; else the one option that holds the answer as whole words (or the
// one the answer starts with). Several such options, or none: no pick; the reply lists them for the model.
function match(want, options) {
  const w = norm(want);
  if (!w) return { pick: null, close: [] };
  const exact = options.filter(o => norm(o) === w);
  if (exact.length) return { pick: exact[0], exact: true, close: [] };
  const re = new RegExp(`(^|[^a-z0-9])${esc(w)}($|[^a-z0-9])`);
  const holds = options.filter(o => re.test(norm(o)));
  if (holds.length === 1) return { pick: holds[0], exact: false, close: holds };
  const starts = options.filter(o => w.startsWith(norm(o)) && norm(o).length >= 3);
  if (!holds.length && starts.length === 1) return { pick: starts[0], exact: false, close: starts };
  return { pick: null, close: holds.length ? holds : starts };
}

const truthy = v => !['false', 'no', 'off', '0', 'unchecked', 'untick', 'n'].includes(norm(v));

// ---- the procedures ----

class Field {
  constructor(tab, h, info, refind) {
    this.tab = tab; this.page = tab.page; this._h = h; this.info = info; this.did = []; this.refind = refind;
  }
  // the control's element now: the same one while it is on the page; a page that redraws its form after a change
  // replaces it, then it is found again (refind: by the original target, else by its label)
  async el() {
    if (await this._h.evaluate(e => e.isConnected).catch(() => false)) return this._h;
    const h = this.refind && await this.refind();
    if (!h) throw new Error('the field went away (the page replaced it and it could not be found again)');
    this._h = h;
    return h;
  }
  set h(v) { this._h = v; }
  async ev(fn, arg) { return capped((await this.el()).evaluate(fn, arg), 'reading the page'); }
  async evh(fn, arg) { return (await capped((await this.el()).evaluateHandle(fn, arg), 'reading the page')).asElement(); }
  // what to act on: the target's own locator while it still points at this control (Playwright's locator actions
  // are the ones MCP uses; Patchright's ElementHandle.selectOption never returned), else the element
  async target() {
    const h = await this.el();
    if (this.loc && await capped(this.loc.evaluate((e, c) => e === c, h), 'x').catch(() => false)) return this.loc;
    return h;
  }
  async settle(quiet = 250, most = 2000) {
    const t0 = Date.now(); let last = null, since = t0;
    while (Date.now() - t0 < most) {
      const sig = await this.ev(SIG).catch(() => null);
      if (sig !== last) { last = sig; since = Date.now(); }
      else if (Date.now() - since >= quiet) break;
      await new Promise(r => setTimeout(r, 80));
    }
    dbg('settled', Date.now() - t0, 'ms');
  }
  async read() {
    dbg('read');
    try { const r = await this.ev(READ); dbg('read done'); return r; } catch (e) { return { status: 'gone', error: String(e).slice(0, 120) }; }
  }
  async items(before) {
    const now = (await this.ev(ITEMS, null).catch(() => [])) || [];
    if (!before || !before.length) return now;
    // a control that names its popup (aria-controls / aria-owns) has its own list: nothing to leave out
    const named = await this.ev(e => { const b = e.matches('input,[role=combobox],button') ? e : (e.querySelector('input,[role=combobox]') || e);
      return !!(b.getAttribute('aria-controls') || b.getAttribute('aria-owns')); }).catch(() => false);
    return named ? now : now.filter(i => !before.includes(i));
  }
  async key(k) { await this.page.keyboard.press(k); }
  async clickEl(el) {
    try { await el.click({ timeout: ACTION_MS }); return 'click'; }
    catch { await capped(el.evaluate(e => e.click()), 'clicking'); return 'DOM click'; }
  }
  async poll(before, want, ms = 4000) {
    const t0 = Date.now(); let last = null, same = 0, items = [];
    while (Date.now() - t0 < ms) {
      await new Promise(r => setTimeout(r, 250));
      items = await this.items(before);
      if (items.length && match(want, items).pick) break;
      same = items.length && JSON.stringify(items) === last ? same + 1 : 0;
      if (same >= 2) break;
      last = JSON.stringify(items);
    }
    return items;
  }
  async open(before) {
    await this.ev(FOCUS).catch(() => false);
    await this.key('ArrowDown');
    let items = await this.poll(before, null, 1500);
    if (!items.length) {
      await this.clickEl(await this.target());
      items = await this.poll(before, null, 2000);
    }
    return items;
  }
  async clear() {
    if (await this.ev(FOCUS).catch(() => false) !== 'clear') return;
    await this.key('ControlOrMeta+a');
    await this.key('Backspace');
  }
  // a list still open or still fading out (another field's, or this one's from a moment ago): close it and wait
  // until it is gone, so its options aren't taken for this field's
  async quiet() {
    for (let i = 0; i < 8; i++) {
      if (!(await this.items()).length) return;
      if (i === 0) await this.key('Escape');
      await new Promise(r => setTimeout(r, 150));
    }
  }
}

// What the control shows, in one short phrase, from a READ.
function shows(rb) {
  if (!rb || rb.status === 'gone') return 'the field is no longer on the page';
  if (rb.checked !== null && rb.checked !== undefined) return rb.checked ? 'ticked' : 'not ticked';
  const sel = (rb.selected || []).map(s => s.text).filter(Boolean);
  if (sel.length) return `shows ${sel.map(s => JSON.stringify(s)).join(', ')}`;
  const v = Array.isArray(rb.value) ? rb.value.join(', ') : rb.value;
  if (v) return `holds ${JSON.stringify(String(v).slice(0, 120))}`;
  if (rb.display) return `shows ${JSON.stringify(rb.display.slice(0, 120))}` + (rb.query ? ` (typed text ${JSON.stringify(rb.query)})` : '');
  if (rb.query) return `its box reads ${JSON.stringify(rb.query)}`;
  return 'is empty';
}

// Does what it shows carry the answer? 'yes' | 'no' | 'unknown'.
function agrees(rb, want, op = {}) {
  if (!rb || rb.status === 'gone') return 'unknown';
  if (typeof want === 'boolean') return rb.checked === null || rb.checked === undefined ? 'unknown' : (rb.checked === want ? 'yes' : 'no');
  const w = norm(want);
  const texts = [...(rb.selected || []).map(s => s.text), ...(Array.isArray(rb.value) ? rb.value : [rb.value]), rb.display]
    .filter(Boolean).map(norm);
  if (texts.some(t => t === w || t.includes(w))) return 'yes';
  // a search box holding exactly what we typed proves nothing; holding the whole option after we typed only part
  // of it means the widget wrote it there
  if (rb.query != null && norm(rb.query) === w) return op.typed != null && norm(op.typed) !== w ? 'yes' : 'unknown';
  if (rb.open) return 'unknown';
  return texts.length || rb.query ? 'no' : 'no';
}

// The browser's own date/time boxes take one standard form (HTML input types); common written forms are turned into it.
const NATIVE = { date: 'yyyy-mm-dd', month: 'yyyy-mm', week: 'yyyy-Www', time: 'HH:MM (24-hour)', 'datetime-local': 'yyyy-mm-ddTHH:MM' };
function nativeValue(type, v) {
  v = String(v).trim();
  const p2 = n => String(n).padStart(2, '0');
  let m;
  if (type === 'date' && (m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  if (type === 'month' && (m = v.match(/^(\d{1,2})[\/.-](\d{4})$/))) return `${m[2]}-${p2(m[1])}`;
  if (type === 'time' && (m = v.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)))
    return `${p2((+m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0))}:${m[2] || '00'}`;
  return v;
}

async function fillText(f, value) {
  if (NATIVE[f.info.type]) {
    const v = nativeValue(f.info.type, value);
    if (v !== value) f.did.push(`a ${f.info.type} box: wrote ${JSON.stringify(value)} as ${JSON.stringify(v)}`);
    try { await (await f.target()).fill(v, { timeout: ACTION_MS }); }
    catch (e) { throw new Error(`a ${f.info.type} box takes ${NATIVE[f.info.type]}; ${String(e.message).split('\n')[0].slice(0, 120)}`); }
    await f.settle();
    const rb = await f.read();
    return { verdict: rb.value === v ? 'yes' : 'no', rb };
  }
  const secret = f.tab.context.lookupSecret(value);
  const before = await f.items();
  await (await f.target()).fill(secret.value, { timeout: ACTION_MS });
  f.did.push(secret.isSecret ? `typed the secret ${value}` : `typed ${JSON.stringify(value.length > 60 ? value.slice(0, 57) + '...' : value)}`);
  await f.settle(300, 1500);
  const pops = await f.items(before);
  if (pops.length) {
    // suggestions under a plain text box: the exact answer among them is picked, else closed and listed
    const m = match(value, pops);
    if (m.pick && m.exact) {
      const el = await f.evh(ITEMS, m.pick);
      if (el) { await f.clickEl(el); f.did.push(`picked the suggestion ${JSON.stringify(m.pick)}`); await f.settle(); }
    } else {
      await f.key('Escape');
      f.did.push(`closed the list it opened (${pops.length} items, none is the answer)`);
      await f.settle();
    }
  }
  const rb = await f.read();
  if (secret.isSecret) return { verdict: rb.value ? 'yes' : 'unknown', rb: { ...rb, value: rb.value ? '(hidden)' : rb.value } };
  return { verdict: norm(rb.value) === norm(value) ? 'yes' : agrees(rb, value), rb };
}

async function fillCheck(f, value) {
  const want = typeof value === 'boolean' ? value : truthy(value);
  let rb = await f.read();
  if (rb.checked === want) { f.did.push(`already ${want ? 'ticked' : 'not ticked'}`); return { verdict: 'yes', rb }; }
  try { await (await f.target()).setChecked(want, { timeout: ACTION_MS }); f.did.push(want ? 'ticked it' : 'unticked it'); }
  catch {
    // hidden real box behind a styled stand-in: a DOM click toggles it and fires the page's own handlers
    await f.ev(e => e.click());
    f.did.push(`${want ? 'ticked' : 'unticked'} it with a DOM click (the box itself can't be clicked on screen)`);
  }
  await f.settle();
  rb = await f.read();
  return { verdict: agrees(rb, want), rb };
}

async function fillGroup(f, value) {
  const wants = Array.isArray(value) ? value : (f.info.many ? String(value).split(/\s*[,;]\s*/) : [String(value)]);
  const items = await f.ev(GROUP_ITEMS, null);
  const texts = items.map(i => i.text);
  const misses = [];
  for (const w of wants) {
    const m = match(w, texts);
    if (!m.pick) { misses.push(w); continue; }
    const el = await f.evh(GROUP_ITEMS, m.pick);
    const it = items.find(i => i.text === m.pick);
    if (it.checked) { f.did.push(`${JSON.stringify(m.pick)} already chosen`); continue; }
    try { await el.check({ timeout: ACTION_MS }); } catch { await el.evaluate(e => e.click()); }
    f.did.push(`chose ${JSON.stringify(m.pick)}`);
    await f.settle();
  }
  if (f.info.many) {          // a checkbox group: the answer is the whole set; untick what isn't in it
    const now = await f.ev(GROUP_ITEMS, null);
    for (const it of now.filter(i => i.checked && !wants.some(w => match(w, [i.text]).pick))) {
      const el = await f.evh(GROUP_ITEMS, it.text);
      try { await el.uncheck({ timeout: ACTION_MS }); } catch { await el.evaluate(e => e.click()); }
      f.did.push(`unticked ${JSON.stringify(it.text)}`);
    }
  }
  const after = await f.ev(GROUP_ITEMS, null);
  const on = after.filter(i => i.checked).map(i => i.text);
  const rb = { selected: on.map(t => ({ text: t })), checked: null };
  if (misses.length) f.did.push(`no choice for ${misses.map(m => JSON.stringify(m)).join(', ')} among ${texts.map(t => JSON.stringify(t)).join(', ')}`);
  const ok = wants.every(w => on.some(t => match(w, [t]).pick)) && (!f.info.many || on.length === wants.length);
  return { verdict: ok ? 'yes' : 'no', rb };
}

async function fillSelect(f, value) {
  const wants = Array.isArray(value) ? value : (f.info.many ? String(value).split(/\s*[,;]\s*/) : [String(value)]);
  const picks = [], misses = [];
  for (const w of wants) {
    const m = match(w, f.info.options.filter(Boolean));
    if (m.pick) picks.push(m.pick); else misses.push({ w, close: m.close });
  }
  if (misses.length) {
    const opts = f.info.options.filter(Boolean);
    f.did.push(misses.map(({ w, close }) => close.length ? `${JSON.stringify(w)} could be any of ${close.map(c => JSON.stringify(c)).join(', ')}`
      : `no option for ${JSON.stringify(w)}`).join('; ') + ` (options: ${opts.slice(0, 25).map(o => JSON.stringify(o)).join(', ')}${opts.length > 25 ? ', ...' : ''})`);
  }
  if (picks.length) {
    dbg('selectOption', JSON.stringify(picks));
    // the DOM way when there is no locator for the control itself (what the page's own handlers see)
    const t = await f.target();
    if (t === f.loc) await t.selectOption(picks.map(label => ({ label })), { timeout: ACTION_MS });
    else await f.ev((e, want) => {
      for (const o of e.options) o.selected = want.includes(o.text.replace(/\s+/g, ' ').trim());
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, picks);
    dbg('selected');
    f.did.push(`selected ${picks.map(p => JSON.stringify(p)).join(', ')}`);
    await f.settle();
  }
  const rb = await f.read();
  const ok = !misses.length && picks.every(p => agrees(rb, p) === 'yes');
  return { verdict: ok ? 'yes' : (picks.length ? agrees(rb, picks[0]) : 'no'), rb };
}

async function fillFile(f, value) {
  const paths = Array.isArray(value) ? value : [String(value)];
  await (await f.target()).setInputFiles(paths, { timeout: ACTION_MS });
  f.did.push(`attached ${paths.map(p => JSON.stringify(p.split(/[\\/]/).pop())).join(', ')}`);
  await f.settle(400, 3000);
  const names = await f.ev(e => [...(e.files || [])].map(x => x.name));
  return { verdict: paths.every(p => names.includes(p.split(/[\\/]/).pop())) ? 'yes' : 'no', rb: { value: names.join(', '), checked: null } };
}

// A slider: a native range box is set directly; an ARIA slider (or a range box that refused) is moved with the
// arrow keys as a keyboard user would (ARIA slider pattern), reading its value after every press.
async function fillSlider(f, value) {
  const want = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  let rb = await f.read();
  const now = () => parseFloat(String(Array.isArray(rb.value) ? rb.value[0] : rb.value).replace(/[^\d.-]/g, ''));
  if (isNaN(want)) { f.did.push(`${JSON.stringify(value)} is not a number`); return { verdict: 'no', rb }; }
  if (f.info.tag === 'input') {
    try { await (await f.target()).fill(String(want), { timeout: ACTION_MS }); f.did.push(`set it to ${want}`); await f.settle(); }
    catch { }
    rb = await f.read();
  }
  if (now() !== want) {
    await f.ev(FOCUS).catch(() => false);
    let n = 0;
    for (; n < 300 && !isNaN(now()) && now() !== want; n++) {
      const was = now();
      await f.key(was < want ? 'ArrowRight' : 'ArrowLeft');
      rb = await f.read();
      if (now() === was) break;                                    // at an end, or the keys do nothing
      if ((was < want) !== (now() < want) && now() !== want) break; // stepped past it: no step lands on the answer
    }
    f.did.push(`pressed the arrow keys ${n} times`);
  }
  if (now() !== want && f.info.min != null) f.did.push(`its range is ${f.info.min} to ${f.info.max}`);
  return { verdict: now() === want ? 'yes' : 'no', rb };
}

// A custom dropdown: type to search when it takes text (all but the last character, so a box that then holds the
// whole option shows the widget wrote it), else open its list; pick the option that is the answer; read back.
async function chooseOne(f, want) {
  await f.quiet();
  const before = await f.items();
  let items = [], typed = null;
  if (f.info.typeable) {
    const w = String(want).trim();
    typed = w.length >= 2 ? w.slice(0, -1).trimEnd() : '';
    await f.clear();
    if (typed) {
      await f.page.keyboard.type(typed, { delay: 20 });
      items = await f.poll(before, want);
      f.did.push(`typed ${JSON.stringify(typed)}: ${items.length} option${items.length === 1 ? '' : 's'}`);
    }
    if (!match(want, items).pick) {
      await f.clear();
      typed = null;
      items = await f.open(before);
      f.did.push(`opened the whole list: ${items.length} options`);
    }
  } else {
    items = await f.open(before);
    f.did.push(`opened its list: ${items.length} options`);
  }
  let m = match(want, items);
  for (let i = 0; !m.pick && items.length && i < 30; i++) {          // long lists that draw only rows in view
    if (!await f.ev(SCROLL, false).catch(() => false)) break;
    await new Promise(r => setTimeout(r, 200));
    for (const x of await f.items(before)) if (!items.includes(x)) items.push(x);
    m = match(want, items);
  }
  if (!m.pick) {
    await f.key('Escape');
    await f.settle();
    if (!items.length) f.did.push('no option list appeared');
    else if (m.close.length) f.did.push(`${JSON.stringify(want)} could be any of ${m.close.slice(0, 8).map(c => JSON.stringify(c)).join(', ')}; none picked`);
    else f.did.push(`no option for ${JSON.stringify(want)} (options: ${items.slice(0, 15).map(c => JSON.stringify(c)).join(', ')}${items.length > 15 ? ', ...' : ''})`);
    return { pick: null, typed };
  }
  let el = await f.evh(ITEMS, m.pick);
  if (!el && await f.ev(SCROLL, true).catch(() => false)) {          // scrolled past it: back to the top, find it again
    for (let i = 0; !el && i < 30; i++) {
      el = await f.evh(ITEMS, m.pick);
      if (!el && !await f.ev(SCROLL, false).catch(() => false)) break;
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (!el) { f.did.push(`option ${JSON.stringify(m.pick)} went away before it could be clicked`); return { pick: null, typed }; }
  await f.clickEl(el);
  f.did.push(`picked ${JSON.stringify(m.pick)}${m.exact ? '' : ' (closest option)'}`);
  await f.settle();
  return { pick: m.pick, typed };
}

async function fillChoice(f, value) {
  const wants = Array.isArray(value) ? value : (f.info.many ? String(value).split(/\s*[,;]\s*/) : [String(value)]);
  let last = {};
  for (const w of wants) {
    const rb0 = await f.read();
    if (f.info.many && (rb0.selected || []).some(s => norm(s.text) === norm(w))) { f.did.push(`${JSON.stringify(w)} already chosen`); continue; }
    last = await chooseOne(f, w);
  }
  let rb = await f.read();
  if (rb.open) { await f.key('Escape'); await f.settle(); rb = await f.read(); }
  const per = wants.map(w => agrees(rb, w, wants.length === 1 ? { typed: last.typed } : {}));
  const verdict = per.every(v => v === 'yes') ? 'yes' : per.some(v => v === 'no') ? 'no' : 'unknown';
  return { verdict, rb };
}

// The one field with this label (exact, else containing it); null when none or several have it (rows of a list
// share their labels: then only the snapshot's ref can tell them apart).
async function byLabel(page, labels) {
  for (const n of labels.filter(Boolean)) {
    for (const exact of [true, false]) {
      const l = page.getByLabel(n, { exact }).and(page.locator(
        'input:not([type=hidden]),select,textarea,[role=combobox],[role=textbox],[role=checkbox],[role=radio],[role=switch],[role=radiogroup],fieldset,[contenteditable=true]'));
      const k = await l.count().catch(() => 0);
      if (k === 1) return l;
      if (k > 1) return null;
    }
  }
  return null;
}

async function fillOne(tab, field) {
  const name = field.name || field.target;
  let locator, note = '';
  try {
    ({ locator } = await tab.targetLocator({ element: field.name, target: field.target }));
    await locator.waitFor({ state: 'attached', timeout: 1000 });
  } catch (e) {
    // the ref was from a page that has since been redrawn: the field by its label instead, when only one has it
    locator = field.name && await byLabel(tab.page, [field.name]);
    if (!locator) throw e;
    note = ` (${field.target} was gone; found it by its label)`;
  }
  dbg('target', field.target, 'resolved');
  const h = (await locator.evaluateHandle(CONTROL_OF)).asElement();
  const info = await h.evaluate(KIND);
  dbg('kind', info.kind, info.tag, info.role, JSON.stringify(info.label));
  const refind = async () => {
    for (const l of [locator, await byLabel(tab.page, [info.label, field.name])]) {
      if (!l || await l.count().catch(() => 0) !== 1) continue;
      const x = (await l.evaluateHandle(CONTROL_OF).catch(() => null))?.asElement();
      if (x) return x;
    }
    return null;
  };
  const f = new Field(tab, h, info, refind);
  if (await locator.evaluate((e, c) => e === c, h).catch(() => false)) f.loc = locator;   // the target is the control
  const value = field.value;
  let out;
  if (info.kind === 'check') out = await fillCheck(f, value);
  else if (info.kind === 'group') out = await fillGroup(f, value);
  else if (info.kind === 'select') out = await fillSelect(f, value);
  else if (info.kind === 'file') out = await fillFile(f, value);
  else if (info.kind === 'slider') out = await fillSlider(f, value);
  else if (info.kind === 'choice') out = await fillChoice(f, value);
  else if (info.kind === 'text') out = await fillText(f, String(value));
  else {
    // no role and no input: if it holds a file input (an upload button / drop zone), attach there; else try it as
    // a dropdown and say so
    const file = (await h.evaluateHandle(FILE_NEAR)).asElement();
    if (file && /[\\/].+\.\w+$/.test(String(value))) { f.h = file; f.refind = null; out = await fillFile(f, value); }
    else { f.did.push(`a ${info.tag}${info.role ? ' role=' + info.role : ''} with no form role; tried it as a dropdown`); out = await fillChoice(f, value); }
  }
  const kind = info.kind === 'choice' ? 'dropdown' : info.kind === 'group' ? (info.many ? 'checkbox group' : 'radio group')
    : info.kind === 'check' ? (info.type || info.role || 'checkbox') : info.kind === 'select' ? 'select' : info.kind;
  const errs = (out.rb && out.rb.errors || []).filter(Boolean);
  const mark = out.verdict === 'yes' ? 'ok' : out.verdict === 'no' ? 'NOT DONE' : 'UNSURE';
  return { verdict: out.verdict,
           line: `${mark} ${name} [${kind}${info.label && info.label !== name ? ': ' + JSON.stringify(info.label) : ''}]${note}: ` +
                 `${f.did.join('; ')}; now ${shows(out.rb)}` + (errs.length ? `; the form says: ${errs.map(e => JSON.stringify(e)).join(', ')}` : '') };
}

async function controlsNow(page) {
  const all = [];
  for (const fr of page.frames()) all.push(...await fr.evaluate(CONTROLS).catch(() => []));
  return [...new Set(all)];
}

function fillTool(z, tabTool) {
  return tabTool({
    capability: 'core',
    schema: {
      name: 'formwright_fill',
      title: 'Fill fields',
      description: 'Fill many form fields in one call, of any kind: text boxes, native selects, custom dropdowns ' +
        '(type-to-search, react-select, MUI, listbox buttons), checkboxes, radio groups and file inputs. Give each field\'s ' +
        'target and the answer; you do not say what kind of control it is: the tool reads that from the page, opens lists, ' +
        'types to search, picks the matching option and reads back what each field shows. The reply has one line per field: ' +
        'what was done and what the field shows now ("ok", "NOT DONE" with the options it saw, or "UNSURE"), plus any ' +
        'fields that appeared or went away. Fields run in order; it stops early if a dialog opens or the page navigates. ' +
        'Prefer this over separate click/type/select calls whenever you know the answers to one or more fields.',
      inputSchema: z.object({
        fields: z.array(z.object({
          target: z.string().describe('Exact target element reference from the page snapshot (the field itself, its label, or a radio/checkbox group)'),
          name: z.string().optional().describe('The field\'s label, as the page shows it (used to find it again if the page was redrawn)'),
          value: z.union([z.string(), z.boolean(), z.array(z.string())]).describe(
            'The answer: text for a text box; the option\'s text for a dropdown or radio group; true/false for a checkbox; ' +
            'a list for a multi-select or checkbox group; a file path for an upload'),
        })).describe('Fields to fill, in page order'),
      }),
      type: 'input',
    },
    handle: async (tab, params, response) => {
      const page = tab.page, url = page.url();
      const before = await controlsNow(page);
      const lines = [];
      let i = 0, counts = { yes: 0, no: 0, unknown: 0 };
      for (; i < params.fields.length; i++) {
        const field = params.fields[i];
        let timer;
        const cap = new Promise((_, no) => { timer = setTimeout(() => no(new Error(`TIMEOUT after ${FIELD_MS / 1000}s`)), FIELD_MS); });
        try {
          const r = await Promise.race([fillOne(tab, field), cap]);
          counts[r.verdict]++;
          lines.push(r.line);
        } catch (e) {
          counts.no++;
          const msg = String(e.message || e).split('\n')[0].slice(0, 200);
          lines.push(`NOT DONE ${field.name || field.target}: ${msg}`);
          if (msg.startsWith('TIMEOUT')) { lines.push('Stopped: that field may still be changing; look at the page.'); i++; break; }
        } finally { clearTimeout(timer); }
        if (tab.modalStates().length) { lines.push('A dialog opened: stopped here.'); i++; break; }
        if (page.url() !== url) { lines.push(`The page moved to ${page.url()}: stopped here.`); i++; break; }
      }
      const rest = params.fields.slice(i).map(f => f.name || f.target);
      if (rest.length) lines.push(`Not attempted: ${rest.join(', ')}`);
      const after = await controlsNow(page);
      const added = after.filter(x => !before.includes(x)), gone = before.filter(x => !after.includes(x));
      if (added.length) lines.push(`New fields on the page: ${added.slice(0, 15).map(x => JSON.stringify(x)).join(', ')}${added.length > 15 ? ', ...' : ''}`);
      if (gone.length) lines.push(`Fields no longer on the page: ${gone.slice(0, 15).map(x => JSON.stringify(x)).join(', ')}${gone.length > 15 ? ', ...' : ''}`);
      response.addTextResult(`${counts.yes} ok, ${counts.no} not done, ${counts.unknown} unsure\n` + lines.join('\n'));
    },
  });
}

module.exports = { fillTool, match };
