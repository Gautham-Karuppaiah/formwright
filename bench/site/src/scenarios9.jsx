// bigform: one long application with everything a large employer's careers site asks of a fresher: account,
// personal details, two addresses, school and degree marks, every internship with its description, projects,
// languages, a hands-on-experience question for each of seventy-five technologies and nineteen areas, work locations, the usual screening
// questions and declarations, and a review page listing every answer, over thirteen steps. Nothing on it is padding; it is long
// because the application is. The password chosen on the first step is asked for again before sending, after a
// sign-in timeout: the page never shows it again, so only the run itself can know it.
import React from "react";
import { Shell, Actions } from "./scenarios";
import { Check, Down, File, Headless, MuiAuto, MuiSel, NativeSelect, Radios, RSelect, Split, Text } from "./widgets";
import { useForm, useKept } from "./store";
import { COUNTRIES, MONTHS, STATES, YEARS } from "./data";
import { CITY_LIST, LANGS, Rows } from "./scenarios5";
import { SCHOOLS, SearchPrompt, SOURCES, STUDY } from "./scenarios2";

const RULE_TEXT = "8 to 12 characters, with at least one uppercase letter and one number. The only symbols allowed are _ and -.";
const fitsRule = (p) => p.length >= 8 && p.length <= 12 && /[A-Z]/.test(p) && /\d/.test(p) && /^[A-Za-z0-9_-]+$/.test(p);
const STEPS = 13;
const Area = (p) => <Text {...p} textarea />;
const YESNO = ["Yes", "No"];
const BOARDS = ["CBSE", "ICSE", "State Board", "IB", "NIOS", "Other"];
const SCHOOL_YEARS = Array.from({ length: 12 }, (_, i) => String(2015 + i));

// hands-on experience questions: the applicant's resume names some of these, not others
export const TECH_A = ["Python", "C++", "Java", "TypeScript", "JavaScript", "Go", "Rust", "Kotlin", "C#", "SQL", "PHP",
  "Ruby", "HTML/CSS", "MATLAB", "Node.js", "Express", "Django", "Spring Boot", "React", "Angular", "Vue", "Tailwind CSS",
  "PyQt6", "Flutter", "REST APIs"];
export const TECH_B = ["PostgreSQL", "SQLite", "MongoDB", "Redis", "Kafka", "WebSockets", "AWS", "Azure", "Google Cloud",
  "Docker", "Kubernetes", "Terraform", "Linux", "Git", "GitHub Actions", "Jenkins", "TensorFlow", "PyTorch",
  "scikit-learn", "NumPy", "Pandas", "Apache Spark", "Selenium", "ROS", "Hadoop"];
export const TECH_C = ["Swift", "Scala", "R", "Perl", "Elixir", "Haskell", "Next.js", "Svelte", "FastAPI", "Flask",
  "Laravel", ".NET", "GraphQL", "gRPC", "MySQL", "Oracle Database", "Cassandra", "Elasticsearch", "RabbitMQ", "Ansible",
  "Prometheus", "Grafana", "OpenCV", "Nginx", "WebAssembly"];
export const AREAS = ["Penetration testing", "SIEM and log monitoring", "Load balancing", "Demand forecasting",
  "Neural networks", "Computer vision", "SLAM", "Embedded C", "RTOS", "CAN bus", "PLC programming", "CUDA", "FPGA design",
  "Mobile app development", "Blockchain", "Augmented reality", "Real-time multiplayer systems", "Self-hosted servers",
  "Extracting data from PDF and CSV files"];
export const slug = (t) => t.toLowerCase().replace(/\+/g, "p").replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, "_");
const TECH_W = [Radios, Down, RSelect, Headless, MuiSel];
function TechStep({ title, list }) {
  return (
    <>
      <h3>{title}</h3>
      <p className="hint">Answer Yes only for technologies you have used yourself in work, internships or projects.</p>
      {list.map((t, i) => {
        const W = TECH_W[i % TECH_W.length];
        return <W key={t} k={`sk_${slug(t)}`} label={`Hands-on experience with ${t}?`} required options={YESNO} />;
      })}
    </>
  );
}
export const PLACES = ["Chennai", "Bengaluru", "Hyderabad", "Pune", "Mumbai", "Noida", "Kolkata", "Coimbatore", "Kochi", "Ahmedabad"];

