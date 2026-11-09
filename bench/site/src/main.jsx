import React from "react";
import { createRoot } from "react-dom/client";
import { Q, REDRAW, SLOW, Store } from "./store";
import { Address, Basics, Experience, EXPERIENCE_INITIAL, Widgets, Wizard } from "./scenarios";
import "./style.css";

const SCENARIOS = { basics: Basics, widgets: Widgets, address: Address, experience: Experience, wizard: Wizard };
const INITIAL = { experience: EXPERIENCE_INITIAL };

function App() {
  const s = Q.get("s");
  const C = SCENARIOS[s];
  if (!C) {
    return (
      <div className="page"><h1>formwright test bench</h1><ul>
        {Object.keys(SCENARIOS).map((k) => (
          <li key={k}><a href={`?s=${k}`}>{k}</a> · <a href={`?s=${k}&redraw=1`}>redraw</a> · <a href={`?s=${k}&redraw=1&slow=1`}>redraw+slow</a></li>
        ))}
      </ul></div>
    );
  }
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
