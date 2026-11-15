// trapform: the traps page's traits as one application, every question answerable from the profile. A tool that says
// a field took when it didn't leaves a wrong value in the sent form; a tool that changes what nobody asked for leaves
// a pre-set answer changed. The form sits in a dialog that Escape closes, as dialog libraries do.
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Actions, Shell } from "./scenarios";
import { useForm, useKept } from "./store";
import {
  ClingyPin, Email, Langs, ListPick, LooseRadios, Location, Mobile, MoreUploads, Office, OffSwitch, Referral, Section,
  TypeAhead, Uploads,
} from "./scenarios7";

export const TRAPFORM_INITIAL = { tr_dialog: true, tr_consent: true, tr_reloc: "Yes", tr_notice: "Immediate" };

const CITIES = ["Chennai", "Coimbatore", "Bengaluru", "Hyderabad", "Mumbai", "Pune"];

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The Monday after next: later than "the Monday of next week", so that answer is refused.
function firstStart() {
  const d = new Date();
  d.setDate(d.getDate() + 14 - (d.getDay() + 6) % 7);
  return d;
}

// An ARIA slider whose every key press takes the page a while.
function SlowCtc() {
  const { fields, set } = useForm();
  const v = fields.tr_ctc ?? 0;
  return (
    <div className="row">
      <p className="lbl" id="tr_ctc-lbl">Expected CTC (LPA)</p>
      <div className="track">
        <div role="slider" tabIndex={0} aria-labelledby="tr_ctc-lbl" aria-valuemin={0} aria-valuemax={50} aria-valuenow={v}
          className="thumb" style={{ left: `${(v / 50) * 100}%` }}
          onKeyDown={(e) => {
            const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            const t = performance.now(); while (performance.now() - t < 25) { /* a heavy handler */ }
            set("tr_ctc", Math.max(0, Math.min(50, v + d)));
          }} />
      </div>
      <div className="hint">{v} LPA</div>
    </div>
  );
}

// A native select whose groups repeat option texts; the answer is not the first copy.
function Degree() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <label htmlFor="tr_degree">Degree and branch</label>
      <select id="tr_degree" value={fields.tr_degree ?? ""} onChange={(e) => set("tr_degree", e.target.value)}>
        <option value="">Select...</option>
        <optgroup label="Electronics"><option value="ece-be">B.E.</option><option value="ece-other">Other</option></optgroup>
        <optgroup label="Computer Science"><option value="cs-be">B.E.</option><option value="cs-other">Other</option></optgroup>
      </select>
    </div>
  );
}

// A date box that clears itself on leaving when the date is before the first allowed one, which it states. Only an
// allowed date is recorded, so one put in some other way is still refused when the form is sent.
function StartFrom() {
  const { fields, set } = useForm();
  const [raw, setRaw] = useKept("StartFrom.raw", null);
  const first = firstStart(), MIN = iso(first);
  return (
    <div className="row">
      <label htmlFor="tr_start">Earliest start date</label>
      <input id="tr_start" type="date" min={MIN} value={raw ?? fields.tr_start ?? ""}
        onChange={(e) => { const v = e.target.value; setRaw(v); set("tr_start", v && v >= MIN ? v : "", false); }}
        onBlur={(e) => { if (e.target.value && e.target.value < MIN) setRaw(""); }} />
      <div className="hint">Joining dates start {first.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</div>
    </div>
  );
}

// A yes/no question the page has already answered.
function Relocate() {
  const { fields, set } = useForm();
  return (
    <fieldset className="row" id="tr_reloc">
      <legend>Are you willing to relocate?</legend>
      {["Yes", "No"].map((o) => (
        <label key={o} className="inline">
          <input type="radio" name="tr_reloc" checked={fields.tr_reloc === o} onChange={() => set("tr_reloc", o)} /> {o}
        </label>
      ))}
    </fieldset>
  );
}

// A list drawn on the page, always visible, with its answer already picked.
function Notice() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <p className="lbl" id="tr_notice-lbl">Notice period</p>
      <ul role="listbox" aria-labelledby="tr_notice-lbl" className="lbox">
        {["Immediate", "15 days", "30 days", "60 days or more"].map((o) => (
          <li key={o} role="option" aria-selected={fields.tr_notice === o} className={fields.tr_notice === o ? "hi" : ""}
            onClick={() => set("tr_notice", o)}>{o}</li>
        ))}
      </ul>
    </div>
  );
}

const REQUIRED = { tr_city: "Current city", tr_auth: "Work authorization", tr_spons: "Visa sponsorship", tr_consent: "Confirmation",
  tr_sex: "Gender", tr_pin: "PIN code", tr_pref: "Preferred city", tr_ctc: "Expected CTC", tr_resume: "Résumé",
  tr_qual: "Highest qualification", tr_degree: "Degree and branch", tr_email: "Email", tr_office: "Chennai office",
  tr_langs: "Languages", tr_start: "Earliest start date", tr_mobile: "Mobile number", tr_loc: "Location" };

export function Trapform() {
  const { fields, set, meta } = useForm();
  const open = fields.tr_dialog !== false;
  const resumeInput = useRef(null), portfolioInput = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === "Escape") set("tr_dialog", false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, set]);
  return (
    <div className="card">
      <p>Field Robotics Engineer · Chennai</p>
      <button type="button" onClick={() => set("tr_dialog", true)}>Apply For This Job</button>
      {open && createPortal(
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-label="Apply" className="dialog" style={{ maxHeight: "90vh", overflow: "auto" }}>
            <Shell>
              <TypeAhead k="tr_city" label="Current city" options={CITIES} />
              <Section />
              <LooseRadios />
              <ClingyPin />
              <TypeAhead k="tr_pref" label="Preferred city" options={CITIES} />
              <SlowCtc />
              <Relocate />
              <Notice />
              <Uploads resumeInput={resumeInput} />
              <MoreUploads portfolioInput={portfolioInput} />
              <ListPick k="tr_qual" label="Highest qualification"
                groups={[[null, [["Diploma", true], ["Bachelor's degree"], ["Master's degree", true]]]]} />
              <OffSwitch />
              <Degree />
              <Email />
              <Referral />
              <Office />
              <Langs />
              <StartFrom />
              <Mobile />
              <Location />
              <input ref={resumeInput} type="file" style={{ display: "none" }} onChange={(e) => set("tr_resume", e.target.files[0]?.name || "")} />
              <input ref={portfolioInput} type="file" style={{ display: "none" }} onChange={(e) => set("tr_portfolio", e.target.files[0]?.name || "")} />
              {meta.errors.length > 0 && <div className="err">Missing: {meta.errors.map((k) => REQUIRED[k]).join(", ")}</div>}
              <Actions required={Object.keys(REQUIRED)} last />
            </Shell>
          </div>
        </div>, document.body)}
    </div>
  );
}
