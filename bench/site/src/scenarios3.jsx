// Coverage pages, last batch (bench/COVERAGE.md): accounts (A7, E6), emailed code (E5), session expiry (E7),
// menubar (B25), radio group with aria-activedescendant (B29), treegrid (B40), canvas signature (D10).
import React, { useEffect, useRef, useState } from "react";
import { useKept, Q, delay, useForm, validate } from "./store";
import { Text } from "./widgets";
import { Actions, Shell } from "./scenarios";

const errOf = (errs, k) => (errs.includes(k) ? "This field is required." : null);
const post = (path, body) => fetch(`${path}?run=${encodeURIComponent(Q.get("run") || "manual")}`,
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

// ====================================================================================== account (A7, E6)
// Sign in first. There is no account yet, so the way on is "Create an account", whose password rules are odd:
// 8-12 characters, an uppercase letter and a digit, and only "_" or "-" as symbols. The page records whether the
// password fit and matched, never the password.
const RULE_TEXT = "8 to 12 characters, with at least one uppercase letter and one number. The only symbols allowed are _ and -.";
const fitsRule = (p) => p.length >= 8 && p.length <= 12 && /[A-Z]/.test(p) && /\d/.test(p) && /^[A-Za-z0-9_-]+$/.test(p);

export function Account() {
  const { fields, set, meta, setMeta } = useForm();
  const [f, setF] = useKept("Account.f", {});
  const [err, setErr] = useKept("Account.err", null);
  const box = (k, label, type = "text") => (
    <div className="row"><label htmlFor={k}>{label} *</label>
      <input id={k} type={type} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  if (meta.step === 1) {
    return (
      <div className="card">
        <h2>Sign in to apply</h2>
        {box("si_email", "Email address", "email")}
        {box("si_password", "Password", "password")}
        {err && <div className="err" role="alert">{err}</div>}
        <button type="button" className="primary" onClick={() => setErr("We couldn't find an account with that email address.")}>Sign in</button>
        <p>New here? <a href="#" onClick={(e) => { e.preventDefault(); setErr(null); setMeta((m) => ({ ...m, step: 2 })); }}>Create an account</a></p>
      </div>
    );
  }
  if (meta.step === 2) {
    return (
      <div className="card">
        <h2>Create an account</h2>
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
          set("acc_email", f.su_email);
          set("acc_password_ok", true);
          setErr(null);
          setMeta((m) => ({ ...m, step: 3 }));
        }}>Create account</button>
      </div>
    );
  }
  return (
    <Shell steps={3}>
      <h3>Your application</h3>
      <Text k="acc_first" label="First name" required />
      <Text k="acc_last" label="Last name" required />
      <Actions required={["acc_first", "acc_last"]} last />
    </Shell>
  );
}

// ====================================================================================== emailcode (E5)
// The page "emails" a code: it posts the message to the bench server, which serves it as the inbox
// (FORMWRIGHT_FAKE_MAIL) for this run only.
export function EmailCode() {
  const { meta, setMeta, set } = useForm();
  const [code] = useKept("EmailCode.code", () => String(100000 + Math.floor(Math.random() * 900000)));
  const [digits, setDigits] = useKept("EmailCode.digits", ["", "", "", "", "", ""]);
  const [err, setErr] = useKept("EmailCode.err", null);
  const refs = useRef([]);
  useEffect(() => {
    if (meta.step === 1) post("/mail", { subject: "Your Acme Robotics verification code",
      body: `Hello Karthik,\n\nUse ${code} to verify your email address. It expires in 15 minutes.\n\nAcme Robotics Talent Team` });
  }, [meta.step, code]);
  if (meta.step === 1) {
    return (
      <div className="card">
        <h2>Verify your email</h2>
        <p>We sent a 6-digit code to karthik.raman@example.com.</p>
        <div className="pair">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => (refs.current[i] = el)} className="split" maxLength={1} size={2} inputMode="numeric"
              aria-label={`Digit ${i + 1} of 6`} value={d}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(-1);
                setDigits((x) => x.map((y, j) => (j === i ? v : y)));
                if (v && i < 5) refs.current[i + 1]?.focus();
              }} />
          ))}
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button type="button" className="primary" onClick={() => {
          if (digits.join("") !== code) return setErr("That code is not correct.");
          set("ec_verified", true);
          setMeta((m) => ({ ...m, step: 2 }));
        }}>Verify</button>
      </div>
    );
  }
  return (
    <Shell steps={2}>
      <Text k="ec_first" label="First name" required />
      <Actions required={["ec_first"]} last />
    </Shell>
  );
}

