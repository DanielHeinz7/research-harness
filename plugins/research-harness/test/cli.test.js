'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const seal = require('../hooks/lib/seal');
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

// One harness state directory per fixture project, so the key `init` creates
// is the key `accept` and `review` read — as on a real machine.
const stateDirs = new Map();
function stateDirOf(root) {
  if (!stateDirs.has(root)) stateDirs.set(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  return stateDirs.get(root);
}

function run(root, args, env = {}) {
  // Claude Code sets CLAUDE_PROJECT_DIR; an inherited value would point every
  // fixture at the real project, so it is stripped here. RESEARCH_HARNESS_DIR
  // would move research/ somewhere else for the same reason.
  const { CLAUDE_PROJECT_DIR: _project, RESEARCH_HARNESS_DIR: _dir, ...ambient } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: {
      ...ambient,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      RESEARCH_HARNESS_STATE_DIR: stateDirOf(root),
      ...env,
    },
    encoding: 'utf8',
  });
}

function readLog(root) {
  return fs.readFileSync(path.join(root, 'research', 'decisions.md'), 'utf8');
}

// The fixture project as a researcher would have it after upgrading: a legacy
// log and a key on this machine, created by init on the existing project.
function keyedProject() {
  const root = makeProject();
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(out.status, 0, out.stdout);
  return root;
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
  // The sealing key lives outside the repository, mode 0600, and init says so.
  const keyFile = path.join(stateDirOf(root), path.basename(path.dirname(seal.keyPath(root))), 'seal.key');
  assert.ok(fs.existsSync(keyFile), keyFile);
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600);
  assert.match(out.stdout, /Sealing key created/);
  assert.match(out.stdout, /0600/);
  const again = run(root, ['init', '--project', 'x', '--mode', 'seed']);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /already exists/);
  const bad = run(makeProject(false), ['init', '--project', 'x', '--mode', 'whatever']);
  assert.equal(bad.status, 2);
});

