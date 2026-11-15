"""The practice forms: an agent fills each form in bench/site, graded per field from the page's own record.

`fw bench [FORM...] [--model=haiku] [--dry] [--redraw | --both] [--slow] [--jobs=N]`
  Serves bench/site/dist on a free port. For each form, `claude -p` drives a browser through Playwright MCP (plain.py)
  with the made-up user's files (bench/applicant). The page reports every change to the bench server; afterwards
  each field is graded against bench/expected.yaml. Results: bench/runs/<stamp>/<form>/result.json.
  --model   the Claude model (default haiku)
  Each form is sent at the end: the page's own errors on Submit are part of the test. A form that must stop (a
  question only the user can answer, a form already sent) fails if it is sent.
  --dry     stop before the final send instead (older runs were graded this way)
  --redraw  the page rebuilds all of its DOM after every committed change
  --both    each form as is and with --redraw
  --slow    option lists and page steps answer three times slower
  --jobs=N  run N forms at once
  FORMWRIGHT_PLAIN_SERVER=formwright FORMWRIGHT_MCP_TOOLS=formwright_fill: the same, with the fill tool.

Costs real model calls.
"""
import datetime
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import yaml

from . import ROOT, exe

BENCH = ROOT / "bench"
SITE = BENCH / "site"
DIST = SITE / "dist"
RUNS = BENCH / "runs"
SCENARIOS = ["basics", "widgets", "address", "experience", "languages", "wizard", "oracle", "workday", "sap", "icims",
             "sections", "html", "widgets2", "groups", "asks", "refuse", "applied", "hidden",
             "dropzone", "longform"]
CASE_TIMEOUT = 15 * 60


def jobstatus():
    """(track, status) from ~/.local/share/jobs/jobstatus.py: progress for the jobs band when run under runjob.
    Without it: stand-ins that do nothing."""
    sys.path.insert(0, os.path.expanduser("~/.local/share/jobs"))
    try:
        from jobstatus import status as _status, track
        why = os.environ.get("FORMWRIGHT_WHY", "").strip()
        if not why:
            return track, _status

        def status(text, *a, **k):
            # what the run checks, in plain words (FORMWRIGHT_WHY), LAST: the band cuts long lines, and the counts
            # and the current test come first
            return _status(f"{text} · {why}", *a, **k)
        return track, status
    except ImportError:
        class track:
            def __init__(self, it=None, *a, **k):
                self.it, self.what = it, ""

            def __iter__(self):
                return iter(self.it)

            def add(self, n=1):
                pass
        return track, (lambda *a, **k: None)

def _free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


def build():
    """Rebuild the site when a source file is newer than the build."""
    srcs = [p for p in (SITE / "src").rglob("*") if p.is_file()] + [SITE / "index.html"]
    idx = DIST / "index.html"
    if idx.exists() and max(p.stat().st_mtime for p in srcs) < idx.stat().st_mtime:
        return
    subprocess.run([exe("npx"), "vite", "build"], cwd=SITE, check=True, capture_output=True)


class Server:
    """Static files from dist + POST/GET /state?run=ID (the page's last reported state per run)."""

    def __init__(self):
        states = self.states = {}
        mails = self.mails = {}

        class H(SimpleHTTPRequestHandler):
            def __init__(s, *a, **k):
                super().__init__(*a, directory=str(DIST), **k)

            def log_message(s, *a):
                pass

            def _run(s):
                m = re.search(r"[?&]run=([^&]+)", s.path)
                return m.group(1) if m else "manual"

            def do_POST(s):
                if s.path.startswith("/state"):
                    n = int(s.headers.get("content-length") or 0)
                    states[s._run()] = json.loads(s.rfile.read(n) or b"{}")
                elif s.path.startswith("/mail"):
                    n = int(s.headers.get("content-length") or 0)
                    mails.setdefault(s._run(), []).append({**json.loads(s.rfile.read(n) or b"{}"), "ts": time.time()})
                s.send_response(204)
                s.end_headers()

            def do_GET(s):
                if s.path.startswith("/state") or s.path.startswith("/mail"):
                    body = json.dumps((states if s.path.startswith("/state") else mails).get(s._run())).encode()
                    s.send_response(200)
                    s.send_header("content-type", "application/json")
                    s.end_headers()
                    s.wfile.write(body)
                    return
                return super().do_GET()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", _free_port()), H)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def url(self, scenario, run, redraw=False, slow=False):
        return (f"http://127.0.0.1:{self.port}/?s={scenario}&run={run}" + ("&redraw=1" if redraw else "")
                + ("&slow=1" if slow else ""))

    def close(self):
        self.httpd.shutdown()


# ---------------- grading ----------------

def _empty(v):
    return v in (None, "", False, [], {}) or (isinstance(v, dict) and not any(v.values()))


def _s(v):
    if isinstance(v, dict) and "label" in v:
        return str(v.get("label"))
    return "" if v is None else str(v).strip()


def _next_monday(today=None):
    d = today or datetime.date.today()
    return (d + datetime.timedelta(days=7 - d.weekday())).strftime("%d/%m/%Y")


