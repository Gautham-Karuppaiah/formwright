"""One agent run on one practice form: `claude -p` with Playwright MCP as its only tools.

The model reads accessibility snapshots and clicks/types by element reference, with the made-up user's files
(bench/applicant) and the task in its prompt. FORMWRIGHT_PLAIN_SERVER=formwright runs the same Playwright MCP from
Patchright's driver (formwright/pwmcp) with the tools named in FORMWRIGHT_MCP_TOOLS added; unset, the official
npx package. FORMWRIGHT_PLAIN_SERVER=cli gives the model Microsoft's Playwright CLI instead of the MCP: shell
commands plus the CLI's own skill text, with page snapshots written to files the model reads when it wants them;
with FORMWRIGHT_MCP_TOOLS=formwright_fill it also gets the fill tool as the `formwright-fill` command.
"""
import json
import os
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

from . import BENCH_PROFILE, WINDOWS, exe

MCP = "@playwright/mcp@0.0.83"
CLI = "@playwright/cli@0.1.24"
CLI_DIR = Path.home() / ".cache" / "formwright" / "pwcli"
_cli_lock = threading.Lock()
SERVER = os.environ.get("FORMWRIGHT_PLAIN_SERVER", "npx")
APPLICANT = BENCH_PROFILE.parent
EFFORT = os.environ.get("FORMWRIGHT_PLAIN_EFFORT", "medium")   # Haiku 5.5's own default, Anthropic's advice for multi-step tool use
LEAN = os.environ.get("FORMWRIGHT_PLAIN_LEAN") == "1"   # fewer-calls guidance + no code echo in tool results
NO_CODE = os.environ.get("FORMWRIGHT_PLAIN_NO_CODE") == "1"   # no code echo only (MCP arms)
BUDGET_USD = 2.00         # per form
# a run whose history passes this many tokens goes on in a new session on the same browser (handoff.py); 0 = one session
SPLIT_TOKENS = int(float(os.environ.get("FORMWRIGHT_PLAIN_SPLIT_K") or 0) * 1000)
MAX_SESSIONS = 8

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
works, then do the rest the same way. Take a snapshot only when you need to see the page again."""

CLI_NOTE = """
Your browser is playwright-cli, run through Bash; its guide follows. Each command saves the page snapshot to a file
and prints the file's path; read it when you need to see the page.
"""


FILL_CLI = Path(__file__).parent / "pwmcp" / "cli_fill.js"
CLI_FILL = "formwright_fill" in (os.environ.get("FORMWRIGHT_MCP_TOOLS") or "").split(",")


def _fill_bin():
    """A folder holding the formwright-fill command, and the command's help text for the model."""
    b = CLI_DIR / "fwbin"
    b.mkdir(parents=True, exist_ok=True)
    if WINDOWS:
        (b / "formwright-fill.cmd").write_text(f'@node "{FILL_CLI}" %*\r\n')
    else:
        (b / "formwright-fill").write_text(f'#!/bin/sh\nexec node "{FILL_CLI}" "$@"\n')
        (b / "formwright-fill").chmod(0o755)
    text = subprocess.run([exe("node"), str(FILL_CLI), "--help"], capture_output=True, text=True, check=True).stdout
    return b, text.strip()


def _cli():
    """The CLI's bin folder and its skill text (references pointing at their real files), installed on first use."""
    with _cli_lock:
        bin_ = CLI_DIR / "node_modules" / ".bin"
        if not (bin_ / ("playwright-cli.cmd" if WINDOWS else "playwright-cli")).exists():
            CLI_DIR.mkdir(parents=True, exist_ok=True)
            npm = ["cmd", "/c", "npm"] if WINDOWS else [exe("npm")]
            subprocess.run([*npm, "install", "--no-audit", "--no-fund", "--prefix", str(CLI_DIR), CLI], check=True,
                           capture_output=True)
    skill = CLI_DIR / "node_modules" / "playwright-core" / "lib" / "tools" / "skills" / "playwright-cli"
    text = (skill / "SKILL.md").read_text(encoding="utf-8").split("---", 2)[2].strip()   # body, without front matter
    return bin_, text.replace("](references/", f"]({(skill / 'references').as_posix()}/")


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


