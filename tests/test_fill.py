"""formwright_fill (formwright/pwmcp/fill.js) through formwright's browser server, on the practice site's real widget libraries.

Scripted tool calls, no model. The oracle is the page's own record of its fields (what the bench grades), never the
tool's reply. Needs a browser: FORMWRIGHT_BROWSER_TESTS=1.
"""
import asyncio
import os
import re
import tempfile
import time
import unittest

from formwright import BENCH_PROFILE, bench, pwmcp

try:
    import sys
    sys.path.insert(0, os.path.expanduser("~/.local/share/jobs"))
    from jobstatus import status
except ImportError:
    def status(_):
        pass

OPTS = ["--headless", "--isolated", "--browser", "chrome", "--output-dir", "mcp"]
RESUME = BENCH_PROFILE.parent / "Karthik_Raman_Resume.pdf"


def ref(snap, role, name, nth=0):
    """The ref of the nth (0-based) control of this role whose name starts with name."""
    ms = list(re.finditer(rf"- '?{role} \"{re.escape(name)}[^\"]*\"[^\n]*?\[ref=((?:f\d+)?e\d+)\]", snap))
    if len(ms) <= nth:
        raise AssertionError(f"no {role} {name!r} #{nth} in:\n{snap}")
    return ms[nth].group(1)


async def session(calls, tmp):
    """calls: list of (tool, args or fn(last snapshot) -> args). Returns the reply texts."""
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client
    argv = pwmcp.command(*OPTS)
    server = StdioServerParameters(command=argv[0], args=argv[1:], cwd=tmp,
                                   env={**os.environ, "FORMWRIGHT_MCP_TOOLS": "formwright_fill", "FORMWRIGHT_FILL_DEBUG": "1"})
    out, snap = [], ""
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as client:
            await client.initialize()
            for tool, args in calls:
                args = args(snap) if callable(args) else args
                res = await client.call_tool(tool, args)
                text = "\n".join(c.text for c in res.content if c.type == "text")
                if "### Snapshot\n```yaml" in text or tool == "browser_snapshot":
                    snap = text
                out.append(text)
    return out


