// The scenarios. Each is one job application; bench/expected.yaml says what a correct fill looks like.
import React, { useState } from "react";
import { COUNTRIES, STATES, CITIES, PINS, MONTHS, YEARS } from "./data";
import { delay, useForm, validate } from "./store";
import { Check, DateP, Down, File, Headless, HiddenCheck, MuiAuto, MuiSel, NativeSelect, Radios, RAsync, RSelect, Split, Text } from "./widgets";

const COUNTRY_NAMES = COUNTRIES.map((c) => c[0]);

function Actions({ required, last, onNext }) {
  const { fields, meta, setMeta } = useForm();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const errors = validate(fields, required);
    setMeta((m) => ({ ...m, errors }));
    if (errors.length) return;
    setBusy(true);
    await delay(600);
    setBusy(false);
    if (last) setMeta((m) => ({ ...m, submitted: true }));
    else { onNext(); window.scrollTo(0, 0); }
  };
  return (
    <div className="actions">
      {meta.errors.length > 0 && (
        <div className="summary" role="alert">Please fix {meta.errors.length} error{meta.errors.length > 1 ? "s" : ""} before continuing.</div>
      )}
      <button type="button" className="primary" disabled={busy} onClick={go}>
        {busy ? "Please wait..." : last ? "Submit application" : "Next"}
      </button>
    </div>
  );
}

function Shell({ steps, children }) {
  const { meta } = useForm();
  if (meta.submitted) return <div className="done"><h2>Thank you for applying!</h2><p>Your application has been submitted.</p></div>;
  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      {steps && <div className="steps">Step {meta.step} of {steps}</div>}
      {children}
    </form>
  );
}

// ---------- basics: plain HTML controls ----------
export function Basics() {
  const req = ["first_name", "last_name", "email", "phone_code", "phone", "gender", "dob", "qualification",
    "auth_india", "sponsorship", "resume", "consent"];
  return (
    <Shell>
      <h3>Personal details</h3>
      <Text k="first_name" label="First name" required />
      <Text k="middle_name" label="Middle name" />
      <Text k="last_name" label="Last name" required />
      <Text k="email" label="Email address" type="email" required />
      <NativeSelect k="phone_code" label="Phone country code" required options={COUNTRIES.map(([n, c]) => `${c} ${n}`)} />
      <Text k="phone" label="Mobile number" type="tel" required />
      <Radios k="gender" label="Gender" required options={["Male", "Female", "Non-binary", "Prefer not to say"]} />
      <Split k="dob" label="Date of birth" required parts={[["Day", 2, "DD"], ["Month", 2, "MM"], ["Year", 4, "YYYY"]]} />
      <h3>Eligibility</h3>
      <NativeSelect k="qualification" label="Highest qualification" required
        options={["High school", "Diploma", "Bachelor's degree", "Master's degree", "PhD"]} />
      <Radios k="auth_india" label="Are you legally authorized to work in India?" required options={["Yes", "No"]} />
      <Radios k="sponsorship" label="Will you now or in the future require visa sponsorship to work in India?" required options={["Yes", "No"]} />
      <h3>Documents</h3>
      <File k="resume" label="Resume / CV" required />
      <Text k="cover_letter" label="Cover letter (optional)" textarea />
      <Check k="marketing" label="Send me job alerts and news from Acme Robotics" />
      <HiddenCheck k="consent" before="I have read and agree to the " link="Privacy Notice" required />
      <Actions required={req} last />
    </Shell>
  );
}

// ---------- widgets: library dropdowns, pickers, comboboxes ----------
export function Widgets() {
  const req = ["phone_country", "years_experience", "notice_period", "nationality", "source", "preferred_location",
    "start_date", "graduation", "expected_ctc", "languages"];
  return (
    <Shell>
      <h3>Contact</h3>
      <RSelect k="phone_country" label="Country code" required options={COUNTRIES.map(([n, c]) => `${n} (${c})`)} />
      <h3>Experience</h3>
      <RSelect k="years_experience" label="Total years of experience" required options={["Fresher / 0", "1-2", "3-5", "5+"]} />
      <MuiSel k="notice_period" label="Notice period" required options={["Immediate", "15 days", "30 days", "60 days", "90 days"]} />
      <MuiAuto k="nationality" label="Nationality (country)" required options={COUNTRY_NAMES} />
      <Headless k="source" label="How did you hear about this job?" required
        options={["Company website", "Employee referral", "LinkedIn", "Naukri", "Campus event", "Other"]} />
      <Down k="preferred_location" label="Preferred work location" required
        options={["Bengaluru", "Chennai", "Gurugram", "Hyderabad", "Mumbai", "Pune"]} />
      <DateP k="start_date" label="Earliest start date" required />
      <DateP k="graduation" label="Graduation date" required month />
      <Text k="expected_ctc" label="Expected annual CTC (in LPA)" required />
      <RSelect k="languages" label="Languages you speak" required multi
        options={["Arabic", "English", "French", "German", "Hindi", "Japanese", "Kannada", "Tamil", "Telugu"]} />
      <Actions required={req} last />
    </Shell>
  );
}

