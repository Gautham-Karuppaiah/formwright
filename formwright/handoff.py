"""Long runs in several short sessions. A session's every request re-sends its whole history, so a long run pays for
its early pages again on every later call, and past a size some models bill each request at a higher rate. Instead of
letting one session grow (or letting the model summarise itself), the run is cut into sessions on one browser:

- a hook after every tool call ends the session once its last request was larger than the limit (the session ends
  normally, so its cost is still reported);
- the next session gets the same task plus a record written by code, not by the model: every action of the earlier
  sessions in order, with the tools' own replies (the fill tool's read-back of each field), and the page it was on;
- the earlier sessions' full log stays on disk; the next session can search it (Grep) when the record isn't enough.

Run as a script, this file is the hook: it reads the session's stream (FORMWRIGHT_SPLIT_STREAM) and stops the session
when its last request held at least FORMWRIGHT_SPLIT_TOKENS tokens.
"""
import json
import os
import re
import sys
from pathlib import Path

TOOL = re.compile(r"^mcp__\w+?__")


def _ctx(usage):
    return sum(usage.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))


def last_request_tokens(stream):
    """Size of the last request a session sent, from its stream-json output."""
    size = 0
    for line in Path(stream).read_text(encoding="utf-8").splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("type") == "assistant":
            size = _ctx(m["message"].get("usage") or {}) or size
    return size


def hook_settings(stream, tokens):
    """--settings JSON for one session: the hook below after every tool call."""
    cmd = f'"{sys.executable}" "{Path(__file__).resolve()}"'
    return json.dumps({"hooks": {"PostToolUse": [{"matcher": "", "hooks": [{"type": "command", "command": cmd}]}]}}), \
        {"FORMWRIGHT_SPLIT_STREAM": str(stream), "FORMWRIGHT_SPLIT_TOKENS": str(tokens)}


def _text(content):
    if isinstance(content, str):
        return content
    return "\n".join(c.get("text", "") for c in content or [] if isinstance(c, dict) and c.get("type") == "text")


def actions(stream):
    """[(tool, input, reply text)] in order, and the model's own words, from one session's stream."""
    calls, order, said = {}, [], []
    for line in Path(stream).read_text(encoding="utf-8").splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        content = (m.get("message") or {}).get("content")
        if m.get("type") == "assistant":
            for c in content or []:
                if c.get("type") == "tool_use":
                    calls[c["id"]] = [TOOL.sub("", c["name"]), c.get("input") or {}, ""]
                    order.append(c["id"])
                elif c.get("type") == "text" and c.get("text", "").strip():
                    said.append(c["text"].strip())
        elif m.get("type") == "user" and isinstance(content, list):
            for c in content:
                if c.get("type") == "tool_result" and c.get("tool_use_id") in calls:
                    calls[c["tool_use_id"]][2] = _text(c.get("content"))
    return [tuple(calls[i]) for i in order], said


def _short(v, n=200):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n] + "..."


def _line(tool, inp, reply):
    """One action as a line or a few: what was done and what the page or tool said back."""
    err = "### Error" in reply
    what = inp.get("element") or inp.get("ref") or inp.get("target") or ""
    if tool == "formwright_fill":
        res = reply.split("### Result", 1)[-1].strip().splitlines()
        rows = [r for r in res[1:] if r.strip()] if res else []
        return "fill:\n" + "\n".join(f"    {r}" for r in rows) if rows and not err else \
            f"fill {_short([(f.get('name'), f.get('value')) for f in inp.get('fields', [])])}: {_short(reply, 300)}"
    if tool == "browser_fill_form":
        body = ", ".join(f"{f.get('name')} = {_short(f.get('value'), 80)!s}" for f in inp.get("fields", []))
    elif tool == "browser_type":
        body = f"typed {_short(inp.get('text'), 120)!r} into {what}"
    elif tool == "browser_select_option":
        body = f"chose {inp.get('values')} in {what}"
    elif tool == "browser_click":
        body = f"clicked {what}"
    elif tool == "browser_press_key":
        body = f"pressed {inp.get('key')}"
    elif tool == "browser_file_upload":
        body = f"uploaded {[Path(p).name for p in inp.get('paths') or []]}"
    elif tool == "browser_navigate":
        body = f"opened {inp.get('url')}"
    elif tool in ("browser_snapshot", "browser_take_screenshot", "browser_find", "browser_wait_for", "browser_console_messages"):
        return None                                   # reads only: the page itself shows the same now
    else:
        body = f"{tool} {_short(inp, 160)}"
        if not err:
            body += f" -> {_short(reply, 200)}"
    return f"{tool.replace('browser_', '')}: {body}" + (f"  [FAILED: {_short(reply.split('### Error', 1)[1], 160)}]" if err else "")


def record(streams):
    """The code-written record handed to the next session: every action so far, oldest first, and the last page."""
    lines, url, said = [], None, []
    for s in streams:
        acts, words = actions(s)
        said += words
        for tool, inp, reply in acts:
            u = re.findall(r"Page URL: (\S+)", reply)
            url = u[-1] if u else url
            ln = _line(tool, inp, reply)
            if ln:
                lines.append(ln)
    return lines, url, said[-3:]


def log_text(streams):
    """The earlier sessions in full as plain text (calls, replies, the model's words), for searching."""
    out = []
    for n, s in enumerate(streams, 1):
        acts, said = actions(s)
        out.append(f"===== session {n}")
        for tool, inp, reply in acts:
            out.append(f"--- {tool} {json.dumps(inp, ensure_ascii=False)}\n{reply.strip()}")
        out.append("--- the model's own words:\n" + "\n".join(said))
    return "\n".join(out)


def note(streams, log_path):
    lines, url, said = record(streams)
    return ("\n\nCONTINUING AN EARLIER SESSION\n"
            f"An earlier session of yours worked on this application and was ended only to keep its history short. The "
            f"browser is still open on the page it reached ({url}), with everything it entered. Don't start over: look at "
            f"the page and carry on from where it stopped. Every action it took, oldest first, with what the tools said "
            f"back:\n" + "\n".join(f"- {ln}" for ln in lines) +
            ("\nIts last words: " + " / ".join(_short(w, 300) for w in said) if said else "") +
            f"\nIts full log (every call and reply) is the file {log_path}: search it with Grep only if you need something "
            f"this list doesn't show.")


if __name__ == "__main__":
    json.load(sys.stdin)
    if last_request_tokens(os.environ["FORMWRIGHT_SPLIT_STREAM"]) >= int(os.environ["FORMWRIGHT_SPLIT_TOKENS"]):
        print(json.dumps({"continue": False, "stopReason": "history limit reached: the run goes on in a new session"}))
