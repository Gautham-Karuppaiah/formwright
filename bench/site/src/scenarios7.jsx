// traps: one trait per way a fill tool can say a field took when it didn't, or change something nobody asked it to.
// Everything sits in a dialog that Escape closes (as dialog libraries do), so a stray Escape shows as a closed form.
// Not one application: each test fills only its own fields and reads the page's record of them.
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Shell } from "./scenarios";
import { useForm, useKept } from "./store";

export const TRAPS_INITIAL = { tr_dialog: true, tr_consent: true, tr_shift: "Morning", tr_lock: "Female", tr_slot: "Morning" };

function Lbl({ k, text }) {
  return <p className="lbl" id={`${k}-lbl`}>{text}</p>;
}

// A type-ahead whose list is in the page only while typing has results; Escape closes the list when one is open.
export function TypeAhead({ k, label, options }) {
  const { fields, set } = useForm();
  const [q, setQ] = useKept(`TypeAhead.q.${k}`, null);
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : [];
  const open = shown.length > 0;
  const pick = (o) => { set(k, o); setQ(null); };
  return (
    <div className="row" style={{ position: "relative" }}>
      <Lbl k={k} text={label} />
      <input id={k} role="combobox" aria-labelledby={`${k}-lbl`} aria-controls={`${k}-list`} aria-autocomplete="list"
        aria-expanded={open} autoComplete="off" value={q ?? fields[k] ?? ""}
        onChange={(e) => setQ(e.target.value)} onBlur={() => setQ(null)}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setQ(null); } }} />
      {open && (
        <ul role="listbox" id={`${k}-list`} className="lbox" onMouseDown={(e) => e.preventDefault()}>
          {shown.map((o) => <li key={o} role="option" aria-selected={false} onClick={() => pick(o)}>{o}</li>)}
        </ul>
      )}
    </div>
  );
}

// A section holding two questions and a ticked confirmation box.
export function Section() {
  const { fields, set } = useForm();
  const yn = (k, text) => (
    <fieldset className="row" id={k}>
      <legend>{text}</legend>
      {["Yes", "No"].map((o) => (
        <label key={o} className="inline">
          <input type="radio" name={k} checked={fields[k] === o} onChange={() => set(k, o)} /> {o}
        </label>
      ))}
    </fieldset>
  );
  return (
    <fieldset className="row" id="tr_section">
      <legend>Work eligibility</legend>
      {yn("tr_auth", "Are you legally authorized to work in India?")}
      {yn("tr_spons", "Will you require visa sponsorship?")}
      <label className="inline">
        <input type="checkbox" id="tr_consent" checked={!!fields.tr_consent} onChange={(e) => set("tr_consent", e.target.checked)} />
        I confirm these answers are accurate
      </label>
    </fieldset>
  );
}

// Radios of one question with no group around them: the question is only nearby text.
export function LooseRadios() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <p className="lbl">Gender</p>
      {["Male", "Female", "Prefer not to say"].map((o) => (
        <label key={o} className="inline">
          <input type="radio" name="tr_sex" checked={fields.tr_sex === o} onChange={() => set("tr_sex", o)} /> {o}
        </label>
      ))}
    </div>
  );
}

// A box that takes the focus back while what it holds is invalid.
export function ClingyPin() {
  const { fields, set } = useForm();
  const ref = useRef(null);
  const bad = fields.tr_pin != null && !/^\d{6}$/.test(fields.tr_pin);
  return (
    <div className="row">
      <label htmlFor="tr_pin">PIN code</label>
      <input id="tr_pin" ref={ref} value={fields.tr_pin ?? ""} onChange={(e) => set("tr_pin", e.target.value, false)}
        onBlur={() => { if (bad) setTimeout(() => ref.current && ref.current.focus(), 0); }} />
      {bad && <div className="err">Enter a 6-digit PIN code.</div>}
    </div>
  );
}

