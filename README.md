# Formwright

A form-filling tool for AI browser agents, added to Microsoft's
[Playwright MCP](https://github.com/microsoft/playwright-mcp).

Filling a custom dropdown usually takes an agent several tool calls. `formwright_fill` takes a whole list of fields
in one call. It works out each control's type from the page, fills it, and reads back what the field actually
shows.

| Claude Haiku on 20 practice forms, two runs each | Forms right | Cost | Tool calls |
|---|---|---|---|
| Playwright MCP | 18–19 | $0.42–0.45 | ~660 |
| Playwright MCP + `formwright_fill` | 18–19 | $0.19–0.21 | ~470 |

Same accuracy at about half the cost. Most of the saving comes from long forms with many dropdowns.

Long runs can also continue in fresh agent sessions on the same browser, carrying an action record and searchable
history. On the long-form benchmark this reduced mean model cost by about 60% versus one uninterrupted session.
See [results and reproduction commands](BENCHMARKS.md) for the separate comparisons.

## Use

```bash
pip install -e . && patchright install chromium
claude mcp add browser -- /path/to/.venv/bin/fw mcp --browser chrome
```

On Windows the command is `.venv\Scripts\fw.exe`. `fw mcp` accepts Playwright MCP's usual options.

## Practice forms

`bench/site` has 21 forms built with react-select, MUI, Headless UI, Downshift and react-datepicker. Each one is
graded from what the page itself recorded, and the agent sends each form at the end. Building them needs Node: `cd bench/site && npm ci`.

```bash
fw bench                                                   # agent alone (Haiku by default)
FORMWRIGHT_PLAIN_SERVER=formwright FORMWRIGHT_MCP_TOOLS=formwright_fill fw bench   # agent + formwright_fill
FORMWRIGHT_BROWSER_TESTS=1 python -m unittest discover -s tests                    # no model needed
```

MIT license.
