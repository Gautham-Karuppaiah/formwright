// modal: the form sits in a dialog that Escape closes (as dialog libraries do); boxes labelled only by nearby text;
// dropdowns drawn as boxes that show the picked option as their own text, each with an option list that is always
// in the page, hidden (visibility) until opened; a phone code list whose options carry more than the answer
// ("India (+91)"); a yes/no question with a long label.
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Shell, Actions } from "./scenarios";
import { useKept, useForm } from "./store";

function NearText({ k, text, placeholder }) {
  const { fields, set, redraw } = useForm();
  return (
    <div className="row">
      <p className="lbl">{text} <span className="req">*</span></p>
      <input value={fields[k] ?? ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} />
    </div>
  );
}

// The box is the dropdown: it shows the picked option as its text. typeable: typing filters the list.
function BoxPick({ k, label, options, typeable }) {
  const { fields, set, meta } = useForm();
  const [open, setOpen] = useKept(`BoxPick.open.${k}`, false);
  const [q, setQ] = useKept(`BoxPick.q.${k}`, null);
  const shown = typeable && q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const pick = (o) => { set(k, o); setQ(null); setOpen(false); };
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`} style={{ position: "relative" }}>
      <p className="lbl" id={`${k}-lbl`}>{label} <span className="req">*</span></p>
      <input id={k} role="combobox" aria-labelledby={`${k}-lbl`} aria-controls={`${k}-list`} aria-expanded={open}
        readOnly={!typeable} autoComplete="off" placeholder="Select" value={q ?? fields[k] ?? ""}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => { setQ(null); setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
          else if (e.key === "Enter" && open && shown.length) { e.preventDefault(); pick(shown[0]); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setQ(null); setOpen(false); }
        }} />
      <ul role="listbox" id={`${k}-list`} className="lbox" onMouseDown={(e) => e.preventDefault()}
        style={{ visibility: open ? "visible" : "hidden", position: "absolute", background: "#fff", zIndex: 60, listStyle: "none", padding: 0 }}>
        {shown.map((o) => <li key={o} role="option" aria-selected={fields[k] === o} onClick={() => pick(o)}>{o}</li>)}
      </ul>
      {meta.errors.includes(k) && <div className="err" role="alert">This field is required.</div>}
    </div>
  );
}

const CODES = ["India (+91)", "United Arab Emirates (+971)", "United Kingdom (+44)", "United States (+1)"];

export function Modal() {
  const [open, setOpen] = useKept("Modal.open", false);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);
  const req = ["md_first", "md_last", "md_code", "md_phone", "md_gender", "md_family"];
  return (
    <div className="card">
      <p>Full Stack Developer · Chennai · Full time</p>
      <button type="button" onClick={() => setOpen(true)}>Apply For This Job</button>
      {open && createPortal(
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-label="Apply" className="dialog">
            <Shell>
              <NearText k="md_first" text="First Name" />
              <NearText k="md_last" text="Last Name" />
              <BoxPick k="md_code" label="Country Code" options={CODES} typeable />
              <NearText k="md_phone" text="Phone Number" placeholder="000 000 0000" />
              <BoxPick k="md_gender" label="Candidate Gender" options={["Male", "Female"]} />
              <BoxPick k="md_family" options={["Yes", "No"]}
                label="Do you have a family relationship (including spouse, partner, parent, sibling or in-law) with an employee of the company?" />
              <Actions required={req} last />
            </Shell>
          </div>
        </div>, document.body)}
    </div>
  );
}
