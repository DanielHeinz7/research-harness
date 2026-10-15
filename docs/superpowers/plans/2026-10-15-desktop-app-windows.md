# Desktop App on Windows Through the Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, tasks run as Sidequest tickets in worktrees, one ticket per task.

**Goal:** A Windows researcher installs Git and Node with their official installers, unzips `research-harness-windows.zip`, double-clicks a start file and does the four human steps in a browser tab; and a research file with Windows line endings is refused instead of read as empty.

**Architecture:** Wave 1 adds one small module, `hooks/lib/line-endings.js`, and calls it from the parsers, the seal chain, `loadState` and the guard, so a CR before an LF is a refusal everywhere; `init` writes `research/.gitattributes` and the app's clone sets `core.autocrlf=false`. Wave 2 adds `hooks/lib/host.js`, the pure functions for what differs by operating system, wires them into the app routes, `serve --app`, `install-cli` and the shell page, and adds `scripts/windows-zip.js`, which `scripts/release.js` attaches to every release.

**Tech Stack:** Node (no plugin dependencies), node:test, Playwright through `NODE_PATH`, macOS `/usr/bin/zip` and `/usr/bin/unzip`, `gh`.

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-app-windows-design.md` (approved, `7988db4`).

**Execution:** subagent-driven, one Sidequest ticket per task, chosen by the owner on 2026-10-15.

## Global Constraints

- The plugin stays dependency-free. No shell anywhere: `execFile`/`spawnSync` with argument arrays.
- Node floor for the Windows start: 22 ("research-harness needs Node.js 22 or newer.").
- The release asset is named `research-harness-windows.zip`; the folder inside is `research-harness-<version>-windows/`.
- The start file is ASCII with CRLF line endings; `README.txt` in the zip has CRLF too.
- Line endings are refused, never repaired: the harness never rewrites a ledger or a canvas behind the person's back.
- Tests that need git to convert line endings set `core.autocrlf=true` in a temporary global config (`GIT_CONFIG_GLOBAL`), never with `git -c` on the command line (spec 4.2: the command line outranks the clone's own config).
- Windows paths in tests go through `path.win32`; `path.isAbsolute('C:\\x')` is false on macOS.
- English for code, UI, docs, commits. Errors in plain words with the next step; never a toast.
- Do not touch `desktop/`. `dashboard/app.html`, `scripts/release.js` and `scripts/release.test.js` are shared with sub-project 4: rebase onto whatever it has landed.
- The README anchor for the repair is `https://github.com/DanielHeinz7/research-harness#windows-line-endings`.

Test commands, run in the directory they judge:
- plugin, in `plugins/research-harness`: `NODE_PATH=/tmp/rh-playwright/node_modules node --test --test-timeout=120000 "test/*.test.js"`
- scripts, in the repo root: `node --test scripts/*.test.js`

Each task that changes what a user sees adds a release fragment `.release/unreleased/<ticket>.md` in the style of the existing ones (a `# <ticket>: <title>` line, then plain sentences).

## Review Focus

1. A canvas edited by the agent while the file on disk is CRLF: the guard must refuse, also when the agent's write would turn the whole file into LF (its "before" reads as empty). Pinned in Task 2.
2. A project with an empty decision log (header only) checked out with CRLF: nothing may be appended to it, because the first seal would anchor over CRLF bytes. Pinned in Task 1 (`verifyChain` on a header-only CRLF log).
3. A path typed with quotes and trailing spaces, `"  C:\Users\x\paper"  `, or pasted from Finder with no quotes at all: both must reach the same validation. Pinned in Task 4 and Task 5.
4. A Windows user whose Documents folder is redirected into OneDrive: the prefilled folder must not be inside OneDrive, and New project or Clone into OneDrive must be refused with the reason. Pinned in Task 5 and Task 6.
5. Git missing on a fresh Windows machine: `serve --app` still starts, prints the Git for Windows line, and clone answers `git-missing` with the Windows hint. Pinned in Task 5.

---

## Wave 1: line endings (spec section 4; can start now)

### Task 1: Refuse CRLF in the parsers and the seal chain

**Files:**
- Create: `plugins/research-harness/hooks/lib/line-endings.js`, `plugins/research-harness/test/line-endings.test.js`
- Modify: `plugins/research-harness/hooks/lib/canvas.js` (`parseCanvas`, line 165), `hooks/lib/glossary.js` (`parseGlossary`, line 167), `hooks/lib/seal.js` (`verifyChain`, line 127), `hooks/lib/review.js` (`WHY`, line 688), `dashboard/canvas.html` (`BREAK_WHY`, line 1459)

**Interfaces:**
- Produces: `firstCrlfLine(text: string | null): number | null` (1-based line of the first CR LF pair); `crlfProblem(line: number): string`; `crlfRefusal(file: string, line: number): string`; `README_ANCHOR: string`.
- Produces: `parseCanvas(text).problems[0]` and `parseGlossary(text).problems[0]` start with `line N: Windows line endings (CRLF)` when the text holds CR LF; `verifyChain(text, key)` returns `{ status: 'broken', broken: { seq, line, why: 'line-endings' } }`, where `seq` is the first entry's number or 0 when there is none.

- [ ] **Step 1: Write the failing tests** in `test/line-endings.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const lineEndings = require('../hooks/lib/line-endings');
const canvas = require('../hooks/lib/canvas');
const glossary = require('../hooks/lib/glossary');
const decisions = require('../hooks/lib/decisions');
const seal = require('../hooks/lib/seal');

const crlf = (s) => s.replace(/\n/g, '\r\n');
const CANVAS = fs.readFileSync(path.join(__dirname, 'fixtures', 'constant-checking', 'research', 'canvas.md'), 'utf8');

function sealedLog(key) {
  let log = decisions.header('crlf');
  for (const [seq, body] of [[1, 'First finding.'], [2, 'Second finding.']]) {
    const { text } = seal.sealEntry(seal.lastSealOf(log), { seq, date: '2026-10-15', kind: 'DISCOVERY', ref: '1.1 check', body, by: 'A' }, key);
    log += decisions.separatorAfter(log) + text;
  }
  return log;
}

test('firstCrlfLine names the first CR LF line and ignores a lone CR', () => {
  assert.equal(lineEndings.firstCrlfLine('a\nb\r\nc\r\n'), 2);
  assert.equal(lineEndings.firstCrlfLine('a\rb\n'), null);
  assert.equal(lineEndings.firstCrlfLine(''), null);
  assert.equal(lineEndings.firstCrlfLine(null), null);
});

test('a CRLF canvas is a parse problem, not an empty canvas', () => {
  assert.deepEqual(canvas.parseCanvas(CANVAS).problems, []);
  const parsed = canvas.parseCanvas(crlf(CANVAS));
  assert.match(parsed.problems[0], /^line 1: Windows line endings \(CRLF\)/);
});

test('a CRLF glossary is a parse problem', () => {
  const text = crlf('---\nglossary-schema: 1\n---\n');
  assert.match(glossary.parseGlossary(text).problems[0], /^line 1: Windows line endings \(CRLF\)/);
  assert.equal(glossary.parseGlossary(text).judgeable, false);
});

test('a CRLF decision log is broken with why line-endings, never verified', () => {
  const key = crypto.randomBytes(32);
  const log = sealedLog(key);
  assert.equal(seal.verifyChain(log, key).status, 'verified');
  const chain = seal.verifyChain(crlf(log), key);
  assert.equal(chain.status, 'broken');
  assert.deepEqual(chain.broken, { seq: 1, line: 1, why: 'line-endings' });
});

test('a header-only CRLF log is broken too, so nothing anchors on CRLF bytes', () => {
  const chain = seal.verifyChain(crlf(decisions.header('crlf')), crypto.randomBytes(32));
  assert.equal(chain.status, 'broken');
  assert.deepEqual(chain.broken, { seq: 0, line: 1, why: 'line-endings' });
});

test('sealedAppend refuses to extend a CRLF log', (t) => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rh-crlf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  const file = path.join(dir, 'decisions.md');
  fs.writeFileSync(file, crlf(sealedLog(key)));
  const before = fs.readFileSync(file);
  assert.throws(() => seal.sealedAppend(file, { date: '2026-10-15', kind: 'DISCOVERY', ref: '1.1 check', body: 'x', by: 'A' }, key), /line-endings/);
  assert.ok(fs.readFileSync(file).equals(before));
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../hooks/lib/line-endings'`):
`NODE_PATH=/tmp/rh-playwright/node_modules node --test test/line-endings.test.js`