@unittest.skipUnless(os.environ.get("FORMWRIGHT_BROWSER_TESTS") == "1", "needs a browser: FORMWRIGHT_BROWSER_TESTS=1")
class Fill(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bench.build()
        cls.srv = bench.Server()

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()

    def run_page(self, scenario, fields, redraw=False, before=()):
        """Open the scenario, make the calls in `before` (clicks that add rows), one formwright_fill call with
        fields(snapshot) -> list; the page's record of its fields and the reply."""
        run = f"fill-{scenario}-{redraw}-{time.time_ns()}"
        status(f"formwright_fill on {scenario}{' redraw' if redraw else ''}")
        with tempfile.TemporaryDirectory() as tmp:
            out = asyncio.run(session([
                ("browser_navigate", {"url": self.srv.url(scenario, run, redraw=redraw)}),
                ("browser_snapshot", {}),
                *before,
                ("browser_snapshot", {}),
                ("formwright_fill", lambda s: {"fields": fields(s)}),
                ("browser_wait_for", {"time": 1}),     # the page reports its fields 80 ms after a change
            ], tmp))
        time.sleep(1.0)
        reply = out[-2]
        print(f"\n--- {scenario}{' redraw' if redraw else ''}\n{reply}")
        return self.srv.states.get(run) or {}, reply

    def assertGraded(self, scenario, state, reply, skip=()):
        bad = [r for r in bench.grade(scenario, state) if not r[1] and r[0] not in skip]
        self.assertFalse(bad, f"{bad}\n{reply}")

    def widgets_fields(self, s):
        monday = bench._next_monday()
        return [
            {"target": ref(s, "combobox", "Country code"), "name": "Country code", "value": "India (+91)"},
            {"target": ref(s, "combobox", "Total years of experience"), "name": "Total years of experience", "value": "Fresher / 0"},
            {"target": ref(s, "combobox", "Notice period"), "name": "Notice period", "value": "Immediate"},
            {"target": ref(s, "combobox", "Nationality (country)"), "name": "Nationality (country)", "value": "India"},
            {"target": ref(s, "combobox", "How did you hear about this job?"), "name": "How did you hear about this job?", "value": "LinkedIn"},
            {"target": ref(s, "combobox", "Preferred work location"), "name": "Preferred work location", "value": "Chennai"},
            {"target": ref(s, "textbox", "Earliest start date"), "name": "Earliest start date", "value": monday},
            {"target": ref(s, "textbox", "Graduation date"), "name": "Graduation date", "value": "07/2026"},
            {"target": ref(s, "textbox", "Expected annual CTC"), "name": "Expected annual CTC (in LPA)", "value": "5"},
            {"target": ref(s, "combobox", "Languages you speak"), "name": "Languages you speak", "value": ["English", "Hindi", "Japanese"]},
        ]

    def test_F1_every_library_dropdown_in_one_call(self):
        """react-select (single, multi), MUI Select, MUI Autocomplete, Headless UI, Downshift, react-datepicker:
        the page records every answer, and the reply says 10 ok."""
        state, reply = self.run_page("widgets", self.widgets_fields)
        self.assertGraded("widgets", state, reply)
        self.assertIn("\n10 ok, 0 not done, 0 unsure", reply)

    def test_F2_after_every_change_redraws_the_form(self):
        """redraw=1: every committed change re-creates the form's DOM, so the snapshot's refs go stale after the
        first field; the tool finds each later field again by its label."""
        state, reply = self.run_page("widgets", self.widgets_fields, redraw=True)
        self.assertGraded("widgets", state, reply)

    def test_F3_native_controls_groups_split_boxes_upload_hidden_box(self):
        """basics: text boxes, native selects, radio groups given as the group, three one-part date boxes, a file
        input, and a consent box shrunk to nothing behind a styled stand-in."""
        def fields(s):
            return [
                {"target": ref(s, "textbox", "First name"), "name": "First name", "value": "Karthik"},
                {"target": ref(s, "textbox", "Last name"), "name": "Last name", "value": "Raman"},
                {"target": ref(s, "textbox", "Email address"), "name": "Email address", "value": "karthik.raman@example.com"},
                {"target": ref(s, "combobox", "Phone country code"), "name": "Phone country code", "value": "+91 India"},
                {"target": ref(s, "textbox", "Mobile number"), "name": "Mobile number", "value": "9000011122"},
                {"target": ref(s, "group", "Gender"), "name": "Gender", "value": "Male"},
                {"target": ref(s, "textbox", "Date of birth: Day"), "value": "14"},
                {"target": ref(s, "textbox", "Date of birth: Month"), "value": "10"},
                {"target": ref(s, "textbox", "Date of birth: Year"), "value": "2003"},
                {"target": ref(s, "combobox", "Highest qualification"), "name": "Highest qualification", "value": "Bachelor's degree"},
                {"target": ref(s, "group", "Are you legally authorized"), "value": "Yes"},
                {"target": ref(s, "group", "Will you now or in the future"), "value": "No"},
                {"target": ref(s, "button", "Resume / CV"), "name": "Resume / CV", "value": str(RESUME)},
                # shrunk to 0x0: no ref in the snapshot, so a locator
                {"target": "#consent", "name": "I have read and agree to the Privacy Notice", "value": True},
            ]
        state, reply = self.run_page("basics", fields)
        self.assertGraded("basics", state, reply)

    def test_F4_an_answer_that_could_be_several_options_picks_none(self):
        """'5' could be '3-5' or '5+': nothing is picked, the reply names both, the page's field stays empty.
        'Klingon' is no option: NOT DONE with the options seen, field empty."""
        def fields(s):
            return [{"target": ref(s, "combobox", "Total years of experience"), "value": "5"},
                    {"target": ref(s, "combobox", "Notice period"), "value": "Klingon"}]
        state, reply = self.run_page("widgets", fields)
        f = state.get("fields") or {}
        self.assertFalse(f.get("years_experience"), reply)
        self.assertFalse(f.get("notice_period"), reply)
        self.assertIn('"3-5"', reply)
        self.assertIn('"5+"', reply)
        self.assertIn('"Immediate"', reply)
        self.assertIn("\n0 ok, 2 not done", reply)

    def test_F5_long_form_rows_with_repeated_labels(self):
        """longform (Ametek's traits): 4 work rows, 1 education row, 3 language rows added by their Add buttons,
        every row with the same labels, then ~50 fields (about 40 custom dropdowns, five libraries) in one call,
        each row's fields told apart only by their refs."""
        add = lambda label: ("browser_click", lambda s: {"target": ref(s, "button", label), "element": label})
        before = [add("+ Add Previous Employment")] * 4 + [add("+ Add Education")] + [add("+ Add Language Skills")] * 3
        jobs = [("Software Developer Intern", "Halcyon Byteworks", "January", "2026", "July", "2026"),
                ("Cyber-Security Intern", "Riverbend Labs", "June", "2025", "August", "2025"),
                ("ML Intern", "Bluefin Analytics Solutions & Technologies", "June", "2024", "August", "2024"),
                ("Cloud Computing Intern", "Kaveri Finance Services Ltd.", "August", "2024", "August", "2024")]
        langs = [("English", "Native or Bilingual Proficiency"), ("Hindi", "Native or Bilingual Proficiency"),
                 ("Japanese", "Elementary Proficiency")]

        def fields(s):
            f = [{"target": ref(s, "textbox", "First Name"), "value": "Karthik"},
                 {"target": ref(s, "textbox", "Last Name"), "value": "Raman"},
                 {"target": ref(s, "textbox", "Email"), "value": "karthik.raman@example.com"},
                 {"target": ref(s, "combobox", "Phone Country Code"), "value": "India (+91)"},
                 {"target": ref(s, "textbox", "Primary Phone"), "value": "9000011122"},
                 {"target": ref(s, "combobox", "Country"), "value": "India"},
                 {"target": ref(s, "combobox", "State"), "value": "Tamil Nadu"},
                 {"target": ref(s, "combobox", "City"), "value": "Chennai"},
                 {"target": ref(s, "textbox", "Address Line 1"), "value": "B-12, Lotus Residency"},
                 {"target": ref(s, "textbox", "Postal Code"), "value": "600097"},
                 {"target": ref(s, "button", "Upload Resume"), "value": str(RESUME)}]
            for i, (t, c, sm, sy, em, ey) in enumerate(jobs):
                f += [{"target": ref(s, "textbox", "Job Title", i), "value": t},
                      {"target": ref(s, "textbox", "Company", i), "value": c},
                      {"target": ref(s, "combobox", "Start Month", i), "value": sm},
                      {"target": ref(s, "combobox", "Start Year", i), "value": sy},
                      {"target": ref(s, "combobox", "End Month", i), "value": em},
                      {"target": ref(s, "combobox", "End Year", i), "value": ey}]
            f += [{"target": ref(s, "textbox", "School"), "value": "Coromandel Institute of Technology, Chennai Campus"},
                  {"target": ref(s, "combobox", "Degree"), "value": "Bachelors"},
                  {"target": ref(s, "combobox", "Major"), "value": "Computer Science"},
                  {"target": ref(s, "combobox", "Graduation Year"), "value": "2026"}]
            for i, (lang, p) in enumerate(langs):
                f += [{"target": ref(s, "combobox", "Language", i), "value": lang}] + [
                    {"target": ref(s, "combobox", f"{k} Proficiency", i), "value": p} for k in ("Speaking", "Reading", "Writing")]
            f += [{"target": ref(s, "combobox", "Are you willing to relocate"), "value": "Yes"},
                  {"target": ref(s, "combobox", "Notice Period"), "value": "Immediate"},
                  {"target": ref(s, "combobox", "Will you require visa sponsorship"), "value": "No"},
                  {"target": ref(s, "combobox", "Have you previously worked"), "value": "No"},
                  {"target": ref(s, "combobox", "How did you hear"), "value": "LinkedIn"},
                  {"target": ref(s, "checkbox", "I certify"), "value": True}]
            return f
        state, reply = self.run_page("longform", fields, before=before)
        self.assertGraded("longform", state, reply)
        self.assertNotIn("NOT DONE", reply)

    def assertGradedOnly(self, scenario, state, reply, keys):
        bad = [r for r in bench.grade(scenario, state) if not r[1] and r[0] in keys]
        self.assertFalse(bad, f"{bad}\n{reply}")

    def test_F6_browser_date_time_boxes_range_multiselect_editable(self):
        """html: the browser's own month/date/time/datetime-local boxes (answers written the way people write
        them), a range input, a native multi-select, a datalist box, a contenteditable address."""
        fields = [{"target": "#h_grad", "value": "07/2026"},
                  {"target": "#h_dob", "value": "14/10/2003"},
                  {"target": "#h_years", "value": "0"},
                  {"target": "#h_slot", "value": "10:00 AM"},
                  {"target": "#h_test", "value": "2026-12-01T10:00"},
                  {"target": "#h_cities", "value": ["Bengaluru", "Chennai", "Hyderabad", "Pune"]},
                  {"target": "#h_nationality", "value": "Indian"},
                  {"target": "#h_address", "value": "B-12, Lotus Residency, Rajiv Gandhi Salai, Thoraipakkam, Chennai 600097"}]
        state, reply = self.run_page("html", lambda s: fields)
        self.assertGradedOnly("html", state, reply, {"h_grad", "h_dob", "h_years", "h_slot", "h_test", "h_cities",
                                                     "h_nationality", "h_address"})

    def test_F7_aria_slider_by_arrow_keys(self):
        """widgets2: a div role=slider (keys only) from 3 down to 0."""
        fields = [{"target": "getByRole('slider', { name: 'Total years of work experience' })", "value": "0"}]
        state, reply = self.run_page("widgets2", lambda s: fields)
        self.assertGradedOnly("widgets2", state, reply, {"w2_years"})
        self.assertIn("\n1 ok", reply)


if __name__ == "__main__":
    unittest.main()