// ====================================================================================== expiry (E7)
// 40 s after loading, the session "expires": the form is replaced by a notice, and Start again brings back an
// empty form. Recovery = start again and fill it again.
export function Expiry() {
  const { meta, setMeta } = useForm();
  const [expired, setExpired] = useKept("Expiry.expired", false);
  const [round, setRound] = useKept("Expiry.round", 0);
  const { set } = useForm();
  useEffect(() => {
    if (round > 0) return undefined;             // only the first session expires
    const t = setTimeout(() => setExpired(true), 40000);
    return () => clearTimeout(t);
  }, [round]);
  if (expired) {
    return (
      <div className="card" role="alertdialog" aria-label="Session expired">
        <h2>Your session has expired</h2>
        <p>For your security, your session ended after a period of inactivity. Your answers were not saved.</p>
        <button type="button" className="primary" onClick={() => {
          ["ex_first", "ex_last", "ex_email", "ex_phone", "ex_city"].forEach((k) => set(k, ""));
          setExpired(false); setRound(1); setMeta((m) => ({ ...m, errors: [] }));
        }}>Start again</button>
      </div>
    );
  }
  return (
    <Shell>
      <h3>Apply</h3>
      <Text k="ex_first" label="First name" required />
      <Text k="ex_last" label="Last name" required />
      <Text k="ex_email" label="Email" required type="email" />
      <Text k="ex_phone" label="Mobile number" required type="tel" />
      <Text k="ex_city" label="Current city" required />
      <Actions required={["ex_first", "ex_last", "ex_email", "ex_phone", "ex_city"]} last />
    </Shell>
  );
}

