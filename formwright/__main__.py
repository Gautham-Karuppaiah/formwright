"""fw: the formwright command line.

  fw mcp [OPTIONS]      the browser server for any MCP client: Playwright MCP + formwright_fill (OPTIONS as for
                        Playwright MCP: --headless, --isolated, --browser chrome ...; FORMWRIGHT_MCP_TOOLS= for none)
  fw bench [...]        an agent fills the practice forms, graded per field (fw bench --help)
"""
import os
import sys


def main(argv):
    if argv and argv[0] == "mcp":
        from . import pwmcp
        os.environ.setdefault("FORMWRIGHT_MCP_TOOLS", "formwright_fill")
        cmd = pwmcp.command(*argv[1:])
        if os.name == "nt":                 # execv on Windows starts a new process and exits: the client loses stdio
            import subprocess
            return subprocess.call(cmd)
        os.execv(cmd[0], cmd)
    if argv and argv[0] == "bench":
        from . import bench
        if "--help" in argv[1:] or "-h" in argv[1:]:
            print(bench.__doc__)
            return 0
        return bench.main(argv[1:])
    print(__doc__)
    return 0 if not argv or argv[0] in ("-h", "--help", "help") else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
