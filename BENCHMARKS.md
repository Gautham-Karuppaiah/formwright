# Benchmark results

Batch filling and session handoff measure different changes. Their percentages are not additive.

## Batch filling

The README compares plain Playwright MCP with Playwright MCP plus `formwright_fill` on 20 practice forms,
two runs per arm, using Claude Haiku at medium effort. Both scored 18–19 forms correct per run; batch filling
cost $0.19–0.21 versus $0.42–0.45, with about 470 versus 660 tool calls. The current default suite has 21 forms.

## Session handoff

Both arms use `formwright_fill` with Haiku at medium effort. The baseline keeps the entire task in one agent
session. The handoff arm starts a fresh session after a request reaches 80,000 input-context tokens, retaining
the browser through CDP and providing a code-written action record plus searchable prior tool history.

The test is `bigform`: a 13-step synthetic form with 173 field checks plus a submission check, including account creation, experience,
education, technical skills and a sign-in timeout that requires the password created earlier in the run.
Results are from four runs per arm on that same form, graded against the page's recorded answers and final submission.

| Round | Single session | Handoff at 80k | Both pass all checks |
|---|---:|---:|---|
| 1 | $0.1683 | $0.0774 | Yes |
| 2 | $0.2268 | $0.0694 | Yes |
| 3 | $0.1684 | $0.0771 | Yes |
| 4 | $0.1491 | $0.0686 | Yes |
| Mean | $0.1781 | $0.0731 | 4/4 per arm |

The reduction in mean cost is 58.96%, rounded to about 60%. This compares session strategies on the long-form
benchmark, separately from the batch-filling comparison. It does not measure savings against automatic compaction
or establish a savings rate across arbitrary websites. Costs and pass counts are taken from the recorded benchmark results.

To repeat the comparison on Linux with Chrome on PATH, install the project and benchmark dependencies from the
README, then run each command four times. These commands make paid model calls against local test pages:

```bash
FORMWRIGHT_PLAIN_SERVER=formwright FORMWRIGHT_MCP_TOOLS=formwright_fill FORMWRIGHT_PLAIN_EFFORT=medium FORMWRIGHT_PLAIN_SPLIT_K=0 fw bench bigform --model=haiku
FORMWRIGHT_PLAIN_SERVER=formwright FORMWRIGHT_MCP_TOOLS=formwright_fill FORMWRIGHT_PLAIN_EFFORT=medium FORMWRIGHT_PLAIN_SPLIT_K=80 fw bench bigform --model=haiku
```

Costs are the model costs reported for those runs, not a forecast at current provider prices.
