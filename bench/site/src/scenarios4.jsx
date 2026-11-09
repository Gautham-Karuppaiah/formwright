// Hidden native controls behind custom stand-ins, the way real ATS pages build them (COVERAGE A17b, A18, D8, D9, D11).
// The real control is hidden (display:none or zero-size); what a person sees and clicks is a styled button or div,
// often with no ARIA role at all.
import React, { useRef } from "react";
import { Actions, Shell } from "./scenarios";
import { Text } from "./widgets";
import { useForm, useKept } from "./store";

const errOf = (errs, k) => (errs.includes(k) ? "This field is required." : null);

// Workday "Resume/CV": a "Select files" button; the <input type=file> is display:none and is opened by the button.
export function ButtonUpload({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const input = useRef(null);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl">{label}{required && <span className="req"> *</span>}</div>
      <div className="hint">Upload a file (5MB max)</div>
      <input ref={input} type="file" style={{ display: "none" }} accept=".pdf,.doc,.docx"
             onChange={(e) => set(k, e.target.files[0]?.name || "")} />
      <button type="button" onClick={() => input.current.click()}>Select files</button>
      {fields[k] && <div className="hint">Successfully uploaded: {fields[k]}</div>}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// react-dropzone style: a plain div (no role) that takes a dropped file or opens the hidden input on click.
export function DropZone({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const input = useRef(null);
  const [over, setOver] = useKept(`DropZone.over.${k}`, false);
  const take = (f) => f && set(k, f.name);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl">{label}{required && <span className="req"> *</span>}</div>
      <input ref={input} type="file" style={{ display: "none" }} accept=".pdf,.doc,.docx"
             onChange={(e) => take(e.target.files[0])} />
      <div tabIndex={0}
           style={{ border: "2px dashed #888", padding: 24, textAlign: "center", cursor: "pointer",
                    background: over ? "#eef" : "#fafafa" }}
           onClick={() => input.current.click()}
           onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current.click()}
           onDragOver={(e) => { e.preventDefault(); setOver(true); }}
           onDragLeave={() => setOver(false)}
           onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
        Drag and drop your file here, or click to browse
      </div>
      {fields[k] && <div className="hint">{fields[k]} <span style={{ color: "#2a6" }}>✓</span></div>}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// A real <select> hidden with display:none; the visible list is plain divs with click handlers, no roles.
export function DivSelect({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const [open, setOpen] = useKept(`DivSelect.open.${k}`, false);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl">{label}{required && <span className="req"> *</span>}</div>
      <select name={k} value={fields[k] ?? ""} style={{ display: "none" }} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <div style={{ border: "1px solid #888", padding: "4px 8px", cursor: "pointer", width: 260 }}
           onClick={() => setOpen(!open)}>
        {fields[k] || "Select..."} ▾
      </div>
      {open && (
        <div style={{ border: "1px solid #888", width: 260, background: "#fff" }}>
          {options.map((o) => (
            <div key={o} style={{ padding: "4px 8px", cursor: "pointer" }}
                 onClick={() => { setOpen(false); set(k, o); }}>{o}</div>
          ))}
        </div>
      )}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// Yes/No as two styled divs with click handlers: no input, no role, no aria-pressed.
export function DivChoice({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl">{label}{required && <span className="req"> *</span>}</div>
      {options.map((o) => (
        <div key={o} onClick={() => set(k, o)}
             style={{ display: "inline-block", padding: "4px 14px", marginRight: 8, cursor: "pointer",
                      border: "1px solid #888", background: fields[k] === o ? "#2a6" : "#fff",
                      color: fields[k] === o ? "#fff" : "#000" }}>{o}</div>
      ))}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// The question is nearby text; the box has no label, id, name or aria-label linking it.
export function LooseText({ k, question, required }) {
  const { fields, set, redraw, meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div>{question}{required && <span className="req"> *</span>}</div>
      <div><input type="text" value={fields[k] ?? ""} onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} /></div>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

export function Hidden() {
  const req = ["first_name", "email", "resume", "qualification", "auth_india", "linkedin"];
  return (
    <Shell>
      <h3>About you</h3>
      <Text k="first_name" label="First name" required />
      <Text k="email" label="Email address" type="email" required />
      <h3>Resume/CV</h3>
      <ButtonUpload k="resume" label="Resume/CV" required />
      <h3>Background</h3>
      <DivSelect k="qualification" label="Highest qualification" required
        options={["High school", "Diploma", "Bachelor's degree", "Master's degree", "PhD"]} />
      <DivChoice k="auth_india" label="Are you legally authorized to work in India?" required options={["Yes", "No"]} />
      <LooseText k="linkedin" question="Your LinkedIn profile URL" required />
      <Actions required={req} last />
    </Shell>
  );
}

export function Dropzone() {
  const req = ["first_name", "email", "resume"];
  return (
    <Shell>
      <h3>Apply</h3>
      <Text k="first_name" label="First name" required />
      <Text k="email" label="Email address" type="email" required />
      <DropZone k="resume" label="Resume" required />
      <Actions required={req} last />
    </Shell>
  );
}
