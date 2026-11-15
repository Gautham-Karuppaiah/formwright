"""formwright's browser server (formwright/pwmcp) against the Playwright MCP the plain arm runs (npx @playwright/mcp).

The same scripted tool calls go to both; the replies must match once timestamps and ports are blanked. No model.
Needs a browser: FORMWRIGHT_BROWSER_TESTS=1.
"""
import asyncio
import functools
import http.server
import os
import re
import tempfile
import threading
import unittest
from pathlib import Path

from formwright import exe, plain, pwmcp

try:                                        # the status band when run as a runjob job
    import sys
    sys.path.insert(0, os.path.expanduser("~/.local/share/jobs"))
    from jobstatus import status
except ImportError:
    def status(_):
        pass

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "bench" / "fixtures"
OPTS = ["--headless", "--isolated", "--browser", "chrome", "--output-dir", "mcp"]
DIALOG = "data:text/html,<button onclick=\"alert('Saved')\">Save</button>"


def ref(text, pattern):
    m = re.search(pattern + r".*?\[ref=((?:f\d+)?e\d+)\]", text)
    if not m:
        raise AssertionError(f"no {pattern!r} in:\n{text}")
    return m.group(1)


def script(base):
    """(tool, args or a function of the last snapshot text -> args). Covers every tool the plain arm used."""
    return [
        ("browser_navigate", {"url": f"{base}/everykind.html"}),
        ("browser_snapshot", {}),
        ("browser_find", {"text": "Karthik"}),
        ("browser_find", {"regex": "/check/i"}),
        ("browser_fill_form", lambda s: {"fields": [
            {"target": ref(s, r'textbox "[^"]*"'), "name": "first text box", "type": "textbox", "value": "Ravi"},
            {"target": ref(s, r"checkbox"), "name": "a checkbox", "type": "checkbox", "value": "false"}]}),
        ("browser_click", lambda s: {"target": ref(s, r"radio"), "element": "a radio"}),
        ("browser_type", lambda s: {"target": ref(s, r'textbox "[^"]*"'), "text": "Ravi K", "submit": True}),
        ("browser_press_key", {"key": "Tab"}),
        ("browser_evaluate", {"function": "() => document.querySelector('#t').value"}),
        ("browser_evaluate", lambda s: {"target": ref(s, r"combobox"), "element": "a select",
                                        "function": "(el) => el.tagName"}),
        ("browser_select_option", lambda s: {"target": ref(s, r"combobox"), "values": ["nonexistent option"]}),
        ("browser_hover", lambda s: {"target": ref(s, r"radio")}),
        ("browser_click", {"target": "e999"}),
        ("browser_click", {"target": "#t"}),
        ("browser_click", {"target": "getByRole('checkbox').first()"}),
        ("browser_wait_for", {"time": 0.2}),
        ("browser_wait_for", {"text": "Karthik"}),
        ("browser_run_code_unsafe", {"code": "async (page) => { return await page.locator('#t').inputValue(); }"}),
        ("browser_console_messages", {"level": "info"}),
        ("browser_file_upload", {"paths": [str(FIXTURES / "frame.html")]}),
        ("browser_navigate", {"url": f"{base}/combo.html"}),
        ("browser_snapshot", {}),
        ("browser_click", lambda s: {"target": ref(s, r"combobox")}),
        ("browser_snapshot", {}),
        ("browser_navigate", {"url": f"{base}/frame.html"}),
        ("browser_snapshot", {}),
        ("browser_navigate", {"url": DIALOG}),
        ("browser_snapshot", {}),
        ("browser_click", lambda s: {"target": ref(s, r'button "Save"')}),
        ("browser_snapshot", {}),
        ("browser_handle_dialog", {"accept": True}),
        ("browser_tabs", {"action": "list"}),
        ("browser_navigate_back", {}),
        ("browser_snapshot", {"depth": 2}),
    ]


def normalize(text, port):
    text = re.sub(r"\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z", "TIME", text)
    text = re.sub(r"\[\s*\d+ms\]", "[Tms]", text)
    return text.replace(str(port), "PORT")


async def run_server(argv, base, port, tmp):
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client
    server = StdioServerParameters(command=argv[0], args=argv[1:], cwd=tmp)
    out, snap = [], ""
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as client:
            await client.initialize()
            names = [t.name for t in (await client.list_tools()).tools]
            calls = script(base)
            for i, (tool, args) in enumerate(calls):
                status(f"{argv[1].split('/')[-1]}: call {i + 1}/{len(calls)} {tool}")
                args = args(snap) if callable(args) else args
                res = await client.call_tool(tool, args)
                text = "\n".join(c.text for c in res.content if c.type == "text")
                if "### Snapshot\n```yaml" in text:
                    snap = text
                out.append((tool, bool(res.is_error), normalize(text, port)))
    return names, out


@unittest.skipUnless(os.environ.get("FORMWRIGHT_BROWSER_TESTS") == "1", "needs a browser: FORMWRIGHT_BROWSER_TESTS=1")
class SameAsPlaywrightMCP(unittest.TestCase):
    """On plain Playwright's driver the replies are npx MCP's exactly. On Patchright's (what formwright uses) two are
    known to differ, both Patchright's doing: an alert() is gone a call or two after the click that opened it, so
    the next snapshot doesn't report it or handle_dialog finds no dialog; after going back to a page with an iframe, the iframe is empty."""

    @classmethod
    def setUpClass(cls):
        class Files(http.server.SimpleHTTPRequestHandler):
            def do_GET(self):
                # no favicon 404: its console error lands on whichever call is running, differently each time
                if self.path == "/favicon.ico":
                    self.send_response(204)
                    self.end_headers()
                    return
                super().do_GET()

            def log_message(self, *a):
                pass
        handler = functools.partial(Files, directory=str(FIXTURES))
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.port = cls.httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.theirs = cls.serve([exe("npx"), "-y", plain.MCP, *OPTS])

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    @classmethod
    def serve(cls, argv):
        with tempfile.TemporaryDirectory() as tmp:
            return asyncio.run(run_server(argv, cls.base, cls.port, tmp))

    def differing(self, ours):
        self.assertEqual(self.theirs[0], ours[0], "tool list")
        for i, (t, e, x) in enumerate(ours[1]):
            print(f"=== {i} {t} error={e}\n{x}\n")
        return {i: f"--- call {i} {t}\nNPX:\n{x}\nOURS:\n{y}"
                for i, ((t, ex, x), (_, ey, y)) in enumerate(zip(self.theirs[1], ours[1])) if (ex, x) != (ey, y)}

    def test_on_playwright_driver_replies_are_identical(self):
        diffs = self.differing(self.serve(pwmcp.command(*OPTS, driver="playwright")))
        self.assertFalse(diffs, "\n\n".join(diffs.values()))

    def test_on_patchright_driver_only_the_known_differences(self):
        calls = [t for t, _ in script(self.base)]
        # the alert is gone by the snapshot after the click or by handle_dialog, depending on timing
        dialog = calls.index("browser_handle_dialog")
        known = {dialog - 1, dialog, len(calls) - 1}
        diffs = self.differing(self.serve(pwmcp.command(*OPTS)))
        self.assertFalse(set(diffs) - known, "\n\n".join(v for i, v in diffs.items() if i not in known))


if __name__ == "__main__":
    unittest.main()
