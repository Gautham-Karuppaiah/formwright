// Shared form state, the "redraw" behaviour and reporting to the bench server.
//
// Query params:  s=<scenario>  run=<id>  redraw=1  slow=1
//   redraw=1  every committed change re-creates the whole form's DOM (as Oracle/knockout-style sites do), with
//             focus kept where it was. Element handles taken before the change point at nothing afterwards.
//   slow=1    option lists and page steps answer late (network-backed widgets).
// Every change is POSTed to /state?run=<id>; the bench grades the last state it got, so grading doesn't depend
// on the page still being open.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

export const Q = new URLSearchParams(location.search);
export const REDRAW = Q.get("redraw") === "1";
export const SLOW = Q.get("slow") === "1";
export const delay = (ms) => new Promise((r) => setTimeout(r, SLOW ? ms * 3 : ms));

const Ctx = createContext(null);

export function Store({ scenario, initial, children }) {
  const [fields, setFields] = useState(initial || {});
  const [gen, setGen] = useState(0);
  const [meta, setMeta] = useState({ step: 1, submitted: false, errors: [] });
  const timer = useRef(null);
  const latest = useRef({ fields, meta });
  latest.current = { fields, meta };

  const post = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/state?run=${encodeURIComponent(Q.get("run") || "manual")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario, redraw: REDRAW, ...latest.current.meta, fields: latest.current.fields }),
      }).catch(() => {});
    }, 80);
  }, [scenario]);

  useEffect(post, [fields, meta, post]);

  const redraw = useCallback(() => {
    if (REDRAW) setTimeout(() => setGen((g) => g + 1), 250);
  }, []);

  // set(key, value)            committed change (selects, radios, pickers): redraws
  // set(key, value, false)     a draft (typing): reported, no redraw until blur
  const set = useCallback((k, v, commit = true) => {
    setFields((f) => ({ ...f, [k]: typeof v === "function" ? v(f[k]) : v }));
    if (commit) redraw();
  }, [redraw]);

  return (
    <Ctx.Provider value={{ fields, set, redraw, meta, setMeta, gen }}>
      <Redraw gen={gen}>{children}</Redraw>
    </Ctx.Provider>
  );
}

// Re-mount the children when gen changes, putting the focus (and caret) back on the element with the same id.
function Redraw({ gen, children }) {
  liveGen = gen;
  const saved = useRef(null);
  const prev = useRef(gen);
  if (prev.current !== gen) {
    const a = document.activeElement;
    saved.current = a && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
    prev.current = gen;
  }
  useLayoutEffect(() => {
    const f = saved.current;
    if (!f) return;
    const el = document.getElementById(f.id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(f.s, f.e); } catch { /* not a text box */ }
    }
    saved.current = null;
  }, [gen]);
  return <div key={gen} data-gen={gen}>{children}</div>;
}

export const useForm = () => useContext(Ctx);

export function validate(fields, required) {
  const empty = (v) => v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && !v.length);
  return required.filter((k) => empty(fields[k]));
}

// A widget's own state (an open list, a typed search, an error shown after blur, a section already loaded) as a
// real app keeps it: in its model, not in the DOM. A redraw re-creates every element but the page doesn't forget.
// Keyed by an explicit name (component.variable[.field key]) plus the copy's number among live copies of that name
// in this redraw generation (Tabs, ShowMore... can appear several times). Not useId: in a client render React
// numbers ids from a global counter, so a re-mounted widget got a new id and never found its state.
const kept = new Map();
let liveGen = 0;                             // the redraw generation being shown
const listeners = new Map();                 // id -> setters of the mounted copies
const slots = new Map();                     // gen -> name -> Set of taken copy numbers
export function useKept(name, init) {
  const gen = useContext(Ctx)?.gen ?? 0;
  const [slot] = useState(() => {
    const g = slots.get(gen) || new Map(); slots.set(gen, g);
    const taken = g.get(name) || new Set(); g.set(name, taken);
    let n = 0; while (taken.has(n)) n++;
    taken.add(n);
    return n;
  });
  useEffect(() => () => {
    slots.get(gen)?.get(name)?.delete(slot);
    // gone without a redraw (a form closed, a step left): a new copy later starts fresh, as in a real app.
    // Replaced by a redraw (gen moved on): the new copy keeps the state.
    if (gen === liveGen) kept.delete(`${name}#${slot}`);
  }, [gen, name, slot]);
  const id = `${name}#${slot}`;
  const [v, setV] = useState(() => {
    if (!kept.has(id)) kept.set(id, typeof init === "function" ? init() : init);
    return kept.get(id);
  });
  // one value per id, like an app model: a write from a copy that a redraw already replaced (an await finishing
  // after the re-mount) reaches the live copy too
  useEffect(() => {
    const ls = listeners.get(id) || new Set(); listeners.set(id, ls);
    ls.add(setV);
    if (kept.get(id) !== v) setV(kept.get(id));
    return () => ls.delete(setV);
  }, [id]);
  const set = useCallback((x) => {
    const n = typeof x === "function" ? x(kept.get(id)) : x;
    kept.set(id, n);
    for (const l of listeners.get(id) || []) l(n);
  }, [id]);
  return [v, set];
}