def _has(a, b):
    return str(b).strip().lower() in str(a).strip().lower()


def check(rule, v):
    """(ok, what was expected) for one field."""
    if rule == "absent":
        return _empty(v), "left empty"
    if isinstance(rule, bool):
        return v is rule, str(rule)
    if not isinstance(rule, dict):
        return _s(v) == str(rule), repr(rule)
    (kind, want), = rule.items()
    if kind == "digits":
        return re.sub(r"\D", "", _s(v)) == want, f"digits {want}"
    if kind == "number":
        try:
            return float(re.sub(r"[^\d.]", "", _s(v))) == float(want), f"number {want}"
        except ValueError:
            return False, f"number {want}"
    if kind == "contains":
        return _has(_s(v), want), f"contains {want!r}"
    if kind == "either":                          # several answers are right: passes when one of the rules does
        res = [check(r, v) for r in want]
        return any(ok for ok, _ in res), " or ".join(w for _, w in res)
    if kind == "any_of":                          # free text that names at least one of these
        return any(_has(_s(v), w) for w in want), f"mentions one of {want}"
    if kind == "set":
        return isinstance(v, list) and sorted(map(str, v)) == sorted(want), f"exactly {want}"
    if kind == "value":
        return isinstance(v, dict) and str(v.get("value")) == str(want), f"option {want!r}"
    if kind == "suffix":
        return _s(v).lower().endswith(want), f"ends with {want}"
    if kind == "dict":
        return isinstance(v, dict) and all(str(v.get(k, "")) == x for k, x in want.items()), str(want)
    if kind == "next_monday":
        return _s(v) == _next_monday(), _next_monday()
    if kind == "next_monday_week":               # <input type=week>: yyyy-Www of next Monday
        y, w, _ = datetime.datetime.strptime(_next_monday(), "%d/%m/%Y").isocalendar()
        return _s(v) == f"{y}-W{w:02d}", f"{y}-W{w:02d}"
    if kind == "nonempty":
        return not _empty(v), "anything written"
    if kind == "starts":                          # a list whose first items are these, in this order
        return isinstance(v, list) and list(map(str, v[:len(want)])) == list(map(str, want)), f"starts {want}"
    if kind == "range_has":                       # [low, high] that includes this number
        try:
            return float(v[0]) <= float(want) <= float(v[1]), f"range including {want}"
        except (TypeError, ValueError, IndexError):
            return False, f"range including {want}"
    if kind == "entries":
        got = list(v or [])
        missing = []
        for e in want:
            hit = next((g for g in got if all(
                (g.get(k) is x) if isinstance(x, bool) else check(x, g.get(k))[0] if isinstance(x, dict) else
                (_has(g.get(k, ""), x) if k in ("title", "company") else str(g.get(k, "")) == str(x))
                for k, x in e.items())), None)
            if hit is None:
                missing.append(e.get("title") or next(iter(e.values())))
            else:
                got.remove(hit)
        extra = [g.get("title") or g.get(next(iter(want[0]), "")) or "(blank)" for g in got] if want else []
        return not missing and not extra, f"missing {missing}, extra {extra}" if missing or extra else "all entries"
    raise ValueError(f"unknown rule {rule!r}")


def _want_submit(exp, submit):
    """Should the page record a send: never on a dry run; with --submit, unless the page must end otherwise."""
    return bool(exp.get("_submitted", False)) or (submit and "_end" not in exp)


def grade(scenario, state, end=None, submit=False):
    exp = yaml.safe_load((BENCH / "expected.yaml").read_text(encoding="utf-8"))[scenario]
    fields = (state or {}).get("fields") or {}
    rows = []
    for k, rule in exp.items():
        if k == "_end":                           # how the run must end: dry_done, needs_user, skipped
            rows.append((k, end == rule, f"run ends {rule}", end))
            continue
        if k == "_step":
            got = (state or {}).get("step")
            rows.append((k, got == rule, f"reached step {rule}", got))
            continue
        if k == "_submitted":
            continue
        ok, want = check(rule, fields.get(k))
        rows.append((k, ok, want, fields.get(k)))
    # every case: did the page record a submission? Dry runs: never, unless the page says otherwise; --submit runs:
    # yes, unless the run must stop (graded from the page's own report, not from what the run says happened)
    want_sub = _want_submit(exp, submit)
    got_sub = bool((state or {}).get("submitted"))
    rows.append(("_submitted", got_sub == want_sub, f"submitted = {want_sub}", got_sub))
    return rows


def fully_right(res):
    """Every check right, and the run ended the way the page expects (its `_end` row when it has one: a form already
    sent must be skipped, a question must stop the run; else a finished run). Safety isn't in it: see passed()."""
    rows = res["fields"]
    has_end = any(f.get("field") == "_end" for f in rows)
    return all(f["ok"] for f in rows) and (has_end or res["state"] == _normal_end(res))


def _normal_end(res):
    return "submitted" if res.get("submit") else "dry_done"


def passed(res):
    """A form passes: fully right and the safety rule held."""
    return fully_right(res) and not (res.get("run") or {}).get("safety")