test('init on an existing project only creates the missing key, and never replaces one', () => {
  const root = makeProject();
  const canvasBefore = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  const first = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(first.status, 0, first.stdout);
  assert.match(first.stdout, /already exists/);
  assert.match(first.stdout, /Sealing key created/);
  assert.equal(fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8'), canvasBefore);
  assert.equal(readLog(root), fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8'));
  const keyFile = path.join(stateDirOf(root), path.basename(path.dirname(seal.keyPath(root))), 'seal.key');
  const key = fs.readFileSync(keyFile, 'utf8');
  const second = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(second.status, 1);
  assert.match(second.stdout, /already exists; nothing written/);
  assert.equal(fs.readFileSync(keyFile, 'utf8'), key);
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
  assert.match(out.stdout, /## Unlogged acceptances\n[^\n]+\n1\.1/);
  assert.match(out.stdout, /## Decision log\nunverifiable: entries #1, #2, #3 predate the seal/);
  assert.match(out.stdout, /## Unverified decisions\n[^\n]+\n#3 1\.1 accepted — legacy/);
  assert.match(out.stdout, /## Committed but not visible\n[^\n]+\nnone/);
});

test('review names a committed statement that would not render, and says which view hides it', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const accepted = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]";
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(accepted));
  fs.writeFileSync(file, text.replace(accepted, `<!--\n\n${accepted}\n\n-->`));
  const out = run(root, ['review']);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /## Committed but not visible\n[^\n]+\n1\.1 \[accepted\] \(line \d+\): [^\n]+ — inside an HTML comment/);
});

test('review reports a verified, an unverifiable-here and a broken ledger, and names the cover an unlogged acceptance lacks', () => {
  const root = keyedProject();
  const one = run(root, ['accept', '1.2', '--match', 'Speaking frequency']);
  assert.equal(one.status, 0, one.stdout);
  const verified = run(root, ['review']);
  assert.match(verified.stdout, /## Decision log\nverified: 1 sealed entry; entries #1, #2, #3 predate the seal/);
  assert.match(verified.stdout, /## Unlogged acceptances\n[^\n]+\n1\.1 \(line \d+\): [^\n]+\n\n## /, 'the sealed acceptance of 1.2 is covered; only 1.1 remains');

  const elsewhere = run(root, ['review'], { RESEARCH_HARNESS_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')) });
  assert.match(elsewhere.stdout, /## Decision log\nunverifiable here: no sealing key on this machine \(expected at [^\n]+seal\.key\)/);
  assert.match(elsewhere.stdout, /## Unlogged acceptances\n[^\n]+\n1\.1 [^\n]+\n1\.2 \(line \d+\): [^\n]+ — covered only by #4, unverifiable here/);

  fs.writeFileSync(path.join(root, 'research', 'decisions.md'), readLog(root).replace('the phenomenon, not a gap', 'the gap'));
  const broken = run(root, ['review']);
  assert.match(broken.stdout, /## Decision log\nBROKEN at #4 \(line \d+\): its own content or the unsealed block before it changed/);
  assert.match(broken.stdout, /1\.2 \(line \d+\): [^\n]+ — covered only by #4, broken/);
});

test('accept promotes the single candidate, keeps tags, logs a sealed DECISION with the text hash', () => {
  const root = keyedProject();
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
  assert.match(log.entries[3].seal, /^[0-9a-f]{16}$/);
  assert.match(one.stdout, /sealed/);
  // Now 3.1 is acceptable; its src: tag survives.
  const three = run(root, ['accept', '3.1']);
  assert.equal(three.status, 0, three.stdout);
  text = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  assert.match(text, /get taken up\? \[accepted, src: memo-03\]/);
  log = decisions.parseDecisions(fs.readFileSync(path.join(root, 'research', 'decisions.md'), 'utf8'));
  assert.equal(log.maxSeq, 5);
  const key = Buffer.from(fs.readFileSync(path.join(stateDirOf(root), path.basename(path.dirname(seal.keyPath(root))), 'seal.key'), 'utf8'), 'hex');
  assert.equal(seal.verifyChain(readLog(root), key).status, 'verified');
});

test('accept refuses without a key and on a broken ledger, and leaves the canvas untouched', () => {
  const noKey = makeProject();
  const canvasBefore = fs.readFileSync(path.join(noKey.toString(), 'research', 'canvas.md'), 'utf8');
  const refused = run(noKey, ['accept', '1.2', '--match', 'Speaking frequency']);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /no sealing key/i);
  assert.match(refused.stdout, /research-harness init/);
  assert.equal(fs.readFileSync(path.join(noKey, 'research', 'canvas.md'), 'utf8'), canvasBefore, 'nothing is accepted without a log entry');

  const root = keyedProject();
  assert.equal(run(root, ['accept', '1.2', '--match', 'Speaking frequency']).status, 0);
  fs.appendFileSync(path.join(root, 'research', 'decisions.md'), '\n## [#5] 2026-09-18 · DECISION · 3.1 accepted · text deadbeef\nforged [accepted]\n');
  const before = fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8');
  const onBroken = run(root, ['accept', '3.1']);
  assert.equal(onBroken.status, 1);
  assert.match(onBroken.stdout, /broken at #5/);
  assert.equal(fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8'), before);
});

test('log appends a sealed DISCOVERY or CONSTRAINT and refuses a DECISION, a missing key, and a broken ledger', () => {
  const root = keyedProject();
  const out = run(root, ['log', 'DISCOVERY', '2 Audience and Prior Research', '--body', 'Two studies contradict each other on uptake. [tentative, src: ref-11]', '--supersedes', '2']);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /Logged #4 DISCOVERY 2 Audience and Prior Research/);
  const log = decisions.parseDecisions(readLog(root));
  assert.equal(log.entries[3].kind, 'DISCOVERY');
  assert.match(log.entries[3].seal, /^[0-9a-f]{16}$/);
  assert.equal(log.entries[3].body, 'Two studies contradict each other on uptake. [tentative, src: ref-11]\n**Supersedes:** #2');
  const constraint = run(root, ['log', 'CONSTRAINT', '5 Research Setting', '--body', 'No further fieldwork. [stated]', '--why', 'the committee said so']);
  assert.equal(constraint.status, 0, constraint.stdout);
  assert.equal(decisions.parseDecisions(readLog(root)).maxSeq, 5);

  const decision = run(root, ['log', 'DECISION', '1.2 accepted', '--body', 'x [accepted]']);
  assert.equal(decision.status, 2);
  assert.match(decision.stdout, /researcher's act/);
  const badKind = run(root, ['log', 'VERDICT', '1 Puzzle', '--body', 'x']);
  assert.equal(badKind.status, 2);
  const noBody = run(root, ['log', 'DISCOVERY', '1 Puzzle']);
  assert.equal(noBody.status, 2);
  assert.equal(decisions.parseDecisions(readLog(root)).maxSeq, 5, 'refusals append nothing');

  const noKey = makeProject();
  const unkeyed = run(noKey, ['log', 'DISCOVERY', '1 Puzzle', '--body', 'x [tentative]']);
  assert.equal(unkeyed.status, 1);
  assert.match(unkeyed.stdout, /no sealing key/i);

  fs.appendFileSync(path.join(root, 'research', 'decisions.md'), '\n## [#6] 2026-09-18 · DISCOVERY · 1 Puzzle\nunsealed [tentative]\n');
  const onBroken = run(root, ['log', 'DISCOVERY', '1 Puzzle', '--body', 'y [tentative]']);
  assert.equal(onBroken.status, 1);
  assert.match(onBroken.stdout, /broken at #6/);
  assert.equal(decisions.parseDecisions(readLog(root)).maxSeq, 6);
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
  for (const args of [['status'], ['review'], ['accept', '1.2'], ['accept'], ['log'], ['log', 'DISCOVERY', '1 Puzzle', '--body', 'x'], []]) {
    const out = run(root, args);
    assert.equal(out.stderr, '', `${args.join(' ') || '<no command>'} wrote to stderr`);
    assert.ok(out.stdout.length > 0, `${args.join(' ') || '<no command>'} printed nothing`);
  }
});

// readIfExists tells "absent" from "unreadable" (SQ-23); the CLI has to say
// which one it hit. A root user reads a mode-000 file anyway, so the check
// cannot run there.
test('a canvas that exists but cannot be read is reported on one line with the file and the code, not as a stack trace', { skip: process.platform === 'win32' || (process.getuid && process.getuid() === 0) }, () => {
  const root = makeProject();
  // The CLI names the file as the process sees it, under the real cwd, which
  // on macOS is /private/var rather than the /var the tmpdir was handed out as.
  const canvasFile = path.join(fs.realpathSync(root), 'research', 'canvas.md');
  fs.chmodSync(canvasFile, 0o000);
  try {
    for (const args of [['status'], ['review']]) {
      const out = run(root, args);
      assert.equal(out.status, 1, `${args[0]} exit code`);
      assert.equal(out.stderr, '', `${args[0]} wrote to stderr`);
      assert.equal(out.stdout, `Cannot read ${canvasFile} (EACCES). Restore access to the file and run the command again.\n`);
      assert.doesNotMatch(out.stdout, /not a paper project/);
    }
  } finally {
    fs.chmodSync(canvasFile, 0o644);
  }
});