// An ARIA slider over a wide range whose every key press takes the page a while.
function SlowSlider() {
  const { fields, set } = useForm();
  const v = fields.tr_km ?? 0;
  return (
    <div className="row">
      <Lbl k="tr_km" text="Distance you can travel (km)" />
      <div className="track">
        <div role="slider" tabIndex={0} aria-labelledby="tr_km-lbl" aria-valuemin={0} aria-valuemax={500} aria-valuenow={v}
          className="thumb" style={{ left: `${(v / 500) * 100}%` }}
          onKeyDown={(e) => {
            const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            const t = performance.now(); while (performance.now() - t < 25) { /* a heavy handler */ }
            set("tr_km", Math.max(0, Math.min(500, v + d)));
          }} />
      </div>
      <div className="hint">{v} km</div>
    </div>
  );
}

export function Slot() {
  const { fields, set } = useForm();
  return (
    <fieldset className="row" id="tr_slot">
      <legend>Interview slot</legend>
      {["Morning", "Afternoon", "Evening"].map((o) => (
        <label key={o} className="inline">
          <input type="radio" name="tr_slot" checked={fields.tr_slot === o} onChange={() => set("tr_slot", o)} /> {o}
        </label>
      ))}
    </fieldset>
  );
}

// A list drawn on the page, always visible.
export function ShiftList() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <Lbl k="tr_shift" text="Preferred shift" />
      <ul role="listbox" aria-labelledby="tr_shift-lbl" className="lbox">
        {["Morning", "Evening", "Night"].map((o) => (
          <li key={o} role="option" aria-selected={fields.tr_shift === o} className={fields.tr_shift === o ? "hi" : ""}
            onClick={() => set("tr_shift", o)}>{o}</li>
        ))}
      </ul>
    </div>
  );
}

// An upload button whose file input is elsewhere in the form, beside a row that has its own.
export function Uploads({ resumeInput }) {
  const { fields, set } = useForm();
  const cover = useRef(null);
  return (
    <div>
      <div className="row">
        <p className="lbl">Résumé</p>
        <button type="button" onClick={() => resumeInput.current.click()}>Upload résumé</button>
        {fields.tr_resume && <div className="hint">Attached: {fields.tr_resume}</div>}
      </div>
      <div className="row">
        <p className="lbl">Cover letter</p>
        <button type="button" onClick={() => cover.current.click()}>Upload cover letter</button>
        <input ref={cover} type="file" style={{ display: "none" }} onChange={(e) => set("tr_cover", e.target.files[0]?.name || "")} />
        {fields.tr_cover && <div className="hint">Attached: {fields.tr_cover}</div>}
      </div>
    </div>
  );
}

// A dropdown filled in from the profile that can't be changed: its list never opens, and it takes no focus. It is
// on the page behind the dialog, so what it shows is read as page text.
function Locked() {
  const { fields } = useForm();
  return (
    <div className="row">
      <Lbl k="tr_lock" text="Gender on file" />
      <div role="combobox" aria-labelledby="tr_lock-lbl" aria-haspopup="listbox" aria-expanded={false}
        aria-disabled="true" className="spin">{fields.tr_lock}</div>
    </div>
  );
}

