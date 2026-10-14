# Desktop App Shell and Human Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, tasks run as Sidequest tickets in worktrees, one ticket per task.

**Goal:** A macOS Electron app in which a researcher without a terminal creates or opens a paper project, clones and updates a shared one, sends their changes, invites or joins a co-author, and runs a meeting, with the session view in the centre.

**Architecture:** The plugin's server (`bin/canvas-serve.js`) gains an app mode: app routes under `/api/app/` plus the existing project routes, acting on a current project that can change. App routes run git (bundled by the app) and the plugin's own CLI as child processes, without a shell. A new shell page `dashboard/app.html` embeds `canvas.html`. The Electron app in `desktop/` starts that server in a `utilityProcess` and offers native dialogs through a preload bridge.

**Tech Stack:** Node (no plugin dependencies), node:test, Playwright (through `NODE_PATH` until SQ-231 lands), Electron, dugite (bundled git), electron-builder (unsigned local build).

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-app-shell-design.md` (approved, `990bbed`). Visual direction: `.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md`.

## Global Constraints

- The plugin stays dependency-free; Electron, dugite and electron-builder are dependencies of `desktop/` only.
- npm versions are exact (no `^`), each the newest release older than 14 days (`npm view <pkg> time --json`).
- Server binds `127.0.0.1` only. Every route except `POST /api/session` needs `X-Harness-Token`.
- The write token is never written to disk, a URL, a log, or local storage.
- Git runs with `GIT_ALLOW_PROTOCOL=https:ssh` and `GIT_TERMINAL_PROMPT=0`; clone links are `https://`, `ssh://` or `user@host:path`.
- No shell anywhere: `execFile` with argument arrays only.
- English for code, UI, docs, commits (public repo). Errors in plain words with the next step; never a toast.
- WCAG 2.2 AA, keyboard operation, visible focus in light and dark, reflow, type that grows with the window: the same bar as the session view.
- Never copy the direction contract into source or served files.

## Review Focus

1. A person without a git identity (no `user.name`/`user.email`) gets updates or sends: merge and commit must not fail with "Please tell me who you are". Pinned in Task 2 (`identityArgs`) and Task 4 (send test with an empty global config).
2. Two people append to the decision log at the same time: update must merge the logs so the seal verifies, and leave no merge in progress on any failure. Pinned in Task 4.
3. A conflict outside `decisions.md` (both edited `research/canvas.md`): the merge is aborted, the working copy is as before, the message names the file. Pinned in Task 4.
4. A clone link that is a flag or another transport (`--upload-pack=…`, `ext::sh -c …`, `file:///…`): refused before git runs. Pinned in Task 2.
5. The app is closed while a git call runs, or git is missing in browser mode: no half-written project, a plain message naming the missing program. Pinned in Task 2 (`git-missing`) and Task 5 (`/api/state` with no project).

## File map

| File | Task | Responsibility |
|---|---|---|
| `desktop/package.json`, `desktop/git-path.js`, `desktop/scripts/check-git.js` | 1 | app package; where the bundled git lives; credential check |
| `plugins/research-harness/hooks/lib/app-git.js` | 2 | clone, pull, commit, push, abort, link check |
| `plugins/research-harness/hooks/lib/app-cli.js` | 3 | run the plugin CLI for one project |
| `plugins/research-harness/hooks/lib/app-store.js`, `app-api.js` | 4 | recent projects; the `/api/app/*` route table |
| `plugins/research-harness/bin/canvas-serve.js`, `bin/research-harness.js` | 5 | app mode; `serve --app` |
| `plugins/research-harness/dashboard/canvas.html` | 6 | token from the embedding shell; tab and refresh messages |
| `plugins/research-harness/dashboard/app.html` | 7 | the shell page |
| `desktop/main.js`, `preload.js`, `server.js`, `askpass.sh`, `electron-builder.yml` | 8 | the app |

**Sequencing.** Wave A (Tasks 1–4) touches only new files and can run while SQ-239 rebuilds `canvas.html`. Wave B (Tasks 5–6) edits files SQ-239 owns: start only after SQ-239 is integrated. Task 7 needs 5 and 6, Task 8 needs 1, 5 and 7, Task 9 closes.

Test command for every plugin task, run in `plugins/research-harness`:
`NODE_PATH=~/dh-appdev/dsi-pubs/node_modules node --test --test-timeout=120000 "test/*.test.js"`

---

### Task 1: Bundled git and its credentials

**Files:**
- Create: `desktop/package.json`, `desktop/git-path.js`, `desktop/scripts/check-git.js`, `desktop/test/git-path.test.js`, `desktop/.gitignore`

**Interfaces:**
- Produces: `gitPath(): string` (absolute path of the bundled git binary); `credentialHelper(): string | null` (the helper the bundled git uses, read from `git config --get credential.helper`).

- [ ] **Step 1: Package and ignore file**

```json
{
  "name": "research-harness-desktop",
  "private": true,
  "version": "0.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test test/*.test.js",
    "check-git": "node scripts/check-git.js"
  },
  "dependencies": { "dugite": "<exact version, see Global Constraints>" },
  "devDependencies": { "electron": "<exact version>", "electron-builder": "<exact version>" }
}
```

Fill the three versions with `npm view <pkg> time --json` per Global Constraints, then `npm install` in `desktop/`. `desktop/.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 2: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const { gitPath } = require('../git-path');

test('the bundled git exists and runs', () => {
  const bin = gitPath();
  assert.ok(fs.existsSync(bin), bin);
  const out = childProcess.execFileSync(bin, ['--version'], { encoding: 'utf8' });
  assert.match(out, /^git version \d+\.\d+/);
});
```

- [ ] **Step 3: Run it, expect FAIL** (`Cannot find module '../git-path'`): `cd desktop && node --test test/git-path.test.js`

- [ ] **Step 4: Implement**

```js
'use strict';
// Where the git that ships with the app lives. dugite unpacks a full git
// into its package folder; the app passes this path to the server as
// RESEARCH_HARNESS_GIT so a Mac without developer tools can clone.
const childProcess = require('node:child_process');
const path = require('node:path');

function gitPath() {
  return path.join(path.dirname(require.resolve('dugite/package.json')), 'git', 'bin', 'git');
}

function credentialHelper() {
  try {
    return childProcess.execFileSync(gitPath(), ['config', '--get', 'credential.helper'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

module.exports = { gitPath, credentialHelper };
```

