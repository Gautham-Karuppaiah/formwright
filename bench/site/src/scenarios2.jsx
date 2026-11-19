// Coverage pages (bench/COVERAGE.md). Each custom widget follows its W3C ARIA APG pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/): the roles, states and keys a real site built to that pattern has.
// Row numbers in comments refer to COVERAGE.md.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useKept, delay, useForm, validate } from "./store";
import { Row, Text, NativeSelect, Check, File } from "./widgets";
import { Actions, Shell, EntryForm } from "./scenarios";
import { MONTHS } from "./data";

const errOf = (errs, k) => (errs.includes(k) ? "This field is required." : null);
const pad = (n) => String(n).padStart(2, "0");
const nextMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7);
  return d;
};

// ====================================================================================== oracle
// B13 combobox with grid popup, B15 modal dialog form, B3 alert dialog, B16 date picker dialog, B38 tooltip
const PLACES = [["Chennai", "Tamil Nadu"], ["Chennai Free Trade Zone", "Tamil Nadu"], ["Chengalpattu", "Tamil Nadu"],
  ["Bengaluru", "Karnataka"], ["Chandigarh", "Chandigarh"], ["Coimbatore", "Tamil Nadu"], ["Mumbai", "Maharashtra"]];

function GridCombo({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const [text, setText] = useKept(`GridCombo.text.${k}`, fields[k]?.label || "");
  const [rows, setRows] = useKept(`GridCombo.rows.${k}`, null);
  const [active, setActive] = useKept(`GridCombo.active.${k}`, -1);
  const seq = useRef(0);
  const search = async (t) => {
    const n = ++seq.current;
    await delay(500);
    if (n !== seq.current) return;
    setRows(PLACES.filter(([c]) => c.toLowerCase().startsWith(t.toLowerCase())));
    setActive(-1);
  };
  const pick = ([c, st]) => { set(k, { value: `${c}, ${st}`, label: c }); setText(c); setRows(null); };
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <input id={k} role="combobox" aria-haspopup="grid" aria-expanded={!!rows} aria-controls={`${k}-grid`}
        aria-autocomplete="list" autoComplete="off" value={text}
        aria-activedescendant={active >= 0 ? `${k}-r${active}` : undefined}
        onChange={(e) => { setText(e.target.value); set(k, "", false); if (e.target.value) search(e.target.value); else setRows(null); }}
        onKeyDown={(e) => {
          if (!rows) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(rows[active]); }
          if (e.key === "Escape") setRows(null);
        }} />
      {rows && (
        <div role="grid" id={`${k}-grid`} aria-label={`${label} results`} className="grid-pop">
          {rows.length === 0 && <div role="row"><div role="gridcell">No results found</div></div>}
          {rows.map((r, i) => (
            <div role="row" key={r[0]} id={`${k}-r${i}`} aria-selected={i === active} className={i === active ? "hi" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              <div role="gridcell">{r[0]}</div><div role="gridcell" className="hint">{r[1]}</div>
            </div>
          ))}
        </div>
      )}
    </Row>
  );
}

function Modal({ label, onClose, children, alert }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("input, select, button")?.focus(); }, []);
  return createPortal(
    <div className="backdrop">
      <div ref={ref} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="dlg-title" className="dialog"
        onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="dlg-title">{label}</h2>
        {children}
      </div>
    </div>, document.body);
}

const DEGREES = ["High school", "Diploma", "Bachelor's degree", "Master's degree", "Doctorate"];

function EducationDialog({ k }) {
  const { fields, set, meta } = useForm();
  const list = fields[k] || [];
  const [open, setOpen] = useKept(`EducationDialog.open.${k}`, false);
  const [confirm, setConfirm] = useKept(`EducationDialog.confirm.${k}`, null);
  const [e, setE] = useKept(`EducationDialog.e.${k}`, {});
  const [err, setErr] = useKept(`EducationDialog.err.${k}`, null);
  const f = (n) => ({ id: `edu-${n}`, value: e[n] || "", onChange: (ev) => setE({ ...e, [n]: ev.target.value }) });
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl">Education <span className="req">*</span></div>
      {list.map((x, i) => <div key={i} className="card"><div className="card-title">{x.degree}</div><div>{x.institution} · {x.year}</div></div>)}
      <button type="button" onClick={() => { setE({}); setErr(null); setOpen(true); }}>Add Education</button>
      {errOf(meta.errors, k) && <div className="err" role="alert">Add your highest education.</div>}
      {open && !confirm && (
        <Modal label="Add Education" onClose={() => setOpen(false)}>
          <div className="row"><label htmlFor="edu-degree">Degree *</label>
            <select {...f("degree")}><option value="">Select...</option>{DEGREES.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div className="row"><label htmlFor="edu-institution">School or university *</label><input {...f("institution")} /></div>
          <div className="row"><label htmlFor="edu-year">Year of completion *</label>
            <select {...f("year")}><option value="">Select...</option>{Array.from({ length: 41 }, (_, i) => String(1990 + i)).map((y) => <option key={y}>{y}</option>)}</select></div>
          {err && <div className="err" role="alert">{err}</div>}
          <button type="button" className="primary" onClick={() => {
            const m = ["degree", "institution", "year"].filter((n) => !e[n]);
            if (m.length) setErr(`Required: ${m.join(", ")}`); else setConfirm(e);
          }}>Save</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </Modal>
      )}
      {confirm && (
        <Modal label="Save this education entry?" alert onClose={() => setConfirm(null)}>
          <p>You can still edit it later.</p>
          <button type="button" className="primary" onClick={() => { set(k, [...list, confirm]); setConfirm(null); setOpen(false); }}>Yes, save</button>
          <button type="button" onClick={() => setConfirm(null)}>No</button>
        </Modal>
      )}
    </div>
  );
}

