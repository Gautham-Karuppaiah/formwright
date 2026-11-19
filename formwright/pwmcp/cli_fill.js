#!/usr/bin/env node
// formwright_fill for Playwright CLI users: `formwright-fill '<fields JSON>'` (or --file=fields.json) fills the fields
// in the CLI session's current page and prints the same per-field report as the MCP tool.
// The CLI can't load extra commands, but its run-code runs a script inside the browser session itself, where the
// snapshot's element refs resolve. So fill.js and read.js, unchanged, are inlined into one run-code script with a
// small stand-in for the MCP tab they expect. run-code has no require or process; the stand-ins below cover that.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE = `usage: formwright-fill '[{"target": "e14", "name": "First name", "value": "Karthik"}, ...]'
       formwright-fill --file=fields.json`;

function fields(argv) {
  const file = argv.find(a => a.startsWith('--file='));
  const text = file ? fs.readFileSync(file.slice(7), 'utf8') : argv.find(a => !a.startsWith('-'));
  if (!text) throw new Error(USAGE);
  let list;
  try { list = JSON.parse(text); } catch (e) { throw new Error(`fields are not valid JSON (${e.message})\n${USAGE}`); }
  if (!Array.isArray(list) || !list.every(f => f && typeof f.target === 'string' && 'value' in f))
    throw new Error(`fields must be a list of {target, name, value}\n${USAGE}`);
  return list;
}

function script(list) {
  const src = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
  const env = { FORMWRIGHT_FILL_FIELD_MS: process.env.FORMWRIGHT_FILL_FIELD_MS || '' };
  return `async page => {
const process = { env: ${JSON.stringify(env)}, stderr: { write() {} } };
const mods = {};
const load = (name, body) => { const module = { exports: {} }; body(module, n => mods[n.replace('./', '')]); mods[name] = module.exports; };
load('read', (module, require) => {
${src('read.js')}
});
load('fill', (module, require) => {
${src('fill.js')}
});
// the tool definition's schema builder is not needed here: anything called or read on it returns itself
const z = new Proxy(function () {}, { get: () => z, apply: () => z });
const tool = mods.fill.fillTool(z, t => t);
// a dialog or file chooser that opens part way stops the run, as in the MCP
let modal = false;
const onModal = () => { modal = true; };
page.on('dialog', onModal);
page.on('filechooser', onModal);
const tab = {
  page,
  context: { lookupSecret: v => ({ value: v, isSecret: false }) },
  modalStates: () => (modal ? ['modal'] : []),
  async targetLocator({ target }) {
    if (/^(f\\d+)?e\\d+$/.test(target)) {
      const locator = page.locator('aria-ref=' + target);
      if (!(await locator.count().catch(() => 0)))
        throw new Error('Ref ' + target + ' not found in the current page snapshot. Try capturing new snapshot.');
      return { locator };
    }
    const h = await page.$(target);
    if (!h) throw new Error(JSON.stringify(target) + ' does not match any elements.');
    h.dispose().catch(() => {});
    return { locator: page.locator(target) };
  },
};
let out = '';
const response = { addTextResult: t => { out += t; }, addError: t => { out += t; } };
try {
  await tool.handle(tab, { fields: ${JSON.stringify(list)} }, response);
} finally {
  page.off('dialog', onModal);
  page.off('filechooser', onModal);
}
return out;
}`;
}

// the MCP tool's own description, so both kinds of agent are told the same thing
function help() {
  const z = new Proxy(function () {}, { get: () => z, apply: () => z });
  const { description } = require('./fill').fillTool(z, t => t).schema;
  return description.replace('Prefer this over separate click/type/select calls',
                             'Prefer this over separate fill/select/check/click commands') + '\n\n' + USAGE + `
Each field: target = the element ref from the snapshot (the field itself, its label, or a radio/checkbox group);
name = the field's label as the page shows it; value = text for a text box, the option's text for a dropdown or
radio group, true/false for a checkbox, a list for a multi-select or checkbox group (the whole set), a file path
for an upload. Fields run in page order.`;
}

function main() {
  if (process.argv.includes('--help')) { console.log(help()); return 0; }
  let list;
  try { list = fields(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
  // run-code resolves a file name against the workspace root: the folder holding .playwright, here or above
  const dir = path.join(process.cwd(), '.playwright-cli');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `formwright-fill-${process.pid}.js`);
  fs.writeFileSync(file, script(list));
  try {
    const r = spawnSync('playwright-cli', ['run-code', `--filename=${file}`, '--raw'],
                        { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 26 });
    if (r.error) { console.error(String(r.error.message)); return 1; }
    let text = (r.stdout || '').trim();
    try { const v = JSON.parse(text); if (typeof v === 'string') text = v; } catch (e) {}   // a dialog's report isn't JSON
    if (text) console.log(text);
    if (r.stderr && r.stderr.trim()) console.error(r.stderr.trim());
    return r.status ?? 1;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

process.exitCode = main();