If the test still fails because dugite keeps git elsewhere, find the binary with `find node_modules/dugite -name git -type f -perm +111 | head` and change the path; the test is the oracle.

- [ ] **Step 5: Credential check script**

```js
'use strict';
// Prints what the spec left unverified: whether the bundled git can store
// credentials in the macOS Keychain.
const fs = require('node:fs');
const path = require('node:path');
const { gitPath, credentialHelper } = require('../git-path');

const helper = credentialHelper();
const keychainBin = path.join(path.dirname(gitPath()), '..', 'libexec', 'git-core', 'git-credential-osxkeychain');
console.log(`git: ${gitPath()}`);
console.log(`credential.helper: ${helper || '(none)'}`);
console.log(`git-credential-osxkeychain bundled: ${fs.existsSync(keychainBin) ? keychainBin : 'no'}`);
```

Run `npm run check-git`. Record the three lines in the commit message. If no helper is configured but the osxkeychain binary is bundled, Task 2's `git()` passes `-c credential.helper=osxkeychain`; if the binary is missing, Task 8 points `credential.helper` at the system's `/usr/bin/git-credential-osxkeychain` only when it exists, and otherwise credentials are asked each time (state that in the Task 8 report).

- [ ] **Step 6: Run the test, expect PASS; commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/.gitignore desktop/git-path.js desktop/scripts/check-git.js desktop/test/git-path.test.js
git commit -m "Desktop app package with bundled git and a credential check"
```

---

### Task 2: Git for the human steps

**Files:**
- Create: `plugins/research-harness/hooks/lib/app-git.js`
- Test: `plugins/research-harness/test/app-git.test.js`

**Interfaces:**
- Produces (all resolve, never reject):
  - `isLink(url: string): boolean`
  - `clone({ url, parent, folder }): Promise<{ ok: true, root } | { ok: false, code: 'invalid'|'exists'|'git'|'git-missing', error }>`
  - `pull(root, name?): Promise<{ ok: true, newCommits: number } | { ok: false, code: 'conflict', files: string[] } | { ok: false, code, error }>`
  - `abortMerge(root): Promise<{ ok: true } | { ok: false, code, error }>`
  - `commit(root, paths: string[], message, name?): Promise<{ ok: true, committed: boolean } | { ok: false, code, error }>`
  - `push(root): Promise<{ ok: true } | { ok: false, code: 'rejected'|'git'|'git-missing', error }>`
- Environment: `RESEARCH_HARNESS_GIT` (binary, default `git`), `RESEARCH_HARNESS_GIT_PROTOCOLS` (default `https:ssh`; tests set `https:ssh:file`).

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const appGit = require('../hooks/lib/app-git');

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

test('clone refuses a bad link, a bad folder name and a non-empty target before running git', async () => {
  delete process.env.RESEARCH_HARNESS_GIT_PROTOCOLS;
  const parent = tmp();
  assert.equal((await appGit.clone({ url: 'ext::sh -c x', parent, folder: 'p' })).code, 'invalid');
  assert.equal((await appGit.clone({ url: 'https://h/a.git', parent, folder: '../up' })).code, 'invalid');
  fs.mkdirSync(path.join(parent, 'full'));
  fs.writeFileSync(path.join(parent, 'full', 'x'), '');
  assert.equal((await appGit.clone({ url: 'https://h/a.git', parent, folder: 'full' })).code, 'exists');
});

test('clone, pull with new commits, commit and push between two clones', async () => {
  process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'https:ssh:file';
  const r = remoteWithClone('a');
  const b = await appGit.clone({ url: `file://${r.remote}`, parent: r.dir, folder: 'b' });
  assert.equal(b.ok, true, b.error);
  fs.appendFileSync(path.join(r.clone, 'research', 'canvas.md'), 'from a\n');
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'a writes', 'A. Researcher'), { ok: true, committed: true });
  assert.deepEqual(await appGit.commit(r.clone, ['research'], 'again', 'A. Researcher'), { ok: true, committed: false });
  assert.deepEqual(await appGit.push(r.clone), { ok: true });
  const pulled = await appGit.pull(b.root, 'B. Supervisor');
  assert.deepEqual(pulled, { ok: true, newCommits: 1 });
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
```

The clones in these tests have no `user.name`; the commit and the merge succeed only through `identityArgs` (Review Focus 1). If the machine running the tests has a global git identity, add `GIT_CONFIG_GLOBAL=/dev/null` to the environment of the test run by setting `process.env.GIT_CONFIG_GLOBAL = '/dev/null'` at the top of the file, after `remoteWithClone` has configured the seed locally.

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../hooks/lib/app-git'`): `node --test test/app-git.test.js`

- [ ] **Step 3: Implement**

