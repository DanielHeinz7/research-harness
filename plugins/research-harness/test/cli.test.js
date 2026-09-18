'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');

function makeProject(withState = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  if (withState) {
    fs.mkdirSync(path.join(root, 'research'));
    fs.copyFileSync(path.join(fixtureDir, 'canvas.md'), path.join(root, 'research', 'canvas.md'));
    fs.copyFileSync(path.join(fixtureDir, 'decisions.md'), path.join(root, 'research', 'decisions.md'));
  }
  return root;
}

function run(root, args) {
  // Claude Code sets CLAUDE_PROJECT_DIR; an inherited value would point every
  // fixture at the real project, so it is stripped here. RESEARCH_HARNESS_DIR
  // would move research/ somewhere else for the same reason.
  const { CLAUDE_PROJECT_DIR: _project, RESEARCH_HARNESS_DIR: _dir, ...ambient } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: {
      ...ambient,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      RESEARCH_HARNESS_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')),
    },
    encoding: 'utf8',
  });
}

test('init creates canvas.md from the template and an empty decision log; refuses to overwrite', () => {
  const root = makeProject(false);
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed', '--outlet', 'Organization Science']);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const text = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  const parsed = canvas.parseCanvas(text);
  assert.equal(parsed.frontmatter.project, 'voice-uptake');
  assert.equal(parsed.frontmatter.mode, 'seed');
  assert.equal(parsed.frontmatter.outlet, 'Organization Science');
  assert.equal(parsed.frontmatter.profile, 'is-qualitative');
  assert.match(parsed.frontmatter.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(parsed.elements.length, 9);
  assert.equal(canvas.allStatements(parsed).length, 0);
  assert.equal(fs.readFileSync(path.join(root, 'research', 'decisions.md'), 'utf8'), decisions.header('voice-uptake'));
  const again = run(root, ['init', '--project', 'x', '--mode', 'seed']);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /already exists/);
  const bad = run(makeProject(false), ['init', '--project', 'x', '--mode', 'whatever']);
  assert.equal(bad.status, 2);
});

test('status prints the same summary the session hook injects', () => {
  const root = makeProject();
  const out = run(root, ['status']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /paper project "voice-uptake"/);
  assert.match(out.stdout, /Empty: 4, 6, 7, 8, 9/);
  const none = run(makeProject(false), ['status']);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /no research\/canvas\.md/);
});

test('review prints the mechanical report as markdown', () => {
  const root = makeProject();
  const out = run(root, ['review']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /## Empty elements\n4, 6, 7, 8, 9/);
  assert.match(out.stdout, /## Open elements \(proposals only\)\n2/);
  assert.match(out.stdout, /## Untagged statements/);
  assert.match(out.stdout, /1\.2 \[stated\]/);
  assert.match(out.stdout, /## Stale acceptances\n#3/);
  assert.match(out.stdout, /## Unlogged acceptances\n1\.1/);
});

test('accept promotes the single candidate, keeps tags, logs a DECISION with the text hash', () => {
  const root = makeProject();
  // 3.1 depends on 1 (is-qualitative). Element 1 is stated, not accepted → refused first.
  const refused = run(root, ['accept', '3.1']);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /element 1 is stated/);
  // Accept the remaining committed statement in 1.2 so element 1 becomes accepted.
  const one = run(root, ['accept', '1.2', '--match', 'Speaking frequency', '--why', 'the gap is uptake, not voice']);
  assert.equal(one.status, 0, one.stdout);
  let text = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  assert.match(text, /whether a proposal is taken up is not\. \[accepted\]/);
  assert.match(text, /chairing style rather than of the proposal\. \[proposed\]/, 'the proposal stays a proposal');
  let log = decisions.parseDecisions(fs.readFileSync(path.join(root, 'research', 'decisions.md'), 'utf8'));
  assert.equal(log.maxSeq, 4);
  assert.equal(log.entries[3].ref, '1.2 accepted');
  assert.equal(log.entries[3].hash, textHash('Speaking frequency is well documented; whether a proposal is taken up is not.'));
  // Now 3.1 is acceptable; its src: tag survives.
  const three = run(root, ['accept', '3.1']);
  assert.equal(three.status, 0, three.stdout);
  text = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  assert.match(text, /get taken up\? \[accepted, src: memo-03\]/);
  log = decisions.parseDecisions(fs.readFileSync(path.join(root, 'research', 'decisions.md'), 'utf8'));
  assert.equal(log.maxSeq, 5);
});

test('accept refuses ambiguity, unknown questions, and already-accepted statements', () => {
  const root = makeProject();
  const ambiguous = run(root, ['accept', '1.2']);
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stdout, /--match/);
  const unknown = run(root, ['accept', '7.9']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stdout, /no question 7\.9/);
  const done = run(root, ['accept', '1.1']);
  assert.equal(done.status, 1);
  assert.match(done.stdout, /nothing to accept/);
});

test('nothing is written to stderr, so a skill can embed the output through a `!` line', () => {
  const root = makeProject();
  for (const args of [['status'], ['review'], ['accept', '1.2'], ['accept'], []]) {
    const out = run(root, args);
    assert.equal(out.stderr, '', `${args.join(' ') || '<no command>'} wrote to stderr`);
    assert.ok(out.stdout.length > 0, `${args.join(' ') || '<no command>'} printed nothing`);
  }
});