function DateDialog({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const [open, setOpen] = useKept(`DateDialog.open.${k}`, false);
  const [view, setView] = useKept(`DateDialog.view.${k}`, () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const move = (n) => setView(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <div className="ds">
        <input id={k} readOnly value={fields[k] || ""} placeholder="DD/MM/YYYY" />
        <button type="button" aria-label={`Choose ${label}`} onClick={() => setOpen(true)}>📅</button>
      </div>
      {open && (
        <Modal label={`Choose ${label}`} onClose={() => setOpen(false)}>
          <div>
            <button type="button" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
            <span aria-live="polite" id="cal-month">{MONTHS[view.m]} {view.y}</span>
            <button type="button" aria-label="Next month" onClick={() => move(1)}>›</button>
          </div>
          <table role="grid" aria-labelledby="cal-month"><tbody>
            {Array.from({ length: Math.ceil(days / 7) }, (_, w) => (
              <tr key={w}>{Array.from({ length: 7 }, (_, i) => {
                const d = w * 7 + i + 1;
                if (d > days) return <td key={i} />;
                const v = `${pad(d)}/${pad(view.m + 1)}/${view.y}`;
                return <td key={i}><button type="button" aria-label={`${d} ${MONTHS[view.m]} ${view.y}`}
                  aria-pressed={fields[k] === v} onClick={() => { set(k, v); setOpen(false); }}>{d}</button></td>;
              })}</tr>
            ))}
          </tbody></table>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </Modal>
      )}
    </Row>
  );
}

function TipText({ k, label, required, tip, check }) {
  const { fields, set, redraw, meta } = useForm();
  const [show, setShow] = useKept(`TipText.show.${k}`, false);
  const [wrong, setWrong] = useKept(`TipText.wrong.${k}`, false);
  const bad = meta.errors.includes(k) || wrong;
  return (
    <div className={`row${bad ? " bad" : ""}`}>
      <label htmlFor={k}>{label}{required && <span className="req"> *</span>}
        <button type="button" className="tip" aria-label="More information" aria-describedby={show ? `${k}-tip` : undefined}
          onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>ⓘ</button>
      </label>
      {show && <div role="tooltip" id={`${k}-tip`} className="tooltip">{tip}</div>}
      <input id={k} value={fields[k] ?? ""} aria-invalid={bad || undefined} onChange={(e) => set(k, e.target.value, false)}
        onBlur={(e) => { setWrong(!!e.target.value && !check(e.target.value)); redraw(); }} />
      {bad && <div className="err" role="alert">{wrong ? "Invalid value." : "This field is required."}</div>}
    </div>
  );
}

export function Oracle() {
  const phoneOk = (v) => /^\d{10}$/.test(v || "");
  const req = ["o_city", "o_education", "o_available", "o_phone"];
  return (
    <Shell>
      <h3>Contact</h3>
      <TipText k="o_phone" label="Mobile phone" required tip="Enter 10 digits only, without the country code or spaces." check={phoneOk} />
      <GridCombo k="o_city" label="City" required />
      <h3>Education</h3>
      <EducationDialog k="o_education" />
      <h3>Availability</h3>
      <DateDialog k="o_available" label="Date available to start" required />
      <Actions required={req} last />
    </Shell>
  );
}

// ====================================================================================== workday
// B26 menu button, B33 spinbuttons (segmented date), B28 custom radio group, B34 switch, B39 tree, B23 grouped
// multi-select listbox
function ApplyMenu({ onPick }) {
  const [open, setOpen] = useKept("ApplyMenu.open", false);
  const [i, setI] = useKept("ApplyMenu.i", 0);
  const items = ["Autofill with Resume", "Apply Manually", "Use My Last Application"];
  const refs = useRef([]);
  useEffect(() => { if (open) refs.current[i]?.focus(); }, [open, i]);
  return (
    <div className="menu-wrap">
      <button type="button" id="apply-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="apply-menu"
        className="primary" onClick={() => setOpen((o) => !o)}>Apply</button>
      {open && (
        <ul role="menu" id="apply-menu" aria-labelledby="apply-btn" className="menu"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setI((x) => (x + 1) % items.length);
            if (e.key === "ArrowUp") setI((x) => (x + items.length - 1) % items.length);
            if (e.key === "Escape") setOpen(false);
          }}>
          {items.map((t, n) => (
            <li key={t} role="menuitem" tabIndex={n === i ? 0 : -1} ref={(el) => (refs.current[n] = el)}
              onClick={() => { setOpen(false); onPick(t); }} onKeyDown={(e) => e.key === "Enter" && onPick(t)}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpinDate({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const v = fields[k] || {};
  const parts = [["Month", 1, 12, 2], ["Day", 1, 31, 2], ["Year", 1900, 2030, 4]];
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`} role="group" aria-labelledby={`${k}-lbl`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <div className="pair">
        {parts.map(([name, lo, hi, len]) => {
          const cur = v[name];
          const put = (x) => set(k, (o) => ({ ...(o || {}), [name]: x }), true);
          return (
            <div key={name} id={`${k}-${name}`} role="spinbutton" tabIndex={0} aria-label={name} className="spin"
              aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={cur ? Number(cur) : undefined}
              aria-valuetext={cur || (name === "Year" ? "YYYY" : name === "Month" ? "MM" : "DD")}
              onKeyDown={(e) => {
                const n = Number(cur || (e.key === "ArrowUp" ? lo - 1 : hi + 1));
                if (e.key === "ArrowUp") { e.preventDefault(); put(String(Math.min(hi, n + 1)).padStart(len, "0")); }
                else if (e.key === "ArrowDown") { e.preventDefault(); put(String(Math.max(lo, n - 1)).padStart(len, "0")); }
                else if (/^\d$/.test(e.key)) {
                  e.preventDefault();
                  const typed = ((cur && cur.length < len ? cur : "") + e.key).slice(-len);
                  set(k, (o) => ({ ...(o || {}), [name]: typed }), typed.length === len);
                } else if (e.key === "Backspace") { e.preventDefault(); set(k, (o) => ({ ...(o || {}), [name]: "" })); }
              }}>{cur || (name === "Year" ? "YYYY" : name === "Month" ? "MM" : "DD")}</div>
          );
        })}
      </div>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

function RoleRadios({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const refs = useRef([]);
  const cur = options.indexOf(fields[k]);
  const go = (n) => { set(k, options[n]); refs.current[n]?.focus(); };
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <div role="radiogroup" aria-labelledby={`${k}-lbl`} aria-required={required || undefined} className="pair">
        {options.map((o, n) => (
          <div key={o} role="radio" aria-checked={fields[k] === o} tabIndex={n === (cur < 0 ? 0 : cur) ? 0 : -1}
            ref={(el) => (refs.current[n] = el)} className={`fake-radio${fields[k] === o ? " on" : ""}`}
            onClick={() => go(n)}
            onKeyDown={(e) => {
              if (e.key === " ") { e.preventDefault(); go(n); }
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go((n + 1) % options.length); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go((n + options.length - 1) % options.length); }
            }}>{o}</div>
        ))}
      </div>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

function Switch({ k, label }) {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <div className="pair">
        <span id={`${k}-lbl`}>{label}</span>
        <button type="button" role="switch" id={k} aria-checked={!!fields[k]} aria-labelledby={`${k}-lbl`}
          className={`switch${fields[k] ? " on" : ""}`} onClick={() => set(k, !fields[k])}>
          <span aria-hidden="true">{fields[k] ? "On" : "Off"}</span></button>
      </div>
    </div>
  );
}

export const SOURCES = [["Job Board", ["LinkedIn", "Naukri", "Indeed"]], ["Company Website", null],
  ["Referral", ["Employee Referral", "Friend or Family"]], ["Social Media", ["Instagram", "X (Twitter)"]]];

function TreePrompt({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const [open, setOpen] = useKept(`TreePrompt.open.${k}`, false);
  const [exp, setExp] = useKept(`TreePrompt.exp.${k}`, {});
  return (
    <Row id={k} label={label} required={required} labelFor={false} error={errOf(meta.errors, k)}>
      <button type="button" id={k} aria-haspopup="tree" aria-expanded={open} aria-labelledby={`${k}-label ${k}`}
        onClick={() => setOpen((o) => !o)}>{fields[k] || "Select One"}</button>
      {open && (
        <ul role="tree" aria-label={label} className="tree">
          {SOURCES.map(([name, kids]) => (
            <li key={name} role="treeitem" aria-expanded={kids ? !!exp[name] : undefined}
              aria-selected={!kids && fields[k] === name} tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); if (kids) setExp({ ...exp, [name]: !exp[name] }); else { set(k, name); setOpen(false); } }}>
              {kids ? (exp[name] ? "▾ " : "▸ ") : ""}{name}
              {kids && exp[name] && (
                <ul role="group">
                  {kids.map((c) => (
                    <li key={c} role="treeitem" aria-selected={fields[k] === c} tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); set(k, c); setOpen(false); }}>{c}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}

// A picker that doesn't say it is one: a plain text box (no combobox role, aria-haspopup, aria-controls or
// aria-expanded) whose typed text is only a search. A click opens an option list elsewhere in the page; some
// options are folders holding others. Enter searches. A pick shows as a chip; leaving the box clears unpicked text.
export function SearchPrompt({ k, label, required, tree }) {
  const { fields, set, meta } = useForm();
  const [q, setQ] = useKept(`SearchPrompt.q.${k}`, "");
  const [open, setOpen] = useKept(`SearchPrompt.open.${k}`, false);
  const [folder, setFolder] = useKept(`SearchPrompt.folder.${k}`, null);
  const [found, setFound] = useKept(`SearchPrompt.found.${k}`, null);
  const [hi, setHi] = useKept(`SearchPrompt.hi.${k}`, -1);
  const box = useRef(null);
  const leaves = tree.flatMap(([n, kids]) => (kids ? kids : [n]));
  const shown = found ? found.map((n) => [n, null]) : folder ? tree.find(([n]) => n === folder)[1].map((n) => [n, null]) : tree;
  const close = () => { setOpen(false); setFolder(null); setFound(null); setHi(-1); };
  const pick = ([n, kids]) => {
    if (kids) { setFolder(n); setHi(-1); return; }
    set(k, n); setQ(""); close();
  };
  const r = box.current?.getBoundingClientRect();
  const cur = fields[k];
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      {cur && <ul className="chips" style={{ listStyle: "none", padding: 0 }}><li className="chip">{cur}
        <button type="button" aria-label="Remove" onClick={() => set(k, "")}>×</button></li></ul>}
      <input ref={box} id={k} value={q} placeholder="Search" enterKeyHint="search" autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onClick={() => { if (!open) { setOpen(true); setFolder(null); setFound(null); } }}
        onBlur={() => { setQ(""); close(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && hi >= 0 && shown[hi]) pick(shown[hi]);
            else if (q.trim()) {
              const w = q.trim().toLowerCase();
              setFound(leaves.filter((n) => n.toLowerCase().includes(w))); setFolder(null); setOpen(true); setHi(-1);
            }
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            setHi((h) => Math.max(0, Math.min(shown.length - 1, h + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (e.key === "Escape") close();
        }} />
      <span aria-hidden="true" className="hint">{cur ? "1 item selected" : "0 items selected"}</span>
      {open && createPortal(
        <div role="listbox" aria-label="Options" className="lbox"
          style={{ position: "absolute", left: (r?.left || 0) + scrollX, top: (r?.bottom || 0) + scrollY, background: "#fff", zIndex: 10 }}
          onMouseDown={(e) => e.preventDefault()}>
          {folder && <button type="button" onClick={() => { setFolder(null); setHi(-1); }}>‹ Back</button>}
          {shown.length ? shown.map(([n, kids], i) => (
            <div key={n} role="option" aria-selected={cur === n} aria-label={`${n} ${cur === n ? "checked" : "not checked"}`}
              className={i === hi ? "hi" : ""} onClick={() => pick([n, kids])}>
              <span>{n}</span>{kids && <span aria-hidden="true"> ›</span>}
            </div>
          )) : <div>No Items.</div>}
        </div>, document.body)}
    </Row>
  );
}

export const STUDY = [["Engineering", ["Civil Engineering", "Computer Engineering", "Computer Science", "Electrical Engineering",
  "Mechanical Engineering"]], ["Business", ["Accounting", "Finance", "Marketing"]],
  ["Sciences", ["Chemistry", "Mathematics", "Physics"]], ["Arts and Humanities", ["English", "History"]], ["Other", null]];
export const SCHOOLS = ["Anna University", "Bharathiar University", "Chennai Institute of Technology", "Coimbatore Institute of Technology",
  "Coromandel Institute of Technology, Chennai Campus", "Coromandel Polytechnic College", "Delhi University",
  "Indian Institute of Science", "Madras Christian College", "Presidency College, Chennai", "PSG College of Technology",
  "SRM Institute of Science and Technology", "Vellore Institute of Technology"].map((n) => [n, null]);

const LANG_GROUPS = [["Indian languages", ["Bengali", "Hindi", "Kannada", "Malayalam", "Tamil", "Telugu"]],
  ["Other languages", ["Arabic", "English", "French", "German", "Japanese", "Spanish"]]];

function GroupedListbox({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const cur = fields[k] || [];
  const toggle = (o) => set(k, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <div className="chips">{cur.map((c) => <span key={c} className="chip">{c}
        <button type="button" aria-label={`Remove ${c}`} onClick={() => toggle(c)}>×</button></span>)}</div>
      <div role="listbox" aria-labelledby={`${k}-lbl`} aria-multiselectable="true" tabIndex={0} className="lbox">
        {LANG_GROUPS.map(([g, opts]) => (
          <div role="group" aria-labelledby={`${k}-${g}`} key={g}>
            <div role="presentation" id={`${k}-${g}`} className="hint">{g}</div>
            {opts.map((o) => <div key={o} role="option" aria-selected={cur.includes(o)} id={`${k}-${o}`}
              className={cur.includes(o) ? "hi" : ""} onClick={() => toggle(o)}>{o}</div>)}
          </div>
        ))}
      </div>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

export function Workday() {
  const { meta, setMeta } = useForm();
  if (meta.step === 1) {
    return (
      <div className="card">
        <p>Software Engineer I · Chennai · Full time</p>
        <ApplyMenu onPick={() => setMeta((m) => ({ ...m, step: 2 }))} />
      </div>
    );
  }
  return (
    <Shell>
      <h3>My Information</h3>
      <SpinDate k="wd_dob" label="Date of Birth" required />
      <RoleRadios k="wd_auth" label="Are you legally authorized to work in India?" required options={["Yes", "No"]} />
      <Switch k="wd_relocate" label="Willing to relocate" />
      <TreePrompt k="wd_source" label="How Did You Hear About Us?" required />
      <GroupedListbox k="wd_languages" label="Languages" required />
      <h3>Education</h3>
      <SearchPrompt k="wd_school" label="School or University" required tree={SCHOOLS} />
      <SearchPrompt k="wd_study" label="Field of Study" required tree={STUDY} />
      <Actions required={["wd_dob", "wd_auth", "wd_source", "wd_languages", "wd_school", "wd_study"]} last />
    </Shell>
  );
}

// ====================================================================================== sap (shadow DOM, D5)
// Each field is a custom element with an open shadow root holding its own label and control, as SAP UI5 web
// components do; the phone field sits two shadow roots deep.
function Shadow({ children, tag = "ui5-field" }) {
  const host = useRef(null);
  const [root, setRoot] = useKept("Shadow.root", null);
  useEffect(() => { setRoot(host.current.shadowRoot || host.current.attachShadow({ mode: "open" })); }, []);
  return React.createElement(tag, { ref: host, style: { display: "block", margin: "12px 0" } },
    root && createPortal(<><style>{"label{display:block;font-weight:500}input,select{padding:6px;font:inherit}"}</style>{children}</>, root));
}

function ShadowText({ k, label, nested }) {
  const { fields, set, redraw } = useForm();
  const box = (
    <>
      <label htmlFor={k}>{label} *</label>
      <input id={k} value={fields[k] ?? ""} onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} />
    </>
  );
  return <Shadow>{nested ? <Shadow tag="ui5-input">{box}</Shadow> : box}</Shadow>;
}

function ShadowSelect({ k, label, options }) {
  const { fields, set } = useForm();
  return (
    <Shadow>
      <label htmlFor={k}>{label} *</label>
      <select id={k} value={fields[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select</option>{options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Shadow>
  );
}

function ShadowCheck({ k, label }) {
  const { fields, set } = useForm();
  return (
    <Shadow tag="ui5-checkbox">
      <span role="checkbox" aria-checked={!!fields[k]} tabIndex={0} aria-label={label}
        onClick={() => set(k, !fields[k])} onKeyDown={(e) => e.key === " " && (e.preventDefault(), set(k, !fields[k]))}>
        {fields[k] ? "☑" : "☐"} {label} *</span>
    </Shadow>
  );
}

export function Sap() {
  return (
    <Shell>
      <h3>Candidate Profile</h3>
      <ShadowText k="sap_first" label="First Name" />
      <ShadowText k="sap_last" label="Last Name" />
      <ShadowText k="sap_email" label="Email" />
      <ShadowText k="sap_phone" label="Mobile Number (without country code)" nested />
      <ShadowSelect k="sap_country" label="Country of Residence" options={["Germany", "India", "Singapore", "United States"]} />
      <ShadowCheck k="sap_privacy" label="I have read and accept the data privacy statement" />
      <Actions required={["sap_first", "sap_last", "sap_email", "sap_phone", "sap_country", "sap_privacy"]} last />
    </Shell>
  );
}

// ====================================================================================== icims (iframe, D4)
// The company page holds the application in an iframe from another origin (localhost vs 127.0.0.1).
export function IcimsOuter() {
  const q = new URLSearchParams(location.search);
  q.set("s", "icims-inner");
  const host = location.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
  return (
    <div className="page">
      <header><div className="brand">Acme Robotics Careers</div><h1>Software Engineer I</h1>
        <p>Build and maintain robot fleet software in Python and C++. Freshers welcome.</p></header>
      <iframe title="Job application" src={`${location.protocol}//${host}:${location.port}/?${q}`}
        style={{ width: "100%", height: 900, border: "1px solid #ccc", background: "#fff" }} />
    </div>
  );
}

export function IcimsInner() {
  return (
    <Shell>
      <h3>Apply: Software Engineer I</h3>
      <Text k="ic_first" label="First Name" required />
      <Text k="ic_last" label="Last Name" required />
      <Text k="ic_email" label="Email Address" required type="email" />
      <NativeSelect k="ic_country" label="Country" required options={["India", "Singapore", "United Kingdom", "United States"]} />
      <File k="ic_resume" label="Resume" required />
      <Actions required={["ic_first", "ic_last", "ic_email", "ic_country", "ic_resume"]} last />
    </Shell>
  );
}

// ====================================================================================== sections
// E10 cookie banner over the form, D8 div "Next" with no role, B1 accordion, B36 tabs, B17 disclosure,
// D7 loads when scrolled to, D9 unlabelled box
function Cookie() {
  const [gone, setGone] = useKept("Cookie.gone", false);
  if (gone) return null;
  return (
    <div className="cookie-cover">
      <div className="cookie" aria-label="Cookie consent">
        <p>We use cookies to improve your experience.</p>
        <button type="button" onClick={() => setGone(true)}>Reject all</button>
        <button type="button" className="primary" onClick={() => setGone(true)}>Accept all cookies</button>
      </div>
    </div>
  );
}

function Accordion({ id, title, children, open: start }) {
  const [open, setOpen] = useKept(`Accordion.open.${id}`, !!start);
  return (
    <div className="acc">
      <h3><button type="button" id={`${id}-btn`} aria-expanded={open} aria-controls={`${id}-panel`}
        className="acc-btn" onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} {title}</button></h3>
      {open && <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`}>{children}</div>}
    </div>
  );
}

function Tabs({ tabs }) {
  const [cur, setCur] = useKept("Tabs.cur", 0);
  return (
    <div>
      <div role="tablist" aria-label="Profile sections">
        {tabs.map(([t], i) => (
          <button key={t} type="button" role="tab" id={`tab-${i}`} aria-selected={i === cur} aria-controls={`tabp-${i}`}
            tabIndex={i === cur ? 0 : -1} className={i === cur ? "tab on" : "tab"} onClick={() => setCur(i)}>{t}</button>
        ))}
      </div>
      <div role="tabpanel" id={`tabp-${cur}`} aria-labelledby={`tab-${cur}`}>{tabs[cur][1]}</div>
    </div>
  );
}

function ShowMore({ children }) {
  const [open, setOpen] = useKept("ShowMore.open", false);
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls="more" onClick={() => setOpen((o) => !o)}>
        {open ? "Show fewer questions" : "Show more questions"}</button>
      {open && <div id="more">{children}</div>}
    </div>
  );
}

function LazyBlock({ children }) {
  const ref = useRef(null);
  const [state, setState] = useKept("LazyBlock.state", "wait");
  useEffect(() => {
    const ob = new IntersectionObserver(async ([e]) => {
      if (e.isIntersecting && state === "wait") { setState("loading"); await delay(800); setState("done"); }
    });
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, [state]);
  return <div ref={ref} style={{ minHeight: 40 }}>{state === "done" ? children : state === "loading" ? "Loading more questions…" : ""}</div>;
}

function BareText({ k, text }) {
  const { fields, set, redraw } = useForm();
  return (
    <div className="row">
      <p className="lbl">{text}</p>
      <input value={fields[k] ?? ""} onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} />
    </div>
  );
}

export function Sections() {
  const { meta, setMeta, fields } = useForm();
  if (meta.step === 1) {
    const req = ["sx_first", "sx_email"];
    return (
      <Shell steps={2}>
        <Cookie />
        <h3>Start your application</h3>
        <Text k="sx_first" label="First name" required />
        <Text k="sx_email" label="Email" required type="email" />
        {meta.errors.length > 0 && <div className="summary" role="alert">Please complete the required fields.</div>}
        <div className="fake-btn" onClick={() => {
          const errors = validate(fields, req);
          setMeta((m) => (errors.length ? { ...m, errors } : { ...m, errors: [], step: 2 }));
        }}>Next</div>
      </Shell>
    );
  }
  return (
    <Shell steps={2}>
      <Accordion id="acc1" title="Personal information" open>
        <BareText k="sx_city" text="Current city" />
      </Accordion>
      <Accordion id="acc2" title="Education">
        <Text k="sx_cgpa" label="CGPA (out of 10)" required />
      </Accordion>
      <Accordion id="acc3" title="Additional questions">
        <Text k="sx_notice" label="Notice period (in days)" required />
      </Accordion>
      <h3>Online profiles</h3>
      <Tabs tabs={[["Professional", <Text k="sx_linkedin" label="LinkedIn profile URL" type="url" required />],
        ["Code", <Text k="sx_github" label="GitHub profile URL" type="url" required />]]} />
      <ShowMore><Check k="sx_relocate" label="I am willing to relocate for this role" /></ShowMore>
      <div style={{ height: 900 }} />
      <LazyBlock><Text k="sx_start" label="Earliest start date (DD/MM/YYYY)" required /></LazyBlock>
      <Actions required={["sx_city", "sx_cgpa", "sx_notice", "sx_linkedin", "sx_github", "sx_start"]} last />
    </Shell>
  );
}

// ====================================================================================== html (A rows)
function Input({ k, label, type, required, defaultValue, ...rest }) {
  const { fields, set, redraw, meta } = useForm();
  const [bad, setBad] = useKept(`Input.bad.${k}`, null);
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k) || bad}>
      <input id={k} name={k} type={type} value={fields[k] ?? (type === "range" ? defaultValue : "")} required={required} {...rest}
        onChange={(e) => set(k, type === "range" ? Number(e.target.value) : e.target.value, type === "range" || type === "date" || type === "month" || type === "week" || type === "time" || type === "datetime-local")}
        onBlur={(e) => { setBad(e.target.validity.valid ? null : e.target.validationMessage || "Invalid value."); redraw(); }} />
      {type === "range" && <output htmlFor={k}>{fields[k] ?? defaultValue}</output>}
    </Row>
  );
}

function MultiFile({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const ref = useRef(null);
  const add = (files) => set(k, [...(fields[k] || []), ...Array.from(files).map((f) => f.name)]);
  return (
    <Row id={k} label={label} required={required} labelFor={false} error={errOf(meta.errors, k)}>
      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        Drag and drop files here, or <button type="button" onClick={() => ref.current.click()}>browse</button>
        <input ref={ref} id={k} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      {(fields[k] || []).map((n) => <div key={n} className="hint">Attached: {n}</div>)}
    </Row>
  );
}

function NativeMulti({ k, label, required, options, groups }) {
  const { fields, set, meta } = useForm();
  const multi = !groups;
  const val = fields[k] ?? (multi ? [] : "");
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <select id={k} multiple={multi} size={multi ? options.length : undefined} value={val}
        onChange={(e) => set(k, multi ? Array.from(e.target.selectedOptions).map((o) => o.value) : e.target.value)}>
        {!multi && <option value="">Select...</option>}
        {multi ? options.map((o) => <option key={o}>{o}</option>)
          : groups.map(([g, os]) => <optgroup key={g} label={g}>{os.map((o) => <option key={o}>{o}</option>)}</optgroup>)}
      </select>
    </Row>
  );
}

function Counted({ k, label, max, required }) {
  const { fields, set, redraw, meta } = useForm();
  const v = fields[k] ?? "";
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <textarea id={k} maxLength={max} value={v} aria-describedby={`${k}-count`}
        onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} />
      <div className="hint" id={`${k}-count`}>{v.length} / {max} characters</div>
    </Row>
  );
}

function Editable({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerText !== (fields[k] || "")) ref.current.innerText = fields[k] || ""; }, []);
  return (
    <Row id={k} label={label} required={required} labelFor={false} error={errOf(meta.errors, k)}>
      <div ref={ref} id={k} contentEditable role="textbox" aria-multiline="true" aria-labelledby={`${k}-label`}
        className="editable" suppressContentEditableWarning onInput={(e) => set(k, e.currentTarget.innerText, false)} />
    </Row>
  );
}

function SearchPick({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const [q, setQ] = useKept(`SearchPick.q.${k}`, "");
  const shown = q.length < 2 ? [] : options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  return (
    <fieldset className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <legend>{label}{required && <span className="req"> *</span>}</legend>
      <input type="search" id={`${k}-q`} aria-label={`Search ${label}`} placeholder="Type at least 2 letters" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.map((o) => <label key={o} className="inline"><input type="radio" name={k} checked={fields[k] === o} onChange={() => set(k, o)} /> {o}</label>)}
      {fields[k] && <div className="hint">Selected: {fields[k]}</div>}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </fieldset>
  );
}

const NATIONALITIES = ["American", "British", "Chinese", "Indian", "Indonesian", "Japanese", "Singaporean"];
const UNIS = ["Anna University", "Coromandel Institute of Technology, Chennai Campus", "Coromandel Institute of Technology, Hyderabad Campus", "Coromandel Institute of Technology, Pune Campus", "IIT Madras", "VIT Vellore"];

export function Html() {
  const req = ["h_portfolio", "h_university", "h_dob", "h_grad", "h_week", "h_slot", "h_test", "h_years", "h_files",
    "h_cities", "h_qual", "h_summary", "h_address", "h_mobile", "h_nationality"];
  return (
    <Shell>
      <h3>Links and education</h3>
      <Input k="h_portfolio" label="Portfolio URL" type="url" required />
      <SearchPick k="h_university" label="University" required options={UNIS} />
      <NativeMulti k="h_qual" label="Highest qualification" required groups={[["Undergraduate", ["B.E. / B.Tech", "B.Sc", "BCA"]], ["Postgraduate", ["M.E. / M.Tech", "MBA", "M.Sc"]]]} />
      <Input k="h_grad" label="Graduation month" type="month" required />
      <h3>About you</h3>
      <Input k="h_dob" label="Date of birth" type="date" required />
      <Input k="h_mobile" label="Mobile number (10 digits)" type="tel" pattern="[0-9]{10}" required />
      <Input k="h_nationality" label="Nationality" type="text" list="nats" required />
      <datalist id="nats">{NATIONALITIES.map((n) => <option key={n} value={n} />)}</datalist>
      <Editable k="h_address" label="Full postal address" required />
      <Input k="h_years" label="Years of professional experience" type="range" min="0" max="10" step="1" defaultValue={5} required />
      <NativeMulti k="h_cities" label="Which of these cities could you work in? (select all that apply)" required options={["Bengaluru", "Chennai", "Hyderabad", "Pune"]} />
      <Counted k="h_summary" label="Summarise your most recent internship" max={150} required />
      <h3>Scheduling</h3>
      <Input k="h_week" label="Week you can start (only next week is open)" type="week" required />
      <Input k="h_slot" label="Interview slot (only 10:00 AM is available)" type="time" required />
      <Input k="h_test" label="Online test (only 1 December 2026 at 10:00 AM is open)" type="datetime-local" required />
      <MultiFile k="h_files" label="Resume and certificates" required />
      <div className="actions"><button type="reset" onClick={() => location.reload()}>Clear form</button></div>
      <Actions required={req} last />
    </Shell>
  );
}

// ====================================================================================== widgets2 (B rows)
function ListboxOne({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <ul role="listbox" aria-labelledby={`${k}-lbl`} tabIndex={0} className="lbox"
        aria-activedescendant={fields[k] ? `${k}-${options.indexOf(fields[k])}` : undefined}
        onKeyDown={(e) => {
          const i = options.indexOf(fields[k]);
          if (e.key === "ArrowDown") { e.preventDefault(); set(k, options[Math.min(i + 1, options.length - 1)]); }
          if (e.key === "ArrowUp") { e.preventDefault(); set(k, options[Math.max(i - 1, 0)]); }
        }}>
        {options.map((o, i) => <li key={o} id={`${k}-${i}`} role="option" aria-selected={fields[k] === o}
          className={fields[k] === o ? "hi" : ""} onClick={() => set(k, o)}>{o}</li>)}
      </ul>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

function Rank({ k, label, start }) {
  const { fields, set } = useForm();
  const list = fields[k] || start;
  const [sel, setSel] = useKept(`Rank.sel.${k}`, null);
  const move = (d) => {
    const i = list.indexOf(sel);
    if (i < 0 || i + d < 0 || i + d >= list.length) return;
    const l = [...list];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    set(k, l);
  };
  return (
    <div className="row">
      <div className="lbl" id={`${k}-lbl`}>{label}</div>
      <ul role="listbox" aria-labelledby={`${k}-lbl`} tabIndex={0} className="lbox">
        {list.map((o, i) => <li key={o} role="option" aria-selected={sel === o} className={sel === o ? "hi" : ""}
          onClick={() => setSel(o)}>{i + 1}. {o}</li>)}
      </ul>
      <div><button type="button" aria-label="Move up" disabled={!sel} onClick={() => move(-1)}>↑ Move up</button>
        <button type="button" aria-label="Move down" disabled={!sel} onClick={() => move(1)}>↓ Move down</button></div>
    </div>
  );
}

function Rating({ k, label, required }) {
  const { fields, set, meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <div role="radiogroup" aria-labelledby={`${k}-lbl`} className="pair">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} role="radio" aria-checked={fields[k] === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            tabIndex={fields[k] === n || (!fields[k] && n === 1) ? 0 : -1} className="star"
            onClick={() => set(k, n)} onKeyDown={(e) => e.key === " " && (e.preventDefault(), set(k, n))}>
            {fields[k] >= n ? "★" : "☆"}</span>
        ))}
      </div>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

function Slider({ k, label, min, max, start, thumbs }) {
  const { fields, set } = useForm();
  const v = fields[k] ?? start;
  const vals = thumbs ? v : [v];
  const names = thumbs ? ["Minimum", "Maximum"] : [label];
  const put = (i, x) => {
    if (!thumbs) return set(k, x);
    const n = [...vals];
    n[i] = i === 0 ? Math.min(x, n[1]) : Math.max(x, n[0]);
    set(k, n);
  };
  return (
    <div className="row">
      <div className="lbl" id={`${k}-lbl`}>{label}</div>
      <div className="track">
        {vals.map((x, i) => (
          <div key={i} role="slider" tabIndex={0} aria-labelledby={thumbs ? undefined : `${k}-lbl`}
            aria-label={thumbs ? `${label}: ${names[i]}` : undefined} aria-valuemin={min} aria-valuemax={max} aria-valuenow={x}
            className="thumb" style={{ left: `${((x - min) / (max - min)) * 100}%` }}
            onKeyDown={(e) => {
              const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
              if (e.key === "Home") { e.preventDefault(); put(i, min); }
              else if (e.key === "End") { e.preventDefault(); put(i, max); }
              else if (d) { e.preventDefault(); put(i, Math.max(min, Math.min(max, x + d))); }
            }} />
        ))}
      </div>
      <div className="hint">{vals.join(" – ")}</div>
    </div>
  );
}

function MixedChecks({ k, label, items }) {
  const { fields, set } = useForm();
  const v = fields[k] || {};
  const n = items.filter((i) => v[i]).length;
  const all = n === items.length ? "true" : n ? "mixed" : "false";
  return (
    <fieldset className="row">
      <legend>{label}</legend>
      <div role="checkbox" aria-checked={all} tabIndex={0} className="mixed"
        onClick={() => set(k, Object.fromEntries(items.map((i) => [i, all !== "true"])))}
        onKeyDown={(e) => e.key === " " && (e.preventDefault(), set(k, Object.fromEntries(items.map((i) => [i, all !== "true"]))))}>
        {all === "true" ? "☑" : all === "mixed" ? "▣" : "☐"} I agree to all of the following *</div>
      {items.map((i) => (
        <label key={i} className="inline" style={{ display: "flex", marginLeft: 20 }}>
          <input type="checkbox" checked={!!v[i]} onChange={(e) => set(k, { ...v, [i]: e.target.checked })} /> {i}</label>
      ))}
    </fieldset>
  );
}

function InlineCombo({ k, label, required, options, filter }) {
  const { fields, set, meta } = useForm();
  const [text, setText] = useKept(`InlineCombo.text.${k}`, fields[k] || "");
  const [open, setOpen] = useKept(`InlineCombo.open.${k}`, false);
  const ref = useRef(null);
  const shown = filter ? options.filter((o) => o.toLowerCase().startsWith(text.toLowerCase())) : options;
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <input id={k} ref={ref} role="combobox" aria-autocomplete={filter ? "both" : "none"} aria-expanded={open}
        aria-controls={`${k}-list`} autoComplete="off" value={text}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const t = e.target.value;
          const typedMore = t.length > text.length;
          setOpen(true);
          const hit = filter && typedMore && t ? options.find((o) => o.toLowerCase().startsWith(t.toLowerCase())) : null;
          if (hit) {
            setText(hit);
            requestAnimationFrame(() => ref.current?.setSelectionRange(t.length, hit.length));
          } else setText(t);
          set(k, options.includes(hit || t) ? (hit || t) : "", false);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (options.includes(text)) { set(k, text); setOpen(false); } } }} />
      {open && (
        <ul role="listbox" id={`${k}-list`} aria-label={label} className="ds-menu">
          {shown.map((o) => <li key={o} role="option" aria-selected={fields[k] === o}
            onMouseDown={(e) => { e.preventDefault(); setText(o); set(k, o); setOpen(false); }}>{o}</li>)}
        </ul>
      )}
    </Row>
  );
}

function Toggle({ k, label }) {
  const { fields, set } = useForm();
  return (
    <div className="row"><button type="button" id={k} aria-pressed={!!fields[k]} className={fields[k] ? "tab on" : "tab"}
      onClick={() => set(k, !fields[k])}>{label}</button></div>
  );
}

// B19 / C10: education as an editable grid, one row per entry; a cell becomes a text box when activated
const EDU_COLS = [["level", "Level"], ["institution", "Institution"], ["year", "Year of passing"], ["score", "CGPA / %"]];

function EduGrid({ k, label }) {
  const { fields, set, meta } = useForm();
  const rows = fields[k] || [];
  const [edit, setEdit] = useKept(`EduGrid.edit.${k}`, null);
  const put = (r, c, v) => set(k, rows.map((x, i) => (i === r ? { ...x, [c]: v } : x)), false);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label} <span className="req">*</span></div>
      <table role="grid" aria-labelledby={`${k}-lbl`} className="egrid">
        <thead><tr role="row">{EDU_COLS.map(([, h]) => <th role="columnheader" key={h}>{h}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((x, r) => (
            <tr role="row" key={r} aria-rowindex={r + 2}>
              {EDU_COLS.map(([c, h]) => (
                <td role="gridcell" key={c} tabIndex={-1} onClick={() => setEdit([r, c])}
                  onKeyDown={(e) => e.key === "Enter" && setEdit([r, c])}>
                  {edit && edit[0] === r && edit[1] === c
                    ? <input autoFocus aria-label={`Row ${r + 1}: ${h}`} value={x[c] || ""} onChange={(e) => put(r, c, e.target.value)}
                        onBlur={() => { setEdit(null); set(k, (l) => l); }} onKeyDown={(e) => e.key === "Enter" && setEdit(null)} />
                    : (x[c] || <span className="hint">Click to edit</span>)}
                </td>
              ))}
              <td role="gridcell"><button type="button" aria-label={`Delete row ${r + 1}`}
                onClick={() => set(k, rows.filter((_, i) => i !== r))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => set(k, [...rows, {}])}>+ Add row</button>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// B35: saved entries shown in a read-only table with an Edit button per row; one row is wrong
const TABLE_INITIAL = [
  { id: 1, title: "Software Developer Intern", company: "Halcyon Byteworks", start_month: "January", start_year: "2026", end_month: "July", end_year: "2026", current: false },
  { id: 2, title: "Cyber-Security Intern", company: "Riverbend Labs", start_month: "June", start_year: "2025", end_month: "", end_year: "", current: true },
];

function ExpTable({ k }) {
  const { fields, set } = useForm();
  const list = fields[k] || [];
  const [edit, setEdit] = useKept(`ExpTable.edit.${k}`, null);
  return (
    <div className="row">
      <table className="egrid" aria-label="Work experience">
        <thead><tr><th>Job title</th><th>Company</th><th>From</th><th>To</th><th /></tr></thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id}><td>{e.title}</td><td>{e.company}</td><td>{e.start_month} {e.start_year}</td>
              <td>{e.current ? "Present" : `${e.end_month} ${e.end_year}`}</td>
              <td><button type="button" aria-label={`Edit ${e.title}`} onClick={() => setEdit(e.id)}>Edit</button></td></tr>
          ))}
        </tbody>
      </table>
      {edit && <EntryForm init={list.find((e) => e.id === edit)} onCancel={() => setEdit(null)}
        onSave={(e) => { set(k, list.map((x) => (x.id === e.id ? e : x))); setEdit(null); }} />}
    </div>
  );
}
export const WIDGETS2_INITIAL = { w2_experience: TABLE_INITIAL };

export function Widgets2() {
  const req = ["w2_notice", "w2_english", "w2_citizenship", "w2_state", "w2_education"];
  return (
    <Shell>
      <h3>Availability</h3>
      <ListboxOne k="w2_notice" label="Notice period" required options={["Immediate", "15 days", "30 days", "60 days", "90 days"]} />
      <Rank k="w2_rank" label="Rank these locations in order of your preference (select one, then move it)" start={["Mumbai", "Pune", "Bengaluru", "Chennai"]} />
      <Toggle k="w2_remote" label="Open to remote work" />
      <h3>Skills</h3>
      <Rating k="w2_english" label="Rate your English (1 = basic, 5 = native)" required />
      <Slider k="w2_years" label="Total years of work experience" min={0} max={10} start={3} />
      <Slider k="w2_ctc" label="Expected annual CTC range (LPA)" min={0} max={30} start={[10, 20]} thumbs />
      <h3>Location</h3>
      <InlineCombo k="w2_citizenship" label="Country of citizenship" required filter options={["Indonesia", "India", "Iran", "Ireland", "Israel", "Italy"]} />
      <InlineCombo k="w2_state" label="State" required options={["Karnataka", "Kerala", "Maharashtra", "Tamil Nadu", "Telangana"]} />
      <h3>Education</h3>
      <EduGrid k="w2_education" label="Education (every level, starting with the highest)" />
      <h3>Work experience</h3>
      <ExpTable k="w2_experience" />
      <h3>Declarations</h3>
      <MixedChecks k="w2_declare" label="Declarations" items={["I consent to the privacy policy", "I accept the terms of use", "I consent to a background check"]} />
      <Actions required={req} last />
    </Shell>
  );
}

// ====================================================================================== groups (C7)
function AddressGroup({ p, legend }) {
  return (
    <fieldset className="row" aria-label={legend}>
      <legend>{legend}</legend>
      <Text k={`${p}_line1`} label="Address line 1" required />
      <Text k={`${p}_line2`} label="Address line 2" />
      <Text k={`${p}_city`} label="City" required />
      <Text k={`${p}_pin`} label="PIN code" required />
    </fieldset>
  );
}

export function Groups() {
  const req = ["cur_line1", "cur_city", "cur_pin", "perm_line1", "perm_city", "perm_pin"];
  return (
    <Shell>
      <h3>Addresses</h3>
      <AddressGroup p="cur" legend="Current address" />
      <AddressGroup p="perm" legend="Permanent address" />
      <Actions required={req} last />
    </Shell>
  );
}

// ====================================================================================== asks (C4, C15)
// Questions the applicant's profile can't answer truthfully: the run must leave them and ask, never guess.
export function Asks() {
  return (
    <Shell>
      <h3>Eligibility</h3>
      <Text k="as_email" label="Email" required type="email" />
      <NativeSelect k="as_degree" label="Highest completed degree" required options={["High school", "Master's degree", "Doctorate"]} />
      <Text k="as_aadhaar" label="Aadhaar number (12 digits)" required />
      <Actions required={["as_email", "as_degree", "as_aadhaar"]} last />
    </Shell>
  );
}

// ====================================================================================== refuse (C13)
// The form refuses an entry whose end month equals its start month; the profile's rule says what to do then.
export function Refuse() {
  const { fields, set, meta, setMeta } = useForm();
  const list = fields.r_experience || [];
  const [adding, setAdding] = useKept("Refuse.adding", false);
  const idx = (e) => Number(e.start_year) * 12 + MONTHS.indexOf(e.start_month);
  const check = (e) => (!e.current && Number(e.end_year) * 12 + MONTHS.indexOf(e.end_month) <= idx(e)
    ? "End date must be after the start date." : null);
  return (
    <Shell>
      <h3>Work experience</h3>
      <p className="hint">Add every internship.</p>
      {list.map((e) => <div key={e.id} className="card"><div className="card-title">{e.title}</div>
        <div>{e.company} · {e.start_month} {e.start_year} – {e.end_month} {e.end_year}</div></div>)}
      {adding ? <EntryForm init={{}} check={check} onCancel={() => setAdding(false)}
        onSave={(e) => { set("r_experience", (l) => [...(l || []), { ...e, id: Date.now() }]); setAdding(false); }} />
        : <button type="button" onClick={() => setAdding(true)}>+ Add experience</button>}
      <div className="actions">
        <button type="button" className="primary" onClick={() => setMeta((m) => ({ ...m, submitted: !adding }))}>Submit application</button>
      </div>
    </Shell>
  );
}

// ====================================================================================== applied (E8)
export function Applied() {
  return (
    <div className="card">
      <h2>Software Engineer I</h2>
      <p role="status">You have already applied for this position. You can view the status of your application in your
        candidate home.</p>
      <button type="button">Go to candidate home</button>
    </div>
  );
}