```js
'use strict';
// Git for the desktop app's human steps: clone, get updates, send. Runs the
// git the app bundles (RESEARCH_HARNESS_GIT) or git from PATH, never through
// a shell, and only over the transports in RESEARCH_HARNESS_GIT_PROTOCOLS
// (https and ssh unless a test widens it). Every function resolves.
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LINK_RE = /^(?:https:\/\/|ssh:\/\/|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:)[^\s]+$/;
const FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const FALLBACK_EMAIL = 'noreply@research-harness.invalid';

function gitBinary() {
  return process.env.RESEARCH_HARNESS_GIT || 'git';
}

function protocols() {
  return process.env.RESEARCH_HARNESS_GIT_PROTOCOLS || 'https:ssh';
}

function git(cwd, args) {
  return new Promise((resolve) => {
    childProcess.execFile(gitBinary(), args, {
      cwd,
      env: { ...process.env, GIT_ALLOW_PROTOCOL: protocols(), GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 4 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') {
        resolve({ ok: false, code: 'git-missing', error: `Git was not found (${gitBinary()}).` });
        return;
      }
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function failed(r, what) {
  return r.code ? r : { ok: false, code: 'git', error: r.stderr.trim() || `${what} failed.` };
}

function isLink(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  if (LINK_RE.test(url)) return true;
  return protocols().split(':').includes('file') && /^file:\/\/\/\S+$/.test(url);
}

// A person who never used git has no identity, and git refuses to commit or
// merge without one. Use the project name the person gave the harness.
async function identityArgs(root, name) {
  const r = await git(root, ['config', 'user.email']);
  if (r.ok && r.stdout.trim()) return [];
  const who = typeof name === 'string' && name.trim() ? name.trim() : 'Research Harness user';
  return ['-c', `user.name=${who}`, '-c', `user.email=${FALLBACK_EMAIL}`];
}

async function clone({ url, parent, folder }) {
  if (!isLink(url)) return { ok: false, code: 'invalid', error: 'Only https:// and ssh links can be cloned.' };
  if (typeof folder !== 'string' || !FOLDER_RE.test(folder)) {
    return { ok: false, code: 'invalid', error: 'The folder name may use letters, digits, dots, hyphens and underscores.' };
  }
  if (typeof parent !== 'string' || !path.isAbsolute(parent) || !fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    return { ok: false, code: 'invalid', error: 'The chosen folder does not exist.' };
  }
  const root = path.join(parent, folder);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    return { ok: false, code: 'exists', error: `${root} already exists and is not empty.` };
  }
  const r = await git(parent, ['clone', '--', url, root]);
  return r.ok ? { ok: true, root } : failed(r, 'Cloning');
}

async function conflictedFiles(root) {
  const r = await git(root, ['diff', '--name-only', '--diff-filter=U']);
  return r.ok ? r.stdout.split('\n').filter(Boolean) : [];
}

async function pull(root, name) {
  const before = await git(root, ['rev-parse', 'HEAD']);
  if (!before.ok) return failed(before, 'Reading the project history');
  const r = await git(root, [...(await identityArgs(root, name)), 'pull', '--no-rebase', '--no-edit']);
  if (r.ok) {
    const count = await git(root, ['rev-list', '--count', `${before.stdout.trim()}..HEAD`]);
    return { ok: true, newCommits: count.ok ? Number(count.stdout.trim()) : 0 };
  }
  if (r.code) return r;
  const files = await conflictedFiles(root);
  return files.length ? { ok: false, code: 'conflict', files } : failed(r, 'Getting updates');
}

async function abortMerge(root) {
  const r = await git(root, ['merge', '--abort']);
  return r.ok ? { ok: true } : failed(r, 'Undoing the merge');
}

async function commit(root, paths, message, name) {
  const add = await git(root, ['add', '--', ...paths]);
  if (!add.ok) return failed(add, 'Staging the changes');
  const staged = await git(root, ['diff', '--cached', '--quiet']);
  const merging = fs.existsSync(path.join(root, '.git', 'MERGE_HEAD'));
  if (staged.ok && !merging) return { ok: true, committed: false };
  const r = await git(root, [...(await identityArgs(root, name)), 'commit', '-m', message]);
  return r.ok ? { ok: true, committed: true } : failed(r, 'Committing');
}

async function push(root) {
  const r = await git(root, ['push']);
  if (r.ok) return { ok: true };
  if (r.code) return r;
  if (/\[rejected\]|non-fast-forward|fetch first/.test(r.stderr)) {
    return { ok: false, code: 'rejected', error: 'The shared copy has changes you do not have yet.' };
  }
  return failed(r, 'Sending');
}

module.exports = { isLink, clone, pull, abortMerge, commit, push, gitBinary };
```

If Task 1 found that the bundled git needs `-c credential.helper=osxkeychain`, add it to the argument list in `git()` when `process.env.RESEARCH_HARNESS_GIT` is set.

- [ ] **Step 4: Run, expect PASS**: `node --test test/app-git.test.js`, then the full test command.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/lib/app-git.js plugins/research-harness/test/app-git.test.js
git commit -m "Git for the desktop app's human steps: clone, update, send"
```

---

### Task 3: Running the plugin CLI for one project

**Files:**
- Create: `plugins/research-harness/hooks/lib/app-cli.js`
- Test: `plugins/research-harness/test/app-cli.test.js`

**Interfaces:**
- Produces: `runCli(root: string, args: string[]): Promise<{ ok: true, output: string } | { ok: false, code: 'invalid'|'refused', error: string }>` (exit code 2 → `invalid`, any other non-zero → `refused`; `error` is the CLI's own message).

Why a child process and not library calls: the CLI handlers (`init`, `join`, `key export`, `session`, `merge-log` in `bin/research-harness.js`) print and return exit codes rather than returning values, and they read the project from `CLAUDE_PROJECT_DIR` or the working directory (`hooks/lib/project.js:12`). Running the same entry keeps every check and message identical to the terminal without refactoring a 1,246-line file. This replaces the spec's "they never shell out to `research-harness`" (§3.2): there is still no shell, only `execFile` of node with an argument array.

- [ ] **Step 1: Read the test setup** in `test/serve.test.js` (the first 60 lines) and reuse its way of creating a temporary project and isolating `HOME`, so `init` does not write keys into the real home folder.

- [ ] **Step 2: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCli } = require('../hooks/lib/app-cli');

// Use the HOME isolation from test/serve.test.js here (Step 1).

test('init through runCli creates the canvas in the given folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-cli-'));
  const r = await runCli(root, ['init', '--project', 'demo', '--mode', 'brainstorming']);
  assert.equal(r.ok, true, r.error);
  assert.ok(fs.existsSync(path.join(root, 'research', 'canvas.md')));
});

test('a usage error comes back as invalid with the CLI message', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-cli-'));
  const r = await runCli(root, ['init', '--project', 'demo', '--mode', 'nope']);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid');
  assert.match(r.error, /--mode must be one of/);
});

test('arguments are not interpreted by a shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-cli-'));
  const marker = path.join(root, 'pwned');
  await runCli(root, ['init', '--project', `x; touch ${marker}`, '--mode', 'brainstorming']);
  assert.equal(fs.existsSync(marker), false);
});
```

- [ ] **Step 3: Run, expect FAIL**: `node --test test/app-cli.test.js`

- [ ] **Step 4: Implement**