- [ ] **Step 3: Implement.** Create `hooks/lib/line-endings.js`:

```js
'use strict';
// Git for Windows checks text files out with CRLF line endings by default
// (core.autocrlf=true). The parsers split on \n and anchor headings at the end
// of a line, so a CRLF file would read as an empty canvas, or as an empty log
// that verifies. A CR before an LF is therefore refused everywhere, never
// repaired: the harness does not rewrite a ledger or a canvas.
const README_ANCHOR = 'https://github.com/DanielHeinz7/research-harness#windows-line-endings';

function firstCrlfLine(text) {
  const s = String(text || '');
  const at = s.indexOf('\r\n');
  if (at < 0) return null;
  let line = 1;
  for (let i = 0; i < at; i += 1) if (s.charCodeAt(i) === 10) line += 1;
  return line;
}

function crlfProblem(line) {
  return `line ${line}: Windows line endings (CRLF), which research-harness does not read; nothing was changed. See ${README_ANCHOR}`;
}

function crlfRefusal(file, line) {
  return `${file} has Windows line endings (CRLF) from line ${line}, so research-harness cannot read it. Nothing was changed. See ${README_ANCHOR}`;
}

module.exports = { README_ANCHOR, firstCrlfLine, crlfProblem, crlfRefusal };
```

In `canvas.js` `parseCanvas`, right after `const result = { frontmatter: fm.data, elements: [], problems: [] };`:

```js
  const crlf = lineEndings.firstCrlfLine(text);
  if (crlf) result.problems.push(lineEndings.crlfProblem(crlf));
```

(`const lineEndings = require('./line-endings');` at the top.) It must come before the frontmatter problem so `problems[0]` names the cause.

In `glossary.js` `parseGlossary`, after `parsed` is created and before the header problems are pushed, the same two lines with `parsed.problems`. `judgeable` (line 301) follows from `problems` on its own.

In `seal.js` `verifyChain`, after `const source = String(text || '');` and before `parseDecisions(source)`:

```js
  // Checked before the empty-log shortcut: a header-only CRLF log is not
  // "verified", because the first seal appended to it would anchor on CR bytes.
  const crlf = lineEndings.firstCrlfLine(source);
  if (crlf) {
    const first = decisions.parseDecisions(source.replace(/\r\n/g, '\n')).entries[0];
    return result('broken', null, [], { seq: first ? first.seq : 0, line: crlf, why: 'line-endings' }, new Set());
  }
```

In `review.js` `WHY`, add `'line-endings': 'the file has Windows line endings (CRLF), which the harness does not read (see the README, "Windows line endings")',`. In `canvas.html` `BREAK_WHY`, add `'line-endings': 'the file has Windows line endings, which research-harness cannot read'`.

- [ ] **Step 4: Run, expect PASS**: the file, then the full plugin command.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/lib/line-endings.js plugins/research-harness/hooks/lib/canvas.js plugins/research-harness/hooks/lib/glossary.js plugins/research-harness/hooks/lib/seal.js plugins/research-harness/hooks/lib/review.js plugins/research-harness/dashboard/canvas.html plugins/research-harness/test/line-endings.test.js
git commit -m "Refuse research files with Windows line endings instead of reading them as empty"
```

---

### Task 2: One refusal for every reader: loadState, the guard, the shell

**Files:**
- Modify: `plugins/research-harness/hooks/lib/state.js` (`loadState`, after line 43), `hooks/guard-promotion.js` (`canvasVerdict` line 117, `glossaryVerdict` line 238, `module.exports` line 3032), `dashboard/app.html` (`readState`, line 436; `refreshState`, line 824)
- Test: `plugins/research-harness/test/line-endings.test.js`, `test/guard-promotion.test.js`, `test/app-shell.test.js`

**Interfaces:**
- Consumes: Task 1 `firstCrlfLine`, `crlfProblem`, `crlfRefusal`.
- Produces: `loadState(root)` returns `{ error, code: 'line-endings' }` for a CRLF canvas or decision log, so `status`, `review`, `accept`, `choose`, `log` and `GET /api/state` (422) all refuse with the same sentence. `glossaryVerdict` is exported.

- [ ] **Step 1: Write the failing tests.** In `test/line-endings.test.js`:

```js
const childProcess = require('node:child_process');
const os = require('node:os');
const guard = require('../hooks/guard-promotion');
const stateLib = require('../hooks/lib/state');
const cli = path.join(__dirname, '..', 'bin', 'research-harness.js');

function crlfProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-crlf-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), crlf(CANVAS));
  fs.writeFileSync(path.join(root, 'research', 'decisions.md'), crlf(decisions.header('crlf')));
  return root;
}

test('loadState refuses a CRLF canvas with code line-endings', (t) => {
  const s = stateLib.loadState(crlfProject(t));
  assert.equal(s.code, 'line-endings');
  assert.match(s.error, /^research\/canvas\.md has Windows line endings \(CRLF\) from line 1/);
});

test('status and review print the refusal and exit non-zero', (t) => {
  const root = crlfProject(t);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-crlf-state-'));
  for (const cmd of ['status', 'review']) {
    const { CLAUDE_PROJECT_DIR: _p, RESEARCH_HARNESS_DIR: _d, ...env } = process.env;
    const r = childProcess.spawnSync(process.execPath, [cli, cmd], { cwd: root, env: { ...env, RESEARCH_HARNESS_STATE_DIR: stateDir }, encoding: 'utf8' });
    assert.notEqual(r.status, 0, cmd);
    assert.match(r.stdout + r.stderr, /Windows line endings \(CRLF\)/, cmd);
  }
});

test('the guard refuses an edit of a CRLF canvas, also one that rewrites it as LF', () => {
  assert.match(guard.canvasVerdict(crlf(CANVAS), crlf(CANVAS).replace('[proposed]', '[tentative]')), /Windows line endings/);
  assert.match(guard.canvasVerdict(crlf(CANVAS), CANVAS), /Windows line endings/);
  assert.equal(guard.canvasVerdict(CANVAS, CANVAS), null);
});

