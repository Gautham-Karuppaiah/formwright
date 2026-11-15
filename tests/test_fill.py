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


async def session(calls, tmp, env=None):
    """calls: list of (tool, args or fn(last snapshot) -> args). Returns the reply texts."""
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client
    argv = pwmcp.command(*OPTS)
    server = StdioServerParameters(command=argv[0], args=argv[1:], cwd=tmp,
                                   env={**os.environ, "FORMWRIGHT_MCP_TOOLS": "formwright_fill", "FORMWRIGHT_FILL_DEBUG": "1",
                                        **(env or {})})
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

    def run_page(self, scenario, fields, redraw=False, before=(), after=(), env=None):
        """Open the scenario, make the calls in `before` (clicks that add rows), one formwright_fill call with
        fields(snapshot) -> list, then the calls in `after`; the page's record of its fields and the fill reply."""
        run = f"fill-{scenario}-{redraw}-{time.time_ns()}"
        status(f"formwright_fill on {scenario}{' redraw' if redraw else ''}")
        with tempfile.TemporaryDirectory() as tmp:
            out = asyncio.run(session([
                ("browser_navigate", {"url": self.srv.url(scenario, run, redraw=redraw)}),
                ("browser_snapshot", {}),
                *before,
                ("browser_snapshot", {}),
                ("formwright_fill", lambda s: {"fields": fields(s)}),
                *after,
                ("browser_wait_for", {"time": 1}),     # the page reports its fields 80 ms after a change
            ], tmp, env))
        time.sleep(1.0)
        reply = out[-2 - len(after)]
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
        """longform: 4 work rows, 1 education row, 3 language rows added by their Add buttons,
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

    def test_F8_an_error_beside_another_box_is_not_this_ones(self):
        """html: the mobile box gets a bad value, so its row shows a format error; the slider set next reports no
        error (an error belongs to the field whose row it is in)."""
        fields = [{"target": "#h_mobile", "value": "12"}, {"target": "#h_years", "value": "0"}]
        state, reply = self.run_page("html", lambda s: fields)
        years = next(line for line in reply.splitlines() if "Years of professional experience" in line)
        self.assertNotIn("the form says", years)
        self.assertEqual(state.get("fields", {}).get("h_years"), 0)

    APPLY = [("browser_click", lambda s: {"target": ref(s, "button", "Apply"), "element": "Apply"}),
             ("browser_snapshot", {}),
             ("browser_click", lambda s: {"target": ref(s, "menuitem", "Apply Manually"), "element": "Apply Manually"})]

    def test_F9_text_that_is_only_a_search_is_not_ok(self):
        """workday: pickers drawn as plain text boxes with no dropdown markers; typed text is only a search and the
        page drops it when the box is left. Nothing is picked, so no line may say ok."""
        def fields(s):
            return [{"target": ref(s, "textbox", "School or University"), "value": "Coromandel Institute of Technology, Chennai Campus"},
                    {"target": ref(s, "textbox", "Field of Study"), "value": "Computer Science"}]
        state, reply = self.run_page("workday", fields, before=self.APPLY)
        self.assertIn("\n0 ok", reply)
        self.assertIn("until the tool left it", reply)

    def test_F10_one_radio_given_its_own_label_is_chosen(self):
        """workday: the radio "No" given "No" is chosen; the radio "Yes" given false can't be unticked: not ok."""
        def fields(s):
            return [{"target": ref(s, "radio", "No"), "value": "No"},
                    {"target": ref(s, "radio", "Yes"), "value": False}]
        state, reply = self.run_page("workday", fields, before=self.APPLY)
        self.assertEqual((state.get("fields") or {}).get("wd_auth"), "No", reply)
        self.assertIn("\n1 ok, 0 not done, 1 unsure", reply)

    def test_F11_what_an_input_changed_elsewhere_is_reported(self):
        """address: picking a country makes the State field appear; the Country line says so."""
        def fields(s):
            return [{"target": ref(s, "combobox", "Country"), "name": "Country", "value": "India"}]
        state, reply = self.run_page("address", fields)
        line = next(x for x in reply.splitlines() if x.startswith(("ok Country", "UNSURE Country", "NOT DONE Country")))
        self.assertIn("new fields appeared", line)
        self.assertIn("State", line)


    def test_F12_radio_divs_and_a_list_shown_on_the_page(self):
        """workday: a radio group of role=radio divs named by their own text, and a multi-select listbox drawn on
        the page (not a popup) with options in groups."""
        def fields(s):
            return [{"target": ref(s, "radiogroup", "Are you legally authorized"), "value": "Yes"},
                    {"target": ref(s, "listbox", "Languages"), "value": ["English", "Hindi", "Japanese"]}]
        state, reply = self.run_page("workday", fields, before=self.APPLY)
        self.assertGradedOnly("workday", state, reply, {"wd_auth", "wd_languages"})
        self.assertIn("\n2 ok", reply)

    def test_F13_form_in_a_dialog_hidden_lists_box_shows_the_pick(self):
        """modal: the form is in a dialog that Escape closes, and every dropdown's list is in the page, hidden, until
        opened: the tool must not close the dialog. A box that shows the picked option as its own text is ok, and so
        is a picked option that holds the answer ("India (+91)" for "+91"). A question given by its label text
        (not a ref) is found by that text."""
        open_ = [("browser_click", lambda s: {"target": ref(s, "button", "Apply For This Job"), "element": "Apply"})]
        q = ("Do you have a family relationship (including spouse, partner, parent, sibling or in-law) "
             "with an employee of the company?")

        def fields(s):
            bare = re.findall(r"- textbox \[ref=((?:f\d+)?e\d+)\]", s)    # boxes labelled only by nearby text
            return [{"target": bare[0], "name": "First Name", "value": "Karthik"},
                    {"target": bare[1], "name": "Last Name", "value": "Raman"},
                    {"target": ref(s, "combobox", "Country Code"), "name": "Country Code", "value": "+91"},
                    {"target": ref(s, "textbox", "000 000 0000"), "name": "Phone Number", "value": "9000011122"},
                    {"target": ref(s, "combobox", "Candidate Gender"), "name": "Candidate Gender", "value": "Male"},
                    {"target": q, "name": "family with employee", "value": "No"}]
        state, reply = self.run_page("modal", fields, before=open_)
        self.assertGraded("modal", state, reply)
        self.assertIn("\n6 ok, 0 not done, 0 unsure", reply)

    # ---- traps: each one a way the tool could say ok wrongly or change what nobody asked it to ----

    def trap(self, fields, **kw):
        """Fill on the traps page; the page's fields and the reply. The page is a dialog that Escape closes: it
        must still be open afterwards."""
        state, reply = self.run_page("traps", fields, **kw)
        f = state.get("fields") or {}
        self.assertIsNot(f.get("tr_dialog"), False, f"the dialog was closed\n{reply}")
        return f, reply

    def line(self, reply, name):
        return next(x for x in reply.splitlines() if re.match(rf"(ok|NOT DONE|UNSURE) {re.escape(name)}\b", x))

    def test_T1_no_list_means_no_escape(self):
        """A type-ahead with no results never shows a list: closing a list that isn't there would close the dialog."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "combobox", "Current city"), "name": "Current city", "value": "Atlantis"}])
        self.assertTrue(self.line(reply, "Current city").startswith("NOT DONE"), reply)
        self.assertFalse(f.get("tr_city"), reply)

    def test_T2_a_section_of_several_questions_is_refused(self):
        """A section holding two yes/no questions and a ticked box, given "Yes": nothing is touched, the reply
        says it holds several questions."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "group", "Work eligibility"), "name": "Work eligibility", "value": "Yes"}])
        self.assertTrue(self.line(reply, "Work eligibility").startswith("NOT DONE"), reply)
        self.assertIs(f.get("tr_consent"), True, reply)
        self.assertFalse(f.get("tr_auth"), reply)
        self.assertFalse(f.get("tr_spons"), reply)

    def test_T3_a_radio_given_another_options_text(self):
        """Radios with no group around them: the radio "Male" given "Female" chooses Female, never Male."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "radio", "Male"), "name": "Gender", "value": "Female"}])
        self.assertEqual(f.get("tr_sex"), "Female", reply)
        self.assertTrue(self.line(reply, "Gender").startswith("ok"), reply)

    def test_T4_keys_go_only_to_the_field(self):
        """A box that takes the focus back while invalid: the next field's typing must not land in it."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "textbox", "PIN code"), "name": "PIN code", "value": "12"},
                                        {"target": ref(s, "combobox", "Preferred city"), "name": "Preferred city", "value": "Chennai"}])
        self.assertEqual(f.get("tr_pin"), "12", reply)
        self.assertFalse(self.line(reply, "Preferred city").startswith("ok") and f.get("tr_pref") != "Chennai", reply)

    def test_T5_a_field_past_its_time_stops_acting(self):
        """A slow slider that runs out of time: after the reply, a radio the model clicks keeps its choice (no arrow
        keys still being pressed)."""
        f, reply = self.trap(
            lambda s: [{"target": ref(s, "slider", "Distance you can travel"), "name": "Distance", "value": "500"}],
            env={"FORMWRIGHT_FILL_FIELD_MS": "1500"},
            after=[("browser_click", lambda s: {"target": ref(s, "radio", "Afternoon"), "element": "Afternoon"}),
                   ("browser_wait_for", {"time": 3})])
        self.assertIn("TIMEOUT", reply)
        self.assertEqual(f.get("tr_slot"), "Afternoon", reply)

    def test_T6_options_of_another_list_are_not_this_fields(self):
        """A list always shown on the page and a type-ahead whose own list appears only with results: "Night" is
        in the page's list, not the type-ahead's; the page's list keeps its choice."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "combobox", "Team"), "name": "Team", "value": "Night"}])
        self.assertEqual(f.get("tr_shift"), "Morning", reply)
        self.assertFalse(f.get("tr_team"), reply)
        self.assertFalse(self.line(reply, "Team").startswith("ok"), reply)

    def test_T7_an_upload_button_uses_only_its_own_rows_input(self):
        """The résumé button's input is elsewhere; the cover-letter row has its own: nothing is attached to it."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "button", "Upload résumé"), "name": "Résumé", "value": str(RESUME)}])
        self.assertFalse(f.get("tr_cover"), reply)
        self.assertFalse(self.line(reply, "Résumé").startswith("ok") and f.get("tr_resume") != RESUME.name, reply)

    def test_T8_a_shown_option_containing_the_answer_is_not_it(self):
        """A locked dropdown showing "Female", answer "Male": not ok, still Female."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "combobox", "Gender on file"), "name": "Gender on file", "value": "Male"}])
        self.assertEqual(f.get("tr_lock"), "Female", reply)
        self.assertFalse(self.line(reply, "Gender on file").startswith("ok"), reply)

    def test_T9_a_multi_select_missing_an_answer_is_not_ok(self):
        """A native multi-select given one option it has and one it hasn't."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "listbox", "Languages you speak"), "name": "Languages", "value": ["English", "Klingon"]}])
        self.assertEqual(f.get("tr_langs"), ["English"], reply)
        self.assertFalse(self.line(reply, "Languages").startswith("ok"), reply)

    def test_T10_a_date_box_cleared_on_leaving_is_not_ok(self):
        """The page clears a date before the first allowed one when the box is left."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "textbox", "Earliest start date"), "name": "Earliest start date", "value": "2026-11-20"}])
        self.assertFalse(f.get("tr_start"), reply)
        self.assertFalse(self.line(reply, "Earliest start date").startswith("ok"), reply)

    def test_T11_an_error_the_field_shows_after_the_input_is_not_ok(self):
        """The box shows "Enter a 10-digit mobile number." under itself once left holding 5 digits: at most unsure."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "textbox", "Mobile number"), "name": "Mobile number", "value": "12345"}])
        self.assertFalse(self.line(reply, "Mobile number").startswith("ok"), reply)
        self.assertIn("10-digit", reply)

    def test_T12_choices_offered_and_none_taken_is_not_ok(self):
        """A plain box whose typing shows suggestions, none exactly the answer; the box keeps the typed text but only
        a picked suggestion counts."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "textbox", "Location"), "name": "Location", "value": "Chennai"}])
        self.assertFalse(f.get("tr_loc"), reply)
        self.assertFalse(self.line(reply, "Location").startswith("ok"), reply)

    def test_T13_an_upload_button_never_takes_a_visible_file_input(self):
        """The portfolio button's input is elsewhere; the next row is a plain file input of its own: nothing is
        attached to it."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "button", "Upload portfolio"), "name": "Portfolio", "value": str(RESUME)}])
        self.assertFalse(f.get("tr_sample"), reply)
        self.assertFalse(self.line(reply, "Portfolio").startswith("ok") and f.get("tr_portfolio") != RESUME.name, reply)

    def test_T14_a_disabled_option_or_box_is_not_clicked(self):
        """"Monday" is a disabled option and the newsletter box is disabled; both still take a click if one is
        forced. Neither changes, neither is ok."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "combobox", "Interview day"), "name": "Interview day", "value": "Monday"},
                                        {"target": ref(s, "checkbox", "Subscribe to the newsletter"), "name": "Newsletter", "value": True}])
        self.assertFalse(f.get("tr_day"), reply)
        self.assertFalse(f.get("tr_news"), reply)
        self.assertFalse(self.line(reply, "Interview day").startswith("ok"), reply)
        self.assertFalse(self.line(reply, "Newsletter").startswith("ok"), reply)

    def test_T15_an_error_that_comes_later_is_not_ok(self):
        """The email box is checked by the server after it is left; the error shows while the next field is filled."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "textbox", "Email"), "name": "Email", "value": "taken@example.com"},
                                        {"target": ref(s, "textbox", "Referral code"), "name": "Referral code", "value": "ABC123"}])
        self.assertFalse(self.line(reply, "Email").startswith("ok"), reply)
        self.assertIn("already registered", reply)

    def test_T16_an_option_text_shown_twice_is_not_picked(self):
        """"Hyderabad" under two headings; "Other" under two option groups of a native select: no pick, not ok."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "combobox", "City of the office"), "name": "City of the office", "value": "Hyderabad"},
                                        {"target": ref(s, "combobox", "Department"), "name": "Department", "value": "Other"}])
        self.assertFalse(f.get("tr_where"), reply)
        self.assertFalse(f.get("tr_dept"), reply)
        self.assertFalse(self.line(reply, "City of the office").startswith("ok"), reply)
        self.assertFalse(self.line(reply, "Department").startswith("ok"), reply)

    def test_T17_a_group_showing_an_error_after_the_choice_is_not_ok(self):
        """Choosing "No" makes the question's own group say it rules the applicant out: at most unsure."""
        f, reply = self.trap(lambda s: [{"target": ref(s, "group", "Can you work from the Chennai office"), "name": "Office", "value": "No"}])
        self.assertEqual(f.get("tr_office"), "No", reply)
        self.assertFalse(self.line(reply, "Office").startswith("ok"), reply)


if __name__ == "__main__":
    unittest.main()