```js
'use strict';
// Runs the plugin's own command line for the desktop app's human steps, so
// the app takes the same checks and writes the same files as the terminal.
// No shell: node gets the arguments as an array. Inside Electron,
// process.execPath is the app binary, which ELECTRON_RUN_AS_NODE turns into
// plain node; outside Electron the variable does nothing.
const childProcess = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', 'bin', 'research-harness.js');

function runCli(root, args) {
  return new Promise((resolve) => {
    childProcess.execFile(process.execPath, [CLI, ...args], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ELECTRON_RUN_AS_NODE: '1' },
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      const output = String(stdout).trim();
      if (!err) {
        resolve({ ok: true, output });
        return;
      }
      resolve({ ok: false, code: err.code === 2 ? 'invalid' : 'refused', error: output || err.message });
    });
  });
}

module.exports = { runCli, CLI };
```

- [ ] **Step 5: Run, expect PASS** (file and full command). **Step 6: Commit**

```bash
git add plugins/research-harness/hooks/lib/app-cli.js plugins/research-harness/test/app-cli.test.js
git commit -m "Run the plugin CLI for one project from the desktop app"
```

---

### Task 4: App routes and recent projects

**Files:**
- Create: `plugins/research-harness/hooks/lib/app-store.js`, `plugins/research-harness/hooks/lib/app-api.js`
- Test: `plugins/research-harness/test/app-api.test.js`

**Interfaces:**
- Consumes: Task 2 `app-git` (all functions), Task 3 `runCli`, `hooks/lib/project.js` (`canvasPath`, `decisionsPath`), `hooks/lib/identity.js` (`readName`; check its signature in that file before use).
- Produces:
  - `readStore(dataDir): { recent: string[] }`, `remember(dataDir, root): string[]`
  - `routes: { [name]: (body: object, ctx: AppContext) => Promise<object> }` with names `projects`, `open`, `init`, `clone`, `update`, `send`, `invite`, `join`, `session`
  - `AppContext = { dataDir: string, getRoot(): string | null, setRoot(root: string): void }`

- [ ] **Step 1: Write the failing tests** (`test/app-api.test.js`; reuse `sh`, `tmp` and the `HOME` isolation from Tasks 2 and 3, and set `RESEARCH_HARNESS_GIT_PROTOCOLS=https:ssh:file`):

```js
function context(dataDir, root = null) {
  let current = root;
  return { dataDir, getRoot: () => current, setRoot: (r) => { current = r; } };
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
  const { a, b } = await twoPeopleSharingOneProject(); // helper in this file: init, key export, clone, join
  await runCli(a, ['log', 'DISCOVERY', '1.1', '--body', 'from A']);
  await runCli(b, ['log', 'DISCOVERY', '1.1', '--body', 'from B']);
  assert.equal((await routes.send({}, context(tmp(), a))).ok, true);
  const r = await routes.update({}, context(tmp(), b));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.merged, true);
  assert.equal((await runCli(b, ['status'])).ok, true);
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
```

Write `twoPeopleSharingOneProject()` in the test file with exactly the steps of its comment: `routes.init` for A in a parent folder, `git init -b main`, add, commit, a bare remote, `git remote add origin`, push; `runCli(a, ['key', 'export', '--out', <tmp>/a.seal.key])` (commit nothing from it); `appGit.clone` for B; `runCli(b, ['join', '--key-file', <that file>, '--name', 'B. Supervisor'])`. Before writing it, read where `key export` and `join` write their files (`bin/research-harness.js:668-746`) and add every file `join` creates on B's side to B's `.gitignore` if the CLI does not already ignore it.

- [ ] **Step 2: Run, expect FAIL**: `node --test test/app-api.test.js`

- [ ] **Step 3: Implement `app-store.js`**

```js
'use strict';
// The desktop app's own memory: recent projects. Lives in the app's data
// folder, never in a project, and holds no token, key or credential.
const fs = require('node:fs');
const path = require('node:path');

const MAX_RECENT = 10;

function storeFile(dataDir) {
  return path.join(dataDir, 'app-state.json');
}

function readStore(dataDir) {
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(dataDir), 'utf8'));
    return { recent: Array.isArray(data.recent) ? data.recent.filter((p) => typeof p === 'string') : [] };
  } catch {
    return { recent: [] };
  }
}

function remember(dataDir, root) {
  const recent = [root, ...readStore(dataDir).recent.filter((p) => p !== root)].slice(0, MAX_RECENT);
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${storeFile(dataDir)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ recent }, null, 2)}\n`);
  fs.renameSync(tmp, storeFile(dataDir));
  return recent;
}

module.exports = { readStore, remember, MAX_RECENT };
```

- [ ] **Step 4: Implement `app-api.js`**

```js
'use strict';
// Routes of the desktop app's human steps, mounted by canvas-serve.js in app
// mode under /api/app/<name>. Each takes the parsed body and the app context
// and resolves to { ok: true, ... } or { ok: false, code, error }.
const fs = require('node:fs');
const path = require('node:path');
const project = require('./project');
const identity = require('./identity');
const appGit = require('./app-git');
const store = require('./app-store');
const { runCli } = require('./app-cli');

const MODES = ['brainstorming', 'seed', 'import'];
const FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SEND_PATHS = ['research'];

function invalid(error) {
  return { ok: false, code: 'invalid', error };
}

function isProject(root) {
  return typeof root === 'string' && path.isAbsolute(root) && fs.existsSync(project.canvasPath(root));
}

function isLine(text, max) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= max && !/[\r\n]/.test(text);
}

function isAbsoluteFile(p, suffix) {
  return typeof p === 'string' && path.isAbsolute(p) && p.endsWith(suffix);
}

function withProject(ctx, fn) {
  const root = ctx.getRoot();
  if (!root) return Promise.resolve({ ok: false, code: 'no-project', error: 'No project is open.' });
  return fn(root);
}

function personName(root) {
  try {
    return identity.readName(root) || null;
  } catch {
    return null;
  }
}

function makeCurrent(ctx, root) {
  ctx.setRoot(root);
  return { ok: true, current: root, recent: store.remember(ctx.dataDir, root) };
}