test('the guard refuses an edit of a CRLF glossary', () => {
  const before = crlf('---\nglossary-schema: 1\n---\n');
  assert.match(guard.glossaryVerdict(before, before.replace(/\r\n/g, '\n')), /Windows line endings/);
});
```

In `test/app-shell.test.js`, next to the Get-updates test:

```js
test('a project whose canvas has Windows line endings: the sidebar says so in plain words', { skip, timeout: 120000 }, async (t) => {
  const root = await makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const srv = await startApp(t, { open: root });
  const page = await openPage(t, srv);
  await page.getByText(/Windows line endings \(CRLF\)/).first().waitFor();
});
```

If `/api/app/open` refuses the CRLF project in `startApp` (it only checks that `research/canvas.md` exists, `app-api.js` line 22), the test stands as written.

- [ ] **Step 2: Run, expect FAIL** (both files).

- [ ] **Step 3: Implement.**

`state.js`, after `const decisionsText = project.readIfExists(paths.decisions) || '';`:

```js
  for (const [file, text] of [[paths.canvas, canvasText], [paths.decisions, decisionsText]]) {
    const line = lineEndings.firstCrlfLine(text);
    if (line) return { root, paths, error: lineEndings.crlfRefusal(path.relative(root, file), line), code: 'line-endings' };
  }
```

`guard-promotion.js`, first lines of `canvasVerdict` and of `glossaryVerdict`:

```js
  // A CRLF file reads as empty, so a write could not be compared with what is
  // there; the repair is git's (README, "Windows line endings"), not the agent's.
  const crlfBefore = lineEndings.firstCrlfLine(beforeText);
  if (crlfBefore) return cannotJudge(lineEndings.crlfProblem(crlfBefore));
```

For `glossaryVerdict`, pass `GLOSSARY_NEXT_STEP` as the second argument, as its other refusals do. Add `glossaryVerdict` to `module.exports`.

`app.html`: `readState` keeps returning the body on success; on a non-ok answer it shows the server's sentence in the project's outcome line and returns null:

```js
  async function readState() {
    try {
      var res = await fetch('/api/state', { headers: { 'X-Harness-Token': token } });
      var body = await res.json();
      if (res.ok) return body;
      if (body && body.error) say('out-project', 'problem', body.error);
      return null;
    } catch (err) {
      return null;
    }
  }
```

(`'problem'` is the kind the file's other failures use, e.g. `say('out-update', 'problem', …)`.)

- [ ] **Step 4: Run, expect PASS** (files, then the full plugin command).

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/lib/state.js plugins/research-harness/hooks/guard-promotion.js plugins/research-harness/dashboard/app.html plugins/research-harness/test/line-endings.test.js plugins/research-harness/test/app-shell.test.js
git commit -m "One line-endings refusal in loadState, the guard and the app shell"
```

---

### Task 3: Keep LF at the source: init, the app's clone, the README

**Files:**
- Modify: `plugins/research-harness/bin/research-harness.js` (`init` line 180, `initVariant` before line 172), `hooks/lib/app-git.js` (`clone`, line 86), `README.md` (new section after "## Try it")
- Create: `plugins/research-harness/test/line-endings-git.test.js`, `.release/unreleased/<ticket>.md`

**Interfaces:**
- Consumes: Task 1 and Task 2 refusals.
- Produces: `ensureGitattributes(root)` in `bin/research-harness.js` (writes `research/.gitattributes` = `* text eol=lf\n` when absent; returns `true` when it wrote one). `appGit.clone` runs `git clone -c core.autocrlf=false -- <url> <root>`.

- [ ] **Step 1: Write the failing test** `test/line-endings-git.test.js`. It sets `core.autocrlf=true` the way Git for Windows does, in a global config:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const appGit = require('../hooks/lib/app-git');

const cli = path.join(__dirname, '..', 'bin', 'research-harness.js');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const globalConfig = path.join(tmp('rh-autocrlf-'), 'gitconfig');
fs.writeFileSync(globalConfig, '[core]\n\tautocrlf = true\n[user]\n\tname = Seed\n\temail = seed@example.invalid\n');
process.env.GIT_CONFIG_GLOBAL = globalConfig;   // inherited by git and by the CLI below
process.env.GIT_CONFIG_NOSYSTEM = '1';

function sh(cwd, ...args) { return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' }); }
function rh(cwd, stateDir, ...args) {
  const { CLAUDE_PROJECT_DIR: _p, RESEARCH_HARNESS_DIR: _d, ...env } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, RESEARCH_HARNESS_STATE_DIR: stateDir }, encoding: 'utf8' });
}
const hasCr = (file) => fs.readFileSync(file, 'utf8').includes('\r\n');

// A project made by init, one sealed finding, pushed to a bare remote.
// `withAttributes: false` removes research/.gitattributes before the commit,
// which is what a project made before this change looks like.
function sharedProject({ withAttributes }) {
  const dir = tmp('rh-crlf-git-');
  const stateDir = path.join(dir, 'state');
  sh(dir, 'init', '-q', '--bare', '-b', 'main', 'remote.git');
  const a = path.join(dir, 'a');
  fs.mkdirSync(a);
  sh(a, 'init', '-q', '-b', 'main');
  assert.equal(rh(a, stateDir, 'init', '--project', 'crlf-probe', '--mode', 'brainstorming').status, 0);
  assert.equal(rh(a, stateDir, 'log', 'DISCOVERY', '1.1', '--body', 'A finding.').status, 0);
  if (!withAttributes) fs.rmSync(path.join(a, 'research', '.gitattributes'));
  sh(a, 'add', '-A');
  sh(a, 'commit', '-q', '-m', 'project');
  sh(a, 'remote', 'add', 'origin', path.join(dir, 'remote.git'));
  sh(a, 'push', '-q', 'origin', 'main');
  return { dir, stateDir, remote: path.join(dir, 'remote.git') };
}

test('init writes research/.gitattributes, and a hand clone under autocrlf=true stays LF and verifies', () => {
  const p = sharedProject({ withAttributes: true });
  sh(p.dir, 'clone', '-q', p.remote, 'b');
  const b = path.join(p.dir, 'b');
  assert.equal(fs.readFileSync(path.join(b, 'research', '.gitattributes'), 'utf8'), '* text eol=lf\n');
  assert.equal(hasCr(path.join(b, 'research', 'decisions.md')), false);
  assert.equal(hasCr(path.join(b, 'research', 'canvas.md')), false);
  const r = rh(b, p.stateDir, 'review');   // same state dir: the clone holds the project key
  assert.doesNotMatch(r.stdout + r.stderr, /Windows line endings/);
});

