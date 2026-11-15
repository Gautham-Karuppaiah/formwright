"""formwright's browser server: Microsoft's Playwright MCP, unchanged, plus formwright's own tools in the same tool list.

Patchright ships Playwright MCP inside its driver (`patchright mcp`). server.js loads that same code, adds the
tools named in FORMWRIGHT_MCP_TOOLS (none = the plain server, on Patchright's driver), and starts it with the usual
Playwright MCP options. formwright's tools run in the same process, so they can use the snapshot's element refs.

Playwright and Playwright MCP are Apache-2.0 (Microsoft); Patchright is Apache-2.0 (patches by Vinyzu).
"""
import importlib
import os
from pathlib import Path

SERVER = Path(__file__).parent / "server.js"


def command(*args, driver=None):
    """The argv that starts the server, with Playwright MCP options (`--headless`, `--isolated`, ...).
    driver "playwright" (or FORMWRIGHT_PW_DRIVER=playwright): plain Playwright's driver, to tell Patchright's
    differences apart."""
    d = Path(importlib.import_module(driver or os.environ.get("FORMWRIGHT_PW_DRIVER", "patchright")).__file__).parent
    node = d / "driver" / ("node.exe" if os.name == "nt" else "node")
    return [str(node), str(SERVER), str(d / "driver" / "package"), *args]