const routes = {
  projects: async (b, ctx) => ({
    ok: true,
    current: ctx.getRoot(),
    recent: store.readStore(ctx.dataDir).recent.filter(isProject),
  }),

  open: async (b, ctx) => {
    if (!isProject(b.root)) return { ok: false, code: 'not-project', error: 'This folder has no research canvas (research/canvas.md).' };
    return makeCurrent(ctx, b.root);
  },

  init: async (b, ctx) => {
    if (typeof b.parent !== 'string' || !path.isAbsolute(b.parent) || !fs.existsSync(b.parent)) return invalid('The chosen folder does not exist.');
    if (typeof b.folder !== 'string' || !FOLDER_RE.test(b.folder)) return invalid('The folder name may use letters, digits, dots, hyphens and underscores.');
    if (!MODES.includes(b.mode)) return invalid(`Choose one of: ${MODES.join(', ')}.`);
    const root = path.join(b.parent, b.folder);
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) return { ok: false, code: 'exists', error: `${root} already exists and is not empty.` };
    fs.mkdirSync(root, { recursive: true });
    const args = ['init', '--project', b.folder, '--mode', b.mode];
    if (isLine(b.title, 200)) args.push('--title', b.title.trim());
    const r = await runCli(root, args);
    return r.ok ? makeCurrent(ctx, root) : r;
  },

  clone: async (b, ctx) => {
    const r = await appGit.clone({ url: b.url, parent: b.parent, folder: b.folder });
    if (!r.ok) return r;
    if (!isProject(r.root)) return { ok: false, code: 'not-project', error: 'The cloned folder has no research canvas (research/canvas.md).', root: r.root };
    return makeCurrent(ctx, r.root);
  },

  update: (b, ctx) => withProject(ctx, async (root) => {
    const name = personName(root);
    const r = await appGit.pull(root, name);
    if (r.ok || r.code !== 'conflict') return r;
    const log = path.relative(root, project.decisionsPath(root));
    if (r.files.length === 1 && r.files[0] === log) {
      const merged = await runCli(root, ['merge-log']);
      if (merged.ok) {
        const c = await appGit.commit(root, [log], 'Merge the shared decision log', name);
        if (c.ok) return { ok: true, merged: true };
      }
      await appGit.abortMerge(root);
      return { ok: false, code: 'merge-failed', error: 'The two decision logs could not be merged so that the seal verifies. Nothing was changed.' };
    }
    await appGit.abortMerge(root);
    return {
      ok: false,
      code: 'conflict',
      files: r.files,
      error: `You and a co-author both changed ${r.files.join(', ')}. Nothing was changed. Compare the file with the co-author who sent these changes, then get updates again.`,
    };
  }),

  send: (b, ctx) => withProject(ctx, async (root) => {
    const name = personName(root);
    const c = await appGit.commit(root, SEND_PATHS, 'Research canvas changes', name);
    if (!c.ok) return c;
    let p = await appGit.push(root);
    if (p.ok) return { ok: true, committed: c.committed };
    if (p.code !== 'rejected') return p;
    const u = await routes.update({}, ctx);
    if (!u.ok) return u;
    p = await appGit.push(root);
    return p.ok ? { ok: true, committed: c.committed, updated: true } : p;
  }),

  invite: (b, ctx) => withProject(ctx, (root) => (
    isAbsoluteFile(b.out, '.seal.key') ? runCli(root, ['key', 'export', '--out', b.out]) : Promise.resolve(invalid('Choose where to save the key file (a name ending in .seal.key).'))
  )),

  join: (b, ctx) => withProject(ctx, (root) => {
    if (!isAbsoluteFile(b.keyFile, '.seal.key')) return Promise.resolve(invalid('Choose the key file you received (it ends in .seal.key).'));
    if (!isLine(b.name, 80)) return Promise.resolve(invalid('Enter your name as co-authors should see it.'));
    return runCli(root, ['join', '--key-file', b.keyFile, '--name', b.name.trim()]);
  }),

  session: (b, ctx) => withProject(ctx, (root) => {
    if (b.action === 'start') {
      return isLine(b.occasion, 200) ? runCli(root, ['session', 'start', b.occasion.trim()]) : Promise.resolve(invalid('Name the occasion in one line.'));
    }
    if (b.action === 'minutes') {
      return isAbsoluteFile(b.out, '.md') ? runCli(root, ['session', 'protocol', '--out', b.out]) : Promise.resolve(invalid('Choose where to save the minutes (a .md file).'));
    }
    return Promise.resolve(invalid('Unknown session action.'));
  }),
};

module.exports = { routes, isProject };
```

Before Step 5, check two facts this code assumes and adjust if they differ: where literature notes live (`grep -rn "literature" plugins/research-harness/skills/literature-note/SKILL.md`): if outside `research/`, add that folder to `SEND_PATHS`; and the exact suffix `key export` requires (`EXPORT_SUFFIX` in `bin/research-harness.js`).

- [ ] **Step 5: Run, expect PASS** (file and full command). **Step 6: Commit**

```bash
git add plugins/research-harness/hooks/lib/app-store.js plugins/research-harness/hooks/lib/app-api.js plugins/research-harness/test/app-api.test.js
git commit -m "App routes for the desktop app's human steps"
```

---

### Task 5: App mode in the server and `serve --app` (after SQ-239)

**Files:**
- Modify: `plugins/research-harness/bin/canvas-serve.js` (`start()`, the request handler around today's lines 188–240), `plugins/research-harness/bin/research-harness.js` (`serve()`, line 846; `USAGE`)
- Test: `plugins/research-harness/test/serve.test.js`

**Interfaces:**
- Consumes: Task 4 `routes`, `isProject`.
- Produces: `start({ root, pluginRoot, log, codeTtlMs, app })` where `app = { dataDir }` turns on app mode; in app mode `root` may be `null`, and the resolved object gains `appUrl` (`${origin}/app#c=${code}`). `GET /app` serves `dashboard/app.html`. `GET /api/app/projects` and `POST /api/app/<name>` dispatch to `routes`. Project routes act on the current root and answer `409 { ok: false, code: 'no-project' }` when none is open. CLI: `research-harness serve --app [--app-data <dir>] [--no-open]`.

