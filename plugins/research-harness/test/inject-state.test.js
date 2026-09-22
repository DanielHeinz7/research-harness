'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const script = path.join(pluginRoot, 'hooks', 'inject-state.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake');

function makeProject(withCanvas = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  if (withCanvas) {
    fs.mkdirSync(path.join(root, 'research'));
    for (const f of ['canvas.md', 'decisions.md']) {
      fs.copyFileSync(path.join(fixtureDir, 'research', f), path.join(root, 'research', f));
    }
  }
  return root;
}

function run(projectRoot, stateDir, data = {}) {
  // Claude Code sets CLAUDE_PROJECT_DIR; an inherited value would point every
  // fixture at the real project, so it is stripped here.
  const { CLAUDE_PROJECT_DIR: _ignored, ...ambient } = process.env;
  const out = childProcess.spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...ambient, RESEARCH_HARNESS_STATE_DIR: stateDir, CLAUDE_PLUGIN_ROOT: pluginRoot },
    input: JSON.stringify({ cwd: projectRoot, session_id: 'sess-1', hook_event_name: 'SessionStart', ...data }),
    encoding: 'utf8',
  });
  return out;
}

test('without a canvas the hook prints nothing and exits 0', () => {
  const root = makeProject(false);
  const out = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
});

test('with a canvas the hook injects a summary under 4 KiB naming empties, open elements and unseen decisions', () => {
  const root = makeProject();
  const out = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(out.status, 0, out.stderr);
  const json = JSON.parse(out.stdout);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  const text = json.hookSpecificOutput.additionalContext;
  assert.ok(Buffer.byteLength(text, 'utf8') <= 4096);
  assert.match(text, /voice-uptake/);
  assert.match(text, /profile is-qualitative/);
  assert.match(text, /mode seed/);
  // Element 1 has a committed statement plus one proposal; element 2 holds
  // only a proposal. The two cases must not read as the same phrase twice.
  assert.match(text, /Elements: 1 stated \(\+1 proposal\) · 2 open \(1 proposal\) · 3 stated · 4 empty · 5 stated/);
  assert.doesNotMatch(text, /open \(\+1 open\)/);
  assert.match(text, /Empty: 4, 6, 7, 8, 9/);
  assert.match(text, /Open \(proposals only\): 2/);
  assert.match(text, /Decisions not yet seen: #1 CONSTRAINT 5 Research Setting; #2 DISCOVERY 1 Puzzle; #3 DECISION 1\.1 accepted/);
  assert.match(text, /Stale acceptances: #3 · Ledger: unverifiable \(3 entries predate the seal\)/);
  assert.match(text, /never write \[accepted\]/i);
  assert.match(text, /\/research-harness:accept/);
});

test('a second session start with the same session id does not repeat decisions already injected', () => {
  const root = makeProject();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  run(root, stateDir);
  const again = JSON.parse(run(root, stateDir).stdout).hookSpecificOutput.additionalContext;
  assert.match(again, /Decisions not yet seen: none/);
  const other = JSON.parse(run(root, stateDir, { session_id: 'sess-2' }).stdout).hookSpecificOutput.additionalContext;
  assert.match(other, /Decisions not yet seen: #1/);
});

test('the summary names a broken ledger and an unverifiable-here one', () => {
  const root = makeProject();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const file = path.join(root, 'research', 'decisions.md');
  fs.appendFileSync(file, '\n## [#4] 2026-09-18 · DISCOVERY · 1 Puzzle · seal 0123456789abcdef\nx [tentative]\n');
  const noKey = JSON.parse(run(root, stateDir).stdout).hookSpecificOutput.additionalContext;
  assert.match(noKey, /Ledger: unverifiable here \(no key on this machine\)/);
  fs.appendFileSync(file, '\n## [#5] 2026-09-18 · DISCOVERY · 1 Puzzle\nunsealed [tentative]\n');
  const broken = JSON.parse(run(root, stateDir).stdout).hookSpecificOutput.additionalContext;
  assert.match(broken, /Ledger: BROKEN at #5 \(unsealed\) — run research-harness review/);
});

test('a malformed canvas or a missing profile does not stop the prompt', () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), '---\nproject: broken\n');
  const broken = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(broken.status, 0);
  assert.equal(broken.stdout, '');
  const root2 = makeProject();
  const text = fs.readFileSync(path.join(root2, 'research', 'canvas.md'), 'utf8').replace('profile: is-qualitative', 'profile: nope');
  fs.writeFileSync(path.join(root2, 'research', 'canvas.md'), text);
  const noProfile = run(root2, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(noProfile.status, 0);
  assert.match(JSON.parse(noProfile.stdout).hookSpecificOutput.additionalContext, /profile nope \(not found; dependencies not checked\)/);
});

test('over-budget text is truncated with a watermark', () => {
  const output = require('../hooks/lib/output');
  const long = 'x'.repeat(5000);
  const projected = output.projectedText('SessionStart', long);
  assert.ok(Buffer.byteLength(projected, 'utf8') <= 4096);
  assert.match(projected, /\[research-harness: truncated to 4096 bytes; run `research-harness status` for the full summary\]$/);
});