def _drive(cmd, d, model, timeout, env=None, stream="plain.jsonl"):
    """Run one claude -p browser session in folder d: stream to d/<stream>, band status while it runs, its usage
    row in d/data/llm-usage.jsonl. Returns {state, note, turns, rc, seconds, usd}."""
    from .bench import jobstatus
    status = jobstatus()[1]
    (d / "data").mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}
    with open(d / stream, "w", encoding="utf-8") as out, open(d / "child.log", "a", encoding="utf-8") as err:
        p = subprocess.Popen(cmd, cwd=d, stdout=out, stderr=err, stdin=subprocess.DEVNULL, **group,
                             env={**os.environ, **NO_NOTES, **(env or {})})
        while True:
            try:
                rc = p.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                pass
            calls = (d / stream).read_text(encoding="utf-8").count('"type":"tool_use"')
            status(f"{d.name}: {calls} browser calls, {round(time.time() - t0)}s")
            if time.time() - t0 > timeout:
                _kill_tree(p)
                rc = "timeout"
                break
    res = None
    for line in (d / stream).read_text(encoding="utf-8").splitlines():
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


def _cmd(text, model, mcp_args, budget, submit=False, settings=None, grep=False):
    system = (SUBMIT_SYSTEM if submit else SYSTEM) + (LEAN_NOTE if LEAN else "")
    if SERVER == "cli":
        skill = _cli()[1]
        allowed = ["Bash(playwright-cli:*)", "Read", "Grep", "Glob"]
        extra = ""
        if CLI_FILL:
            allowed.append("Bash(formwright-fill:*)")
            extra = "\n\n## formwright-fill: filling form fields\n\n" + _fill_bin()[1] + "\n"
        tools = ["--tools", "Bash,Read,Grep,Glob", "--strict-mcp-config", "--allowedTools", *allowed]
        return _claude(text, model, system + CLI_NOTE + extra + "\n" + skill, tools, budget, submit)
    if SERVER == "formwright":
        from . import pwmcp
        argv = pwmcp.command(*mcp_args)
        mcp = {"mcpServers": {"pw": {"command": argv[0], "args": argv[1:]}}}
        if os.environ.get("FORMWRIGHT_MCP_TOOLS"):
            mcp["mcpServers"]["pw"]["env"] = {"FORMWRIGHT_MCP_TOOLS": os.environ["FORMWRIGHT_MCP_TOOLS"],
                                              **({"FORMWRIGHT_PAGE_CODE": "1"} if os.environ.get("FORMWRIGHT_PAGE_CODE") == "1" else {})}
    else:
        npx = ["cmd", "/c", "npx"] if WINDOWS else ["npx"]      # claude on Windows starts npx only through cmd
        mcp = {"mcpServers": {"pw": {"command": npx[0], "args": [*npx[1:], "-y", MCP, *mcp_args]}}}
    if LEAN or NO_CODE:
        mcp["mcpServers"]["pw"]["args"] += ["--codegen", "none"]
    tools = ["--tools", "Grep" if grep else "", "--mcp-config", json.dumps(mcp), "--strict-mcp-config",
             "--allowedTools", "mcp__pw", *(["Grep"] if grep else [])]
    if settings:
        tools += ["--settings", settings]
    return _claude(text, model, system, tools, budget, submit)


def _claude(text, model, system, tools, budget, submit):
    return [exe("claude"), "-p", text, "--model", model, "--effort", EFFORT, "--system-prompt", system, *tools,
            "--setting-sources", "", "--disable-slash-commands",
            "--no-session-persistence", "--max-budget-usd", str(budget), "--json-schema", json.dumps(_schema(submit)),
            "--verbose", "--output-format", "stream-json"]