- [ ] **Step 1: Write the failing tests** in `serve.test.js`, using its existing request helpers:

```js
test('app mode: no project open, token required, open switches the project', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-data-'));
  const running = await canvasServe.start({ root: null, app: { dataDir } });
  try {
    const token = await redeem(running);                                  // existing helper: POST /api/session with the code
    assert.equal((await get(running, '/api/app/projects', null)).status, 403);
    const state = await get(running, '/api/state', token);
    assert.equal(state.status, 409);
    assert.equal(state.body.code, 'no-project');
    const root = await makeProject();                                     // existing helper that inits a temp project
    const opened = await post(running, '/api/app/open', { root }, token);
    assert.equal(opened.body.ok, true);
    assert.equal((await get(running, '/api/state', token)).status, 200);
    assert.equal((await post(running, '/api/app/nope', {}, token)).status, 404);
  } finally {
    await running.close();
  }
});

test('app mode serves the shell page and project mode does not', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-app-data-'));
  const app = await canvasServe.start({ root: null, app: { dataDir } });
  try {
    assert.equal((await getText(app, '/app')).status, 200);
  } finally {
    await app.close();
  }
  const plain = await canvasServe.start({ root: await makeProject() });
  try {
    assert.equal((await getText(plain, '/app')).status, 404);
  } finally {
    await plain.close();
  }
});
```

Use the helper names `serve.test.js` already has; where one is missing (`getText` for a non-JSON body), add it next to the others.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `canvas-serve.js`:

```js
const appApi = require('../hooks/lib/app-api');

// inside start(): the current project can change in app mode
let currentRoot = root;
const appCtx = app ? { dataDir: app.dataDir, getRoot: () => currentRoot, setRoot: (r) => { currentRoot = r; } } : null;

// in the request handler, after the token check and before the project routes:
if (appCtx && req.method === 'GET' && url === '/app') {
  return send(res, 200, fs.readFileSync(path.join(pluginRoot, 'dashboard', 'app.html'), 'utf8'), 'text/html; charset=utf-8');
}
if (appCtx && url.startsWith('/api/app/')) {
  const name = url.slice('/api/app/'.length);
  const handler = Object.prototype.hasOwnProperty.call(appApi.routes, name) ? appApi.routes[name] : null;
  if (!handler) return send(res, 404, { ok: false, error: 'not found' });
  if (name === 'projects' ? req.method !== 'GET' : req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
  const body = name === 'projects' ? {} : await readJson(req);              // the body reader the handler already uses
  const result = await handler(body, appCtx);
  return send(res, result.ok ? 200 : (result.code === 'no-project' || result.code === 'conflict' ? 409 : 422), result);
}
if (!currentRoot && url.startsWith('/api/')) return send(res, 409, { ok: false, code: 'no-project', error: 'No project is open.' });
```

Replace every use of `root` in the project routes' context with `currentRoot`, keep `GET /api/session` and the code exchange exactly as they are, and add `appUrl` to the resolved object when `app` is set. Match the handler's real structure as SQ-239 left it; the snippet shows the logic, not the final line positions.

In `bin/research-harness.js`, `serve(flags)`: when `flags.app === true`, skip the canvas check, start with `root: fs.existsSync(project.canvasPath(cwd)) ? cwd : null` and `app: { dataDir: typeof flags['app-data'] === 'string' ? flags['app-data'] : path.join(os.homedir(), '.research-harness') }`, print and open `running.appUrl`. Add the usage line `research-harness serve --app [--app-data <dir>] [--no-open]`, and grep `test/` for the old usage text first (`grep -rn "serve \[--no-open\]" plugins/research-harness/test`) and update every hit.

- [ ] **Step 4: Run, expect PASS** (file and full command). **Step 5: Commit**

```bash
git add plugins/research-harness/bin/canvas-serve.js plugins/research-harness/bin/research-harness.js plugins/research-harness/test/serve.test.js
git commit -m "App mode for the session server and research-harness serve --app"
```

---

### Task 6: Session view embedded in the shell (after SQ-239)

**Files:**
- Modify: `plugins/research-harness/dashboard/canvas.html` (the code that redeems `#c=` today)
- Test: `plugins/research-harness/test/view.test.js`

