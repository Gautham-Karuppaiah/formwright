"""Continuation records and stop thresholds, using recorded-message shapes without model calls."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from formwright import handoff


class Handoff(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def stream(self, name, messages):
        p = self.root / name
        p.write_text("\n".join(json.dumps(m) for m in messages) + "\n", encoding="utf-8")
        return p

    def test_context_counts_cached_tokens_and_ignores_partial_tail(self):
        p = self.stream("session.jsonl", [
            {"type": "assistant", "message": {"usage": {"input_tokens": 10,
             "cache_creation_input_tokens": 20, "cache_read_input_tokens": 79970}}},
            {"type": "assistant", "message": {"usage": {}}},
        ])
        with p.open("a") as f:
            f.write('{"type":')
        self.assertEqual(handoff.last_request_tokens(p), 80000)

    def test_tool_results_stay_with_their_calls_when_replies_arrive_out_of_order(self):
        p = self.stream("session.jsonl", [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "id": "a", "name": "mcp__pw__browser_type", "input": {"text": "Ada"}},
                {"type": "tool_use", "id": "b", "name": "mcp__pw__browser_click", "input": {"target": "e8"}},
            ]}},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": "b", "content": "clicked"},
                {"type": "tool_result", "tool_use_id": "a", "content": [{"type": "text", "text": "typed"}]},
            ]}},
        ])
        acts, _ = handoff.actions(p)
        self.assertEqual([(a[0], a[2]) for a in acts], [("browser_type", "typed"), ("browser_click", "clicked")])

    def test_next_session_gets_readbacks_last_page_and_searchable_full_history(self):
        p = self.stream("session.jsonl", [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "id": "a", "name": "mcp__pw__formwright_fill",
                 "input": {"fields": [{"name": "Email", "value": "ada@example.com"}]}}]}},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": "a", "content":
                 "### Result\n1 ok\nok Email: now ada@example.com\nPage URL: http://localhost/step2"}]}},
        ])
        earlier = self.root / "earlier.log"
        note = handoff.note([p], earlier)
        self.assertIn("ok Email: now ada@example.com", note)
        self.assertIn("http://localhost/step2", note)
        self.assertIn(str(earlier), note)
        self.assertIn('"value": "ada@example.com"', handoff.log_text([p]))

    def test_hook_stops_at_threshold_and_continues_below_it(self):
        p = self.stream("session.jsonl", [{"type": "assistant", "message": {
            "usage": {"input_tokens": 80000}}}])
        for threshold, stop in [(80000, True), (80001, False)]:
            with self.subTest(threshold=threshold):
                _, env = handoff.hook_settings(p, threshold)
                r = subprocess.run([sys.executable, handoff.__file__], input="{}", text=True,
                                   capture_output=True, env={**os.environ, **env}, check=True)
                self.assertEqual(bool(r.stdout), stop)
                if stop:
                    self.assertFalse(json.loads(r.stdout)["continue"])