test('an older project cloned by hand gets CRLF, is refused, and the README repair makes it readable', () => {
  const p = sharedProject({ withAttributes: false });
  sh(p.dir, 'clone', '-q', p.remote, 'b');
  const b = path.join(p.dir, 'b');
  assert.equal(hasCr(path.join(b, 'research', 'decisions.md')), true);
  for (const cmd of ['status', 'review']) assert.match(((r) => r.stdout + r.stderr)(rh(b, p.stateDir, cmd)), /Windows line endings \(CRLF\)/, cmd);
  assert.equal(sh(b, 'status', '--porcelain'), '');            // the README's precondition
  sh(b, 'config', 'core.autocrlf', 'false');                   // the README's two commands
  sh(b, 'checkout', '--', 'research');
  assert.equal(hasCr(path.join(b, 'research', 'decisions.md')), false);
  assert.doesNotMatch(((r) => r.stdout + r.stderr)(rh(b, p.stateDir, 'review')), /Windows line endings/);
});

test('the app clones an older project with LF', async () => {
  const p = sharedProject({ withAttributes: false });
  const r = await appGit.clone({ url: `file://${p.remote}`, parent: p.dir, folder: 'c' });
  assert.equal(r.ok, true, r.error);
  assert.equal(hasCr(path.join(p.dir, 'c', 'research', 'decisions.md')), false);
  assert.equal(sh(path.join(p.dir, 'c'), 'config', '--local', 'core.autocrlf').trim(), 'false');
});

test('init leaves an existing research/.gitattributes and a root .gitattributes alone', () => {
  const root = tmp('rh-attrs-');
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.pdf binary\n');
  fs.writeFileSync(path.join(root, 'research', '.gitattributes'), '# mine\n');
  assert.equal(rh(root, path.join(root, '.state'), 'init', '--project', 'x', '--mode', 'import').status, 0);
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'), '*.pdf binary\n');
  assert.equal(fs.readFileSync(path.join(root, 'research', '.gitattributes'), 'utf8'), '# mine\n');
});
```

The app-clone test uses a `file://` link: set `process.env.RESEARCH_HARNESS_GIT_PROTOCOLS = 'file'` for that test only and restore it after, as `app-git.test.js` does when it clones local remotes (grep `RESEARCH_HARNESS_GIT_PROTOCOLS` there and copy its pattern, including how it passes `isLink`). If `isLink` refuses `file://`, clone through the helper `app-git.test.js` uses for local remotes instead.

- [ ] **Step 2: Run, expect FAIL** (no `.gitattributes`; the app clone gets CRLF).

- [ ] **Step 3: Implement.** In `bin/research-harness.js`:

```js
// research/.gitattributes keeps every research file LF in every checkout, also
// under Git for Windows' default core.autocrlf=true; without it the canvas and
// the log are refused there (README, "Windows line endings"). A file that is
// already there is the researcher's and stays as it is.
function ensureGitattributes(root) {
  const file = path.join(root, 'research', '.gitattributes');
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, '* text eol=lf\n');
  return true;
}
```

Call it in `init` after the canvas and log are written, and in `initVariant` after `fs.mkdirSync(path.dirname(canvasFile), …)`. Add `research/.gitattributes` to the "Created …" line when it returned `true`. Grep `test/` for the old "Created " wording first (`grep -rn "Created research" plugins/research-harness/test`) and update every assertion it breaks.

In `app-git.js` `clone`:

```js
  // -c writes core.autocrlf=false into the new clone's own config before any
  // file is checked out, so this clone and its later pulls keep LF even where
  // Git for Windows set core.autocrlf=true globally (spec 4.2, layer 2).
  const r = await git(parent, ['clone', '-c', 'core.autocrlf=false', '--', url, root]);
```

In `README.md`, after "## Try it", add:

```markdown
## Windows

research-harness runs on Windows in a browser tab; see "Install on Windows" below once it ships.

### Windows line endings

Git for Windows checks out text files with Windows line endings (CRLF) unless told otherwise.
research-harness reads only LF, so it refuses a canvas or decision log with CRLF and changes
nothing. Projects created with research-harness 0.6 or later carry `research/.gitattributes`, which
keeps LF in every checkout, and the desktop app clones with LF.

To repair a copy you cloned yourself: first run `git status` in the project folder. If it lists no
changes of your own, run

    git config core.autocrlf false
    git checkout -- research

If it does list changes of yours, commit or copy them away first; `git checkout -- research`
replaces the research files with the committed ones.
```

Use the real next version number instead of 0.6 (read `plugins/research-harness/.claude-plugin/plugin.json`; the next minor). The first paragraph under "## Windows" is replaced by Task 7.

Write the release fragment: CRLF files are now refused with a plain message instead of being read as empty; `init` writes `research/.gitattributes`; the app clones with LF; the README has the repair.

- [ ] **Step 4: Run, expect PASS** (file, then the full plugin command).

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/bin/research-harness.js plugins/research-harness/hooks/lib/app-git.js plugins/research-harness/test/line-endings-git.test.js README.md .release/unreleased/
git commit -m "Keep research files LF: init writes research/.gitattributes, the app clones with core.autocrlf=false"
```

- [ ] **Step 6: Hand back for a release.** Wave 1 ships as a plugin release of its own (spec 4.3). Releasing publishes a tool people use, so it waits for the owner: report that wave 1 is on `main` and name the command, `node scripts/release.js <version> "<summary>"`, without running it.

---

## Wave 2: Windows in the browser (spec sections 5 to 7; comes last)

### Task 4: `host.js`, what differs by operating system

**Files:**
- Create: `plugins/research-harness/hooks/lib/host.js`, `plugins/research-harness/test/host.test.js`

**Interfaces:**
- Produces (all pure; platform, env and versions are parameters):
  - `normalizePath(p: unknown): unknown`: for a string, trim, then strip one pair of surrounding double quotes, then trim again; anything else unchanged.
  - `oneDriveOf(p: string, { platform, env }): string | null`: on `win32`, the value of `env.OneDrive`, `env.OneDriveCommercial` or `env.OneDriveConsumer` that contains `p` (compared case-insensitively with `path.win32`); otherwise `null`.
  - `hostInfo({ platform, home }): { platform, home, sep }`, with `sep` `'\\'` on win32 and `'/'` elsewhere.
  - `startNotes({ platform, nodeVersion, gitFound }): { refuse: string | null, lines: string[] }`.
  - `installCliRefusal(platform): string | null`.
  - `gitMissingHint(platform): string` (empty string off win32).
  - Constants `NODE_FLOOR = 22`, `KEEP_OPEN`, `GIT_FOR_WINDOWS = 'https://git-scm.com/download/win'`.

- [ ] **Step 1: Write the failing tests** `test/host.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const host = require('../hooks/lib/host');

test('normalizePath strips spaces and one pair of quotes, nothing else', () => {
  assert.equal(host.normalizePath('  "C:\\Users\\x\\paper"  '), 'C:\\Users\\x\\paper');
  assert.equal(host.normalizePath('/Users/x/paper'), '/Users/x/paper');
  assert.equal(host.normalizePath('"/Users/x/my "paper""'), '/Users/x/my "paper"');
  assert.equal(host.normalizePath('"'), '"');
  assert.equal(host.normalizePath(undefined), undefined);
});