**Interfaces:**
- Produces: messages the shell sends to the embedded view, same origin only:
  - `{ type: 'harness-token', token: string }`: use this token instead of redeeming a code;
  - `{ type: 'harness-tab', tab: 'poster' | 'to-talk-about' | 'history' }`: switch tab;
  - `{ type: 'harness-refresh' }`: read `/api/state` now (change marks follow from SQ-239's diff).
- The view sends `{ type: 'harness-ready' }` to its parent once its listener is attached.

- [ ] **Step 1: Write the failing rendered test** in `view.test.js`, with its existing Playwright setup: load a parent page from the same server whose script embeds `/` in an iframe without `#c=`, waits for `harness-ready`, posts `harness-token` with the redeemed token, then `harness-tab` `to-talk-about`; assert the iframe shows the "To talk about" tab selected and an Accept… flow reaches the dialog. Second case: a message with the same shape from another origin (a `data:` URL page) changes nothing.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// Embedded in the app's shell page, the view takes its token from the shell
// instead of redeeming a code; opened alone, it redeems its own code.
function listenToShell(onToken) {
  if (window.parent === window) return false;
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const msg = event.data || {};
    if (msg.type === 'harness-token' && typeof msg.token === 'string') onToken(msg.token);
    if (msg.type === 'harness-tab') showTab(msg.tab);          // the view's own tab switcher
    if (msg.type === 'harness-refresh') refreshState();        // the view's own state reader
  });
  window.parent.postMessage({ type: 'harness-ready' }, window.location.origin);
  return true;
}
```

Call it where the view decides how to get its token; use the view's real names for the tab switcher and state reader.

- [ ] **Step 4: Run, expect PASS** (file and full command). **Step 5: Commit**

```bash
git add plugins/research-harness/dashboard/canvas.html plugins/research-harness/test/view.test.js
git commit -m "Session view takes its token and tab from the app shell"
```

---

### Task 7: The shell page

**Files:**
- Create: `plugins/research-harness/dashboard/app.html`
- Test: `plugins/research-harness/test/app-shell.test.js`

**Interfaces:**
- Consumes: Task 5 routes and `appUrl`; Task 6 messages; the host bridge `window.harnessHost` from Task 8 when present.
- Produces: `window.harnessHost` contract the Electron preload must meet:
  `pickFolder(): Promise<string | null>`, `pickFile({ suffix }): Promise<string | null>`, `saveFile({ suggestedName }): Promise<string | null>`, `reveal(path): Promise<void>`, `openExternal(url): Promise<void>`.

This is a design build in the galley-proof world, code-led. Before the first UI edit: load the `impeccable` skill, run its `context --target plugins/research-harness/dashboard/app.html`, read the direction contract and `reference/craft-floor.md`. Build from `.impeccable/mocks/decision/sketches/model-pick.html` (sidebar left, session view centre; the agent column stays hidden) and reuse the tokens, fonts and status vocabulary SQ-239 put into `canvas.html`. The sidebar and dialogs follow spec §4 word for word in what they offer.

- [ ] **Step 1: Write the failing rendered tests** (`app-shell.test.js`, Playwright as in `view.test.js`, server from Task 5 in app mode with a temp `dataDir`):
  - no project: the first-start page offers New project…, Open project…, Clone from link…, each with one explaining sentence, all reachable by Tab;
  - with the fixture project opened through `/api/app/open`: the sidebar shows the project name and folder, Meeting and People sections, and the session view iframe receives the token (assert the iframe's poster renders);
  - Get updates with a remote that conflicts outside `decisions.md`: the message appears next to the button, names the file, and focus stays on the button; no element with `role="status"` that disappears on a timer;
  - in a plain browser (no `window.harnessHost`), Open project… shows a labelled path field instead of a picker;
  - focus contrast of every visible control at least 3:1 in light and dark, keyboard path through the sidebar, reflow at 320 px: copy the measuring helpers from `view.test.js` into `test/helpers/a11y.js` and use them from both files;
  - the page source contains no token after redemption: `page.content()` and `location.href` do not include it.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Build `app.html`.** The parts every implementation needs, in this form:

```js
let token = null;
const hash = new URLSearchParams(location.hash.slice(1));
const code = hash.get('c');
history.replaceState(null, '', location.pathname);           // the code leaves the address bar at once

async function redeem() {
  const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const body = await res.json();
  if (!body.ok) throw new Error('This window was already opened elsewhere. Close it and start the app again.');
  token = body.token;
}

async function api(name, body) {
  const get = name === 'projects';
  const res = await fetch(`/api/app/${name}`, {
    method: get ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Harness-Token': token },
    body: get ? undefined : JSON.stringify(body || {}),
  });
  return res.json();
}

const host = window.harnessHost || null;                      // null in a browser tab: dialogs show path fields

function embedSessionView(frame) {
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if ((event.data || {}).type === 'harness-ready') frame.contentWindow.postMessage({ type: 'harness-token', token }, location.origin);
  });
  frame.src = '/';
}
```

After Get updates succeeds, post `{ type: 'harness-refresh' }`; the Agenda button posts `{ type: 'harness-tab', tab: 'to-talk-about' }`. Outcomes go into a sidebar line under the control (`aria-live="polite"`), never a toast.

- [ ] **Step 4: Run, expect PASS** (file and full command). Capture `.impeccable/review/app-desktop.png` (1440×900, light), `app-desktop-dark.png`, `app-mobile.png` (390 wide) with headless Chrome against `research-harness serve --app --no-open` and a fixture project.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/dashboard/app.html plugins/research-harness/test/app-shell.test.js plugins/research-harness/test/helpers/a11y.js plugins/research-harness/test/view.test.js .impeccable/review/app-*.png
git commit -m "Shell page for the desktop app in the galley-proof world"
```

---

### Task 8: The Electron app

**Files:**
- Create: `desktop/main.js`, `desktop/preload.js`, `desktop/server.js`, `desktop/askpass.sh`, `desktop/electron-builder.yml`, `desktop/scripts/bundle-plugin.js`, `desktop/test/smoke.test.js`
- Modify: `desktop/package.json` (scripts `bundle`, `dist`)

**Interfaces:**
- Consumes: Task 1 `gitPath()`; Task 5 `start({ root: null, pluginRoot, app: { dataDir } })` and `appUrl`; Task 7 `window.harnessHost` contract.
- Environment the server process gets: `RESEARCH_HARNESS_GIT`, `RESEARCH_HARNESS_PLUGIN`, `RESEARCH_HARNESS_APP_DATA`, `GIT_ASKPASS`. Test-only: `RESEARCH_HARNESS_TEST_USER_DATA` overrides `userData`.