export function Langs() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <label htmlFor="tr_langs">Languages you speak</label>
      <select id="tr_langs" multiple value={fields.tr_langs || []}
        onChange={(e) => set("tr_langs", [...e.target.selectedOptions].map((o) => o.value))}>
        {["English", "Hindi", "Tamil", "Japanese"].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// A date box that clears itself on leaving when the date is before the first allowed one.
function StartDate() {
  const { fields, set } = useForm();
  const MIN = "2026-12-01";
  return (
    <div className="row">
      <label htmlFor="tr_start">Earliest start date</label>
      <input id="tr_start" type="date" min={MIN} value={fields.tr_start ?? ""} onChange={(e) => set("tr_start", e.target.value, false)}
        onBlur={(e) => { if (e.target.value && e.target.value < MIN) set("tr_start", ""); }} />
    </div>
  );
}

// A box that says, under itself, when what it was left holding is wrong.
export function Mobile() {
  const { fields, set } = useForm();
  const [left, setLeft] = useKept("Mobile.left", false);
  const bad = left && !/^\d{10}$/.test(fields.tr_mobile || "");
  return (
    <div className="row">
      <label htmlFor="tr_mobile">Mobile number</label>
      <input id="tr_mobile" value={fields.tr_mobile ?? ""} onChange={(e) => { setLeft(false); set("tr_mobile", e.target.value, false); }}
        onBlur={() => setLeft(true)} />
      {bad && <div className="err" role="alert">Enter a 10-digit mobile number.</div>}
    </div>
  );
}

// A plain box with a suggestion list: only a picked suggestion counts; typed text stays in the box.
export function Location() {
  const { fields, set } = useForm();
  const [q, setQ] = useKept("Location.q", null);
  const [open, setOpen] = useKept("Location.open", false);
  const ALL = ["Chennai, Tamil Nadu, India", "Chennai Central, Chennai, India", "Coimbatore, Tamil Nadu, India"];
  const shown = q ? ALL.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <div className="row" style={{ position: "relative" }}>
      <label htmlFor="tr_loc">Location</label>
      <input id="tr_loc" autoComplete="off" value={q ?? fields.tr_loc ?? ""}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }} />
      {open && shown.length > 0 && (
        <ul role="listbox" className="lbox" onMouseDown={(e) => e.preventDefault()}>
          {shown.map((o) => <li key={o} role="option" aria-selected={false}
            onClick={() => { set("tr_loc", o); setQ(o); setOpen(false); }}>{o}</li>)}
        </ul>
      )}
    </div>
  );
}

// An upload button whose input is elsewhere, beside a row that is a plain file input of its own.
export function MoreUploads({ portfolioInput }) {
  const { fields, set } = useForm();
  return (
    <div>
      <div className="row">
        <p className="lbl">Portfolio</p>
        <button type="button" onClick={() => portfolioInput.current.click()}>Upload portfolio</button>
        {fields.tr_portfolio && <div className="hint">Attached: {fields.tr_portfolio}</div>}
      </div>
      <div className="row">
        <label htmlFor="tr_sample">Writing sample</label>
        <input id="tr_sample" type="file" onChange={(e) => set("tr_sample", e.target.files[0]?.name || "")} />
      </div>
    </div>
  );
}

