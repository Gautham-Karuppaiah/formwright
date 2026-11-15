import React from "react";
import { createRoot } from "react-dom/client";
import { Q, REDRAW, SLOW, Store } from "./store";
import { Address, Basics, Experience, EXPERIENCE_INITIAL, Languages, LANGUAGES_INITIAL, Widgets, Wizard } from "./scenarios";
import { Applied, Asks, Groups, Html, IcimsInner, IcimsOuter, Oracle, Refuse, Sap, Sections, Widgets2, WIDGETS2_INITIAL, Workday } from "./scenarios2";
import { Dropzone, Hidden } from "./scenarios4";
import { Longform } from "./scenarios5";
import { Modal } from "./scenarios6";
import { Traps, TRAPS_INITIAL } from "./scenarios7";
import { Trapform, TRAPFORM_INITIAL } from "./scenarios8";
import "./style.css";

const SCENARIOS = { basics: Basics, widgets: Widgets, address: Address, experience: Experience, languages: Languages, wizard: Wizard,
  oracle: Oracle, workday: Workday, sap: Sap, icims: IcimsInner, sections: Sections, html: Html, widgets2: Widgets2,
  groups: Groups, asks: Asks, refuse: Refuse, applied: Applied,
  hidden: Hidden, dropzone: Dropzone, longform: Longform, modal: Modal, traps: Traps, trapform: Trapform };
const INITIAL = { experience: EXPERIENCE_INITIAL, languages: LANGUAGES_INITIAL, widgets2: WIDGETS2_INITIAL, traps: TRAPS_INITIAL, trapform: TRAPFORM_INITIAL };

function App() {
  const s = Q.get("s");
  if (s === "icims") return <IcimsOuter />;       // the company page; the form is in a cross-origin iframe
  const inner = s === "icims-inner";
  const C = SCENARIOS[inner ? "icims" : s];
  if (!C) {
    return (
      <div className="page"><h1>formwright test bench</h1><ul>
        {Object.keys(SCENARIOS).map((k) => (
          <li key={k}><a href={`?s=${k}`}>{k}</a> · <a href={`?s=${k}&redraw=1`}>redraw</a> · <a href={`?s=${k}&redraw=1&slow=1`}>redraw+slow</a></li>
        ))}
      </ul></div>
    );
  }
  if (inner) return <div className="page"><Store scenario="icims"><C /></Store></div>;
  return (
    <div className="page">
      <header>
        <div className="brand">Acme Robotics Careers</div>
        <h1>Software Engineer I</h1>
        <div className="hint">Chennai, Tamil Nadu, India · Full-time · Req ID BENCH-{s}{REDRAW ? " · redraw" : ""}{SLOW ? " · slow" : ""}</div>
        <p>Build and maintain robot fleet software in Python and C++. 0–2 years of experience. Freshers welcome.</p>
      </header>
      <Store scenario={s} initial={INITIAL[s]}><C /></Store>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