// ====================================================================================== misc (B25, B29, B40, D10)
function Menubar({ onPick }) {
  const [open, setOpen] = useKept("Menubar.open", null);
  const menus = [["Sections", ["Personal details", "Preferences"]], ["Help", ["Contact support"]]];
  return (
    <ul role="menubar" aria-label="Application" className="menubar">
      {menus.map(([m, items]) => (
        <li key={m} role="none" className="menu-wrap">
          <span role="menuitem" tabIndex={0} aria-haspopup="menu" aria-expanded={open === m}
            onClick={() => setOpen(open === m ? null : m)}>{m} ▾</span>
          {open === m && (
            <ul role="menu" aria-label={m} className="menu">
              {items.map((i) => <li key={i} role="menuitem" tabIndex={-1} onClick={() => { setOpen(null); onPick(i); }}>{i}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActiveRadios({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const [focus, setFocus] = useKept(`ActiveRadios.focus.${k}`, Math.max(0, options.indexOf(fields[k])));
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <ul role="radiogroup" aria-labelledby={`${k}-lbl`} tabIndex={0} aria-activedescendant={`${k}-o${focus}`} className="lbox"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); const n = (focus + 1) % options.length; setFocus(n); set(k, options[n]); }
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); const n = (focus + options.length - 1) % options.length; setFocus(n); set(k, options[n]); }
          if (e.key === " ") { e.preventDefault(); set(k, options[focus]); }
        }}>
        {options.map((o, i) => <li key={o} id={`${k}-o${i}`} role="radio" aria-checked={fields[k] === o}
          className={fields[k] === o ? "hi" : ""} onClick={() => { setFocus(i); set(k, o); }}>{fields[k] === o ? "◉" : "○"} {o}</li>)}
      </ul>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

const CATEGORIES = [["Engineering", [["Hardware", 4], ["Software", 12], ["Quality", 3]]], ["Operations", [["Logistics", 5], ["Field service", 7]]],
  ["Sales", [["Inside sales", 2], ["Account management", 3]]]];

function TreeGrid({ k, label, required }) {
  const { fields, set, meta } = useForm();
  const [exp, setExp] = useKept(`TreeGrid.exp.${k}`, {});
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <div className="lbl" id={`${k}-lbl`}>{label}{required && <span className="req"> *</span>}</div>
      <table role="treegrid" aria-labelledby={`${k}-lbl`} className="egrid">
        <thead><tr role="row"><th role="columnheader">Category</th><th role="columnheader">Open roles</th></tr></thead>
        <tbody>
          {CATEGORIES.flatMap(([c, kids]) => [
            <tr key={c} role="row" aria-level={1} aria-expanded={!!exp[c]} tabIndex={-1} onClick={() => setExp({ ...exp, [c]: !exp[c] })}>
              <td role="gridcell">{exp[c] ? "▾" : "▸"} {c}</td><td role="gridcell">{kids.reduce((a, [, n]) => a + n, 0)}</td></tr>,
            ...(exp[c] ? kids.map(([s, n]) => (
              <tr key={`${c}/${s}`} role="row" aria-level={2} aria-selected={fields[k] === `${c} / ${s}`} tabIndex={-1}
                className={fields[k] === `${c} / ${s}` ? "hi" : ""} onClick={() => set(k, `${c} / ${s}`)}>
                <td role="gridcell" style={{ paddingLeft: 24 }}>{s}</td><td role="gridcell">{n}</td></tr>)) : []),
          ])}
        </tbody>
      </table>
      {fields[k] && <div className="hint">Selected: {fields[k]}</div>}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

function Signature({ k, label }) {
  const { fields, set } = useForm();
  const ref = useRef(null);
  const drawing = useRef(false);
  const pts = useRef(0);
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return (
    <div className="row">
      <div className="lbl">{label} <span className="req">*</span></div>
      <canvas ref={ref} width={400} height={120} className="sig"
        onMouseDown={(e) => { drawing.current = true; const c = ref.current.getContext("2d"); c.beginPath(); c.moveTo(...at(e)); }}
        onMouseMove={(e) => { if (!drawing.current) return; const c = ref.current.getContext("2d"); c.lineTo(...at(e)); c.stroke(); pts.current += 1; }}
        onMouseUp={() => { drawing.current = false; if (pts.current > 5) set(k, true); }} />
      <div><button type="button" onClick={() => { ref.current.getContext("2d").clearRect(0, 0, 400, 120); pts.current = 0; set(k, false); }}>Clear</button>
        {fields[k] ? <span className="hint"> Signed</span> : <span className="hint"> Sign with your mouse above</span>}</div>
    </div>
  );
}

export function Misc() {
  const [section, setSection] = useKept("Misc.section", "Personal details");
  return (
    <Shell>
      <Menubar onPick={(s) => s !== "Contact support" && setSection(s)} />
      <p className="hint">Showing: {section}. Use the Sections menu to see the other section.</p>
      {section === "Personal details" ? (
        <>
          <ActiveRadios k="m_gender" label="Gender" required options={["Female", "Male", "Non-binary", "Prefer not to say"]} />
          <TreeGrid k="m_category" label="Which job category are you applying in?" required />
        </>
      ) : (
        <Text k="m_notice" label="Notice period (in days)" required />
      )}
      <Signature k="m_signed" label="Signature" />
      <Actions required={["m_gender", "m_category", "m_notice", "m_signed"]} last />
    </Shell>
  );
}