function Review() {
  const { fields } = useForm();
  const show = (v) => (Array.isArray(v) ? v.map((r) => (typeof r === "object" ? Object.entries(r).filter(([c]) => c !== "id")
    .map(([c, x]) => `${c}: ${x}`).join(", ") : r)).join(" | ") : typeof v === "object" && v ? Object.values(v).join("/") : String(v));
  return (
    <dl>
      {Object.entries(fields).filter(([k]) => !["account_ok", "signed_in_again"].includes(k)).map(([k, v]) => (
        <React.Fragment key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{show(v)}</dd></React.Fragment>
      ))}
    </dl>
  );
}

const WORK = [
  { c: "title", label: "Job Title", W: Text },
  { c: "company", label: "Company", W: Text },
  { c: "location", label: "Location", W: Text },
  { c: "start_month", label: "Start Month", W: RSelect, options: MONTHS },
  { c: "start_year", label: "Start Year", W: RSelect, options: YEARS },
  { c: "end_month", label: "End Month", W: MuiSel, options: MONTHS },
  { c: "end_year", label: "End Year", W: MuiSel, options: YEARS },
  { c: "description", label: "Responsibilities and achievements", W: Area },
];
const PROJECTS = [
  { c: "name", label: "Project Title", W: Text },
  { c: "tech", label: "Technologies Used", W: Text },
  { c: "description", label: "Project Description", W: Area },
];

