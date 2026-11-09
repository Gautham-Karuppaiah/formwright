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
    <Ctx.Provider value={{ fields, set, redraw, meta, setMeta }}>
      <Redraw gen={gen}>{children}</Redraw>
    </Ctx.Provider>
  );
}

// Re-mount the children when gen changes, putting the focus (and caret) back on the element with the same id.
function Redraw({ gen, children }) {
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
