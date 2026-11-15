"""One agent run on one practice form: `claude -p` with Playwright MCP as its only tools.

The model reads accessibility snapshots and clicks/types by element reference, with the made-up user's files
(bench/applicant) and the task in its prompt. FORMWRIGHT_PLAIN_SERVER=formwright runs the same Playwright MCP from
Patchright's driver (formwright/pwmcp) with the tools named in FORMWRIGHT_MCP_TOOLS added; unset, the official
npx package.
"""
import json
import os
import shutil
import signal
import subprocess
import time

from . import BENCH_PROFILE, WINDOWS, exe

MCP = "@playwright/mcp@0.0.83"
SERVER = os.environ.get("FORMWRIGHT_PLAIN_SERVER", "npx")
APPLICANT = BENCH_PROFILE.parent
EFFORT = os.environ.get("FORMWRIGHT_PLAIN_EFFORT", "medium")   # Haiku 5.5's own default, Anthropic's advice for multi-step tool use
LEAN = os.environ.get("FORMWRIGHT_PLAIN_LEAN") == "1"   # fewer-calls guidance + no code echo in tool results
BUDGET_USD = 2.00         # per form

SYSTEM = """You fill in online job applications for one applicant, using a browser through your tools.
This is a DRY RUN: fill every field correctly and go through every step of the application (Next / Continue /
Save and continue are fine, and so are signing in, creating an account and verifying an email), but never click
the button that sends the finished application to the employer. Stop just before it.
Use only facts from the applicant's files. Never invent an answer. When a question needs something the files don't
say and only the applicant can decide, fill the rest of the page first, then stop and report needs_user with the
question. When the page says this job
was already applied for, stop and report skipped. Optional fields the files say nothing about stay blank.
When you are done, reply with:
- end: dry_done (everything filled, stopped before the final send) | needs_user | skipped
- note: one or two sentences: where you stopped and why, and anything you were unsure of."""

# practice-site runs that go all the way (fw bench --submit): the site's own errors on Submit are part of the test
SUBMIT_SYSTEM = SYSTEM.replace("""This is a DRY RUN: fill every field correctly and go through every step of the application (Next / Continue /
Save and continue are fine, and so are signing in, creating an account and verifying an email), but never click
the button that sends the finished application to the employer. Stop just before it.""", """This is a practice site: fill every field correctly, go through every step of the application (signing in,
creating an account and verifying an email are fine) and send it at the end with the final Submit / Apply button.
If the page then shows errors, fix them and send again.""").replace(
    "- end: dry_done (everything filled, stopped before the final send)", "- end: submitted (the page confirmed it was sent)")
assert SUBMIT_SYSTEM.count("practice site") == 1 and "submitted (" in SUBMIT_SYSTEM

LEAN_NOTE = """
Work in as few tool calls as you can. Fill every field you can see in one browser_fill_form. When the same kind of
control repeats (a dropdown that needs open, type and pick; rows of a list), do the first one by hand to learn how it
works, then do the rest in one browser_run_code_unsafe script that also reads back what each control shows and
returns that. Take a snapshot only when you need to see the page again."""

def _schema(submit=False):
    ends = ["submitted" if submit else "dry_done", "needs_user", "skipped"]
    return {"type": "object", "additionalProperties": False, "required": ["end", "note"],
            "properties": {"end": {"type": "string", "enum": ends}, "note": {"type": "string"}}}


def _files():
    parts = []
    for p in [BENCH_PROFILE, APPLICANT / "resume.md", *sorted((APPLICANT / "writing").glob("*.md"))]:
        parts.append(f"===== {p.name} =====\n{p.read_text(encoding='utf-8').strip()}")
    return "\n\n".join(parts)


def prompt(url, mail_url, pdf):
    return (f"Apply for the job at {url}\n\n"
            f"Resume file to upload: {pdf}\n"
            f"Emails sent to the applicant (e.g. verification codes) can be read as JSON at {mail_url}\n"
            f"If the site needs a new account, choose a password that fits its rules and say it in the note.\n\n"
            f"APPLICANT'S FILES\n\n{_files()}")


