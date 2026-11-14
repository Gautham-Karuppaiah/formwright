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

const formwrightTools = {
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

for (const name of (process.env.FORMWRIGHT_MCP_TOOLS || '').split(',').filter(Boolean)) {
  if (!formwrightTools[name])
    throw new Error(`no formwright tool "${name}"; known: ${Object.keys(formwrightTools).join(', ')}`);
  tools.browserTools.push(formwrightTools[name]);
}
libCli.decorateProgram(program);
program.parse(['node', 'cli', 'mcp', ...process.argv.slice(3)]);
