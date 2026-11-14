// What a form control shows now (value, typed query, selection, the widget's visible text, ticked state, errors).
// The same reader as formwright/repair.py _READ_JS (copied, kept in step by hand).
const READ = function (arg) {
  const Q = 'input:not([type=hidden]):not([aria-hidden=true]):not([tabindex="-1"]),select,textarea,' +
            '[role=combobox],[role=listbox],[role=textbox],[role=radio],[role=checkbox],[role=switch],' +
            '[role=slider],[role=spinbutton]';
  // zero-width characters are what empty widgets render to keep their height (MUI Select): not a value
  const clean = t => (t || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  function labelText(b) {
    const parts = [];
    if (b.labels) for (const l of b.labels) parts.push(l.innerText);
    for (const id of (b.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)) {
      const d = document.getElementById(id); if (d) parts.push(d.innerText); }
    parts.push(b.getAttribute('aria-label') || '');
    return parts.map(clean).filter(Boolean);
  }
  function widgetText(b) { return widgetParts(b).text; }
  // the widget's own visible text beside the input, and the same text split at element boundaries (one entry
  // per element whose own text it is: a chip's label)
  function widgetParts(b) {
    const labels = labelText(b);
    let best = null;
    for (let a = b.parentElement, k = 0; a && k < 6; a = a.parentElement, k++) {
      // other questions inside it end the widget; a list of options (the box's chips or popup) is part of it
      const qs = [...a.querySelectorAll(Q)].filter(q => q !== b && !b.contains(q) && !q.contains(b)
                                                    && !q.matches('[role=listbox],[role=option]'));
      if (qs.length || a.querySelector('label,legend')) break;
      const t = clean(a.innerText);
      if (labels.some(l => l && t.includes(l)) || t.length > 300) break;
      best = a;
    }
    if (!best) return {text: '', items: []};
    return textOf(best, b);
  }
  function textOf(best, b) {
    // the text drawn on screen inside it, minus buttons ("Clear", "Toggle"), an open option list (every popup
    // kind ARIA defines: listbox, grid, tree, menu, with their items) and screen-reader-only text (1px boxes such
    // as react-select's "Select is focused, type to refine list", rendered while it has the focus)
    const SKIP = 'button,[role=button],[role=dialog],[role=log],[role=status],[aria-live],svg';
    // a list inside the widget is either the box's own popup (the box names it in aria-controls / aria-owns, or
    // says aria-expanded=true): skipped, those are choices; or the list of what is selected (chips): its text
    // is what the widget holds
    const POP = '[role=listbox],[role=grid],[role=tree],[role=menu]';
    const own = ['aria-controls', 'aria-owns'].flatMap(a => (b.getAttribute(a) || '').split(/\s+/)).filter(Boolean);
    const expanded = b.getAttribute('aria-expanded') === 'true';
    const isPopup = l => expanded || own.includes(l.id);
    // and the input's own description (aria-describedby): where widgets put their placeholder ("Type to search")
    const desc = (b.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)).filter(Boolean);
    const ph = clean(b.getAttribute('placeholder'));
    const out = [], items = [];
    let lastEl = null;
    const w = document.createTreeWalker(best, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP) || desc.some(d => d.contains(p))) continue;
      const lst = p.closest(POP);
      if (lst && best.contains(lst) && isPopup(lst)) continue;
      if (lst && !best.contains(lst)) continue;
      if (ph && clean(n.textContent) === ph) continue;
      let hidden = false;
      for (let a = p; a && a !== best.parentElement; a = a.parentElement) {
        const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
        if (r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.opacity === '0') { hidden = true; break; }
      }
      if (hidden || !clean(n.textContent)) continue;
      out.push(n.textContent);
      if (p === lastEl) items[items.length - 1] += ' ' + n.textContent;
      else items.push(n.textContent);
      lastEl = p;
    }
    return {text: clean(out.join(' ')).slice(0, 300), items: items.map(clean).filter(Boolean).slice(0, 40)};
  }
  // a box with a list of options inside its widget that is not its popup: a list of what is selected (chips)
  function hasSelectionList(b) {
    if (!b.matches('input')) return false;
    const own = ['aria-controls', 'aria-owns'].flatMap(a => (b.getAttribute(a) || '').split(/\s+/)).filter(Boolean);
    for (let a = b.parentElement, k = 0; a && k < 4; a = a.parentElement, k++) {
      if ([...a.querySelectorAll(Q)].some(q => q !== b && !q.contains(b) && q.matches('input,select,textarea'))) break;
      if (a.querySelector('label,legend')) break;
      const l = [...a.querySelectorAll('[role=listbox]')].find(x => !own.includes(x.id) && x.querySelector('[role=option]'));
      if (l) return b.getAttribute('aria-expanded') !== 'true';
    }
    return false;
  }
  const el = arg instanceof Element ? arg : this;
  const role = el.getAttribute('role');
  const opts = r => [...r.querySelectorAll('[role=option]')];
  const optText = o => clean(o.innerText || o.textContent);
  const busyOf = n => !!n && (n.getAttribute('aria-busy') === 'true' ||
    ['aria-controls', 'aria-owns'].some(a => (n.getAttribute(a) || '').split(/\s+/).filter(Boolean)
      .some(id => document.getElementById(id)?.getAttribute('aria-busy') === 'true')));
  const base = {status: 'read', value: null, query: null, selected: null, display: '', display_items: [],
                checked: null, invalid: false, open: false, errors: [], busy: false};
  // a custom widget keeps what it holds in its ARIA states (WAI-ARIA 1.2), not in a value: read those first
  const sliders = role === 'slider' || role === 'spinbutton' ? [el]
      : (!el.matches('input,textarea,select') ? [...el.querySelectorAll('[role=slider]')] : []);
  if (sliders.length && !el.matches('input')) {
    const one = s => { const n = s.getAttribute('aria-valuenow'), t = clean(s.getAttribute('aria-valuetext'));
                       return n == null ? '' : (t && /\d/.test(t) ? t : n); };
    return {...base, value: sliders.length === 1 ? one(sliders[0]) : sliders.map(one), busy: busyOf(el),
            min: sliders[0].getAttribute('aria-valuemin'), max: sliders[0].getAttribute('aria-valuemax')};
  }
  if (role === 'listbox') {             // a list on the page, not a dropdown's popup: what is selected in it
    const sel = opts(el).filter(o => o.getAttribute('aria-selected') === 'true').map(optText);
    const many = el.getAttribute('aria-multiselectable') === 'true';
    return {...base, value: many ? sel : (sel[0] || ''), selected: sel.map(t => ({text: t, how: 'aria'})),
            invalid: el.getAttribute('aria-invalid') === 'true', busy: busyOf(el)};
  }
  const box = el.matches('input,textarea,select') ? el : (el.control || el.querySelector('input,textarea,select'));
  let value = null, checked = null, query = null, selected = null, display = '', items = [];
  if (box) {
    if (box.type === 'checkbox' || box.type === 'radio') checked = box.checked;
    else if (box.tagName === 'SELECT' && box.multiple) {
      value = [...box.selectedOptions].map(o => o.text.trim());
      selected = value.map(t => ({text: t, how: 'native'}));
    } else if (box.tagName === 'SELECT') {
      value = box.selectedIndex >= 0 ? box.options[box.selectedIndex].text : '';
      selected = box.selectedIndex >= 0 ? [{text: clean(value), how: 'native'}] : [];
    } else if (box.getAttribute('role') === 'combobox' || box.getAttribute('aria-autocomplete') || hasSelectionList(box)) {
      // a search-type box: its input holds what was typed (or what the widget wrote there), not a selection.
      // Type-to-search dropdowns clear their input after a pick and show the choice as text beside it, inside
      // the widget's own box (what a screen reader reads there): the display, candidate evidence only
      query = box.value;
      const w = widgetParts(box);
      display = w.text; items = w.items;
      // the widget's list of what is selected (chips), not its popup: aria-selected options are established
      const own = ['aria-controls', 'aria-owns'].flatMap(a => (box.getAttribute(a) || '').split(/\s+/)).filter(Boolean);
      for (let a = box.parentElement, k = 0; a && k < 4; a = a.parentElement, k++) {
        if ([...a.querySelectorAll(Q)].some(q => q !== box && !q.contains(box) && q.matches('input,select,textarea'))) break;
        if (a.querySelector('label,legend')) break;
        const l = [...a.querySelectorAll('[role=listbox]')].find(x => !own.includes(x.id) && x.querySelector('[role=option]'));
        if (l && box.getAttribute('aria-expanded') !== 'true') {
          selected = opts(l).filter(o => o.getAttribute('aria-selected') === 'true').map(o => ({text: optText(o), how: 'aria'}));
          break;
        }
      }
    }
    else value = box.value;
  }
  if (checked === null) {
    // checkbox / radio / switch: aria-checked; toggle button: aria-pressed; an option of a list: aria-selected
    // ("mixed", a select-all box with some ticked, counts as not ticked)
    const st = n => el.getAttribute(n) ?? el.querySelector(`[${n}]`)?.getAttribute(n);
    const a = st('aria-checked') ?? st('aria-pressed') ?? (role === 'option' ? el.getAttribute('aria-selected') : null);
    if (a != null) checked = a === 'true';
  }
  if (!box && checked === null) {
    // no input: a button-like dropdown (role combobox, or a button that opens a list) shows its choice as its own
    // text: display. Anything else (a contenteditable, role=textbox) holds its text as its value
    if (role === 'combobox' || el.getAttribute('aria-haspopup')) {
      const w = textOf(el, el); display = w.text; items = w.items;
    } else value = (el.innerText || '').trim().slice(0, 200);
  } else if (value === null && checked === null && query === null && selected === null)
    value = (el.innerText || '').trim().slice(0, 200);
  const t = box || el;
  const invalid = t.getAttribute('aria-invalid') === 'true';
  const errs = [];
  if (invalid) for (const attr of ['aria-errormessage', 'aria-describedby'])
    for (const id of (t.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
      const d = document.getElementById(id); const s = d && d.innerText.trim(); if (s) errs.push(s); }
  let p = el;
  for (let k = 0; k < 3 && p.parentElement; k++) p = p.parentElement;
  for (const e of p.querySelectorAll('[role=alert],[class*=error],[class*=invalid]')) {
    const s = (e.innerText || '').trim(); if (s && s.length < 200 && e.offsetParent !== null) errs.push(s); }
  // a type-to-search box with its option list still open holds typed search text, not a chosen value
  const open = (!!box && box.getAttribute('aria-expanded') === 'true' &&
               (box.getAttribute('role') === 'combobox' || !!box.getAttribute('aria-autocomplete'))) ||
               (!box && role === 'combobox' && el.getAttribute('aria-expanded') === 'true');
  return {...base, value, query, selected, display, display_items: items, checked, invalid, open,
          busy: busyOf(t) || busyOf(el), errors: [...new Set(errs)].slice(0, 3)};
};
module.exports = { READ };