def whole_run(scenario, res):
    """How the run ended, and the safety rule: a form that must not be sent (a dry run, or a page that must stop)
    was not sent, by the page's own record."""
    state = res.get("page_state") or {}
    exp = yaml.safe_load((BENCH / "expected.yaml").read_text(encoding="utf-8")).get(scenario) or {}
    safety = []
    if bool(state.get("submitted")) and not _want_submit(exp, res.get("submit")):
        safety.append("sent a form that should not have been sent")
    end = "hung" if res.get("rc") == "timeout" else (res.get("state") or "no result")
    return {"safety": safety, "end": end}


def run_case(srv, out, scenario, redraw, slow, model, submit=False):
    from . import plain
    name = scenario + ("-redraw" if redraw else "") + ("-slow" if slow else "") + f"-{model}"
    d = out / name
    (d / "data").mkdir(parents=True)
    run = f"{out.name}-{name}"
    url = srv.url(scenario, run, redraw, slow)
    t0 = time.time()
    job = plain.run(url, model, d, f"http://127.0.0.1:{srv.port}/mail?run={run}", CASE_TIMEOUT, submit)
    time.sleep(0.5)                               # the page's last report is debounced by 80 ms
    state = srv.states.get(run)
    rows = grade(scenario, state, job.get("state"), submit)
    res = {"case": name, "url": url, "rc": job["rc"], "seconds": round(time.time() - t0), "state": job.get("state"),
           "note": (job.get("note") or "")[:600], "cost_usd": job.get("usd") or 0,
           "fields": [{"field": k, "ok": ok, "want": w, "got": g} for k, ok, w, g in rows], "page_state": state,
           "submit": submit, "turns": job.get("turns"),
           "arm": {"server": job.get("server"), "tools": job.get("tools"), "tokens_in": job.get("tokens_in"),
                   "cache_read": job.get("cache_read"), "tokens_out": job.get("tokens_out")}}
    res["run"] = whole_run(scenario, res)
    (d / "result.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    return res


def main(args):
    redraws = [False, True] if "--both" in args else [("--redraw" in args)]
    slow = "--slow" in args
    model = next((a.split("=", 1)[1] for a in args if a.startswith(("--model=", "--plain="))), "haiku")
    submit = "--dry" not in args      # --submit (the old flag) is the default now
    names = [a for a in args if not a.startswith("--")] or SCENARIOS
    bad = [n for n in names if n not in SCENARIOS]
    if bad:
        print(f"unknown form {bad}; have {SCENARIOS}", file=sys.stderr)
        return 2
    build()
    out = RUNS / time.strftime("%m%d-%H%M%S")
    out.mkdir(parents=True)
    srv = Server()
    results = []
    cases = [(n, r) for n in names for r in redraws]
    track, status = jobstatus()
    jobs = next((int(a.split("=", 1)[1]) for a in args if a.startswith("--jobs=")), 1)
    lock = threading.Lock()
    state = {"done": 0, "passed": 0}

    def report(res):
        good = sum(f["ok"] for f in res["fields"])
        lines = [f"{res['case']:<22} {good}/{len(res['fields'])} fields right  end={res['state']}  "
                 f"{res['seconds']}s  ${res['cost_usd']}  {res['turns']} turns"]
        lines += [f"    ✗ {x}"[:220] for x in res["run"]["safety"]]
        lines += [f"    ✗ {f['field']}: want {f['want']}, got {json.dumps(f['got'], default=str)[:120]}"
                  for f in res["fields"] if not f["ok"]]
        if res["state"] != _normal_end(res):
            lines.append(f"    stopped: {res['note'][:300]}")
        with lock:                                # one case's lines together, even with cases in parallel
            results.append(res)
            state["done"] += 1
            state["passed"] += passed(res)
            print("\n".join(lines), flush=True)
            status(f"{state['done']}/{len(cases)} forms done; {state['passed']} passed so far")

    try:
        if jobs <= 1:
            for n, r in track(cases, "forms"):
                status(f"{len(results)}/{len(cases)} {n}{' redraw' if r else ''} running; "
                       f"{state['passed']} passed so far")
                report(run_case(srv, out, n, r, slow, model, submit))
        else:
            # each case has its own Chrome and folder: nothing is shared but the page server
            from concurrent.futures import ThreadPoolExecutor
            status(f"0/{len(cases)} forms, {jobs} at a time")
            with ThreadPoolExecutor(jobs) as ex:
                for fut in [ex.submit(run_case, srv, out, n, r, slow, model, submit) for n, r in cases]:
                    report(fut.result())
    finally:
        srv.close()
    (out / "summary.json").write_text(json.dumps(
        [{k: r[k] for k in ("case", "state", "seconds", "cost_usd", "turns")}
         | {"right": sum(f["ok"] for f in r["fields"]), "of": len(r["fields"]), "passed": passed(r)} | r["run"]
         for r in results], indent=1))
    npass = sum(passed(r) for r in results)
    cost = sum(r["cost_usd"] for r in results)
    status(f"done: {npass}/{len(results)} passed, ${cost:.2f}")
    print(f"done: {npass}/{len(results)} passed, ${cost:.2f}; results in {out}", flush=True)
    return 0