// ---------- address: each answer decides the next field's options; changing one clears the rest ----------
export function AddressBlock() {
  const { fields, set } = useForm();
  const country = fields.country || "";
  const st = fields.state || "";
  const city = fields.city?.value || "";
  const clear = (...ks) => ks.forEach((k) => set(k, ""));
  return (
    <>
      <Text k="address1" label="Address line 1" required />
      <Text k="address2" label="Address line 2" />
      <CascadeCountry onPick={() => clear("state", "city", "pincode")} />
      <div key={`s-${country}`}>
        {country && <CascadeState options={STATES[country] || ["Other"]} onPick={() => clear("city", "pincode")} />}
      </div>
      <div key={`c-${country}-${st}`}>
        {st && <RAsync k="city" label="City or town" required short
          search={async () => { await delay(500); return (CITIES[st] || ["Other"]).map((c) => ({ value: c, label: `${c}, ${st}` })); }} />}
      </div>
      <div key={`p-${country}-${st}-${city}`}>
        {city && <RAsync k="pincode" label="PIN code" required minChars={3} placeholder="Type to search"
          search={async (q) => {
            await delay(700);
            if ((q || "").length < 3) return [];
            const ql = q.toLowerCase();
            return (PINS[city] || []).filter(([p, a]) => p.startsWith(q) || a.toLowerCase().includes(ql))
              .map(([p, a]) => ({ value: p, label: `${p} - ${a}` }));
          }} />}
      </div>
    </>
  );
}

function CascadeCountry({ onPick }) {
  const { fields, set, meta } = useForm();
  return <MuiAutoRaw k="country" label="Country" value={fields.country} errors={meta.errors}
    onChange={(v) => { if (v !== fields.country) { onPick(); set("country", v || ""); } }} />;
}
function CascadeState({ options, onPick }) {
  const { fields, set } = useForm();
  return <RSelectRaw k="state" label="State or province" options={options} value={fields.state}
    onChange={(v) => { if (v !== fields.state) { onPick(); set("state", v); } }} />;
}

// Same widgets, with an onChange that does more than store the value.
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Select from "react-select";
function MuiAutoRaw({ k, label, value, onChange, errors }) {
  return (
    <div className="row">
      <Autocomplete id={k} options={COUNTRY_NAMES} value={value || null} onChange={(_, v) => onChange(v)}
        renderInput={(p) => <TextField {...p} label={label} required size="small" error={errors.includes(k)}
          helperText={errors.includes(k) ? "This field is required." : null} />} />
    </div>
  );
}
function RSelectRaw({ k, label, options, value, onChange }) {
  const { meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <label htmlFor={k}>{label}<span className="req"> *</span></label>
      <Select inputId={k} instanceId={k} options={options.map((x) => ({ value: x, label: x }))} classNamePrefix="rs"
        value={value ? { value, label: value } : null} onChange={(o) => onChange(o?.value || "")} />
      {meta.errors.includes(k) && <div className="err" role="alert">This field is required.</div>}
    </div>
  );
}

export function Address() {
  return (
    <Shell>
      <h3>Home address</h3>
      <AddressBlock />
      <Actions required={["address1", "country", "state", "city", "pincode"]} last />
    </Shell>
  );
}

// ---------- experience: entry cards, Edit only shows on hover / focus ----------
const IMPORTED = [
  { id: 1, title: "Software Developer Intern", company: "Halcyon Byteworks", location: "Dubai, UAE",
    start_month: "January", start_year: "2026", end_month: "July", end_year: "2026", current: false },
  { id: 2, title: "ML Intern", company: "Bluefin Analytics Solutions & Technologies", location: "Dubai, UAE",
    start_month: "June", start_year: "2024", end_month: "", end_year: "", current: false },
];
const missingIn = (e) => ["title", "company", "start_month", "start_year"].filter((k) => !e[k])
  .concat(!e.current && (!e.end_month || !e.end_year) ? ["end date"] : []);

