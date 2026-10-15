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

test('git failures become a sentence with the next step; git\'s own line is only a detail', () => {
  const cases = [
    ['fatal: not a git repository (or any of the parent directories): .git', /Share with co-authors/],
    ['fatal: could not read Username for \'https://h\': terminal prompts disabled', /did not accept your login/],
    ['remote: Invalid username or password.\nfatal: Authentication failed for \'https://h/a.git/\'', /did not accept your login/],
    ['git@h: Permission denied (publickey).\nfatal: Could not read from remote repository.', /did not accept your login/],
    ['remote: Repository not found.\nfatal: repository \'https://h/a.git/\' not found', /No repository was found/],
    ['fatal: unable to access \'https://h/\': Could not resolve host: h', /could not reach the shared copy/],
    ['fatal: refusing to merge unrelated histories', /started separately/],
    ['error: Your local changes to the following files would be overwritten by merge:\n\tx', /outside the research folder/],
    ['There is no tracking information for the current branch.', /not connected to a shared copy/],
    ['fatal: No configured push destination.', /not connected to a shared copy/],
    ['error: src refspec main does not match any', /no saved history/],
    ['something git never said before', /Getting updates did not work\./],
  ];
  for (const [stderr, expected] of cases) {
    const text = appGit.explain(stderr, 'Getting updates');
    assert.match(text, expected, stderr);
    assert.doesNotMatch(text, /^fatal|^error|fatal:|research-harness [a-z]/i, `git's text is not the message: ${text}`);
    assert.match(text, /\(Git said: .+\)$/, 'git\'s line follows as a detail');
  }
});

test('a link shows without the password or token in front of its host', () => {
  assert.equal(appGit.displayLink('https://me:secret@github.com/a/b.git'), 'https://github.com/a/b.git');
  assert.equal(appGit.displayLink('https://github.com/a/b.git'), 'https://github.com/a/b.git');
  assert.equal(appGit.displayLink('git@github.com:a/b.git'), 'git@github.com:a/b.git');
  assert.equal(appGit.displayLink(null), null);
});

// SQ-285 F9: every scheme, and everything up to the last @ of the host part.
test('a link shows without its login for every scheme, and a link with a login is not cloned', async () => {
  assert.equal(appGit.displayLink('https://me:p@ss@github.com/a/b.git'), 'https://github.com/a/b.git');
  assert.equal(appGit.displayLink('http://ghp_token@host/a/b.git'), 'http://host/a/b.git');
  assert.equal(appGit.displayLink('ssh://me:secret@host/a/b.git'), 'ssh://host/a/b.git');
  assert.equal(appGit.displayLink('HTTPS://tok@host/a.git'), 'HTTPS://host/a.git');
  assert.equal(appGit.displayLink('https://host/team/@scope/a.git'), 'https://host/team/@scope/a.git', 'an @ in the path is not a login');
  for (const login of ['https://me:secret@github.com/a/b.git', 'https://ghp_token@github.com/a/b.git', 'ssh://me:secret@host/a/b.git']) {
    assert.equal(appGit.hasCredentials(login), true, login);
  }
  for (const plain of ['https://github.com/a/b.git', 'ssh://git@host/a/b.git', 'git@github.com:a/b.git', 'https://host/team/@scope/a.git']) {
    assert.equal(appGit.hasCredentials(plain), false, plain);
  }
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const parent = tmp();
  const r = await appGit.clone({ url: 'https://me:secret@github.com/a/b.git', parent, folder: 'p' });
  assert.equal(r.code, 'invalid');
  assert.match(r.error, /without your password/);
  assert.doesNotMatch(r.error, /secret/);
  assert.deepEqual(fs.readdirSync(parent), []);
});

// SQ-285 F5: a commit holds the research paths, whatever else is staged.
test('commit takes only the named paths, not what the person staged by hand', async () => {
  const r = remoteWithClone('a');
  fs.writeFileSync(path.join(r.clone, 'draft.txt'), 'private draft\n');
  sh(r.clone, 'add', 'draft.txt');
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'more\n');
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'research only', 'A. Researcher'), { ok: true, committed: true });
  assert.equal(sh(r.clone, 'show', '--name-only', '--format=', 'HEAD').trim(), 'research/canvas.md');
  assert.equal(sh(r.clone, 'diff', '--cached', '--name-only').trim(), 'draft.txt', 'the hand-staged file stays staged');
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'nothing new', 'A. Researcher'), { ok: true, committed: false }, 'a staged file outside the paths is no reason to commit');
});

// SQ-285 F6: the project's own repository, never the one around it.
test('originOf and hasUpstream look only at the project\'s own repository', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('outer');
  assert.equal(await appGit.originOf(r.clone), r.remote);
  assert.equal(await appGit.hasUpstream(r.clone), true);
  const inner = path.join(r.clone, 'papers', 'inner');
  fs.mkdirSync(inner, { recursive: true });
  assert.equal(await appGit.originOf(inner), null);
  assert.equal(await appGit.hasUpstream(inner), false);
  sh(r.clone, 'remote', 'add', 'other', r.remote);
  const fresh = tmp();
  sh(fresh, 'init', '-q', '-b', 'main');
  sh(fresh, 'remote', 'add', 'origin', r.remote);
  assert.equal(await appGit.originOf(fresh), r.remote);
  assert.equal(await appGit.hasUpstream(fresh), false, 'an origin without a first push is not tracked');
});

