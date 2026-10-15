'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The isolation of test/app-git.test.js and test/app-cli.test.js: no global
// git identity (Review Focus 1: update and send must work without one), the
// sealing key and the name under a temporary state directory, and file://
// links allowed so a bare remote on disk can be cloned.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.RESEARCH_HARNESS_DIR;
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
process.env.RESEARCH_HARNESS_STATE_DIR = stateDir;
process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';

const appGit = require('../hooks/lib/app-git');
const { runCli } = require('../hooks/lib/app-cli');
const { routes } = require('../hooks/lib/app-api');

const roots = [stateDir];
function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-api-'));
  roots.push(dir);
  return dir;
}
test.after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function sh(cwd, ...args) {
  return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function context(dataDir, root = null) {
  let current = root;
  return { dataDir, getRoot: () => current, setRoot: (r) => { current = r; } };
}

// A creates the project, logs one shared entry, commits, pushes to a bare
// remote. B clones and joins with A's exported key. With `empty`, A shares
// the log before anything is logged, the usual path for a new project.
async function twoPeopleSharingOneProject({ empty = false } = {}) {
  const parent = tmp();
  const created = await routes.init({ parent, folder: 'shared', mode: 'brainstorming', title: 'Shared' }, context(tmp()));
  assert.equal(created.ok, true, created.error);
  const a = created.current;
  const named = await runCli(a, ['name', 'A. Author']);
  assert.equal(named.ok, true, named.error);
  if (!empty) {
    const shared = await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'Shared finding']);
    assert.equal(shared.ok, true, shared.error);
  }
  sh(a, 'init', '-b', 'main');
  sh(a, 'add', '.');
  // A one-off identity for the first commit only: A keeps no user.email, so
  // A's later sends also run without a git identity.
  sh(a, '-c', 'user.name=A. Author', '-c', 'user.email=a@example.invalid', 'commit', '-m', 'Start the project');
  const remote = path.join(tmp(), 'remote.git');
  sh(path.dirname(remote), 'init', '--bare', '-b', 'main', 'remote.git');
  sh(a, 'remote', 'add', 'origin', remote);
  sh(a, 'push', '-u', 'origin', 'main');
  const keyFile = path.join(tmp(), 'a.seal.key');
  const exported = await runCli(a, ['key', 'export', '--out', keyFile]);
  assert.equal(exported.ok, true, exported.error);
  const cloned = await appGit.clone({ url: `file://${remote}`, parent: tmp(), folder: 'shared' });
  assert.equal(cloned.ok, true, cloned.error);
  const b = cloned.root;
  const joined = await runCli(b, ['join', '--key-file', keyFile, '--name', 'B. Supervisor']);
  assert.equal(joined.ok, true, joined.error);
  // join keeps the key and the name under the state directory: nothing new
  // in B's working copy that would need a .gitignore entry.
  assert.equal(sh(b, 'status', '--porcelain'), '');
  return { a, b, remote };
}

test('open refuses a folder without a canvas and remembers a real project', async () => {
  const ctx = context(tmp());
  assert.equal((await routes.open({ root: tmp() }, ctx)).code, 'not-project');
  const root = tmp();
  await runCli(root, ['init', '--project', 'demo', '--mode', 'brainstorming']);
  const r = await routes.open({ root }, ctx);
  assert.equal(r.ok, true);
  assert.equal(ctx.getRoot(), root);
  assert.deepEqual((await routes.projects({}, ctx)).recent, [root]);
});

test('init creates a project in a new folder and makes it current', async () => {
  const ctx = context(tmp());
  const parent = tmp();
  const r = await routes.init({ parent, folder: 'voice-uptake', mode: 'brainstorming', title: 'Voice uptake' }, ctx);
  assert.equal(r.ok, true, r.error);
  assert.equal(ctx.getRoot(), path.join(parent, 'voice-uptake'));
});

test('update merges two people appending to the decision log at once', async () => {
  // A creates the project, commits, pushes to a bare remote. B clones and
  // joins with A's exported key. Both log a DISCOVERY. A sends; B updates.
  const { a, b } = await twoPeopleSharingOneProject();
  await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'from A']);
  await runCli(b, ['log', 'DISCOVERY', '1.1', '--body', 'from B']);
  assert.equal((await routes.send({}, context(tmp(), a))).ok, true);
  const r = await routes.update({}, context(tmp(), b));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.merged, true);
  assert.equal((await runCli(b, ['status'])).ok, true);
  assert.equal(fs.existsSync(path.join(b, '.git', 'MERGE_HEAD')), false);
});

test('update merges two people who both log after sharing an empty log', async () => {
  const { a, b } = await twoPeopleSharingOneProject({ empty: true });
  assert.equal((await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'from A'])).ok, true);
  assert.equal((await runCli(b, ['log', 'DISCOVERY', '1.1', '--body', 'from B'])).ok, true);
  assert.equal((await routes.send({}, context(tmp(), a))).ok, true);
  const r = await routes.update({}, context(tmp(), b));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.merged, true);
  assert.equal((await runCli(b, ['status'])).ok, true);
  const log = fs.readFileSync(path.join(b, 'research', 'decisions.md'), 'utf8');
  assert.match(log, /from A[\s\S]*from B/);
  assert.equal(fs.existsSync(path.join(b, '.git', 'MERGE_HEAD')), false);
});

test('a conflict outside decisions.md aborts the merge and names the file', async () => {
  const { a, b } = await twoPeopleSharingOneProject();
  fs.appendFileSync(path.join(a, 'research', 'canvas.md'), '\nA edit\n');
  fs.appendFileSync(path.join(b, 'research', 'canvas.md'), '\nB edit\n');
  await routes.send({}, context(tmp(), a));
  const before = fs.readFileSync(path.join(b, 'research', 'canvas.md'), 'utf8');
  const r = await routes.update({}, context(tmp(), b));
  assert.equal(r.code, 'conflict');
  assert.match(r.error, /research\/canvas\.md/);
  assert.equal(fs.readFileSync(path.join(b, 'research', 'canvas.md'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(b, '.git', 'MERGE_HEAD')), false);
});

test('send after a co-author pushed gets updates first, then sends', async () => {
  const { a, b } = await twoPeopleSharingOneProject();
  await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'A first']);
  await routes.send({}, context(tmp(), a));
  await runCli(b, ['log', 'DISCOVERY', '1.1', '--body', 'B second']);
  const r = await routes.send({}, context(tmp(), b));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.updated, true);
});

test('invite, join and session refuse bad paths and texts before running the CLI', async () => {
  const ctx = context(tmp(), tmp());
  assert.equal((await routes.invite({ out: 'relative.seal.key' }, ctx)).code, 'invalid');
  assert.equal((await routes.invite({ out: '/tmp/x.txt' }, ctx)).code, 'invalid');
  assert.equal((await routes.join({ keyFile: 'k', name: 'B' }, ctx)).code, 'invalid');
  assert.equal((await routes.session({ action: 'start', occasion: 'two\nlines' }, ctx)).code, 'invalid');
  assert.equal((await routes.session({ action: 'other' }, ctx)).code, 'invalid');
  assert.equal((await routes.update({}, context(tmp()))).code, 'no-project');
});