- [ ] **Step 1: Write the failing smoke test** (`desktop/test/smoke.test.js`, Playwright's `_electron` through `NODE_PATH`):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

test('the app opens, shows the first-start page and keeps the token off disk', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-desktop-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, RESEARCH_HARNESS_TEST_USER_DATA: userData } });
  try {
    const win = await app.firstWindow();
    await win.getByRole('button', { name: 'New project…' }).waitFor();
    assert.equal(new URL(win.url()).hash, '');
    const token = await win.evaluate(() => fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"x"}' }).then((r) => r.status));
    assert.equal(token, 403);                                     // the code was already redeemed by the shell
    for (const file of fs.readdirSync(userData, { recursive: true })) {
      const full = path.join(userData, String(file));
      if (fs.statSync(full).isFile()) assert.doesNotMatch(fs.readFileSync(full, 'latin1'), /[0-9a-f]{64}/, full);
    }
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && NODE_PATH=~/dh-appdev/dsi-pubs/node_modules node --test test/smoke.test.js`

- [ ] **Step 3: Implement `server.js`**

```js
'use strict';
// Runs in an Electron utilityProcess: starts the plugin's server in app mode
// and hands the main process the URL with the single-use code. The token
// never leaves this process except to the page that redeems the code.
const path = require('node:path');

const pluginRoot = process.env.RESEARCH_HARNESS_PLUGIN;
const { start } = require(path.join(pluginRoot, 'bin', 'canvas-serve.js'));

start({ root: null, pluginRoot, app: { dataDir: process.env.RESEARCH_HARNESS_APP_DATA } }).then(
  (running) => process.parentPort.postMessage({ url: running.appUrl }),
  (err) => process.parentPort.postMessage({ error: err.message }),
);
```

- [ ] **Step 4: Implement `main.js`**

```js
'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require('electron');
const path = require('node:path');
const { gitPath } = require('./git-path');

if (process.env.RESEARCH_HARNESS_TEST_USER_DATA) app.setPath('userData', process.env.RESEARCH_HARNESS_TEST_USER_DATA);

const pluginRoot = app.isPackaged ? path.join(process.resourcesPath, 'plugin') : path.join(__dirname, '..', 'plugins', 'research-harness');
const askpass = app.isPackaged ? path.join(process.resourcesPath, 'askpass.sh') : path.join(__dirname, 'askpass.sh');

function startServer() {
  const child = utilityProcess.fork(path.join(__dirname, 'server.js'), [], {
    env: {
      ...process.env,
      RESEARCH_HARNESS_GIT: gitPath(),
      RESEARCH_HARNESS_PLUGIN: pluginRoot,
      RESEARCH_HARNESS_APP_DATA: app.getPath('userData'),
      GIT_ASKPASS: askpass,
    },
  });
  return new Promise((resolve, reject) => {
    child.once('message', (msg) => (msg && msg.url ? resolve({ child, url: msg.url }) : reject(new Error((msg && msg.error) || 'The server did not start.'))));
    child.once('exit', (code) => reject(new Error(`The server stopped (exit ${code}).`)));
  });
}

function window(url) {
  const origin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'research-harness',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.loadURL(url);
  return win;
}

ipcMain.handle('host:pick-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('host:pick-file', async (e, opts) => {
  const suffix = opts && typeof opts.suffix === 'string' ? opts.suffix.replace(/^\./, '') : null;
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: suffix ? [{ name: suffix, extensions: [suffix.split('.').pop()] }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('host:save-file', async (e, opts) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: opts && typeof opts.suggestedName === 'string' ? opts.suggestedName : undefined });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('host:reveal', (e, p) => { if (typeof p === 'string' && path.isAbsolute(p)) shell.showItemInFolder(p); });
ipcMain.handle('host:open-external', (e, url) => { if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url); });

app.whenReady().then(async () => {
  try {
    const { child, url } = await startServer();
    window(url);
    app.on('before-quit', () => child.kill());
  } catch (err) {
    dialog.showErrorBox('research-harness could not start', err.message);
    app.quit();
  }
});
app.on('window-all-closed', () => app.quit());
```

The URL with the single-use code goes from `server.js` to `main.js` to `loadURL` only; nothing prints or stores it.

- [ ] **Step 5: Implement `preload.js` and `askpass.sh`**

```js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('harnessHost', {
  pickFolder: () => ipcRenderer.invoke('host:pick-folder'),
  pickFile: (opts) => ipcRenderer.invoke('host:pick-file', opts),
  saveFile: (opts) => ipcRenderer.invoke('host:save-file', opts),
  reveal: (p) => ipcRenderer.invoke('host:reveal', p),
  openExternal: (url) => ipcRenderer.invoke('host:open-external', url),
});
```

```sh
#!/bin/sh
# git asks for a user name or password through GIT_ASKPASS; answer with a
# native macOS dialog. Passwords are typed hidden.
case "$1" in
  Password*) hidden="with hidden answer" ;;
  *) hidden="" ;;
esac
exec /usr/bin/osascript -e "on run argv" -e "set r to display dialog (item 1 of argv) default answer \"\" $hidden with title \"research-harness\"" -e "return text returned of r" -e "end run" -- "$1"
```

`chmod +x desktop/askpass.sh`.

- [ ] **Step 6: Bundling and an unsigned build**

`desktop/scripts/bundle-plugin.js` copies `plugins/research-harness` (without `test/` and `node_modules/`) to `desktop/build/plugin` with `fs.cpSync(src, dest, { recursive: true, filter })`. `desktop/electron-builder.yml`:

```yaml
appId: org.research-harness.desktop
productName: research-harness
directories: { output: dist }
files: [main.js, preload.js, server.js, git-path.js, package.json]
extraResources:
  - { from: build/plugin, to: plugin }
  - { from: askpass.sh, to: askpass.sh }
asarUnpack: ["node_modules/dugite/**"]
mac: { target: dir, identity: null }
```

Scripts in `package.json`: `"bundle": "node scripts/bundle-plugin.js"`, `"dist": "npm run bundle && electron-builder --mac dir"`. Add `build/` to `desktop/.gitignore`.

- [ ] **Step 7: Run, expect PASS**: the smoke test, then `npm run dist` and open `dist/mac*/research-harness.app` once by double-click; record in the report whether macOS asked for "Open Anyway" (expected for an unsigned app, spec §7).

- [ ] **Step 8: Commit**

```bash
git add desktop/
git commit -m "Electron app: window, server process, native dialogs, unsigned build"
```

---

### Task 9: Finish review, design record, owner check

**Files:**
- Modify: `DESIGN.md` and `.impeccable/design.json` (written after SQ-239's finish), `.impeccable/surfaces/` (only if the shell gets its own brief)

- [ ] **Step 1:** Run the impeccable finish review for `dashboard/app.html` with `.impeccable/mocks/decision/model-pick.png` as the critique reference and the direction contract; apply the material fixes in one batch, re-run the full test command.
- [ ] **Step 2:** Run `impeccable detect --json plugins/research-harness/dashboard/app.html` once; report findings and what was done.
- [ ] **Step 3:** Update `DESIGN.md` through impeccable's documenter so it covers the shell (sidebar, dialogs, outcome lines).
- [ ] **Step 4:** Owner check, by Daniel, on a Mac user account without developer tools, with the build from Task 8: create a project; clone a shared one and get updates; send a change and see it arrive on the other side; invite a co-author and join as that co-author; start a session, open the agenda, export minutes. Record each step as done or as the exact message that stopped it.
- [ ] **Step 5: Commit**

```bash
git add DESIGN.md .impeccable/design.json
git commit -m "Design record covers the desktop app shell"
```