# claude -p run inside a project would load that project's Claude Code memory notes and CLAUDE.md files into the
# model's context; --setting-sources "" alone doesn't stop that, and --safe-mode also drops the MCP tools.
NO_NOTES = {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1", "CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1"}


def _drive(cmd, d, model, timeout):
    """Run one claude -p browser session in folder d: stream to d/plain.jsonl, band status while it runs, its usage
    row in d/data/llm-usage.jsonl. Returns {state, note, turns, rc, seconds, usd}."""
    from .bench import jobstatus
    status = jobstatus()[1]
    (d / "data").mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}
    with open(d / "plain.jsonl", "w", encoding="utf-8") as out, open(d / "child.log", "w", encoding="utf-8") as err:
        p = subprocess.Popen(cmd, cwd=d, stdout=out, stderr=err, stdin=subprocess.DEVNULL, **group,
                             env={**os.environ, **NO_NOTES})
        while True:
            try:
                rc = p.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                pass
            calls = (d / "plain.jsonl").read_text(encoding="utf-8").count('"type":"tool_use"')
            status(f"{d.name}: {calls} browser calls, {round(time.time() - t0)}s")
            if time.time() - t0 > timeout:
                _kill_tree(p)
                rc = "timeout"
                break
    res = None
    for line in (d / "plain.jsonl").read_text(encoding="utf-8").splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("type") == "result":
            res = m
    job = {"state": None, "note": "", "turns": None, "rc": rc, "seconds": round(time.time() - t0), "usd": None}
    if res:
        u = res.get("usage") or {}
        tin = sum(u.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        row = {"t": time.strftime("%Y-%m-%dT%H:%M:%S"), "model": model, "in": tin,
               "cache_read": u.get("cache_read_input_tokens"), "out": u.get("output_tokens"),
               "ms": res.get("duration_ms"), "turns": res.get("num_turns"), "usd": res.get("total_cost_usd"),
               "arm": "plain"}
        with open(d / "data" / "llm-usage.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
        job.update(turns=res.get("num_turns"), usd=res.get("total_cost_usd"), tokens_in=tin,
                   cache_read=row["cache_read"], tokens_out=row["out"])
        so = res.get("structured_output")
        if isinstance(so, dict):
            job["state"], job["note"] = so.get("end"), so.get("note") or ""
        else:
            job["note"] = f"{res.get('subtype')}: {str(res.get('result') or '')[:400]}"
    return job


def _kill_tree(p):
    """claude and its npx/Chrome children."""
    if WINDOWS:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True, check=False)
    else:
        os.killpg(p.pid, signal.SIGKILL)
    p.wait()


def _cmd(text, model, mcp_args, budget, submit=False):
    if SERVER == "formwright":
        from . import pwmcp
        argv = pwmcp.command(*mcp_args)
        mcp = {"mcpServers": {"pw": {"command": argv[0], "args": argv[1:]}}}
        if os.environ.get("FORMWRIGHT_MCP_TOOLS"):
            mcp["mcpServers"]["pw"]["env"] = {"FORMWRIGHT_MCP_TOOLS": os.environ["FORMWRIGHT_MCP_TOOLS"]}
    else:
        npx = ["cmd", "/c", "npx"] if WINDOWS else ["npx"]      # claude on Windows starts npx only through cmd
        mcp = {"mcpServers": {"pw": {"command": npx[0], "args": [*npx[1:], "-y", MCP, *mcp_args]}}}
    if LEAN:
        mcp["mcpServers"]["pw"]["args"] += ["--codegen", "none"]
    return [exe("claude"), "-p", text, "--model", model, "--effort", EFFORT,
            "--system-prompt", (SUBMIT_SYSTEM if submit else SYSTEM) + (LEAN_NOTE if LEAN else ""), "--tools", "", "--mcp-config", json.dumps(mcp), "--strict-mcp-config",
            "--allowedTools", "mcp__pw", "--setting-sources", "", "--disable-slash-commands",
            "--no-session-persistence", "--max-budget-usd", str(budget), "--json-schema", json.dumps(_schema(submit)),
            "--verbose", "--output-format", "stream-json"]


def run(url, model, d, mail_url, timeout, submit=False):
    """One case in folder d. submit: send the application at the end (practice site only). Returns (job dict like bench-one's RESULT: state, note; extra: turns, rc)."""
    pdf = d / "Karthik_Raman_Resume.pdf"
    shutil.copy2(APPLICANT / pdf.name, pdf)       # Playwright MCP may read files under its working folder only
    cmd = _cmd(prompt(url, mail_url, pdf), model,
               ["--headless", "--isolated", "--browser", "chrome", "--output-dir", str(d / "mcp")], BUDGET_USD, submit)
    job = _drive(cmd, d, model, timeout)
    job.update(server=SERVER, tools=os.environ.get("FORMWRIGHT_MCP_TOOLS") or "")
    return job
