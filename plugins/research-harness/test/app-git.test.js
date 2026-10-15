'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const appGit = require('../hooks/lib/app-git');

// The clones below have no user.name or user.email: commit and merge succeed
// only through identityArgs (Review Focus 1), so a global identity on the
// machine running the tests must not leak in. The seed sets its own locally.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';

function sh(cwd, ...args) {
  return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });
}
function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-git-'));
}
// A bare remote with one commit, and a clone of it named `name`.
function remoteWithClone(name) {
  const dir = tmp();
  sh(dir, 'init', '--bare', '-b', 'main', 'remote.git');
  sh(dir, 'clone', path.join(dir, 'remote.git'), 'seed');
  const seed = path.join(dir, 'seed');
  sh(seed, 'config', 'user.name', 'Seed');
  sh(seed, 'config', 'user.email', 'seed@example.invalid');
  fs.mkdirSync(path.join(seed, 'research'));
  fs.writeFileSync(path.join(seed, 'research', 'canvas.md'), 'line one\n');
  sh(seed, 'add', '.');
  sh(seed, 'commit', '-m', 'seed');
  sh(seed, 'push', 'origin', 'main');
  sh(dir, 'clone', path.join(dir, 'remote.git'), name);
  return { dir, remote: path.join(dir, 'remote.git'), seed, clone: path.join(dir, name) };
}

test('links: https, ssh and scp form pass; flags and other transports do not', () => {
  delete process.env.RESEARCH_HARNESS_GIT_PROTOCOLS;
  for (const ok of ['https://github.com/a/b.git', 'ssh://git@host/a/b.git', 'git@github.com:a/b.git']) assert.equal(appGit.isLink(ok), true, ok);
  for (const bad of ['--upload-pack=touch /tmp/x', 'ext::sh -c touch% /tmp/x', 'file:///etc', '/tmp/repo', 'https://a b', '']) assert.equal(appGit.isLink(bad), false, bad);
});

test('links whose user or host is an option are refused', () => {
  delete process.env.RESEARCH_HARNESS_GIT_PROTOCOLS;
  for (const bad of ['-oProxyCommand@host:a/b.git', 'git@-oProxyCommand:a/b.git', 'ssh://-oProxyCommand=touch/a.git', 'ssh://git@-oProxyCommand=touch/a.git', 'https://-x/a.git']) {
    assert.equal(appGit.isLink(bad), false, bad);
  }
  assert.equal(appGit.isLink('https://github.com/a-b/c-d.git'), true);
});

test('clone refuses a bad link, a bad folder name and a non-empty target before running git', async () => {
  delete process.env.RESEARCH_HARNESS_GIT_PROTOCOLS;
  const parent = tmp();
  assert.equal((await appGit.clone({ url: 'ext::sh -c x', parent, folder: 'p' })).code, 'invalid');
  assert.equal((await appGit.clone({ url: 'https://h/a.git', parent, folder: '../up' })).code, 'invalid');
  fs.mkdirSync(path.join(parent, 'full'));
  fs.writeFileSync(path.join(parent, 'full', 'x'), '');
  assert.equal((await appGit.clone({ url: 'https://h/a.git', parent, folder: 'full' })).code, 'exists');
  fs.writeFileSync(path.join(parent, 'afile'), '');
  assert.equal((await appGit.clone({ url: 'https://h/a.git', parent, folder: 'afile' })).code, 'exists');
});

test('clone, pull with new commits, commit and push between two clones', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  const b = await appGit.clone({ url: `file://${r.remote}`, parent: r.dir, folder: 'b' });
  assert.equal(b.ok, true, b.error);
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'from a\n');
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'a writes', 'A. Researcher'), { ok: true, committed: true });
  assert.equal(sh(r.clone, 'log', '-1', '--format=%an <%ae>').trim(), 'A. Researcher <noreply@research-harness.invalid>');
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'again', 'A. Researcher'), { ok: true, committed: false });
  assert.deepEqual(await appGit.push(r.clone), { ok: true });
  const pulled = await appGit.pull(b.root, 'B. Supervisor');
  assert.deepEqual(pulled, { ok: true, newCommits: 1 });
});