def run(url, model, d, mail_url, timeout, submit=False):
    """One case in folder d. submit: send the application at the end (practice site only). Returns (job dict like bench-one's RESULT: state, note; extra: turns, rc)."""
    pdf = d / "Karthik_Raman_Resume.pdf"
    shutil.copy2(APPLICANT / pdf.name, pdf)       # Playwright MCP may read files under its working folder only
    cmd = _cmd(prompt(url, mail_url, pdf), model,
               ["--headless", "--isolated", "--browser", "chrome", "--output-dir", str(d / "mcp")], BUDGET_USD, submit)
    if SPLIT_TOKENS and SERVER != "cli":
        job = _split_run(prompt(url, mail_url, pdf), model, d, timeout, submit)
    elif SERVER != "cli":
        job = _drive(cmd, d, model, timeout)
    else:
        # the CLI keeps one browser per folder holding .playwright/: headless Chrome with an in-memory profile, like
        # the MCP arm, and nothing shared between cases running side by side
        (d / ".playwright").mkdir()
        (d / ".playwright" / "cli.config.json").write_text(json.dumps(
            {"browser": {"browserName": "chromium", "launchOptions": {"channel": "chrome", "headless": True}}}))
        bin_ = _cli()[0]
        try:
            path = [str(bin_), *([str(CLI_DIR / "fwbin")] if CLI_FILL else []), os.environ.get("PATH", "")]
            job = _drive(cmd, d, model, timeout, {"PATH": os.pathsep.join(path)})
        finally:
            cli = [str(bin_ / "playwright-cli.cmd")] if WINDOWS else [str(bin_ / "playwright-cli")]
            subprocess.run([*cli, "close"], cwd=d, capture_output=True, timeout=60, check=False)
    job.update(server=SERVER, tools=os.environ.get("FORMWRIGHT_MCP_TOOLS") or "")
    return job


def _chrome(d):
    """A headless Chrome of our own that outlives each session attached to it: (process, CDP endpoint)."""
    prof = d / "chrome-profile"
    binary = next(filter(None, (shutil.which(b) for b in ("google-chrome-stable", "google-chrome", "chrome"))), None)
    if not binary:
        raise RuntimeError("split runs need Chrome on PATH")
    # basic password store + mock keychain: a desktop keyring would otherwise ask to unlock a wallet
    p = subprocess.Popen([binary, "--headless=new", "--remote-debugging-port=0", f"--user-data-dir={prof}", "--no-first-run",
                          "--password-store=basic", "--use-mock-keychain", "about:blank"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    port_file = prof / "DevToolsActivePort"
    for _ in range(200):
        if port_file.exists() and port_file.read_text().strip():
            return p, f"http://127.0.0.1:{int(port_file.read_text().split()[0])}"
        time.sleep(0.1)
    _kill_tree(p)
    raise RuntimeError("Chrome gave no debugging port")


def _split_run(text, model, d, timeout, submit):
    """One case as several sessions on one browser: each ends once its history passes SPLIT_TOKENS; the next gets
    the task plus the record handoff.py writes from the earlier sessions. Returns the summed job dict."""
    from . import handoff
    chrome, cdp = _chrome(d)
    t0 = time.time()
    total = {"usd": 0.0, "turns": 0, "tokens_in": 0, "cache_read": 0, "tokens_out": 0}
    streams, job = [], {}
    try:
        for n in range(1, MAX_SESSIONS + 1):
            stream = f"plain-{n}.jsonl" if n > 1 else "plain.jsonl"
            settings, env = handoff.hook_settings(d / stream, SPLIT_TOKENS)
            extra = ""
            if streams:
                log = d / f"earlier-sessions-{n - 1}.log"
                log.write_text(handoff.log_text(streams), encoding="utf-8")
                extra = handoff.note(streams, log)
                (d / f"handoff-{n}.txt").write_text(extra, encoding="utf-8")
            cmd = _cmd(text + extra, model, ["--browser", "chrome", "--cdp-endpoint", cdp, "--output-dir", str(d / "mcp")],
                       max(BUDGET_USD - total["usd"], 0.05), submit, settings=settings, grep=bool(streams))
            job = _drive(cmd, d, model, max(timeout - (time.time() - t0), 30), env, stream)
            for k in total:
                total[k] += job.get(k) or 0
            streams.append(d / stream)
            stopped = job.get("state") is None and handoff.last_request_tokens(d / stream) >= SPLIT_TOKENS
            if not stopped or time.time() - t0 > timeout:
                break
    finally:
        _kill_tree(chrome)
    job.update(total, sessions=len(streams), seconds=round(time.time() - t0))
    return job
