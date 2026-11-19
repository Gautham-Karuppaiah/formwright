// longform: one long page with Ametek's traits (Oracle-style "Add" rows, seen live 2026-11-11): about forty custom
// dropdowns from five libraries, most of them inside rows that an Add button appends in place, every row with the
// same labels ("Row number 2" tells them apart). Plain Haiku spent ~4 calls per dropdown there (click, type, find,
// click the option).
import React from "react";
import { Shell } from "./scenarios";
import { Check, Down, File, Headless, MuiAuto, MuiSel, RSelect, Text } from "./widgets";
import { useForm } from "./store";
import { COUNTRIES, LANGUAGES, MONTHS, PROFICIENCY, STATES, YEARS } from "./data";

export const CITY_LIST = ["Chennai", "Chennai Free Trade Zone", "Coimbatore", "Madurai", "Bengaluru", "Hyderabad", "Mumbai", "Pune"];

// A list of rows: an Add button appends an empty row in place; each row has the same fields.
export function Rows({ k, title, add, cols }) {
  const { fields, set, meta } = useForm();
  const list = fields[k] || [];
  const put = (id, c, v) => set(k, (l) => (l || []).map((r) => (r.id === id ? { ...r, [c]: v } : r)));
  const bad = meta.errors.includes(k);
  return (
    <section>
      <h3>{title}</h3>
      {list.map((r, i) => (
        <div key={r.id} className="entry" role="group" aria-label={`${title}: row number ${i + 1}`}>
          <div className="lbl">Row number {i + 1}</div>
          {cols.map(({ c, label, W, options }) => (
            <W key={c} k={`${k}-${r.id}-${c}`} label={label} options={options} required
               bind={{ value: r[c] ?? "", set: (v) => put(r.id, c, v) }} />
          ))}
          <button type="button" onClick={() => set(k, (l) => l.filter((x) => x.id !== r.id))}>Remove row {i + 1}</button>
        </div>
      ))}
      {bad && <div className="err" role="alert">Complete every field of every {title.toLowerCase()} row.</div>}
      <button type="button" onClick={() => set(k, (l) => [...(l || []), { id: Date.now() % 1e8 + (l || []).length }])}>{add}</button>
    </section>
  );
}

export const WORK = [
  { c: "title", label: "Job Title", W: Text },
  { c: "company", label: "Company", W: Text },
  { c: "start_month", label: "Start Month", W: RSelect, options: MONTHS },
  { c: "start_year", label: "Start Year", W: RSelect, options: YEARS },
  { c: "end_month", label: "End Month", W: RSelect, options: MONTHS },
  { c: "end_year", label: "End Year", W: RSelect, options: YEARS },
];
export const EDUCATION = [
  { c: "school", label: "School", W: Text },
  { c: "degree", label: "Degree", W: MuiAuto, options: ["High School", "Associate", "Bachelors", "Masters", "Doctorate"] },
  { c: "major", label: "Major", W: Headless, options: ["Computer Science", "Electrical Engineering", "Electronics and Communication",
    "Information Technology", "Mechanical Engineering", "Mathematics"] },
  { c: "year", label: "Graduation Year", W: RSelect, options: YEARS },
];
export const LANGS = [
  { c: "language", label: "Language", W: RSelect, options: LANGUAGES },
  { c: "speaking", label: "Speaking Proficiency", W: MuiSel, options: PROFICIENCY },
  { c: "reading", label: "Reading Proficiency", W: MuiSel, options: PROFICIENCY },
  { c: "writing", label: "Writing Proficiency", W: MuiSel, options: PROFICIENCY },
];
const LISTS = { work: WORK, education: EDUCATION, languages: LANGS };
const REQ = ["first_name", "last_name", "email", "phone_code", "phone", "country", "state", "city", "address1", "pincode",
  "resume", "relocate", "notice", "sponsorship", "worked_before", "source", "certify"];

export function Longform() {
  const { fields, setMeta } = useForm();
  const submit = () => {
    const errors = REQ.filter((k) => !fields[k]);
    for (const [k, cols] of Object.entries(LISTS))
      if ((fields[k] || []).some((r) => cols.some(({ c }) => !r[c]))) errors.push(k);
    setMeta((m) => ({ ...m, errors, submitted: !errors.length }));
  };
  const { meta } = useForm();
  return (
    <Shell>
      <h3>Personal Information</h3>
      <Text k="first_name" label="First Name" required />
      <Text k="last_name" label="Last Name" required />
      <Text k="email" label="Email" type="email" required />
      <RSelect k="phone_code" label="Phone Country Code" required options={COUNTRIES.map(([n, c]) => `${n} (${c})`)} />
      <Text k="phone" label="Primary Phone" type="tel" required />
      <Headless k="country" label="Country" required options={COUNTRIES.map((c) => c[0])} />
      <Down k="state" label="State" required options={STATES.India} />
      <MuiAuto k="city" label="City" required options={CITY_LIST} />
      <Text k="address1" label="Address Line 1" required />
      <Text k="pincode" label="Postal Code" required />
      <h3>Resume</h3>
      <File k="resume" label="Upload Resume" required />
      <Rows k="work" title="Previous Employment" add="+ Add Previous Employment" cols={WORK} />
      <Rows k="education" title="Education" add="+ Add Education" cols={EDUCATION} />
      <Rows k="languages" title="Language Skills" add="+ Add Language Skills" cols={LANGS} />
      <h3>Application Questions</h3>
      <Down k="relocate" label="Are you willing to relocate?" required options={["Yes", "No"]} />
      <MuiSel k="notice" label="Notice Period" required options={["Immediate", "2 weeks", "1 month", "2 months", "3 months"]} />
      <Headless k="sponsorship" label="Will you require visa sponsorship to work in India?" required options={["Yes", "No"]} />
      <RSelect k="worked_before" label="Have you previously worked for Acme Robotics?" required options={["Yes", "No"]} />
      <RSelect k="source" label="How did you hear about this position?" required
        options={["Company Website", "LinkedIn", "Job Board", "Employee Referral", "Other"]} />
      <Check k="certify" label="I certify that the information provided is true and complete" required />
      <div className="actions">
        {meta.errors.length > 0 && <div className="summary" role="alert">Please fix {meta.errors.length} error{meta.errors.length > 1 ? "s" : ""}: {meta.errors.join(", ")}.</div>}
        <button type="button" className="primary" onClick={submit}>Submit application</button>
      </div>
    </Shell>
  );
}