test('oneDriveOf finds a folder inside OneDrive on Windows only', () => {
  const env = { OneDrive: 'C:\\Users\\x\\OneDrive - KIT', OneDriveConsumer: 'C:\\Users\\x\\OneDrive' };
  assert.equal(host.oneDriveOf('C:\\Users\\x\\OneDrive - KIT\\Documents\\paper', { platform: 'win32', env }), 'C:\\Users\\x\\OneDrive - KIT');
  assert.equal(host.oneDriveOf('c:\\users\\X\\onedrive\\p', { platform: 'win32', env }), 'C:\\Users\\x\\OneDrive');
  assert.equal(host.oneDriveOf('C:\\Users\\x\\research', { platform: 'win32', env }), null);
  assert.equal(host.oneDriveOf('C:\\Users\\x\\OneDriveX\\p', { platform: 'win32', env: { OneDrive: 'C:\\Users\\x\\OneDrive' } }), null);
  assert.equal(host.oneDriveOf('/Users/x/OneDrive/p', { platform: 'darwin', env: { OneDrive: '/Users/x/OneDrive' } }), null);
});

test('hostInfo carries the separator the page joins paths with', () => {
  assert.deepEqual(host.hostInfo({ platform: 'win32', home: 'C:\\Users\\x' }), { platform: 'win32', home: 'C:\\Users\\x', sep: '\\' });
  assert.deepEqual(host.hostInfo({ platform: 'darwin', home: '/Users/x' }), { platform: 'darwin', home: '/Users/x', sep: '/' });
});

test('startNotes: Node below the floor refuses; git missing is a line, not a refusal', () => {
  assert.match(host.startNotes({ platform: 'win32', nodeVersion: '20.11.0', gitFound: true }).refuse, /needs Node\.js 22 or newer/);
  const noGit = host.startNotes({ platform: 'win32', nodeVersion: '22.0.0', gitFound: false });
  assert.equal(noGit.refuse, null);
  assert.ok(noGit.lines.some((l) => l.includes('https://git-scm.com/download/win')));
  const fine = host.startNotes({ platform: 'darwin', nodeVersion: '24.16.0', gitFound: true });
  assert.deepEqual(fine, { refuse: null, lines: [host.KEEP_OPEN] });
  assert.ok(host.startNotes({ platform: 'darwin', nodeVersion: '24.0.0', gitFound: false }).lines.some((l) => /Git was not found/.test(l)));
});

test('install-cli refuses on Windows only; the git hint is Windows only', () => {
  assert.match(host.installCliRefusal('win32'), /Start research-harness\.cmd/);
  assert.equal(host.installCliRefusal('darwin'), null);
  assert.match(host.gitMissingHint('win32'), /git-scm\.com\/download\/win/);
  assert.equal(host.gitMissingHint('linux'), '');
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `hooks/lib/host.js`:

```js
'use strict';
// What differs by operating system, as pure functions: the caller passes the
// platform, the environment and the versions, so tests on macOS can ask the
// Windows questions (sub-project 5; nothing here has run on Windows).
const path = require('node:path');

const NODE_FLOOR = 22;
const GIT_FOR_WINDOWS = 'https://git-scm.com/download/win';
const KEEP_OPEN = 'research-harness is running in your browser. Keep this window open while you work; close it to stop.';

function normalizePath(p) {
  if (typeof p !== 'string') return p;
  const t = p.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

function oneDriveOf(p, { platform, env }) {
  if (platform !== 'win32' || typeof p !== 'string') return null;
  for (const name of ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']) {
    const root = env && env[name];
    if (!root) continue;
    const rel = path.win32.relative(root.toLowerCase(), p.toLowerCase());
    if (rel === '' || (!rel.startsWith('..') && !path.win32.isAbsolute(rel))) return root;
  }
  return null;
}

function hostInfo({ platform, home }) {
  return { platform, home, sep: platform === 'win32' ? '\\' : '/' };
}

function startNotes({ platform, nodeVersion, gitFound }) {
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!(major >= NODE_FLOOR)) {
    return { refuse: `research-harness needs Node.js ${NODE_FLOOR} or newer (this is ${nodeVersion}). Install it from https://nodejs.org, then start research-harness again.`, lines: [] };
  }
  const lines = [];
  if (!gitFound) {
    lines.push(platform === 'win32'
      ? `Git was not found. Opening a project and running a meeting work without it; to clone, get updates and send, install Git for Windows from ${GIT_FOR_WINDOWS} and start research-harness again.`
      : 'Git was not found. Opening a project and running a meeting work without it; clone, get updates and send need git.');
  }
  lines.push(KEEP_OPEN);
  return { refuse: null, lines };
}

function installCliRefusal(platform) {
  return platform === 'win32'
    ? 'install-cli writes a shell command for macOS and Linux. On Windows, start research-harness with Start research-harness.cmd.'
    : null;
}

function gitMissingHint(platform) {
  return platform === 'win32' ? ` Install Git for Windows from ${GIT_FOR_WINDOWS} and start research-harness again.` : '';
}

module.exports = { NODE_FLOOR, GIT_FOR_WINDOWS, KEEP_OPEN, normalizePath, oneDriveOf, hostInfo, startNotes, installCliRefusal, gitMissingHint };
```

- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/lib/host.js plugins/research-harness/test/host.test.js
git commit -m "host.js: what differs by operating system, as pure functions"
```

---

### Task 5: Server side: app routes, serve --app, install-cli, git-missing

**Files:**
- Modify: `plugins/research-harness/hooks/lib/app-api.js` (routes, line 54 onward), `hooks/lib/app-git.js` (`git-missing`, line 35), `bin/research-harness.js` (`serve` line 849, `installCli` line 1163)
- Test: `test/app-api.test.js`, `test/app-git.test.js`, `test/serve.test.js`, `test/install-cli.test.js`

**Interfaces:**
- Consumes: Task 4 `normalizePath`, `oneDriveOf`, `hostInfo`, `startNotes`, `installCliRefusal`, `gitMissingHint`; `appGit.gitBinary()`.
- Produces: every route receives its body with `root`, `parent`, `out` and `keyFile` passed through `normalizePath`. The routes read `ctx.platform || process.platform` and `ctx.env || process.env`. `projects` answers `host: { platform, home, sep }`. `init` and `clone` answer `{ ok: false, code: 'onedrive', error }` for a target inside OneDrive on win32; `open` there succeeds and adds `warning`. `serve --app` prints the URL and then each of `startNotes(...).lines`, or refuses with exit 1.

- [ ] **Step 1: Write the failing tests.** In `test/app-api.test.js`, with its `tmp()` and `context()` helpers and one new helper:

```js
async function newProject() {
  const r = await routes.init({ parent: tmp(), folder: 'paper', mode: 'brainstorming' }, context(tmp()));
  assert.equal(r.ok, true, r.error);
  return r.current;
}

test('a quoted, padded path reaches the same check as a clean one', async () => {
  const root = await newProject();
  const ctx = context(tmp());
  assert.equal((await routes.open({ root: `  "${root}"  ` }, ctx)).ok, true);
});

test('projects carries the host: platform, home and separator', async () => {
  const res = await routes.projects({}, { ...context(tmp()), platform: 'win32' });
  assert.equal(res.host.platform, 'win32');
  assert.equal(res.host.sep, '\\');
  assert.equal(typeof res.host.home, 'string');
});

test('on Windows, init and clone refuse a folder inside OneDrive; open warns', async () => {
  const parent = tmp();
  const ctx = { ...context(tmp()), platform: 'win32', env: { OneDrive: parent } };
  const made = await routes.init({ parent, folder: 'paper', mode: 'brainstorming' }, ctx);
  assert.equal(made.code, 'onedrive');
  assert.match(made.error, /synced by OneDrive/);
  assert.equal(fs.existsSync(path.join(parent, 'paper')), false);
  const cloned = await routes.clone({ url: 'https://example.invalid/a.git', parent, folder: 'p2' }, ctx);
  assert.equal(cloned.code, 'onedrive');
  const root = await newProject();
  const opened = await routes.open({ root }, { ...context(tmp()), platform: 'win32', env: { OneDrive: path.dirname(root) } });
  assert.equal(opened.ok, true);
  assert.match(opened.warning, /OneDrive/);
});
```