test('a pull that merges without conflict commits the merge as the named person', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  fs.writeFileSync(path.join(r.seed, 'research', 'other.md'), 'seed\n');
  sh(r.seed, 'add', '.');
  sh(r.seed, 'commit', '-m', 'seed adds a file');
  sh(r.seed, 'push');
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'a\n');
  await appGit.commit(r.clone, ['research'], 'a edit', 'A. Researcher');
  assert.deepEqual(await appGit.pull(r.clone, 'A. Researcher'), { ok: true, newCommits: 2 });
  assert.equal(sh(r.clone, 'log', '-1', '--format=%P').trim().split(' ').length, 2);
  assert.equal(sh(r.clone, 'log', '-1', '--format=%an <%ae>').trim(), 'A. Researcher <noreply@research-harness.invalid>');
});

test('a conflicting pull reports the files and abortMerge restores the copy', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  fs.writeFileSync(path.join(r.seed, 'research', 'canvas.md'), 'seed changed\n');
  sh(r.seed, 'commit', '-am', 'seed edit');
  sh(r.seed, 'push');
  fs.writeFileSync(path.join(r.clone, 'research', 'canvas.md'), 'a changed\n');
  await appGit.commit(r.clone, ['research'], 'a edit', 'A. Researcher');
  const pulled = await appGit.pull(r.clone, 'A. Researcher');
  assert.deepEqual(pulled, { ok: false, code: 'conflict', files: ['research/canvas.md'] });
  assert.deepEqual(await appGit.abortMerge(r.clone), { ok: true });
  assert.equal(fs.readFileSync(path.join(r.clone, 'research', 'canvas.md'), 'utf8'), 'a changed\n');
  assert.equal(fs.existsSync(path.join(r.clone, '.git', 'MERGE_HEAD')), false);
});

test('a pull whose merge stops without a conflict leaves no merge in progress', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  fs.writeFileSync(path.join(r.seed, 'research', 'other.md'), 'seed\n');
  sh(r.seed, 'add', '.');
  sh(r.seed, 'commit', '-m', 'seed adds a file');
  sh(r.seed, 'push');
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'a\n');
  await appGit.commit(r.clone, ['research'], 'a edit', 'A. Researcher');
  const head = sh(r.clone, 'rev-parse', 'HEAD');
  // A hook that refuses every merge commit: git stops after merging the files.
  const hook = path.join(r.clone, '.git', 'hooks', 'pre-merge-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(hook, 0o755);
  const pulled = await appGit.pull(r.clone, 'A. Researcher');
  assert.equal(pulled.ok, false);
  assert.equal(pulled.code, 'git');
  assert.equal(fs.existsSync(path.join(r.clone, '.git', 'MERGE_HEAD')), false);
  assert.equal(sh(r.clone, 'rev-parse', 'HEAD'), head);
  assert.equal(sh(r.clone, 'status', '--porcelain'), '');
});

test('a rejected push says so', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  fs.appendFileSync(path.join(r.seed, 'research', 'canvas.md'), 'seed\n');
  sh(r.seed, 'commit', '-am', 'seed');
  sh(r.seed, 'push');
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'a\n');
  await appGit.commit(r.clone, ['research'], 'a', 'A. Researcher');
  assert.equal((await appGit.push(r.clone)).code, 'rejected');
});

test('a missing git binary is named, not thrown', async () => {
  process.env.RESEARCH_HARNESS_GIT = '/nonexistent/git';
  try {
    const r = await appGit.pull(tmp(), 'x');
    assert.equal(r.code, 'git-missing');
    assert.match(r.error, /\/nonexistent\/git/);
  } finally {
    delete process.env.RESEARCH_HARNESS_GIT;
  }
});

test('a missing project folder or bad arguments resolve with an error, never throw', async () => {
  const gone = path.join(tmp(), 'gone');
  const r = await appGit.pull(gone, 'x');
  assert.equal(r.ok, false);
  assert.notEqual(r.code, 'git-missing');
  const root = tmp();
  assert.equal((await appGit.commit(root, undefined, 'm', 'x')).ok, false);
  assert.equal((await appGit.commit(root, ['a'], undefined, 'x')).ok, false);
});
