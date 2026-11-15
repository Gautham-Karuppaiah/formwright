"""Formwright: a form-filling tool for AI browser agents (pwmcp) and the practice forms that measure it (bench)."""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BENCH_PROFILE = ROOT / "bench" / "applicant" / "profile.yaml"     # the made-up user whose answers the forms get
WINDOWS = os.name == "nt"


def exe(name):
    """A program on PATH by its full path: on Windows npx and claude are .cmd/.exe files a bare name doesn't start."""
    return shutil.which(name) or name
