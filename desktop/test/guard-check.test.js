'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGuardCheck } = require('../agent/sdk/guard-check');

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'research-harness');
const COMMANDS = [{ name: 'research-harness:canvas' }, { name: 'help' }];
const recorded = fs.readFileSync(path.join(__dirname, 'fixtures', 'sdk-messages', 'guard.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const run = (msgs, opts = {}) => { const feed = createGuardCheck({ pluginRoot: PLUGIN, commands: COMMANDS, ...opts }); let d = null; for (const m of msgs) d = feed(m) || d; return d; };

test('the recorded start shows the guard on, with the plugin version', () => {
  const d = run(recorded);
  assert.equal(d.state, 'on');
  assert.match(d.version, /^\d+\.\d+\.\d+$/);
});

test('the decision is made before the first message goes out', () => {
  const d = run(recorded.slice(0, 2));
  assert.equal(d.state, 'on');
  assert.match(d.version, /^\d+\.\d+\.\d+$/);
});

test('a start hook that succeeded without our commands: off', () => {
  assert.deepEqual(run(recorded, { commands: [{ name: 'help' }] }), { state: 'off', cause: 'The research-harness plugin did not load.' });
});

test('no SessionStart hook result (hooks turned off): off', () => {
  const d = run(recorded.filter((m) => !(m.subtype === 'hook_response' && m.hook_event === 'SessionStart')));
  assert.equal(d.state, 'off');
  assert.match(d.cause, /start hook did not run/);
});

test('a failed SessionStart hook: off', () => {
  const d = run(recorded.map((m) => (m.subtype === 'hook_response' && m.hook_event === 'SessionStart' ? { ...m, outcome: 'error' } : m)));
  assert.equal(d.state, 'off');
  assert.match(d.cause, /start hook did not run/);
});

test('an init that arrives without the plugin: off', () => {
  const d = run(recorded.map((m) => (m.subtype === 'init' ? { ...m, plugins: [] } : m)));
  assert.deepEqual(d, { state: 'off', cause: 'The research-harness plugin did not load.' });
});

test('a SessionStart hook from another plugin: off', () => {
  const d = run(recorded.map((m) => (m.subtype === 'hook_response' && m.hook_event === 'SessionStart'
    ? { ...m, output: JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'something else' } }) }
    : m)));
  assert.equal(d.state, 'off');
  assert.match(d.cause, /start hook did not run/);
});
