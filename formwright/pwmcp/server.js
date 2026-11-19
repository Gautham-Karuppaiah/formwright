// Playwright MCP, unchanged, from Patchright's bundled Playwright, plus formwright's tools in the same tool list.
// Usage: node server.js <patchright driver package dir> [the same options as `patchright mcp`]
// FORMWRIGHT_MCP_TOOLS: comma-separated names of formwright tools to add; unset = none (the plain server).
const pkg = process.argv[2];
require(pkg + '/lib/bootstrap');
const { libCli, tools } = require(pkg + '/lib/coreBundle');
const { program, z } = require(pkg + '/lib/utilsBundle');

// The same checks as MCP's own defineTabTool: a page exists, and no dialog/file chooser is waiting.
function tabTool(tool) {
  return { ...tool, handle: async (context, params, response) => {
    const tab = await context.ensureTab();
    if (tab.modalStates().length)
      return response.addError(`Error: Tool "${tool.schema.name}" does not handle the modal state.`);
    return tool.handle(tab, params, response);
  } };
}

const { fillTool } = require('./fill');

const formwrightTools = {
  formwright_fill: fillTool(z, tabTool),
  // what an element ref resolves to: for tests of the ref sharing, not offered to models
  formwright_probe: tabTool({
    capability: 'core',
    schema: {
      name: 'formwright_probe', title: 'Probe', description: 'What a target resolves to (tests only).',
      inputSchema: z.object({ target: z.string().describe('Exact target element reference from the page snapshot') }),
      type: 'readOnly',
    },
    handle: async (tab, params, response) => {
      const { locator, resolved, selector } = await tab.targetLocator({ target: params.target });
      response.addTextResult(JSON.stringify({ resolved, selector, value: await locator.inputValue().catch(() => null) }));
    },
  }),
};

// Only what a person can do: look at the page and use the mouse and keys. Tools that run code in the page (whose
// clicks and events no person can make, on elements no person can reach) are not offered.
const PAGE_CODE = new Set(['browser_evaluate', 'browser_run_code_unsafe', 'browser_webmcp_call']);
// FORMWRIGHT_PAGE_CODE=1 keeps them, for tests that read the page back.
if (process.env.FORMWRIGHT_PAGE_CODE !== '1')
  tools.browserTools.splice(0, Infinity, ...tools.browserTools.filter(t => !PAGE_CODE.has(t.schema.name)));
for (const name of (process.env.FORMWRIGHT_MCP_TOOLS || '').split(',').filter(Boolean)) {
  if (!formwrightTools[name])
    throw new Error(`no formwright tool "${name}"; known: ${Object.keys(formwrightTools).join(', ')}`);
  tools.browserTools.push(formwrightTools[name]);
}
// A tool that throws (a timeout's call log prints the page's elements, typed values included) is answered from a
// path that skips secret redaction: blank the secrets, as written and as HTML shows them, before it gets there.
for (const tool of tools.browserTools) {
  const handle = tool.handle;
  tool.handle = async (context, ...rest) => {
    try {
      return await handle(context, ...rest);
    } catch (e) {
      const secrets = Object.entries(context.config?.secrets ?? {}).filter(([, v]) => v);
      if (!secrets.length)
        throw e;
      const esc = v => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let text = e instanceof Error ? e.message : String(e);
      for (const [name, v] of secrets)
        for (const form of new Set([v, esc(v), JSON.stringify(v).slice(1, -1)]))
          text = text.replaceAll(form, `<secret>${name}</secret>`);
      const err = new Error(text);
      err.name = e?.name || 'Error';
      throw err;
    }
  };
}
// FORMWRIGHT_TRACE=1: a Playwright trace (actions, DOM snapshots, screenshots, network) from the first tool call,
// written live so a run that is killed still leaves it
if (process.env.FORMWRIGHT_TRACE === '1') {
  for (const tool of tools.browserTools) {
    const handle = tool.handle;
    tool.handle = async (context, params, response) => {
      if (!context._tracing)
        await context.startTracing().catch(e => process.stderr.write(`trace not started: ${e}\n`));
      return handle(context, params, response);
    };
  }
}
libCli.decorateProgram(program);
program.parse(['node', 'cli', 'mcp', ...process.argv.slice(3)]);
