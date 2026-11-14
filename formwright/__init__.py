"""Formwright: a form-filling tool for AI browser agents (pwmcp) and the practice forms that measure it (bench)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BENCH_PROFILE = ROOT / "bench" / "applicant" / "profile.yaml"     # the made-up user whose answers the forms get