(`oneDriveOf` compares with `path.win32`, which accepts the posix temp paths as written.)

In `test/app-git.test.js`, next to its git-missing test (grep `git-missing`): the error ends with `gitMissingHint(process.platform)`; assert on darwin that the message is unchanged, and test the hint itself in Task 4 already.

In `test/serve.test.js`:

```js
test('serve --app prints the URL, then the keep-open line', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-serve-app-'));
  const child = childProcess.spawn(process.execPath, [cli, 'serve', '--app', '--no-open', '--app-data', appDataDir()], { cwd });
  t.after(() => child.kill());
  let out = '';
  for await (const chunk of child.stdout) { out += chunk; if (out.includes('Keep this window open')) break; }
  assert.match(out, /^http:\/\/127\.0\.0\.1:\d+\/app#c=[0-9a-f]{32}\n/);
  assert.match(out, /Keep this window open while you work; close it to stop\./);
});
```

`cli` (line 20) and `appDataDir()` (line 503) are the file's own; add `childProcess` and `os` requires if the file lacks them.

In `test/install-cli.test.js`: `host.installCliRefusal` is covered in Task 4. Here, only assert that `installCli` consults it: run the CLI with `install-cli --dir <tmp>` on darwin and expect today's behaviour (unchanged test). No platform override is added to the CLI for testing.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

`app-api.js`:

```js
const os = require('node:os');
const host = require('./host');

const platformOf = (ctx) => ctx.platform || process.platform;
const envOf = (ctx) => ctx.env || process.env;

function oneDriveRefusal(ctx, target) {
  const root = host.oneDriveOf(target, { platform: platformOf(ctx), env: envOf(ctx) });
  if (!root) return null;
  const example = path.win32.join(os.homedir(), 'research');
  return { ok: false, code: 'onedrive', error: `This folder is synced by OneDrive (${root}). Git and OneDrive both change the files in .git and get in each other's way. Choose a folder outside OneDrive, for example ${example}.` };
}
```

In `projects`, add `host: host.hostInfo({ platform: platformOf(ctx), home: os.homedir() })`. In `init` and `clone`, after the parent check: `const od = oneDriveRefusal(ctx, path.join(b.parent, b.folder)); if (od) return od;`. In `open`, after `makeCurrent`, when `host.oneDriveOf(b.root, …)` returns a root, add `warning: 'This project lies in a folder synced by OneDrive. If git reports odd changes or locked files, move it to a folder outside OneDrive.'` to the result.

At the end of the file, before `module.exports`, wrap every route once so each receives normalised paths:

```js
// A path pasted from File Explorer's "Copy as path" arrives in quotes, and one
// typed by hand may carry spaces; both reach the same checks as a clean path.
const PATH_KEYS = ['root', 'parent', 'out', 'keyFile'];
for (const name of Object.keys(routes)) {
  const handler = routes[name];
  routes[name] = (b, ctx) => {
    const body = { ...(b || {}) };
    for (const k of PATH_KEYS) if (k in body) body[k] = host.normalizePath(body[k]);
    return handler(body, ctx);
  };
}
```

`app-git.js`, the `git-missing` message: `` `Git was not found (${gitBinary()}).${host.gitMissingHint(process.platform)}` `` (with `const host = require('./host');`).

`bin/research-harness.js` `serve`, at the top of the app-mode branch, before `canvasServe.start`:

```js
  if (appMode) {
    const probe = childProcess.spawnSync(require('../hooks/lib/app-git').gitBinary(), ['--version'], { encoding: 'utf8' });
    const notes = host.startNotes({ platform: process.platform, nodeVersion: process.versions.node, gitFound: !probe.error });
    if (notes.refuse) return fail(notes.refuse);
    startLines = notes.lines;
  }