// a sign-in box whose values live in the page only, never in the graded record: the page records whether they worked
function useBoxes(name) {
  const [f, setF] = useKept(`Bigform.${name}`, {});
  const box = (k, label, type = "text") => (
    <div className="row"><label htmlFor={k}>{label} *</label>
      <input id={k} type={type} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return [f, box];
}

function CreateAccount({ onDone }) {
  const [f, box] = useBoxes("signup");
  const [err, setErr] = useKept("Bigform.signupErr", null);
  return (
    <div className="card">
      <h2>Create your candidate account</h2>
      <p>You need an account to apply. You will sign in with it again before you send your application.</p>
      {box("su_email", "Email address", "email")}
      {box("su_password", "Password", "password")}
      <div className="hint" id="rules">Password rules: {RULE_TEXT}</div>
      {box("su_confirm", "Confirm password", "password")}
      {err && <div className="err" role="alert">{err}</div>}
      <button type="button" className="primary" onClick={() => {
        const p = f.su_password || "";
        if (!f.su_email || !p) return setErr("Fill in every field.");
        if (!fitsRule(p)) return setErr(`That password doesn't meet the rules: ${RULE_TEXT}`);
        if (p !== f.su_confirm) return setErr("The passwords don't match.");
        setErr(null);
        onDone(f.su_email, p);
      }}>Create account</button>
    </div>
  );
}

function SignInAgain({ account, onDone }) {
  const [f, box] = useBoxes("signin");
  const [err, setErr] = useKept("Bigform.signinErr", null);
  return (
    <div className="card" role="region" aria-label="Sign in again">
      <h2>Your sign-in has timed out</h2>
      <p>Your answers are saved. For your security, sign in again to review and send your application.</p>
      {box("si_email", "Email address", "email")}
      {box("si_password", "Password", "password")}
      {err && <div className="err" role="alert">{err}</div>}
      <button type="button" className="primary" onClick={() => {
        if ((f.si_email || "").trim().toLowerCase() !== account.email.trim().toLowerCase() || f.si_password !== account.password)
          return setErr("The email address or password is incorrect.");
        setErr(null);
        onDone();
      }}>Sign in</button>
    </div>
  );
}

function Address({ p, title }) {
  return (
    <>
      <h3>{title}</h3>
      <Text k={`${p}_line1`} label="Address Line 1" required />
      <Text k={`${p}_line2`} label="Address Line 2" />
      <Headless k={`${p}_country`} label="Country" required options={COUNTRIES.map((c) => c[0])} />
      <Down k={`${p}_state`} label="State" required options={STATES.India} />
      <MuiAuto k={`${p}_city`} label="City" required options={CITY_LIST} />
      <Text k={`${p}_pincode`} label="PIN Code" required />
    </>
  );
}

function School({ p, title }) {
  return (
    <>
      <h3>{title}</h3>
      <NativeSelect k={`${p}_board`} label="Board" required options={BOARDS} />
      <Text k={`${p}_school`} label="School Name" required />
      <RSelect k={`${p}_year`} label="Year of Passing" required options={SCHOOL_YEARS} />
      <Text k={`${p}_percent`} label="Percentage" required />
    </>
  );
}

export function Bigform() {
  const { fields, set, meta, setMeta } = useForm();
  const [account, setAccount] = useKept("Bigform.account", null);
  const next = () => setMeta((m) => ({ ...m, step: m.step + 1, errors: [] }));
  const rowsDone = (k, cols) => (fields[k] || []).length > 0 && (fields[k] || []).every((r) => cols.every(({ c }) => r[c]));
  const withRows = (required, lists) => () => {
    const empty = (v) => v === undefined || v === null || v === "" || v === false;
    const errors = [...required.filter((k) => empty(fields[k])), ...lists.filter(([k, cols]) => !rowsDone(k, cols)).map(([k]) => k)];
    setMeta((m) => (errors.length ? { ...m, errors } : { ...m, errors: [], step: m.step + 1 }));
  };
  if (meta.step === 1)
    return <CreateAccount onDone={(email, password) => { setAccount({ email, password }); set("account_ok", true); next(); }} />;
  if (meta.step === STEPS && !fields.signed_in_again)
    return <SignInAgain account={account || { email: "", password: null }} onDone={() => set("signed_in_again", true)} />;
  return (
    <Shell steps={STEPS}>
      {meta.step === 2 && <>
        <h3>Personal Details</h3>
        <Text k="first_name" label="First Name" required />
        <Text k="middle_name" label="Middle Name" />
        <Text k="last_name" label="Last Name" required />
        <Split k="dob" label="Date of Birth" required parts={[["Day", 2, "DD"], ["Month", 2, "MM"], ["Year", 4, "YYYY"]]} />
        <Radios k="gender" label="Gender" required options={["Male", "Female", "Transgender", "Prefer not to say"]} />
        <RSelect k="marital" label="Marital Status" required options={["Single", "Married", "Divorced", "Widowed"]} />
        <Headless k="nationality" label="Nationality" required options={["Indian", "Nepalese", "Sri Lankan", "Bangladeshi", "Other"]} />
        <MuiSel k="category" label="Category" required options={["General", "OBC", "SC", "ST", "EWS"]} />
        <Text k="email" label="Email" type="email" required />
        <RSelect k="phone_code" label="Phone Country Code" required options={COUNTRIES.map(([n, c]) => `${n} (${c})`)} />
        <Text k="phone" label="Mobile Number" type="tel" required />
        <Text k="linkedin" label="LinkedIn Profile URL" />
        <Text k="github" label="GitHub Profile URL" />
        <Actions required={["first_name", "last_name", "dob", "gender", "marital", "nationality", "category", "email", "phone_code", "phone"]} onNext={next} />
      </>}
      {meta.step === 3 && <>
        <Address p="cur" title="Current Address" />
        <Address p="perm" title="Permanent Address" />
        <Actions required={["cur_line1", "cur_country", "cur_state", "cur_city", "cur_pincode",
          "perm_line1", "perm_country", "perm_state", "perm_city", "perm_pincode"]} onNext={next} />
      </>}
      {meta.step === 4 && <>
        <School p="x" title="Class X" />
        <School p="xii" title="Class XII" />
        <h3>Graduation</h3>
        <MuiAuto k="deg" label="Degree" required options={["B.E.", "B.Tech", "B.Sc", "BCA", "M.E.", "M.Tech", "MCA"]} />
        <SearchPrompt k="deg_branch" label="Branch / Specialisation" required tree={STUDY} />
        <SearchPrompt k="deg_college" label="College Name" required tree={SCHOOLS} />
        <RSelect k="deg_start" label="Start Year" required options={SCHOOL_YEARS} />
        <RSelect k="deg_end" label="Year of Passing" required options={SCHOOL_YEARS} />
        <Down k="deg_scale" label="Grading System" required options={["CGPA out of 10", "CGPA out of 4", "Percentage"]} />
        <Text k="deg_score" label="CGPA / Percentage" required />
        <Actions required={["x_board", "x_school", "x_year", "x_percent", "xii_board", "xii_school", "xii_year", "xii_percent",
          "deg", "deg_branch", "deg_college", "deg_start", "deg_end", "deg_scale", "deg_score"]} onNext={next} />
      </>}
      {meta.step === 5 && <>
        <h3>Resume</h3>
        <File k="resume" label="Upload Resume" required />
        <Rows k="work" title="Internships and Work Experience" add="+ Add Experience" cols={WORK} />
        <div className="actions"><button type="button" className="primary" onClick={withRows(["resume"], [["work", WORK]])}>Next</button>
          {meta.errors.length > 0 && <div className="summary" role="alert">Please fix {meta.errors.length} error{meta.errors.length > 1 ? "s" : ""} before continuing.</div>}</div>
      </>}
      {meta.step === 6 && <>
        <Rows k="projects" title="Projects" add="+ Add Project" cols={PROJECTS} />
        <Rows k="languages" title="Language Skills" add="+ Add Language Skills" cols={LANGS} />
        <Area k="skills" label="Key Skills" required />
        <div className="actions"><button type="button" className="primary" onClick={withRows(["skills"], [["projects", PROJECTS], ["languages", LANGS]])}>Next</button>
          {meta.errors.length > 0 && <div className="summary" role="alert">Please fix {meta.errors.length} error{meta.errors.length > 1 ? "s" : ""} before continuing.</div>}</div>
      </>}
      {meta.step === 7 && <>
        <TechStep title="Technical Skills: Languages and Frameworks" list={TECH_A} />
        <Actions required={TECH_A.map((t) => `sk_${slug(t)}`)} onNext={next} />
      </>}
      {meta.step === 8 && <>
        <TechStep title="Technical Skills: Data, Cloud and Tools" list={TECH_B} />
        <Actions required={TECH_B.map((t) => `sk_${slug(t)}`)} onNext={next} />
      </>}
      {meta.step === 9 && <>
        <TechStep title="Technical Skills: More Languages, Frameworks and Tools" list={TECH_C} />
        <Actions required={TECH_C.map((t) => `sk_${slug(t)}`)} onNext={next} />
      </>}
      {meta.step === 10 && <>
        <TechStep title="Areas of Experience" list={AREAS} />
        <Actions required={AREAS.map((t) => `sk_${slug(t)}`)} onNext={next} />
      </>}
      {meta.step === 11 && <>
        <h3>Work Locations</h3>
        <p className="hint">Tick every location where you are willing to work.</p>
        {PLACES.map((c) => <Check key={c} k={`loc_${slug(c)}`} label={c} />)}
        <Down k="pref_loc" label="Preferred Location" required options={PLACES} />
        <Radios k="remote" label="Are you open to remote work?" required options={YESNO} />
        <RSelect k="office_days" label="How many days a week can you work from the office?" required options={["1", "2", "3", "4", "5"]} />
        <MuiSel k="start" label="When can you start?" required options={["Immediately", "Within 2 weeks", "Within 1 month", "Within 2 months", "Within 3 months"]} />
        <Actions required={["pref_loc", "remote", "office_days", "start"]} onNext={next} />
      </>}
      {meta.step === 12 && <>
        <h3>Screening Questions</h3>
        <Down k="relocate" label="Are you willing to relocate?" required options={YESNO} />
        <MuiSel k="notice" label="Notice Period" required options={["Immediate", "15 days", "1 month", "2 months", "3 months"]} />
        <RSelect k="experience" label="Total Work Experience" required options={["Fresher", "Less than 1 year", "1-2 years", "2-4 years", "4+ years"]} />
        <Text k="current_ctc" label="Current CTC (LPA)" required />
        <Text k="expected_ctc" label="Expected CTC (LPA)" required />
        <Headless k="sponsorship" label="Will you require visa sponsorship to work in India?" required options={YESNO} />
        <Radios k="worked_before" label="Have you previously worked for Acme Robotics?" required options={YESNO} />
        <Radios k="relatives" label="Do you have relatives working at Acme Robotics?" required options={YESNO} />
        <Radios k="convicted" label="Have you ever been convicted of a criminal offence?" required options={YESNO} />
        <Radios k="noncompete" label="Are you bound by a non-compete agreement?" required options={YESNO} />
        <SearchPrompt k="source" label="How did you hear about this position?" required tree={SOURCES} />
        <Radios k="referred" label="Were you referred by an Acme Robotics employee?" required options={YESNO} />
        <Text k="referrer" label="Referrer's name (if referred)" />
        <h3>Voluntary Disclosures</h3>
        <MuiSel k="disability" label="Do you have a disability?" required options={["Yes", "No", "Prefer not to say"]} />
        <Down k="veteran" label="Have you served in the armed forces?" required options={YESNO} />
        <h3>Declarations</h3>
        <Check k="alerts" label="Send me job alerts and news from Acme Robotics" />
        <Check k="privacy" label="I have read and agree to the candidate privacy notice" required />
        <Check k="certify" label="I certify that the information provided is true and complete" required />
        <Actions required={["relocate", "notice", "experience", "current_ctc", "expected_ctc", "sponsorship", "worked_before",
          "relatives", "convicted", "noncompete", "source", "referred", "disability", "veteran", "privacy", "certify"]} onNext={next} />
      </>}
      {meta.step === STEPS && <>
        <h3>Review and send</h3>
        <p>You are signed in again. Check your answers below, then send your application.</p>
        <Review />
        <Actions required={[]} last />
      </>}
    </Shell>
  );
}