// A dropdown drawn as a read-only box showing the pick. groups: [[heading or null, [[text, disabled]]]]; a disabled
// option still takes a click (the page only styles it); a pick under a heading is recorded with its heading.
export function ListPick({ k, label, groups }) {
  const { fields, set } = useForm();
  const [open, setOpen] = useKept(`ListPick.open.${k}`, false);
  return (
    <div className="row" style={{ position: "relative" }}>
      <Lbl k={k} text={label} />
      <input id={k} role="combobox" readOnly aria-labelledby={`${k}-lbl`} aria-controls={`${k}-list`} aria-expanded={open}
        placeholder="Select" value={fields[k] ?? ""} onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }} />
      {open && (
        <div role="listbox" id={`${k}-list`} className="lbox" onMouseDown={(e) => e.preventDefault()}>
          {groups.map(([g, opts], gi) => (
            <div key={gi} role={g ? "group" : undefined} aria-label={g || undefined}>
              {g && <div className="hint">{g}</div>}
              {opts.map(([o, off], oi) => (
                <div key={oi} role="option" aria-selected={false} aria-disabled={off ? "true" : undefined}
                  style={off ? { color: "#999" } : undefined}
                  onClick={() => { set(k, g ? `${o}, ${g}` : o); setOpen(false); }}>{o}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A switch the page has turned off for this applicant; its handler doesn't check.
export function OffSwitch() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <div role="checkbox" tabIndex={0} aria-checked={!!fields.tr_news} aria-disabled="true" className="spin"
        onClick={() => set("tr_news", !fields.tr_news)}>Subscribe to the newsletter</div>
    </div>
  );
}

function Dept() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <label htmlFor="tr_dept">Department</label>
      <select id="tr_dept" value={fields.tr_dept ?? ""} onChange={(e) => set("tr_dept", e.target.value)}>
        <option value="">Select...</option>
        <optgroup label="Engineering"><option value="eng-robotics">Robotics</option><option value="eng-other">Other</option></optgroup>
        <optgroup label="Sales"><option value="sales-field">Field sales</option><option value="sales-other">Other</option></optgroup>
      </select>
    </div>
  );
}

// A box checked by the server a moment after it is left.
export function Email() {
  const { fields, set } = useForm();
  const [taken, setTaken] = useKept("Email.taken", false);
  return (
    <div className="row">
      <label htmlFor="tr_email">Email</label>
      <input id="tr_email" type="email" value={fields.tr_email ?? ""}
        onChange={(e) => { setTaken(false); set("tr_email", e.target.value, false); }}
        onBlur={(e) => { const v = e.target.value; setTimeout(() => setTaken(v.startsWith("taken@")), 700); }} />
      {taken && <div className="err" role="alert">This email is already registered.</div>}
    </div>
  );
}

export function Referral() {
  const { fields, set } = useForm();
  return (
    <div className="row">
      <label htmlFor="tr_ref">Referral code</label>
      <input id="tr_ref" value={fields.tr_ref ?? ""} onChange={(e) => set("tr_ref", e.target.value, false)} />
    </div>
  );
}

// A yes/no question that answers "No" with an error in its own group.
export function Office() {
  const { fields, set } = useForm();
  return (
    <fieldset className="row" id="tr_office">
      <legend>Can you work from the Chennai office?</legend>
      {["Yes", "No"].map((o) => (
        <label key={o} className="inline">
          <input type="radio" name="tr_office" checked={fields.tr_office === o} onChange={() => set("tr_office", o)} /> {o}
        </label>
      ))}
      {fields.tr_office === "No" && <div className="err" role="alert">This role needs you in the Chennai office.</div>}
    </fieldset>
  );
}

const CITIES = ["Chennai", "Coimbatore", "Bengaluru", "Hyderabad", "Mumbai", "Pune"];
const TEAMS = ["Platform", "Robotics", "Perception", "Fleet Tools"];

export function Traps() {
  const { fields, set } = useForm();
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
      <Locked />
      {open && createPortal(
        <div className="backdrop">
          <div role="dialog" aria-modal="true" aria-label="Apply" className="dialog" style={{ maxHeight: "90vh", overflow: "auto" }}>
            <Shell>
              <TypeAhead k="tr_city" label="Current city" options={CITIES} />
              <Section />
              <LooseRadios />
              <ClingyPin />
              <TypeAhead k="tr_pref" label="Preferred city" options={CITIES} />
              <SlowSlider />
              <Slot />
              <ShiftList />
              <TypeAhead k="tr_team" label="Team" options={TEAMS} />
              <Uploads resumeInput={resumeInput} />
              <MoreUploads portfolioInput={portfolioInput} />
              <ListPick k="tr_day" label="Interview day" groups={[[null, [["Monday", true], ["Tuesday"], ["Wednesday"]]]]} />
              <OffSwitch />
              <ListPick k="tr_where" label="City of the office"
                groups={[["Telangana", [["Hyderabad"], ["Warangal"]]], ["Sindh", [["Hyderabad"], ["Karachi"]]]]} />
              <Dept />
              <Email />
              <Referral />
              <Office />
              <Langs />
              <StartDate />
              <Mobile />
              <Location />
              <input ref={resumeInput} type="file" style={{ display: "none" }} onChange={(e) => set("tr_resume", e.target.files[0]?.name || "")} />
              <input ref={portfolioInput} type="file" style={{ display: "none" }} onChange={(e) => set("tr_portfolio", e.target.files[0]?.name || "")} />
            </Shell>
          </div>
        </div>, document.body)}
    </div>
  );
}