// SQ-285 F4: a network step that hears nothing for the timeout stops with a
// sentence; one that keeps talking, or waits for the person's login, does not.
function stubGit(dir, body) {
  const file = path.join(dir, 'git');
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

test('network steps stop after a silence, not while git talks or the person is asked for a login', { skip: process.platform === 'win32' }, async (t) => {
  const saved = { git: process.env.RESEARCH_HARNESS_GIT, timeout: process.env.RESEARCH_HARNESS_GIT_TIMEOUT_MS, askpass: process.env.GIT_ASKPASS };
  t.after(() => {
    for (const [k, v] of [['RESEARCH_HARNESS_GIT', saved.git], ['RESEARCH_HARNESS_GIT_TIMEOUT_MS', saved.timeout], ['GIT_ASKPASS', saved.askpass]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  process.env.RESEARCH_HARNESS_GIT_TIMEOUT_MS = '400';
  const dir = tmp();

  // A host that never answers: git is silent until it is stopped.
  process.env.RESEARCH_HARNESS_GIT = stubGit(dir, 'sleep 30');
  const started = Date.now();
  const silent = await appGit.remoteIsEmpty('https://host.invalid/a.git');
  assert.equal(silent.code, 'timeout');
  assert.match(silent.error, /did not answer for 0 seconds|did not answer for \d+ seconds/);
  assert.match(silent.error, /try again/);
  assert.ok(Date.now() - started < 10000, 'git and what it started were stopped');
  const cloned = await appGit.clone({ url: 'https://host.invalid/a.git', parent: dir, folder: 'p' });
  assert.equal(cloned.code, 'timeout');

  // A slow transfer that keeps reporting progress runs to the end.
  process.env.RESEARCH_HARNESS_GIT = stubGit(dir, 'for i in 1 2 3 4 5 6 7 8; do echo "Writing objects: $i" >&2; sleep 0.2; done');
  assert.deepEqual(await appGit.remoteIsEmpty('https://host.invalid/a.git'), { ok: true, empty: true });

  // The login dialog: git asks through GIT_ASKPASS and hears nothing while the
  // person types, here for longer than the timeout.
  const helper = path.join(dir, 'askpass');
  fs.writeFileSync(helper, '#!/bin/sh\nsleep 1.2\necho typed-by-the-person\n');
  fs.chmodSync(helper, 0o755);
  process.env.GIT_ASKPASS = helper;
  process.env.RESEARCH_HARNESS_GIT = stubGit(dir, 'answer=$("$GIT_ASKPASS" "Password for https://host.invalid: ")\necho "$answer\trefs/heads/main"');
  const asked = await appGit.remoteIsEmpty('https://host.invalid/a.git');
  assert.deepEqual(asked, { ok: true, empty: false }, 'the answer reached git and the step was not stopped');
});

test('a project becomes a repository with one commit; a link is added, checked and pushed with upstream', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const dir = tmp();
  const project = path.join(dir, 'paper');
  fs.mkdirSync(path.join(project, 'research'), { recursive: true });
  fs.writeFileSync(path.join(project, 'research', 'canvas.md'), 'canvas\n');
  fs.writeFileSync(path.join(project, 'notes.txt'), 'outside the research files\n');
  assert.equal(appGit.hasRepo(project), false);
  assert.deepEqual(await appGit.initRepo(project, ['research'], 'Start the project', 'A. Author'), { ok: true, committed: true });
  assert.equal(appGit.hasRepo(project), true);
  assert.equal(sh(project, 'symbolic-ref', '--short', 'HEAD').trim(), 'main');
  assert.equal(sh(project, 'ls-files').trim(), 'research/canvas.md', 'only the research files are committed');
  assert.equal(await appGit.originOf(project), null);

  sh(dir, 'init', '--bare', '-b', 'main', 'empty.git');
  const empty = `file://${path.join(dir, 'empty.git')}`;
  assert.deepEqual(await appGit.remoteIsEmpty(empty), { ok: true, empty: true });
  assert.deepEqual(await appGit.addOrigin(project, empty), { ok: true });
  assert.equal(await appGit.originOf(project), empty);
  assert.deepEqual(await appGit.push(project, { upstream: true }), { ok: true });
  assert.equal(sh(project, 'rev-parse', '--abbrev-ref', '@{upstream}').trim(), 'origin/main');
  assert.deepEqual(await appGit.remoteIsEmpty(empty), { ok: true, empty: false }, 'after the push the repository holds the project');

  await appGit.removeOrigin(project);
  assert.equal(await appGit.originOf(project), null);
  const missing = await appGit.remoteIsEmpty(`file://${path.join(dir, 'nowhere.git')}`);
  assert.equal(missing.ok, false);
  assert.doesNotMatch(missing.error, /fatal:/);
});
