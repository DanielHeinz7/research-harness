'use strict';

// Setting up the second clone (spec §7): the key holder exports the project key
// to a file, the second person joins with it — and neither `init` nor a write
// ever creates a new key on a log that is already sealed elsewhere.

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const seal = require('../hooks/lib/seal');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(root, 'research'));
  fs.copyFileSync(path.join(fixtureDir, 'canvas.md'), path.join(root, 'research', 'canvas.md'));
  fs.copyFileSync(path.join(fixtureDir, 'decisions.md'), path.join(root, 'research', 'decisions.md'));
  return root;
}

// One harness state directory per fixture project, so the key `init` creates
// is the key the CLI reads — as on a real machine.
const stateDirs = new Map();
function stateDirOf(root) {
  if (!stateDirs.has(root)) stateDirs.set(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  return stateDirs.get(root);
}

// The state directory of "the second machine": a plain clone brings no key and
// no name with it, so each one is a fresh empty directory.
function freshState() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
}

function run(root, args, env = {}) {
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

// The project with a key on this machine and a name set: what the key holder
// has before the second person starts.
function keyed() {
  const root = makeProject();
  fs.writeFileSync(path.join(stateDirOf(root), 'name'), 'A. Researcher\n');
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(out.status, 0, out.stdout);
  return root;
}

// The same project after its first sealed entry: this is the log a second
// clone receives, and the one whose missing key on that machine is the trap
// init must not close with a fresh key.
function sealedProject() {
  const root = keyed();
  const out = run(root, ['log', 'DISCOVERY', '7', '--body', 'The first finding, sealed on this machine.']);
  assert.equal(out.status, 0, out.stdout);
  return root;
}

// The key holder's one step, taken: the project key in a file of their own.
function keyedWithExport() {
  const root = sealedProject();
  const exported = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-k-')), 'voice.seal.key');
  const out = run(root, ['key', 'export', '--out', exported]);
  assert.equal(out.status, 0, out.stdout);
  return { root, exported };
}

// The second clone: the same paper tree under a new path, so its state
// directory — and the key in it — are its own (`projectStateDir` hashes the
// path).
function duplicateProject(root) {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-clone-'));
  fs.cpSync(path.join(root, 'research'), path.join(clone, 'research'), { recursive: true });
  return clone;
}

// Where a project's key lies inside a state directory, derived the way the
// library derives it: the digest directory is the parent `keyPath` names.
function keyFileIn(state, root) {
  return path.join(state, path.basename(path.dirname(seal.keyPath(root))), 'seal.key');
}

test('key export writes the key to a .seal.key file, mode 600, and never prints it', () => {
  const root = keyed();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-k-')), 'voice.seal.key');
  const r = run(root, ['key', 'export', '--out', out]);
  assert.equal(r.status, 0, r.stdout);
  const key = fs.readFileSync(out, 'utf8').trim();
  // Asserted without ever putting the key into an assertion message: a failing
  // test must not print it either.
  assert.equal(key.length, 64);
  assert.equal(/^[0-9a-f]{64}$/.test(key), true);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.equal(r.stdout.includes(key), false, 'the key never reaches stdout');
  assert.match(r.stdout, /not as plain-text mail, not into the repository/);
  const again = run(root, ['key', 'export', '--out', out]);
  assert.equal(again.status, 1, 'an existing file is not overwritten');
  assert.match(again.stdout, /already exists/);
  assert.equal(fs.readFileSync(out, 'utf8').trim() === key, true, 'the file it refused to overwrite is unchanged');
  assert.equal(run(root, ['key', 'export', '--out', out.replace('.seal.key', '.txt')]).status, 2);
  assert.equal(run(root, ['key', 'export']).status, 2);
});

test('join with the matching key copies it, sets the name, says the file can go, runs doctor', () => {
  const { root, exported } = keyedWithExport();
  const clone = duplicateProject(root);
  const state = freshState();
  const r = run(clone, ['join', '--key-file', exported, '--name', 'B. Supervisor'], { RESEARCH_HARNESS_STATE_DIR: state });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /can delete .*voice\.seal\.key now/);
  assert.match(r.stdout, /research-harness doctor/);
  assert.equal(fs.existsSync(exported), true, 'join never deletes the key file');
  const keyFile = keyFileIn(state, clone);
  assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(keyFile, 'utf8').trim() === fs.readFileSync(exported, 'utf8').trim(), true, 'the clone reads the exported key');
  assert.equal(fs.readFileSync(path.join(state, 'name'), 'utf8').trim(), 'B. Supervisor');
  // With key and name in place the clone writes: the entry seals onto the key
  // holder's chain, which is what the join was for.
  const written = run(clone, ['log', 'DISCOVERY', '7', '--body', 'From the second clone.'], { RESEARCH_HARNESS_STATE_DIR: state });
  assert.equal(written.status, 0, written.stdout);
  assert.match(fs.readFileSync(path.join(clone, 'research', 'decisions.md'), 'utf8'), /From the second clone\./);
});