export function Experience() {
  const { fields, set, meta, setMeta } = useForm();
  const list = fields.experience || [];
  const [editing, setEditing] = useState(null);       // entry id, or "new"
  const save = (e) => {
    set("experience", (l) => (e.id && (l || []).some((x) => x.id === e.id)
      ? l.map((x) => (x.id === e.id ? e : x)) : [...(l || []), { ...e, id: Date.now() }]));
    setEditing(null);
  };
  const bad = list.filter((e) => missingIn(e).length);
  return (
    <Shell>
      <h3>Work experience</h3>
      <p className="hint">We imported {IMPORTED.length} entries from your resume. Check them and add anything missing.</p>
      {list.map((e) => (editing === e.id ? <EntryForm key={e.id} init={e} onSave={save} onCancel={() => setEditing(null)} /> : (
        <div key={e.id} className={`card${missingIn(e).length ? " needs" : ""}`} tabIndex={0}>
          <div className="card-title">{e.title || "(no title)"}</div>
          <div>{e.company}{e.location ? ` · ${e.location}` : ""}</div>
          <div>{e.start_month} {e.start_year} – {e.current ? "Present" : `${e.end_month} ${e.end_year}`.trim() || "?"}</div>
          {missingIn(e).length > 0 && <div className="err">Needs attention: {missingIn(e).join(", ")} required.</div>}
          <div className="card-actions">
            <button type="button" onClick={() => setEditing(e.id)}>Edit</button>
            <button type="button" onClick={() => set("experience", (l) => l.filter((x) => x.id !== e.id))}>Delete</button>
          </div>
        </div>
      )))}
      {editing === "new" ? <EntryForm init={{}} onSave={save} onCancel={() => setEditing(null)} />
        : <button type="button" onClick={() => setEditing("new")}>+ Add experience</button>}
      <div className="actions">
        {meta.errors.length > 0 && <div className="summary" role="alert">Please complete every work experience entry.</div>}
        <button type="button" className="primary" onClick={() => {
          const errors = bad.length || editing ? ["experience"] : [];
          setMeta((m) => ({ ...m, errors, submitted: !errors.length }));
        }}>Submit application</button>
      </div>
    </Shell>
  );
}

function EntryForm({ init, onSave, onCancel }) {
  const [e, setE] = useState({ title: "", company: "", location: "", start_month: "", start_year: "", end_month: "",
    end_year: "", current: false, ...init });
  const [err, setErr] = useState(null);
  const f = (k) => ({ id: `exp-${k}`, value: e[k], onChange: (ev) => setE({ ...e, [k]: ev.target.value }) });
  const sel = (k, label, opts) => (
    <div className="row"><label htmlFor={`exp-${k}`}>{label}</label>
      <select {...f(k)}><option value="">Select...</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
  );
  return (
    <div className="entry" role="group" aria-label="Work experience entry">
      <div className="row"><label htmlFor="exp-title">Job title *</label><input {...f("title")} /></div>
      <div className="row"><label htmlFor="exp-company">Company *</label><input {...f("company")} /></div>
      <div className="row"><label htmlFor="exp-location">Location</label><input {...f("location")} /></div>
      <div className="pair">{sel("start_month", "Start month *", MONTHS)}{sel("start_year", "Start year *", YEARS)}</div>
      <label className="inline"><input type="checkbox" id="exp-current" checked={e.current}
        onChange={(ev) => setE({ ...e, current: ev.target.checked })} /> I currently work here</label>
      {!e.current && <div className="pair">{sel("end_month", "End month *", MONTHS)}{sel("end_year", "End year *", YEARS)}</div>}
      {err && <div className="err" role="alert">{err}</div>}
      <button type="button" className="primary" onClick={() => {
        const m = missingIn(e);
        if (m.length) setErr(`Required: ${m.join(", ")}`); else onSave(e);
      }}>Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}
export const EXPERIENCE_INITIAL = { experience: IMPORTED };

// ---------- wizard: three steps, errors after Next, a question that reveals another ----------
export function Wizard() {
  const { fields, meta, setMeta } = useForm();
  const next = () => setMeta((m) => ({ ...m, step: m.step + 1, errors: [] }));
  return (
    <Shell steps={3}>
      {meta.step === 1 && <>
        <h3>Contact information</h3>
        <Text k="w_first" label="Given name" required />
        <Text k="w_last" label="Family name" required />
        <Text k="w_email" label="Email" type="email" required />
        <Text k="w_phone" label="Phone number (with country code)" type="tel" required />
        <Actions required={["w_first", "w_last", "w_email", "w_phone"]} onNext={next} />
      </>}
      {meta.step === 2 && <>
        <h3>Address and education</h3>
        <AddressBlock />
        <Text k="w_university" label="University / college" required />
        <Text k="w_cgpa" label="CGPA (out of 10)" required />
        <Radios k="w_student" label="Are you currently enrolled as a student?" required options={["Yes", "No"]} />
        <Actions required={["address1", "country", "state", "city", "pincode", "w_university", "w_cgpa", "w_student"]} onNext={next} />
      </>}
      {meta.step === 3 && <>
        <h3>A few more questions</h3>
        <Radios k="w_referred" label="Were you referred by a current employee?" required options={["Yes", "No"]} />
        {fields.w_referred === "Yes" && <Text k="w_referrer" label="Referrer's name" required />}
        <Radios k="w_worked_before" label="Have you previously worked for Acme Robotics?" required options={["Yes", "No"]} />
        <Radios k="w_relatives" label="Do you have relatives employed at Acme Robotics?" required options={["Yes", "No"]} />
        <Radios k="w_noncompete" label="Are you bound by a non-compete agreement?" required options={["Yes", "No"]} />
        <Check k="w_certify" label="I certify that the information provided is true and complete" required />
        <Actions required={["w_referred", "w_worked_before", "w_relatives", "w_noncompete", "w_certify",
          ...(fields.w_referred === "Yes" ? ["w_referrer"] : [])]} last />
      </>}
    </Shell>
  );
}