```

and after `say(url);`: `for (const line of startLines) say(line);` (declare `let startLines = [];` at the top of `serve`). `installCli`, first line: `const refusal = host.installCliRefusal(process.platform); if (refusal) return fail(refusal, 2);`.

Node floor check: run the plugin suite once with the oldest Node on this Mac at or above 20, as a lower bound for the floor of 22: `ls "$NVM_DIR/versions/node"`; use a `v22*` if present, else `v20.20.2`: `"$NVM_DIR/versions/node/<v>/bin/node" --test --test-timeout=120000 test/*.test.js` after `npm ci` in the repository root (Playwright is a root dev dependency since SQ-231; shell glob, since `node --test` globs need Node 21+). Write in the commit body which version ran and what failed; a failure only below 22 does not block.

- [ ] **Step 4: Run, expect PASS** (files, then the full plugin command).

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/lib/app-api.js plugins/research-harness/hooks/lib/app-git.js plugins/research-harness/bin/research-harness.js plugins/research-harness/test/app-api.test.js plugins/research-harness/test/app-git.test.js plugins/research-harness/test/serve.test.js
git commit -m "Windows in the server: normalised paths, OneDrive refusal, start notes, install-cli refusal"
```

---

### Task 6: The shell page in a browser: hints, prefill, Copy path, a used link

**Files:**
- Modify: `plugins/research-harness/dashboard/app.html` (templates lines 280–380, `LINK_USED` line 412, the minutes and invite outcomes lines 712–721, page start line 913)
- Test: `plugins/research-harness/test/app-shell.test.js` (`openPage` gains a `userAgent` option)

**Interfaces:**
- Consumes: Task 5 `host` in `GET /api/app/projects`, `warning` from `open`, code `onedrive`.
- Produces: no new contract; browser mode only (`window.harnessHost` absent). With a host, nothing changes.

Design work in the galley-proof world, as in sub-project 1 Task 7: before the first UI edit, load the `impeccable` skill, run its `context --target plugins/research-harness/dashboard/app.html`, and reuse the tokens and the `.hint` and `.outcome` styles already in the file. No new colours.

- [ ] **Step 1: Write the failing rendered tests** in `app-shell.test.js`. Extend `openPage` with `userAgent` (passed to `browser.newPage({ viewport, colorScheme, userAgent })`), then:

```js
test('browser mode: a path pasted with quotes opens the project', { skip, timeout: 120000 }, async (t) => {
  const root = await makeProject();
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('button', { name: 'Open project…' }).first().click();
  await page.getByLabel(/Project folder/).fill(`"${root}"`);
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await page.locator('#proj-name').waitFor();
});

test('browser mode: path fields start in the home folder and say how to copy a path', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('button', { name: 'New project…' }).first().click();
  assert.equal(await page.getByLabel(/Folder to create it in/).inputValue(), os.homedir());
  await page.getByText(/Option\+Command\+C/).first().waitFor();
});

test('browser mode: after Export minutes, the path and a Copy path button', { skip, timeout: 120000 }, async (t) => {
  const root = await makeProject();
  const srv = await startApp(t, { open: root });
  const page = await openPage(t, srv);
  const out = path.join(tmp(), 'minutes.md');
  await page.getByRole('button', { name: 'Start session…' }).click();
  await page.getByLabel('What is the occasion?').fill('Supervision');
  await page.locator('#dlg').getByRole('button', { name: 'Start session' }).click();
  await page.locator('#live').waitFor();
  await page.getByRole('button', { name: 'Export minutes…' }).click();
  await page.getByLabel('Save the minutes as').fill(out);
  await page.locator('#dlg').getByRole('button', { name: 'Export minutes' }).click();
  await page.locator('#out-meeting').getByText(out).waitFor();
  await page.locator('#out-meeting').getByRole('button', { name: 'Copy path' }).waitFor();
});

test('a used link in a Windows browser names the start file', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const first = await openPage(t, srv);                                  // redeems the code
  await first.locator('#out-start, #proj-name').first().waitFor();
  const again = await openPage(t, srv, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36' });
  await again.getByText(/double-click Start research-harness again/).waitFor();
});
```

The session and minutes steps are the ones the existing meeting test uses (`app-shell.test.js` lines 277–290).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `app.html`:
  - After `api('projects')` resolves, keep `res.host` in a variable `hostInfo`. When `host` (the bridge) is null, `prefill(form)` sets each empty path field: `parent` and `root` to `hostInfo.home`; `out` and `keyFile` to `hostInfo.home + hostInfo.sep + <the suggested name the picker uses>` (`saveName() + '-minutes.md'`, `saveName() + '.seal.key'`; `keyFile` stays empty).
  - Each path field's `data-plain` hint gets its second sentence from `hostInfo.platform`: win32 "In File Explorer, right-click the folder (Shift+right-click on Windows 10) and choose Copy as path, then paste it here."; otherwise "In Finder, select it and press Option+Command+C, then paste it here." Also give the two parent fields (lines 283 and 318) a `data-plain` hint, so all six fields carry one.
  - On win32 without a bridge, the Clone dialog's hint adds: "Use the https link; an ssh link needs a key set up in a terminal."
  - Minutes and invite outcomes without a bridge: after `say(...)`, append a button `Copy path` to the outcome line that calls `navigator.clipboard.writeText(path)` and then sets its own text to `Copied`. Focus stays where `restoreFocus` puts it.
  - `LINK_USED`: when `host` is null, use "This page was opened before. Close the research-harness window and double-click Start research-harness again." if `/Windows/.test(navigator.userAgent)`, else "This page was opened before. Stop research-harness serve --app with Ctrl+C and start it again." With a bridge, keep today's sentence.
  - An `open` answer with `warning` shows it with `say('out-project', 'problem', res.warning)` after the project has opened: the project is usable, and the line asks the person to act.
  - The `onedrive` code needs no new handling: its `error` shows next to the dialog's submit button like every refusal.

- [ ] **Step 4: Run, expect PASS** (file, then the full plugin command). Capture `.impeccable/review/app-browser-windows.png` (1440×900, light, Windows user agent, the Open project dialog) with headless Chrome against `research-harness serve --app --no-open`.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/dashboard/app.html plugins/research-harness/test/app-shell.test.js .impeccable/review/app-browser-windows.png
git commit -m "Shell page in a browser: path hints, prefill, Copy path, a used link that names the start file"
```

---

### Task 7: The Windows zip

**Files:**
- Create: `windows/Start research-harness.cmd`, `windows/README.txt`, `scripts/windows-zip.js`, `scripts/windows-zip.test.js`
- Modify: `README.md` (the "## Windows" section from Task 3), `.release/unreleased/<ticket>.md`

**Interfaces:**
- Produces: `node scripts/windows-zip.js <version> [--out <dir>]` writes `<out>/research-harness-windows.zip` (default `out`: a new temp folder), prints its path, exits 0; exit 2 on a missing version. `buildWindowsZip({ version, out, repo })` returns the zip's path (exported for `release.js`).

- [ ] **Step 1: Write the failing test** `scripts/windows-zip.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildWindowsZip } = require("./windows-zip");

const REPO = path.resolve(__dirname, "..");
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test("the zip holds the start file, README.txt and the plugin without test/", function (t) {
  const out = tmp("rh-winzip-");
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const zip = buildWindowsZip({ version: "9.9.9", out, repo: REPO });
  assert.strictEqual(path.basename(zip), "research-harness-windows.zip");
  cp.execFileSync("/usr/bin/unzip", ["-q", zip, "-d", path.join(out, "x")]);
  const top = path.join(out, "x", "research-harness-9.9.9-windows");
  assert.deepStrictEqual(fs.readdirSync(top).sort(), ["README.txt", "Start research-harness.cmd", "research-harness"]);
  assert.ok(fs.existsSync(path.join(top, "research-harness", "bin", "research-harness.js")));
  assert.ok(fs.existsSync(path.join(top, "research-harness", "dashboard", "app.html")));
  assert.ok(!fs.existsSync(path.join(top, "research-harness", "test")));
  for (const name of ["Start research-harness.cmd", "README.txt"]) {
    const bytes = fs.readFileSync(path.join(top, name));
    assert.ok(bytes.every((b) => b < 128), name + " is ASCII");
    const text = bytes.toString("latin1");
    assert.strictEqual(text.split("\r\n").length - 1, text.split("\n").length - 1, name + " has CRLF on every line");
  }
  assert.match(fs.readFileSync(path.join(top, "Start research-harness.cmd"), "latin1"), /serve --app/);
});

test("the unzipped copy starts in app mode and serves the shell page", async function (t) {
  const out = tmp("rh-winzip-run-");
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  cp.execFileSync("/usr/bin/unzip", ["-q", buildWindowsZip({ version: "9.9.9", out, repo: REPO }), "-d", path.join(out, "x")]);
  const cli = path.join(out, "x", "research-harness-9.9.9-windows", "research-harness", "bin", "research-harness.js");
  const child = cp.spawn(process.execPath, [cli, "serve", "--app", "--no-open", "--app-data", tmp("rh-winzip-data-")], { cwd: out });
  t.after(() => child.kill());
  let text = "";
  for await (const chunk of child.stdout) { text += chunk; if (/#c=[0-9a-f]{32}/.test(text)) break; }
  const url = new URL(text.match(/http:\/\/\S+/)[0]);
  const res = await fetch(url.origin + "/app");
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /<html/);
});

test("a missing version exits 2", function () {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, "windows-zip.js")], { encoding: "utf8" });
  assert.strictEqual(r.status, 2);
});
```

- [ ] **Step 2: Run, expect FAIL**: `node --test scripts/windows-zip.test.js` (repo root).

- [ ] **Step 3: Implement.**

`windows/Start research-harness.cmd`, stored with LF in the repository; the build writes CRLF:

```bat
@echo off
title research-harness
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node "research-harness\bin\research-harness.js" serve --app
if errorlevel 1 pause
exit /b
:nonode
echo research-harness needs Node.js 22 or newer.
echo Install it from https://nodejs.org, then double-click this file again.
pause
```

`windows/README.txt`, ASCII, short lines:

```
research-harness for Windows

Before the first start, install two programs, each with its installer's defaults:
  1. Git for Windows: https://git-scm.com/download/win
  2. Node.js, the LTS version (22 or newer): https://nodejs.org
The Node installer may ask for administrator rights. On a managed machine, ask your IT.

Start: double-click "Start research-harness.cmd". A black window opens, then your browser.
The first time, Windows may warn that the publisher could not be verified. Choose Run
(or More info, then Run anyway).

Keep the black window open while you work. Closing it stops research-harness.
Do not reload the browser page. If you did, or closed the tab, close the black window and
double-click "Start research-harness.cmd" again.

Keep your projects outside OneDrive, for example in C:\Users\<your name>\research.
Use the https link of a shared project; an ssh link needs a key set up in a terminal.

Update: download the new research-harness-windows.zip and replace this folder. Your projects
and your list of recent projects are stored elsewhere and stay.

Nothing in this package has been tested on Windows yet.
```

`scripts/windows-zip.js`:

```js
#!/usr/bin/env node
"use strict";
// Builds research-harness-windows.zip for the GitHub release (sub-project 5):
// the plugin without test/, a start file and README.txt with CRLF line endings,
// zipped with macOS's /usr/bin/zip. Runs on the release Mac; nothing here runs
// on Windows.
//
//   node scripts/windows-zip.js <version> [--out <dir>]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

const ASSET = "research-harness-windows.zip";

function crlf(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function buildWindowsZip({ version, out, repo }) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "rh-winzip-stage-"));
  try {
    const top = "research-harness-" + version + "-windows";
    const dir = path.join(stage, top);
    fs.mkdirSync(dir);
    fs.cpSync(path.join(repo, "plugins", "research-harness"), path.join(dir, "research-harness"), {
      recursive: true,
      filter: function (src) { return path.basename(src) !== "test" && path.basename(src) !== "node_modules"; },
    });
    fs.writeFileSync(path.join(dir, "Start research-harness.cmd"), crlf(path.join(repo, "windows", "Start research-harness.cmd")));
    fs.writeFileSync(path.join(dir, "README.txt"), crlf(path.join(repo, "windows", "README.txt")));
    fs.mkdirSync(out, { recursive: true });
    const zip = path.join(out, ASSET);
    fs.rmSync(zip, { force: true });
    cp.execFileSync("/usr/bin/zip", ["-q", "-r", "-X", zip, top], { cwd: stage });
    return zip;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const version = args[0];
  if (!version || version.startsWith("--")) {
    process.stderr.write("usage: node scripts/windows-zip.js <version> [--out <dir>]\n");
    process.exit(2);
  }
  const at = args.indexOf("--out");
  const out = at >= 0 && args[at + 1] ? path.resolve(args[at + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), "rh-winzip-"));
  process.stdout.write(buildWindowsZip({ version: version, out: out, repo: path.resolve(__dirname, "..") }) + "\n");
}

module.exports = { ASSET, buildWindowsZip };
```

The `filter` drops every folder named `test`; check with `find plugins/research-harness -name test -type d` that only `plugins/research-harness/test` exists, so nothing else is dropped. Also check that nothing private or large is in the plugin directory (`du -sh plugins/research-harness/*`) and say in the commit body how large the zip is.

`README.md`: replace the placeholder paragraph under "## Windows" with an "Install on Windows" part: the two installers with links, the download link `https://github.com/DanielHeinz7/research-harness/releases/latest/download/research-harness-windows.zip`, double-click `Start research-harness.cmd`, keep the black window open, keep projects outside OneDrive, and the sentence that nothing has been tested on Windows. Keep "### Windows line endings" below it.

Release fragment: Windows users can run research-harness in a browser from a zip on the release page; untested on Windows.

- [ ] **Step 4: Run, expect PASS** (`node --test scripts/*.test.js` in the repo root).

- [ ] **Step 5: Commit**

```bash
git add windows/ scripts/windows-zip.js scripts/windows-zip.test.js README.md .release/unreleased/
git commit -m "Windows zip: start file, README.txt and the plugin, built on the release Mac"
```

---

### Task 8: Attach the zip to every release

**Files:**
- Modify: `scripts/release.js` (the step list, lines 243–267), `scripts/release.test.js` (the fixture and the full-release assertions)

**Interfaces:**
- Consumes: Task 7 `buildWindowsZip`, `ASSET`.
- Produces: `gh release create <tag> <zip> --verify-tag --title <version> --notes-file <file> --latest`; the zip is built after the version commit into a temp folder that is removed after `gh`, like the notes file. `--dry-run` lists the build step.

Sub-project 4 also changes this step (its spec §4.4: DMGs, zips, `latest-mac.yml`). If it has landed, add the Windows zip to the same asset list, unconditionally; if not, add it alone and leave the list shape easy to extend. On the board this task waits for sub-project 4, Task 5 (cross-plan note in the sub-project 4 plan, 2026-10-15).

- [ ] **Step 1: Write the failing test.** In `release.test.js`, make the fixture copy `scripts/windows-zip.js`, `windows/` and a minimal `plugins/research-harness/bin/research-harness.js` into the fixture repo (read how `fixture()` builds the repo and extend it the same way). Change the full-release test's `gh` assertion to:

```js
  assert.match(fs.readFileSync(fx.ghLog, "utf8"), /^release create v0\.4\.0 \S+\/research-harness-windows\.zip --verify-tag --title 0\.4\.0 --notes-file \S+ --latest\n$/);
  assert.deepStrictEqual(fs.readdirSync(path.join(fx.dir, "tmp")), [], "the notes file and the zip are gone after gh");
```

and the dry-run test to expect a line matching `/build research-harness-windows\.zip/` in the planned commands, with no zip written anywhere under the fixture.

If the stub `gh` keeps a copy of the notes (`fx.ghNotes`), have it record the asset's existence too (`test -f "$2"` style, in the stub's own language), so the test proves the zip existed when `gh` ran.

- [ ] **Step 2: Run, expect FAIL**: `node --test scripts/release.test.js`.

- [ ] **Step 3: Implement** in `release.js`: `const { buildWindowsZip } = require("./windows-zip");`. Before the `gh release create` step, a step `{ label: "build research-harness-windows.zip", do: … }` that builds into `fs.mkdtempSync(path.join(os.tmpdir(), "rh-release-zip-"))` and keeps the path in a variable the `gh` step reads. The `gh` step passes the zip right after the tag and removes the zip's folder in its `finally`, next to the notes file's. In `--dry-run`, the label is printed and nothing is built, as for every other step.

- [ ] **Step 4: Run, expect PASS** (`node --test scripts/*.test.js`), then a real dry run in the repo root: `node scripts/release.js 0.0.0-dry "dry" --dry-run`, and check that the plan lists the build step.

- [ ] **Step 5: Commit**

```bash
git add scripts/release.js scripts/release.test.js
git commit -m "release.js attaches research-harness-windows.zip to every release"
```

---

## After the last task

The orchestrator runs both suites on the merged tree, then reports to the owner: what landed, the zip's size, which Node version ran the lower-bound check, and that nothing ran on Windows. Releasing waits for the owner.