test('join refuses a wrong key and a malformed file, and copies nothing', () => {
  const { root } = keyedWithExport();
  const clone = duplicateProject(root);
  const state = freshState();
  const wrong = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-k-')), 'w.seal.key');
  fs.writeFileSync(wrong, 'ab'.repeat(32));
  const r = run(clone, ['join', '--key-file', wrong, '--name', 'B'], { RESEARCH_HARNESS_STATE_DIR: state });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /does not verify/);
  fs.writeFileSync(wrong, 'nothex');
  assert.equal(run(clone, ['join', '--key-file', wrong, '--name', 'B'], { RESEARCH_HARNESS_STATE_DIR: state }).status, 1);
  assert.deepEqual(fs.readdirSync(state).filter((n) => n !== 'name'), [], 'no key directory was created');
});

test('join refuses when a different key is already here, and is a no-op with the same key', () => {
  const { root, exported } = keyedWithExport();
  const clone = duplicateProject(root);
  const state = freshState();
  // The trap this command exists to close: someone ran init in the clone and a
  // key of its own is already here. The right key must not replace it quietly.
  const keyFile = keyFileIn(state, clone);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyFile, 'cd'.repeat(32), { mode: 0o600 });
  const refused = run(clone, ['join', '--key-file', exported, '--name', 'B'], { RESEARCH_HARNESS_STATE_DIR: state });
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stdout, /A different key is already at/);
  assert.match(refused.stdout, /nothing was copied/);
  assert.equal(fs.readFileSync(keyFile, 'utf8') === 'cd'.repeat(32), true, 'the key that was here is kept');
  // The same key again is a no-op success, not a refusal.
  fs.writeFileSync(keyFile, fs.readFileSync(exported, 'utf8').trim(), { mode: 0o600 });
  const again = run(clone, ['join', '--key-file', exported, '--name', 'B'], { RESEARCH_HARNESS_STATE_DIR: state });
  assert.equal(again.status, 0, again.stdout);
  assert.match(again.stdout, /same key was already here/);
  assert.equal(fs.readFileSync(keyFile, 'utf8').trim() === fs.readFileSync(exported, 'utf8').trim(), true, 'the key is untouched');
});

test('init on a sealed log without a key refuses and points to join', () => {
  const { root } = keyedWithExport();
  const clone = duplicateProject(root);
  const r = run(clone, ['init', '--project', 'voice-uptake', '--mode', 'seed'], { RESEARCH_HARNESS_STATE_DIR: freshState() });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /sealed on another machine/);
  assert.match(r.stdout, /research-harness join --key-file/);
});

test('a write without a key on a sealed log points to join, not to init', () => {
  const { root } = keyedWithExport();
  const clone = duplicateProject(root);
  const r = run(clone, ['log', 'DISCOVERY', '7', '--body', 'x'], { RESEARCH_HARNESS_STATE_DIR: freshState() });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /research-harness join/);
  assert.doesNotMatch(r.stdout, /research-harness init/);
});

test('doctor notes a missing remote and pull.rebase=true, and fails when the key does not verify the log', () => {
  const root = sealedProject();
  childProcess.spawnSync('git', ['init', '-q'], { cwd: root });
  childProcess.spawnSync('git', ['config', 'pull.rebase', 'true'], { cwd: root });
  const out = run(root, ['doctor']);
  assert.match(out.stdout, /^- note: no git remote; a second clone needs one$/m);
  assert.match(out.stdout, /^- note: pull\.rebase is true here, so merge-log would refuse after a pull; run git config pull\.rebase false$/m);
  // A key that does not verify the log: every write here would seal a chain the
  // other clone reports broken, so doctor fails and points at join.
  fs.writeFileSync(keyFileIn(stateDirOf(root), root), 'ef'.repeat(32), { mode: 0o600 });
  const bad = run(root, ['doctor']);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /does not verify/);
  assert.match(bad.stdout, /research-harness join/);
});
