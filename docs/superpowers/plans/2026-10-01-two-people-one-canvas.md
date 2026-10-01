# Two People, One Canvas (0.5, spec §2–§8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two people run a supervision session on one canvas from one machine or two git clones: every log entry names its author, sessions are marked in the log, two clones' logs merge into one sealed chain, the agenda before and the protocol after a session come out of the CLI, a second clone is set up without a new key, and the view shows and filters by name.

**Architecture:** The sealed log `decisions.md` stays the single record. A `By` field joins the body (already under seal, so `sealOf` does not change). Two new entry kinds, `SESSION` and `MERGE`, are written only by their own commands. New pure libraries — `identity.js`, `merge.js`, `protocol.js`, `agenda.js` — hold the logic; `bin/research-harness.js` maps them to commands. The guard keeps its allowlist: every new writing subcommand is denied to the model by default, and only the read-only `agenda` and `session protocol` (without `--out`) are let through.

**Tech Stack:** Node.js (CommonJS, no dependencies), `node:test`, `git` on PATH, plain HTML/JS dashboard.

**Spec:** `docs/superpowers/specs/2026-10-01-research-harness-0.5-design.md`, §2–§8 and §10.1. Base design: `docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md` §4.4, §4.7.

## Global Constraints

- Everything in the repo is English.
- No new npm dependencies.
- The seal formula in `hooks/lib/seal.js` `sealOf` does not change; every existing seal keeps verifying.
- The tool never deletes or rewrites a sealed entry in place. `merge-log` re-seals *moved copies* of the user's own entries onto the other clone's chain; nothing else rewrites the log.
- No command prints the sealing key. The key never goes on a command line, into the repo, or into a test's stdout.
- `By` is a statement, not proof. No text may call it an identity check.
- Every message goes to stdout (`say`/`fail` in `bin/research-harness.js`); refusals exit 1, malformed calls exit 2.
- `bin/research-harness.js` and `bin/canvas-serve.js` contain the word `serve`; the guard refuses a shell command whose text names it. Edit these files with the Edit tool, never with a sed/python heredoc. `research-harness serve` cannot be started from Bash.
- A ticket writes only its own release fragment `.release/unreleased/SQ-<n>.md`.
- Run the suite from `plugins/research-harness`: `node --test test/*.test.js`. Baseline before this plan: 351 tests, 351 pass. Also `node --test scripts/release.test.js verification/probe-benign.test.js` (22 pass) and `node verification/SQ-29/probe-perimeter.js` (exit 0) from the repo root.
- Test fixtures use invented data only (names like "A. Researcher", "B. Supervisor"; paths under `os.tmpdir()`).
- A shell `#` starts a comment: `--skip-decision #12` reaches the CLI as a bare flag. Every place that takes an entry number accepts `12` and `#12`, and every hint the tool prints spells it `12`.
- Each task ends with a commit; untracked files are committed too.

## Review Focus

1. **`--skip-decision #12` typed in a shell** arrives as a bare flag (the `#12` is a comment). Expected: the bare-flag refusal (`--skip-decision needs a value`), never a merge without the skip. (Task 4: `skip-decision` joins `VALUE_FLAGS`; test.)
2. **`agenda --out research/canvas.md` from the model.** A read subcommand that writes a file is a write. Expected: the guard denies `agenda` and `session protocol` with `--out`, allows them without. (Task 8.)
3. **`join` on a clone that already holds a different key.** Expected: refuse, overwrite nothing; the same key again is a no-op success. (Task 7.)
4. **A moved entry that supersedes or lists the entry skipped by `--skip-decision`.** Its reference would point at an unrelated entry of the other clone. Expected: refuse and name both entries. (Task 3.)
5. **A session occasion that starts with a digit** ("7 October supervision"). Expected: not read as an element-7 finding by the `hypotheses-before-data` check or the agenda. (Task 2.)
6. **A view opened with `#c=<code>` that also carries `#by=<name>`, or a reload after the code was traded.** Expected: stripping the code keeps `by=`; the filter survives a reload. (Task 9.)
7. **After `merge-log --skip-decision`, the canvas still shows the dropped statement as `[accepted]`.** `accept` refuses an already accepted statement, so "accept again" needs the marker reset by hand. Expected: the command's next-step text says so, naming the question. (Task 4.)

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `hooks/lib/identity.js` (new) | the user's name: read (file, then git), validate, write | 1 |
| `hooks/lib/decisions.js` | `By` field; `SESSION`, `MERGE` kinds | 1, 2 |
| `hooks/lib/state.js` | `loadState` carries `by`; `ledgerRefusal` refuses without a name; key pointer to `join` | 1, 7 |
| `hooks/lib/log.js`, `accept.js`, `choose.js` | pass `by` into every sealed write | 1 |
| `hooks/lib/session.js` (new) | `startSession` | 2 |
| `hooks/lib/review.js` | `findingsBeforeHypotheses` ignores SESSION and MERGE | 2 |
| `hooks/lib/seal.js` | `sealEntry` (pure), used by `sealedAppend` and `merge.js`; key-missing message | 3, 7 |
| `hooks/lib/merge.js` (new) | `mergeLogs` (pure) | 3 |
| `hooks/lib/protocol.js` (new) | `protocolOf` (pure) | 5 |
| `hooks/lib/agenda.js` (new) | `HUMAN_QUESTIONS`, `agendaOf`, `agendaMarkdown` | 6 |
| `bin/research-harness.js` | `name`, `session start|protocol`, `merge-log`, `agenda`, `key export`, `join`; init refusal; doctor checks | 1–7 |
| `bin/canvas-serve.js` | state carries `agenda`, `humanQuestions` | 6 |
| `dashboard/canvas.html` | agenda from state; names; session dividers; filter | 1, 6, 9 |
| `hooks/guard-promotion.js` | allow `agenda`/`session protocol` without `--out`; deny `*.seal.key` | 8 |
| `verification/SQ-29/probe-perimeter.js` | rows for `*.seal.key` and the new subcommands | 8 |
| `README.md`, `docs/technical-appendix.md` | "Two people, one canvas"; `By` is a statement | 10 |

Order and waves: Task 1 → Task 2 → {3, 6, 7} → {4, 5, 9} → {8, 10}. Task 3+4 get a separate review ticket (`security-review`: it re-seals). Task 8 gets `security-review` too.

---

### Task 1: `By: <name>` on every new entry

**Files:**
- Create: `plugins/research-harness/hooks/lib/identity.js`
- Modify: `plugins/research-harness/hooks/lib/decisions.js` (`FIELDS`, `FIELD_RE`, `bodyFields`, `formatEntry`)
- Modify: `plugins/research-harness/hooks/lib/state.js` (`loadState`, `ledgerRefusal`)
- Modify: `plugins/research-harness/hooks/lib/log.js:66`, `hooks/lib/accept.js:98`, `hooks/lib/choose.js:123` (pass `by`)
- Modify: `plugins/research-harness/bin/research-harness.js` (`name` command, `USAGE`, `main` switch, doctor check)
- Modify: `plugins/research-harness/dashboard/canvas.html:908` (`ENTRY_LABEL` learns `By`)
- Test: `plugins/research-harness/test/identity.test.js` (new), `test/decisions.test.js`, `test/seal.test.js`, `test/cli.test.js`, `test/view.test.js`

**Interfaces:**
- Produces: `identity.readName(root) → { name: string, source: 'file'|'git' } | { name: null, error: string }`; `identity.writeName(name)`; `identity.nameRefusal(name) → string|null`; `identity.namePath() → string`.
- Produces: `parseDecisions(text).entries[i].by → string|null`; `formatEntry({ ..., by })` writes `**By:** <name>` as the first field line.
- Produces: `loadState(...)` returns `by` (string|null) and `nameError` (string|null). `ledgerRefusal(state)` returns `{ code: 'name', error }` when `by` is null (checked after the key and chain checks, so existing refusal messages are unchanged).

- [ ] **Step 1: Write the failing tests**

`test/identity.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const identity = require('../hooks/lib/identity');

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

// A git repo whose user.name is set locally, with global and system config cut off.
function repo(userName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-id-'));
  childProcess.spawnSync('git', ['init', '-q'], { cwd: dir });
  if (userName) childProcess.spawnSync('git', ['config', 'user.name', userName], { cwd: dir });
  return dir;
}
const NO_GLOBAL = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

test('nameRefusal: one trimmed line, at most 60 characters, no #, no heading, no field label', () => {
  assert.equal(identity.nameRefusal('A. Researcher'), null);
  assert.equal(identity.nameRefusal('  B. Supervisor  '), null);
  assert.match(identity.nameRefusal(''), /empty/);
  assert.match(identity.nameRefusal('   '), /empty/);
  assert.match(identity.nameRefusal('A\nB'), /one line/);
  assert.match(identity.nameRefusal('x'.repeat(61)), /60/);
  assert.equal(identity.nameRefusal('x'.repeat(60)), null);
  assert.match(identity.nameRefusal('A #2'), /#/);
  assert.match(identity.nameRefusal('**Why:** x'), /field label/);
});

test('readName: the file first, then git config user.name, then a refusal naming the command', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const dir = repo('Git Person');
  withEnv({ RESEARCH_HARNESS_STATE_DIR: state, ...NO_GLOBAL }, () => {
    assert.deepEqual(identity.readName(dir), { name: 'Git Person', source: 'git' });
    identity.writeName('  A. Researcher ');
    assert.deepEqual(identity.readName(dir), { name: 'A. Researcher', source: 'file' });
    assert.equal(fs.readFileSync(identity.namePath(), 'utf8'), 'A. Researcher\n');
  });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  withEnv({ RESEARCH_HARNESS_STATE_DIR: empty, ...NO_GLOBAL }, () => {
    const none = identity.readName(repo(null));
    assert.equal(none.name, null);
    assert.match(none.error, /research-harness name "<your name>"/);
  });
});

test('readName: an unusable name in the file is reported, not replaced by git', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  fs.writeFileSync(path.join(state, 'name'), 'bad # name\n');
  withEnv({ RESEARCH_HARNESS_STATE_DIR: state, ...NO_GLOBAL }, () => {
    const got = identity.readName(repo('Git Person'));
    assert.equal(got.name, null);
    assert.match(got.error, /not usable/);
  });
});
```

Append to `test/decisions.test.js` (use the file's existing `require` of `../hooks/lib/decisions` and of `../hooks/lib/seal`; read its head first and reuse its names):

```js
test('By is a field: formatEntry writes it first, parseDecisions reads it back, old entries read null', () => {
  const text = decisions.formatEntry({ seq: 1, date: '2026-10-08', kind: 'DISCOVERY', ref: '7', body: 'A finding.', by: 'A. Researcher', why: 'Because.' });
  assert.equal(text, '## [#1] 2026-10-08 · DISCOVERY · 7\nA finding.\n**By:** A. Researcher\n**Why:** Because.\n');
  const [e] = decisions.parseDecisions(text).entries;
  assert.equal(e.by, 'A. Researcher');
  assert.equal(e.why, 'Because.');
  const [old] = decisions.parseDecisions('## [#1] 2026-10-08 · DISCOVERY · 7\nA finding.\n').entries;
  assert.equal(old.by, null);
  assert.equal(decisions.fieldLabelIn('**By:** someone'), 'By');
});
```

Append to `test/seal.test.js` (reuse its key helper; read the file's head for its name):

```js
test('a seal over an entry with By recomputes, and changing the name breaks it', () => {
  const key = Buffer.alloc(32, 7);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-')), 'decisions.md');
  fs.writeFileSync(file, '# Decision log — t\n');
  seal.sealedAppend(file, { date: '2026-10-08', kind: 'DISCOVERY', ref: '7', body: 'A finding.', by: 'A. Researcher' }, key);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(seal.verifyChain(text, key).status, 'verified');
  assert.equal(seal.verifyChain(text.replace('A. Researcher', 'B. Supervisor'), key).status, 'broken');
});
```

Append to `test/cli.test.js` (uses its `makeProject`, `run`, `readLog`, `stateDirOf`):

```js
test('name sets and prints the name; log writes it as By; no name at all refuses the write', () => {
  const root = makeProject();
  assert.equal(run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']).status, 0);
  const set = run(root, ['name', 'A. Researcher']);
  assert.equal(set.status, 0, set.stdout);
  assert.match(run(root, ['name']).stdout, /^A\. Researcher$/m);
  assert.equal(run(root, ['log', 'DISCOVERY', '7', '--body', 'A finding.']).status, 0);
  assert.match(readLog(root), /A finding\.\n\*\*By:\*\* A\. Researcher\n/);
  assert.equal(run(root, ['name', 'bad # name']).status, 2);

  fs.rmSync(path.join(stateDirOf(root), 'name'));
  const nobody = run(root, ['log', 'DISCOVERY', '7', '--body', 'Another.'], { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  assert.equal(nobody.status, 1);
  assert.match(nobody.stdout, /research-harness name "<your name>"/);
  assert.doesNotMatch(readLog(root), /Another\./);
});
```

Note: `makeProject` copies the fixture into a tmp dir that is not a git repo, so the git fallback finds no local `user.name`; with `GIT_CONFIG_GLOBAL=/dev/null` it finds none at all.

Append to `test/serve.test.js` (use its `keyedProject()` and `post(srv, urlPath, payload)` helpers; read how an existing `/api/comment` test starts the server and gets the token, and do the same): with a name file `B. Supervisor` in the project's state dir, a POST to `/api/comment` appends a DISCOVERY whose body carries `**By:** B. Supervisor`. Writes from the view carry the name of the person who started the server, from the same `loadState` as the CLI.

Append to `test/view.test.js`:

```js
test('canvas.html reads By as an entry field, so it is never shown as raw body text', () => {
  assert.match(html, /ENTRY_LABEL = \/\^\\\*\\\*\(By\|Why\|/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd plugins/research-harness && node --test test/identity.test.js test/decisions.test.js test/seal.test.js test/cli.test.js test/view.test.js`
Expected: FAIL — `Cannot find module '../hooks/lib/identity'`, `e.by` undefined, unknown command `name`.

- [ ] **Step 3: Implement `hooks/lib/identity.js`**

```js
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { stateRoot } = require('./ledger');
const { fieldLabelIn } = require('./decisions');

// The name an entry's `By` carries (spec §3). It belongs to a person, not to a
// clone, so it lives once under the user-wide state root, beside the per-project
// directories. A statement, not proof: whoever holds the key can write any name;
// the seal only keeps it from changing afterwards.
const NAME_FILE = 'name';
const MAX_NAME = 60;
const ENTRY_HEADING = /^## \[#/m;

function namePath() {
  return path.join(stateRoot(), NAME_FILE);
}

function nameRefusal(name) {
  if (typeof name !== 'string' || !name.trim()) return 'A name may not be empty.';
  const t = name.trim();
  if (/[\r\n]/.test(t)) return 'A name is one line.';
  if (t.length > MAX_NAME) return `A name has at most ${MAX_NAME} characters.`;
  if (t.includes('#')) return 'A name may not contain #.';
  if (ENTRY_HEADING.test(t)) return 'A name may not start like an entry heading.';
  if (fieldLabelIn(t)) return 'A name may not start like a field label.';
  return null;
}

const UNSET = 'no name is set for the decision log on this machine; run research-harness name "<your name>" once';

function readName(root) {
  let raw = null;
  try {
    raw = fs.readFileSync(namePath(), 'utf8').trim();
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  if (raw) {
    const bad = nameRefusal(raw);
    return bad ? { name: null, error: `the name in ${namePath()} is not usable (${bad}); run research-harness name "<your name>"` } : { name: raw, source: 'file' };
  }
  const git = childProcess.spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  const fromGit = git.status === 0 ? String(git.stdout).trim() : '';
  if (fromGit && !nameRefusal(fromGit)) return { name: fromGit, source: 'git' };
  return { name: null, error: UNSET };
}

function writeName(name) {
  fs.mkdirSync(stateRoot(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(namePath(), `${name.trim()}\n`, { mode: 0o600 });
}

module.exports = { namePath, nameRefusal, readName, writeName, MAX_NAME };
```

- [ ] **Step 4: Teach `decisions.js` the field**

```js
const FIELDS = [
  ['by', 'By'],
  ['why', 'Why'],
  ['explained', 'Explained'],
  ['rejected', 'Rejected'],
  ['openAtAccept', 'Open at acceptance'],
  ['supersedes', 'Supersedes'],
];
const FIELD_RE = /^\*\*(By|Why|Explained|Rejected|Open at acceptance|Supersedes):\*\* ?(.*)$/;
```

In `bodyFields`'s return object add `by: value('by'),` as the first key. In `formatEntry` destructure `by` and push `if (by) lines.push(\`**By:** ${by}\`);` directly after the body line, before `Why`.

- [ ] **Step 5: Carry the name through `state.js` and every write**

In `loadState`, after the key block:

```js
  const who = identity.readName(root);
  return { root, variant, paths, canvasText, parsed, decisionsText, graph, checks, profileError, key, keyError, by: who.name, nameError: who.error || null };
```

(`const identity = require('./identity');` at the top.) In `ledgerRefusal`, after the broken-chain check and before `return null`:

```js
  if (!state.by) return { error: `${state.nameError}; nothing is written.`, code: 'name' };
```

Add `by: state.by,` to the fields object in `log.js` `appendLog`, `accept.js` `acceptStatement`, and `by: main.by,` in `choose.js`.

- [ ] **Step 6: The `name` command and a doctor check in `bin/research-harness.js`**

Add `const identity = require('../hooks/lib/identity');`, a usage line `'research-harness name [<name>]',`, the switch case `case 'name': return name(positional);`, and:

```js
// ---------- name ----------

// The name every entry written from this machine carries as `By` (spec §3).
// User-wide, not per project: it belongs to the person.
function name(positional) {
  if (!positional.length) {
    const who = identity.readName(project.projectDir({}));
    if (!who.name) return fail(who.error);
    say(who.source === 'git' ? `${who.name} (from git config user.name)` : who.name);
    return 0;
  }
  if (positional.length > 1) return fail(`name takes one argument; quote a name with spaces.\n${USAGE}`, 2);
  const bad = identity.nameRefusal(positional[0]);
  if (bad) return fail(bad, 2);
  identity.writeName(positional[0]);
  say(`Name set: ${positional[0].trim()}. Every entry you write from now on carries it as By — a statement, not a proof of who wrote it.`);
  return 0;
}
```

Doctor: add `checkName()` to the `checks` array in `doctor()`:

```js
function checkName() {
  const who = identity.readName(project.projectDir({}));
  return who.name
    ? { ok: true, name: 'name', detail: `entries are written as ${who.name}` }
    : { ok: false, name: 'name', detail: who.error };
}
```

In `dashboard/canvas.html:908` change `ENTRY_LABEL` to `/^\*\*(By|Why|Explained|Rejected|Open at acceptance|Supersedes):\*\* ?(.*)$/`.

- [ ] **Step 7: Run the whole suite**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: all pass. Tests that compared exact log bytes after a write now see a `**By:**` line (from git config on this machine); update their expected bytes, never the assertion's intent. If a test runs where git has no `user.name`, set the name in that test's state dir rather than weakening the refusal.

- [ ] **Step 8: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "Log: every entry carries By, from research-harness name or git"
```

---

### Task 2: `SESSION` and `MERGE` kinds, `session start`

**Files:**
- Modify: `plugins/research-harness/hooks/lib/decisions.js` (`KINDS`, `ENTRY_RE`)
- Create: `plugins/research-harness/hooks/lib/session.js`
- Modify: `plugins/research-harness/hooks/lib/review.js` (`findingsBeforeHypotheses`)
- Modify: `plugins/research-harness/bin/research-harness.js` (`session` command, doctor note)
- Test: `test/decisions.test.js`, `test/review.test.js`, `test/cli.test.js`, `test/session.test.js` (new)

**Interfaces:**
- Consumes: `state.by`, `ledgerRefusal` (Task 1).
- Produces: `KINDS = ['DECISION', 'CONSTRAINT', 'DISCOVERY', 'SESSION', 'MERGE']`; `startSession({ root, occasion, pluginRoot }) → { ok: true, seq, seal } | refusal`; `MARKER_KINDS = new Set(['SESSION', 'MERGE'])` exported from `decisions.js`.

- [ ] **Step 1: Write the failing tests**

`test/decisions.test.js`:

```js
test('SESSION and MERGE parse, format and verify in one chain', () => {
  const key = Buffer.alloc(32, 3);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-')), 'decisions.md');
  fs.writeFileSync(file, '# Decision log — t\n');
  seal.sealedAppend(file, { date: '2026-10-08', kind: 'SESSION', ref: 'Supervision with B. Supervisor', body: 'Session started.', by: 'A. Researcher' }, key);
  seal.sealedAppend(file, { date: '2026-10-08', kind: 'MERGE', ref: 'from abc1234', body: 'Taken up to #1.', by: 'A. Researcher' }, key);
  const text = fs.readFileSync(file, 'utf8');
  assert.deepEqual(decisions.parseDecisions(text).entries.map((e) => [e.seq, e.kind, e.ref]), [[1, 'SESSION', 'Supervision with B. Supervisor'], [2, 'MERGE', 'from abc1234']]);
  assert.equal(seal.verifyChain(text, key).status, 'verified');
});
```

`test/review.test.js` (reuse its helpers for building a log; read the file's head first):

```js
test('hypotheses-before-data does not read a session occasion that starts with a digit as a finding', () => {
  const text = [
    '# Decision log — t', '',
    '## [#1] 2026-10-08 · SESSION · 7 October supervision', 'Session started.', '',
  ].join('\n');
  assert.deepEqual(findingsBeforeHypotheses(text), []);
});
```

`test/cli.test.js`:

```js
test('session start appends a sealed SESSION marker with By; log refuses SESSION and MERGE', () => {
  const root = makeProject();
  assert.equal(run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']).status, 0);
  assert.equal(run(root, ['name', 'A. Researcher']).status, 0);
  const out = run(root, ['session', 'start', 'Supervision with B. Supervisor']);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /Session #\d+ started/);
  assert.match(readLog(root), /· SESSION · Supervision with B\. Supervisor · seal [0-9a-f]{16}\nSession started\.\n\*\*By:\*\* A\. Researcher\n/);
  assert.equal(run(root, ['log', 'SESSION', 'x', '--body', 'y']).status, 2);
  assert.equal(run(root, ['log', 'MERGE', 'x', '--body', 'y']).status, 2);
  assert.equal(run(root, ['session', 'start', 'a · b']).status, 2);
  assert.equal(run(root, ['session', 'start']).status, 2);
  assert.equal(run(root, ['session']).status, 2);
});

test('doctor notes two session markers in a row without failing on it', () => {
  const root = makeProject();
  run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  run(root, ['name', 'A. Researcher']);
  run(root, ['session', 'start', 'One']);
  run(root, ['session', 'start', 'Two']);
  assert.match(run(root, ['doctor']).stdout, /note: .*#\d+ and #\d+ are two session markers in a row/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/decisions.test.js test/review.test.js test/cli.test.js`
Expected: FAIL — `unknown decision kind: SESSION`, unknown command `session`.

- [ ] **Step 3: Implement**

`decisions.js`:

```js
const KINDS = ['DECISION', 'CONSTRAINT', 'DISCOVERY', 'SESSION', 'MERGE'];
// Written only by their own commands (session start, merge-log); never a
// finding, a cover or an open check.
const MARKER_KINDS = new Set(['SESSION', 'MERGE']);
const ENTRY_RE = new RegExp(`^## \\[#(\\d+)\\] (\\d{4}-\\d{2}-\\d{2}) · (${KINDS.join('|')}) · (.+?)(?: · text ([0-9a-f]{8}))?(?: · seal ([0-9a-f]{16}))?$`);
```

Export `MARKER_KINDS`. `review.js` `findingsBeforeHypotheses`: `const entries = parseDecisions(decisionsText || '').entries.filter((e) => !MARKER_KINDS.has(e.kind));`.

`hooks/lib/session.js`:

```js
'use strict';

const seal = require('./seal');
const { loadState, ledgerRefusal } = require('./state');
const { headingRefusal, labelRefusal, today, refuse } = require('./log');

const MAX_OCCASION = 120;

// A session runs from its marker to the next one or the end of the log
// (spec §4). Only a person starts one; an open view is not a session.
function startSession({ root, occasion, pluginRoot } = {}) {
  const text = typeof occasion === 'string' ? occasion.trim() : '';
  if (!text || /[·\n]/.test(text) || text.length > MAX_OCCASION) {
    return refuse('invalid', `session start needs an occasion: one line of at most ${MAX_OCCASION} characters without a middle dot, e.g. "Supervision with B. Supervisor".`, true);
  }
  const bad = headingRefusal(text) || labelRefusal(text);
  if (bad) return refuse('invalid', bad);
  const state = loadState(root, { pluginRoot });
  if (state.error) return refuse(state.code, state.error);
  const refusal = ledgerRefusal(state);
  if (refusal) return refuse(refusal.code, `Cannot start a session: ${refusal.error}`);
  const logged = seal.sealedAppend(state.paths.decisions, { date: today(), kind: 'SESSION', ref: text, body: 'Session started.', by: state.by }, state.key);
  return { ok: true, seq: logged.seq, seal: logged.seal };
}

module.exports = { startSession };
```

CLI: usage lines `'research-harness session start "<occasion>"'`, and `case 'session': return session(positional, flags);`:

```js
// ---------- session ----------

function session(positional, flags) {
  const [action, ...rest] = positional;
  if (action === 'start') {
    if (rest.length !== 1) return fail(`session start takes one quoted occasion.\n${USAGE}`, 2);
    const result = startSession({ root: project.projectDir({}), occasion: rest[0], pluginRoot: pluginRoot() });
    if (!result.ok) return refused(result);
    say(`Session #${result.seq} started, sealed ${result.seal}. It runs until the next session start.`);
    return 0;
  }
  return fail(`session takes start or protocol.\n${USAGE}`, 2);
}
```

Doctor: a check may carry `note: true`; notes print and do not fail. Add `checkSessionMarkers()` returning `null` outside a project or when no two consecutive entries are both SESSION, else `{ ok: true, note: true, name: 'note', detail: '#a and #b are two session markers in a row; the first session is empty' }`. In `doctor()`, after the failed lines: `for (const c of checks.filter((c) => c.note)) say(\`- note: ${c.detail}\`);`.

- [ ] **Step 4: Run the suite**

Run: `node --test test/*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "Log: SESSION and MERGE kinds, research-harness session start"
```

---

### Task 3: `mergeLogs`, the pure merge

**Files:**
- Modify: `plugins/research-harness/hooks/lib/seal.js` (extract `sealEntry`; `sealedAppend` uses it)
- Create: `plugins/research-harness/hooks/lib/merge.js`
- Test: `plugins/research-harness/test/merge.test.js` (new), `test/seal.test.js`

**Interfaces:**
- Consumes: `formatEntry`, `parseDecisions`, `separatorAfter`, `MARKER_KINDS` (Task 2), `by` field (Task 1).
- Produces: `seal.sealEntry(previousSeal, fields, key) → { text, seal }` where `fields` includes `seq`; `seal.lastSealOf(text) → string` (the previous seal an append to `text` chains onto). `merge.mergeLogs(ours, theirs, key, { by, theirsCommit, skip = [] }) → { ok: true, text, merged: false, kept: 'ours'|'theirs' } | { ok: true, text, merged: true, moved: [[old, new], ...], dropped: number[], mergeSeq } | { ok: false, code, error }`. Codes: `ledger`, `broken`, `no-prefix`, `check`, `skip`, `dangling`.

- [ ] **Step 1: Write the failing tests** (`test/merge.test.js`)

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const seal = require('../hooks/lib/seal');
const decisions = require('../hooks/lib/decisions');
const { mergeLogs } = require('../hooks/lib/merge');

const KEY = Buffer.alloc(32, 9);
const HEADER = '# Decision log — t\n';

// Appends sealed entries to a text in memory, the way sealedAppend does on disk.
function append(text, entries) {
  let out = text;
  for (const f of entries) {
    const seq = decisions.parseDecisions(out).maxSeq + 1;
    const { text: entry } = seal.sealEntry(seal.lastSealOf(out), { date: '2026-10-08', body: 'x', ...f, seq }, KEY);
    out += decisions.separatorAfter(out) + entry;
  }
  return out;
}
const d = (ref, extra = {}) => ({ kind: 'DISCOVERY', ref, body: `finding ${ref}`, by: 'A. Researcher', ...extra });

const base = append(HEADER, [d('1'), d('2')]);
const ours = append(base, [d('3'), d('4', { supersedes: 3 })]);
const theirs = append(base, [{ ...d('5'), by: 'B. Supervisor' }]);

test('one log a prefix of the other: the longer one, unchanged, no MERGE', () => {
  assert.deepEqual(mergeLogs(base, ours, KEY, { by: 'A', theirsCommit: 'abc1234' }), { ok: true, text: ours, merged: false, kept: 'theirs' });
  assert.deepEqual(mergeLogs(ours, base, KEY, { by: 'A', theirsCommit: 'abc1234' }), { ok: true, text: ours, merged: false, kept: 'ours' });
});

test('divergence: theirs unchanged, ours renumbered and re-sealed after it, references rewritten, one MERGE', () => {
  const r = mergeLogs(ours, theirs, KEY, { by: 'A. Researcher', theirsCommit: 'abc1234' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.merged, true);
  assert.ok(r.text.startsWith(theirs));
  assert.deepEqual(r.moved, [[3, 4], [4, 5]]);
  const entries = decisions.parseDecisions(r.text).entries;
  assert.deepEqual(entries.map((e) => [e.seq, e.kind, e.ref]), [[1, 'DISCOVERY', '1'], [2, 'DISCOVERY', '2'], [3, 'DISCOVERY', '5'], [4, 'DISCOVERY', '3'], [5, 'DISCOVERY', '4'], [6, 'MERGE', 'from abc1234']]);
  assert.equal(entries[4].supersedes, 4, 'the supersede follows the moved entry');
  assert.equal(entries[3].by, 'A. Researcher');
  assert.match(entries[5].body, /Taken up to #3 from abc1234\. Own #3–#4 moved to #4–#5\./);
  assert.equal(entries[5].by, 'A. Researcher');
  assert.equal(r.mergeSeq, 6);
  assert.equal(seal.verifyChain(r.text, KEY).status, 'verified');
});

test('a reference into the shared prefix stays', () => {
  const o = append(base, [d('3', { supersedes: 1 })]);
  const r = mergeLogs(o, theirs, KEY, { by: 'A', theirsCommit: 'abc1234' });
  assert.equal(decisions.parseDecisions(r.text).entries[3].supersedes, 1);
});

test('refusals: missing key, a broken side, no shared prefix', () => {
  assert.equal(mergeLogs(ours, theirs, null, { by: 'A', theirsCommit: 'x' }).code, 'ledger');
  const broken = ours.replace('finding 3', 'finding 3!');
  const r = mergeLogs(broken, theirs, KEY, { by: 'A', theirsCommit: 'x' });
  assert.equal(r.code, 'broken');
  assert.match(r.error, /ours is broken at #3/);
  assert.equal(mergeLogs(ours, theirs.replace('finding 5', 'finding 5!'), KEY, { by: 'A', theirsCommit: 'x' }).code, 'broken');
  const other = append('# Decision log — other\n', [d('1')]);
  assert.equal(mergeLogs(ours, other, KEY, { by: 'A', theirsCommit: 'x' }).code, 'no-prefix');
});

const accept = (q) => ({ kind: 'DECISION', ref: `${q} accepted`, hash: 'abcdef12', body: 'S. [accepted]', explained: 'E.', by: 'A. Researcher' });

test('check refusal: our acceptance on a question theirs opened a check on after the prefix', () => {
  const o = append(base, [accept('7.1')]);
  const t = append(base, [{ kind: 'DISCOVERY', ref: '7.1 check', body: 'Is this right?', by: 'B. Supervisor' }]);
  const r = mergeLogs(o, t, KEY, { by: 'A', theirsCommit: 'abc1234' });
  assert.equal(r.code, 'check');
  assert.match(r.error, /7\.1/);
  assert.match(r.error, /#3/);
  assert.match(r.error, /git merge --abort/);
  assert.match(r.error, /--skip-decision 3\b/);
  assert.doesNotMatch(r.error, /--skip-decision #/);
});

test('--skip-decision leaves that DECISION out and the MERGE entry says so', () => {
  const o = append(base, [accept('7.1'), d('8')]);
  const t = append(base, [{ kind: 'DISCOVERY', ref: '7.1 check', body: 'Is this right?', by: 'B. Supervisor' }]);
  const r = mergeLogs(o, t, KEY, { by: 'A', theirsCommit: 'abc1234', skip: [3] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.dropped, [3]);
  assert.deepEqual(r.moved, [[4, 4]]);
  const entries = decisions.parseDecisions(r.text).entries;
  assert.equal(entries.filter((e) => e.kind === 'DECISION').length, 0);
  assert.match(entries[entries.length - 1].body, /#3 dropped, to be accepted again/);
  assert.equal(seal.verifyChain(r.text, KEY).status, 'verified');
});

test('--skip-decision refuses a number that is not one of our moved DECISIONs, and a moved entry that points at it', () => {
  const o = append(base, [accept('7.1'), d('8', { supersedes: 3 })]);
  assert.equal(mergeLogs(o, theirs, KEY, { by: 'A', theirsCommit: 'x', skip: [1] }).code, 'skip');
  assert.equal(mergeLogs(o, theirs, KEY, { by: 'A', theirsCommit: 'x', skip: [4] }).code, 'skip');
  const r = mergeLogs(o, theirs, KEY, { by: 'A', theirsCommit: 'x', skip: [3] });
  assert.equal(r.code, 'dangling');
  assert.match(r.error, /#4.*#3/);
});

test('SESSION entries move like any other entry', () => {
  const o = append(base, [{ kind: 'SESSION', ref: 'Supervision', body: 'Session started.', by: 'A' }]);
  const r = mergeLogs(o, theirs, KEY, { by: 'A', theirsCommit: 'x' });
  assert.deepEqual(decisions.parseDecisions(r.text).entries.map((e) => e.kind).slice(-2), ['SESSION', 'MERGE']);
});
```

Add to `test/seal.test.js`: `sealedAppend` output is byte-identical before and after the refactor — append two entries to a fixture with the existing helper and compare against a hard-coded expected text captured before Step 3 (capture it by running the test once on the old code and pasting the bytes).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/merge.test.js`
Expected: FAIL — `seal.sealEntry is not a function`, `Cannot find module '../hooks/lib/merge'`.

- [ ] **Step 3: Extract `sealEntry` and `lastSealOf` in `seal.js`**

```js
// The seal an append to `current` chains onto: the last seal there is, or for
// a log that has none yet, the anchor over every byte the new entry follows.
function lastSealOf(current) {
  const sealed = decisions.parseDecisions(current).entries.filter((e) => e.seal !== null);
  return sealed.length ? sealed[sealed.length - 1].seal : anchorOf(current + decisions.separatorAfter(current));
}

// One sealed entry as text, without touching a file. The body under seal is
// what the parser will read back, so it is taken from a parse of the
// formatted draft rather than assembled twice.
function sealEntry(previousSeal, fields, key) {
  const draft = decisions.formatEntry({ ...fields, seal: undefined });
  const entry = decisions.parseDecisions(draft).entries[0];
  const s = sealOf(key, previousSeal, entry);
  return { text: decisions.formatEntry({ ...fields, seal: s }), seal: s };
}
```

`sealedAppend` keeps its refusals and becomes, after the broken-chain check:

```js
  const seq = decisions.parseDecisions(current).maxSeq + 1;
  const { text, seal: s } = sealEntry(lastSealOf(current), { ...fields, seq }, key);
  decisions.appendEntry(filePath, text);
  return { seq, seal: s };
```

Export both.

- [ ] **Step 4: Implement `hooks/lib/merge.js`**

```js
'use strict';

const decisions = require('./decisions');
const seal = require('./seal');

// Two clones that both appended after #n each hold a #n+1 on the same chain
// (spec §2). Equal seq and equal seal means the same entry, because a seal
// chains over everything before it, so the shared prefix is found by
// comparing seals, without git's merge base. Theirs stays byte for byte; our
// entries after the prefix are renumbered and re-sealed after it. Nothing is
// deleted: an entry left out with `skip` stays in git history.

function refuse(code, error) {
  return { ok: false, code, error };
}

// Legacy entries carry no seal; they are the same entry when every parsed
// part is the same. The first sealed entry's anchor covers them anyway.
function sameEntry(a, b) {
  if (a.seq !== b.seq) return false;
  if (a.seal !== null || b.seal !== null) return a.seal === b.seal;
  return a.date === b.date && a.kind === b.kind && a.ref === b.ref && a.body === b.body;
}

const ACCEPT_REF = /^([1-9]\.\d+) accepted$/;
const REF_LINE = /^\*\*(Supersedes|Open at acceptance):\*\* ?(.*)$/;

// Only the field lines that name entries by number move with the map; the
// first line is the entry's text and is never read as a field.
function rewriteRefs(body, map) {
  const lines = body.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const m = REF_LINE.exec(lines[i]);
    if (m) lines[i] = `**${m[1]}:** ${m[2].replace(/#(\d+)/g, (all, n) => (map.has(Number(n)) ? `#${map.get(Number(n))}` : all))}`;
  }
  return lines.join('\n');
}

function refsOf(entry) {
  return [...(entry.supersedes ? [entry.supersedes] : []), ...entry.openAtAccept];
}

function mergeLogs(ours, theirs, key, { by, theirsCommit, skip = [] } = {}) {
  if (!key) return refuse('ledger', 'No sealing key for this project on this machine; nothing is merged.');
  for (const [side, text] of [['ours', ours], ['theirs', theirs]]) {
    const chain = seal.verifyChain(text, key);
    if (chain.status === 'broken') {
      return refuse('broken', `${side} is broken at #${chain.broken.seq} (line ${chain.broken.line}, ${chain.broken.why}); nothing is merged. The harness never repairs a ledger.`);
    }
  }
  const a = decisions.parseDecisions(ours).entries;
  const b = decisions.parseDecisions(theirs).entries;
  let n = 0;
  while (n < a.length && n < b.length && sameEntry(a[n], b[n])) n += 1;
  if (n === a.length) return { ok: true, text: theirs, merged: false, kept: 'theirs' };
  if (n === b.length) return { ok: true, text: ours, merged: false, kept: 'ours' };
  if (n === 0) return refuse('no-prefix', 'The two logs share no entry; they are not two copies of one log. Nothing is merged.');

  const mine = a.slice(n);
  const other = b.slice(n);
  if (mine.some((e) => e.seal === null)) return refuse('broken', 'ours has unsealed entries after the shared part; nothing is merged.');
  for (const s of skip) {
    if (!mine.some((e) => e.seq === s && e.kind === 'DECISION')) {
      return refuse('skip', `--skip-decision ${s}: our side has no DECISION #${s} after the shared part (#${a[n - 1].seq}); nothing is merged.`);
    }
  }
  const kept = mine.filter((e) => !skip.includes(e.seq));
  for (const e of kept) {
    const hit = refsOf(e).find((r) => skip.includes(r));
    if (hit) return refuse('dangling', `Our #${e.seq} refers to #${hit}, which --skip-decision leaves out; nothing is merged. Merge without the skip, or leave both out by accepting again after the merge.`);
  }
  for (const e of kept) {
    const q = e.kind === 'DECISION' && ACCEPT_REF.exec(e.ref);
    if (!q) continue;
    const check = other.find((t) => t.kind === 'DISCOVERY' && t.ref.trim() === `${q[1]} check`);
    if (check) {
      return refuse('check', `Our acceptance #${e.seq} of ${q[1]} would be placed after their check question #${check.seq} on ${q[1]}, which we never saw, and would read as having closed it. Nothing is merged. Run git merge --abort, then git pull --no-rebase again and run research-harness merge-log --skip-decision ${e.seq}; accept ${q[1]} again after the merge.`);
    }
  }

  const theirMax = decisions.parseDecisions(theirs).maxSeq;
  const map = new Map();
  kept.forEach((e, i) => map.set(e.seq, theirMax + 1 + i));
  let text = theirs;
  let previous = seal.lastSealOf(theirs);
  for (const e of kept) {
    const fields = { seq: map.get(e.seq), date: e.date, kind: e.kind, ref: e.ref, hash: e.hash, body: rewriteRefs(e.body, map) };
    const sealed = seal.sealEntry(previous, fields, key);
    text += decisions.separatorAfter(text) + sealed.text;
    previous = sealed.seal;
  }
  const moved = kept.map((e) => [e.seq, map.get(e.seq)]);
  const range = (xs) => (xs.length === 1 ? `#${xs[0]}` : `#${xs[0]}–#${xs[xs.length - 1]}`);
  const parts = [`Taken up to #${theirMax} from ${theirsCommit}.`];
  if (moved.length) parts.push(`Own ${range(moved.map((m) => m[0]))} moved to ${range(moved.map((m) => m[1]))}.`);
  if (skip.length) parts.push(`${skip.map((s) => `#${s}`).join(', ')} dropped, to be accepted again.`);
  const mergeSeq = theirMax + kept.length + 1;
  const entry = seal.sealEntry(previous, { seq: mergeSeq, date: new Date().toISOString().slice(0, 10), kind: 'MERGE', ref: `from ${theirsCommit}`, body: parts.join(' '), by }, key);
  text += decisions.separatorAfter(text) + entry.text;
  if (seal.verifyChain(text, key).status !== 'verified') return refuse('broken', 'The merged log does not verify; nothing is written. This is a bug in merge-log.');
  return { ok: true, text, merged: true, moved, dropped: [...skip], mergeSeq };
}

module.exports = { mergeLogs };
```

Note on Step 1's expected `range`: with one moved entry the body reads `Own #4 moved to #4.`; the skip test asserts only the dropped clause.

- [ ] **Step 5: Run the suite**

Run: `node --test test/*.test.js`
Expected: all pass, including the byte-identity test for `sealedAppend`.

- [ ] **Step 6: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "Merge: mergeLogs takes their log and re-seals ours after it"
```

---

### Task 4: `research-harness merge-log`

**Files:**
- Modify: `plugins/research-harness/bin/research-harness.js` (`merge-log`, `VALUE_FLAGS`, `USAGE`)
- Test: `plugins/research-harness/test/merge-log.test.js` (new)

**Interfaces:**
- Consumes: `mergeLogs` (Task 3), `loadState().by`, `.key` (Task 1).
- Produces: CLI `research-harness merge-log [--skip-decision <n>]`; exit 0 on merge or no-op, 1 on refusal, 2 on malformed call.

- [ ] **Step 1: Write the failing tests** (`test/merge-log.test.js`)

```js
'use strict';

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
const GIT_ENV = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function git(cwd, ...args) {
  const r = childProcess.spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  return r;
}
function rh(cwd, state, args) {
  const { CLAUDE_PROJECT_DIR: _p, RESEARCH_HARNESS_DIR: _d, ...ambient } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...ambient, ...GIT_ENV, CLAUDE_PLUGIN_ROOT: pluginRoot, RESEARCH_HARNESS_STATE_DIR: state } });
}
function keyPathIn(state, root) {
  const saved = process.env.RESEARCH_HARNESS_STATE_DIR;
  process.env.RESEARCH_HARNESS_STATE_DIR = state;
  try { return seal.keyPath(root); } finally { if (saved === undefined) delete process.env.RESEARCH_HARNESS_STATE_DIR; else process.env.RESEARCH_HARNESS_STATE_DIR = saved; }
}

// A bare origin, clone A (who inits and holds the key) and clone B (who gets
// a copy of the key file), each with its own state dir and name.
function twoClones() {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-merge-'));
  const origin = path.join(top, 'origin.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', origin);
  const A = path.join(top, 'a');
  const B = path.join(top, 'b');
  const sa = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  git(top, 'clone', '-q', origin, A);
  fs.mkdirSync(path.join(A, 'research'));
  fs.copyFileSync(path.join(fixtureDir, 'canvas.md'), path.join(A, 'research', 'canvas.md'));
  fs.copyFileSync(path.join(fixtureDir, 'decisions.md'), path.join(A, 'research', 'decisions.md'));
  assert.equal(rh(A, sa, ['init', '--project', 'voice-uptake', '--mode', 'seed']).status, 0);
  rh(A, sa, ['name', 'A. Researcher']);
  rh(A, sa, ['log', 'DISCOVERY', '7', '--body', 'Shared finding.']);
  git(A, 'add', '-A'); git(A, 'commit', '-qm', 'start'); git(A, 'push', '-q', 'origin', 'HEAD:main');
  git(top, 'clone', '-q', origin, B);
  git(B, 'config', 'pull.rebase', 'false');
  git(A, 'config', 'pull.rebase', 'false');
  const kb = keyPathIn(sb, B);
  fs.mkdirSync(path.dirname(kb), { recursive: true });
  fs.copyFileSync(keyPathIn(sa, A), kb);
  rh(B, sb, ['name', 'B. Supervisor']);
  return { A, B, sa, sb, key: fs.readFileSync(kb, 'utf8').trim() };
}

test('two clones log in parallel, pull conflicts, merge-log joins the logs, both verify after the round trip', () => {
  const { A, B, sa, sb, key } = twoClones();
  rh(A, sa, ['log', 'DISCOVERY', '7', '--body', 'From A.']);
  git(A, 'commit', '-qam', 'a'); git(A, 'push', '-q', 'origin', 'HEAD:main');
  rh(B, sb, ['log', 'DISCOVERY', '6', '--body', 'From B.']);
  git(B, 'commit', '-qam', 'b');
  const pull = git(B, 'pull', '--no-rebase', '-q', 'origin', 'main');
  assert.notEqual(pull.status, 0, 'the pull conflicts on decisions.md');

  const out = rh(B, sb, ['merge-log']);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /git add research\/decisions\.md/);
  const merged = fs.readFileSync(path.join(B, 'research', 'decisions.md'), 'utf8');
  assert.doesNotMatch(merged, /^<<<<<<<|^>>>>>>>/m);
  assert.equal(seal.verifyChain(merged, Buffer.from(key, 'hex')).status, 'verified');
  assert.match(merged, /· MERGE · from [0-9a-f]{7,}/);
  assert.match(merged, /\*\*By:\*\* B\. Supervisor/);

  git(B, 'add', 'research/decisions.md'); git(B, 'commit', '-qm', 'merge'); git(B, 'push', '-q', 'origin', 'HEAD:main');
  assert.equal(git(A, 'pull', '--no-rebase', '-q', 'origin', 'main').status, 0);
  const atA = fs.readFileSync(path.join(A, 'research', 'decisions.md'), 'utf8');
  assert.equal(atA, merged);
  assert.equal(seal.verifyChain(atA, Buffer.from(key, 'hex')).status, 'verified');
});

test('merge-log refuses outside a merge and during a rebase', () => {
  const { B, sb } = twoClones();
  const none = rh(B, sb, ['merge-log']);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /no merge in progress/);
  fs.mkdirSync(path.join(B, '.git', 'rebase-merge'));
  const rebasing = rh(B, sb, ['merge-log']);
  assert.equal(rebasing.status, 1);
  assert.match(rebasing.stdout, /git pull --no-rebase/);
});

test('--skip-decision needs a value, and a bare one (the shell ate "#12") is refused before anything runs', () => {
  const { B, sb } = twoClones();
  const bare = rh(B, sb, ['merge-log', '--skip-decision']);
  assert.equal(bare.status, 2);
  assert.match(bare.stdout, /--skip-decision needs a value/);
  assert.equal(rh(B, sb, ['merge-log', '--skip-decision', 'x']).status, 2);
});
```

Add one more test in the same file that drives the check refusal end to end: A writes `7.1 check` (via `log DISCOVERY "7.1 check" --body ...`) and pushes; B accepts a question `7.1` candidate from the fixture (`accept 7.1 --explained ... [--match ...]`; read `test/fixtures/voice-uptake/research/canvas.md` for a question with a single candidate and use its id instead of `7.1` if needed) and pulls; `merge-log` exits 1 naming `--skip-decision <n>`; `git merge --abort`; pull again; `merge-log --skip-decision <n>` exits 0, prints that the statement's marker in `research/canvas.md` must be set back by hand before accepting again, and the log verifies.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/merge-log.test.js`
Expected: FAIL — unknown command `merge-log` (usage, exit 2).

- [ ] **Step 3: Implement in `bin/research-harness.js`**

Add `'skip-decision'` to `VALUE_FLAGS`, the usage line `'research-harness merge-log [--skip-decision <n>]'`, `case 'merge-log': return mergeLog(flags);`, `const { mergeLogs } = require('../hooks/lib/merge');`, and:

```js
// ---------- merge-log ----------

function gitIn(root, args) {
  return childProcess.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

// Entry numbers arrive as `12` or `#12`; a shell drops an unquoted `#12` as a
// comment, which the bare-flag refusal in main already catches.
function entryNumber(value) {
  const m = /^#?([1-9]\d*)$/.exec(String(value));
  return m ? Number(m[1]) : null;
}

// Run inside a `git pull --no-rebase` that conflicted on decisions.md (spec
// §2). Ours is stage 2, theirs stage 3. Writes the working file and nothing
// else: staging and committing stay the person's steps.
function mergeLog(flags) {
  const root = project.projectDir({});
  let skip = [];
  if (flags['skip-decision'] !== undefined) {
    const n = entryNumber(flags['skip-decision']);
    if (n === null) return fail(`--skip-decision takes an entry number, e.g. 12.\n${USAGE}`, 2);
    skip = [n];
  }
  const gitPath = (name) => {
    const r = gitIn(root, ['rev-parse', '--git-path', name]);
    return r.status === 0 ? path.resolve(root, r.stdout.trim()) : null;
  };
  if (['rebase-merge', 'rebase-apply'].some((n) => { const p = gitPath(n); return p && fs.existsSync(p); })) {
    return fail('A rebase is in progress; in a rebase ours and theirs are swapped, so merge-log refuses. Abort it (git rebase --abort) and pull with git pull --no-rebase.');
  }
  const head = gitIn(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  if (head.status !== 0) return fail('There is no merge in progress. Run merge-log after a git pull --no-rebase that conflicted on research/decisions.md.');
  const state = stateLib.loadState(root, { pluginRoot: pluginRoot() });
  if (state.error) return fail(state.error);
  const refusal = stateLib.ledgerRefusal({ ...state, decisionsText: '' });
  if (refusal) return fail(`Cannot merge: ${refusal.error}`);
  const rel = `./${path.relative(root, state.paths.decisions)}`;
  const ours = gitIn(root, ['show', `:2:${rel}`]);
  const theirs = gitIn(root, ['show', `:3:${rel}`]);
  if (ours.status !== 0 || theirs.status !== 0) return fail(`${rel.slice(2)} is not in conflict in this merge; nothing to do.`);
  const short = gitIn(root, ['rev-parse', '--short', 'MERGE_HEAD']).stdout.trim();
  const result = mergeLogs(ours.stdout, theirs.stdout, state.key, { by: state.by, theirsCommit: short, skip });
  if (!result.ok) return fail(result.error);
  fs.writeFileSync(state.paths.decisions, result.text);
  if (seal.verifyChain(fs.readFileSync(state.paths.decisions, 'utf8'), state.key).status !== 'verified') {
    return fail(`${rel.slice(2)} was written but does not verify. Do not commit it; run git merge --abort.`);
  }
  if (!result.merged) say(`One log already holds the other (${result.kept} kept, unchanged).`);
  else say(`Merged: their log up to #${result.mergeSeq - result.moved.length - 1}, then ours as ${result.moved.map(([o, n]) => `#${o}→#${n}`).join(', ') || 'nothing'}; MERGE entry #${result.mergeSeq}.`);
  for (const s of result.dropped || []) {
    say(`#${s} was left out. Its statement in research/canvas.md may still read [accepted]: set its marker back by hand after the merge, then accept it again with research-harness accept.`);
  }
  say(`Next: git add ${rel.slice(2)}, resolve any other conflicts, git commit.`);
  return 0;
}
```

(`ledgerRefusal` is called with an empty `decisionsText` so a conflicted working file — which holds conflict markers and reads as broken — does not refuse the very command that repairs it; the key and name checks still run. Both stages are verified inside `mergeLogs`.)

- [ ] **Step 4: Run the suite and the perimeter probe**

Run: `node --test test/*.test.js && (cd ../.. && node verification/SQ-29/probe-perimeter.js >/dev/null; echo "probe exit $?")`
Expected: all pass; probe exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "CLI: research-harness merge-log joins two clones' logs after a conflicting pull"
```

---

### Task 5: `research-harness session protocol`

**Files:**
- Create: `plugins/research-harness/hooks/lib/protocol.js`
- Modify: `plugins/research-harness/bin/research-harness.js` (`session protocol`, `out` in `VALUE_FLAGS`)
- Test: `plugins/research-harness/test/protocol.test.js` (new), `test/cli.test.js`

**Interfaces:**
- Consumes: `SESSION` kind (Task 2), `by` (Task 1), `openChecks` (`hooks/lib/accept.js`), `verifyChain`, `logAnchor`, `textHash`, `findQuestion` (`state.js`).
- Produces: `protocolOf({ decisionsText, canvasText, key, seq }) → { ok: true, markdown } | refusal`.

- [ ] **Step 1: Write the failing tests** (`test/protocol.test.js`)

Build the fixture log in memory with `seal.sealEntry`/`seal.lastSealOf` as in `test/merge.test.js` (copy the `append` helper), against a canvas text that holds question `3.1` with the statement `Voice is taken up when it is answered. [accepted]` and question `4.1` with any `[accepted]` statement. Log:

1. DISCOVERY `1` by A (before any session)
2. SESSION `First supervision` by A
3. DECISION `3.1 accepted`, `hash: textHash('Voice is taken up when it is answered.')`, explained `E1.`, by B
4. DISCOVERY `7.1 check` body `Is the sample large enough?`, why `Power.`, by B
5. CONSTRAINT `6` body `No new data.` (no `by`)
6. DECISION `4.1 accepted`, `hash: 'deadbeef'` (no longer matches the canvas), explained `E2.`, by A
7. SESSION `Second supervision` by A
8. DISCOVERY `5` by A

```js
test('latest session by default; #seq picks another; a non-marker seq refuses', () => {
  const latest = protocolOf({ decisionsText: log, canvasText, key: KEY });
  assert.match(latest.markdown, /^# Session protocol — Second supervision$/m);
  const first = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 });
  assert.match(first.markdown, /^# Session protocol — First supervision$/m);
  assert.equal(protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 3 }).ok, false);
});

test('section bounds, grouping, participants and unknown', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  assert.match(md, /^Participants: A\. Researcher, B\. Supervisor, unknown$/m);
  assert.match(md, /## Accepted[\s\S]*3\.1[\s\S]*Voice is taken up when it is answered\.[\s\S]*Explained: E1\.[\s\S]*By: B\. Supervisor/);
  assert.match(md, /4\.1[\s\S]*text changed since \(text deadbeef\)/);
  assert.match(md, /## Noted[\s\S]*7\.1 check[\s\S]*Why: Power\.[\s\S]*By: B\. Supervisor/);
  assert.match(md, /No new data\.[\s\S]*By: unknown/);
  assert.doesNotMatch(md, /DISCOVERY · 1\b|finding 1/, 'the entry before the marker is not in the section');
  assert.doesNotMatch(md, /Second supervision/);
});

test('open at the end: a check still open when the section ends', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  assert.match(md, /## Open at the end[\s\S]*7\.1 check #4/);
});

test('footer: seal status and the anchor as of the section\'s last entry', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  const upTo = log.slice(0, decisions.parseDecisions(log).entries[6].offset).replace(/\n+$/, '\n');
  assert.match(md, /Seal: verified/);
  assert.ok(md.includes(seal.logAnchor(upTo)));
});

test('a broken chain still gives a protocol, headed BROKEN; no marker refuses', () => {
  const broken = log.replace('No new data.', 'No new data!');
  assert.match(protocolOf({ decisionsText: broken, canvasText, key: KEY, seq: 2 }).markdown, /^\*\*BROKEN at #5\*\*/m);
  const none = protocolOf({ decisionsText: '# Decision log — t\n', canvasText, key: KEY });
  assert.equal(none.ok, false);
  assert.match(none.error, /session start/);
});
```

`test/cli.test.js`: `session protocol` prints the same markdown `protocolOf` returns for the project's state; `session protocol 12` and `#12` both work; `--out <tmpfile>` writes it and prints the path; `session protocol` on a log without a marker exits 1.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/protocol.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hooks/lib/protocol.js`**

```js
'use strict';

const canvas = require('./canvas');
const { parseDecisions } = require('./decisions');
const { verifyChain, logAnchor } = require('./seal');
const { textHash } = require('./hash');
const { findQuestion } = require('./state');
const { openChecks } = require('./accept');

function refuse(code, error) {
  return { ok: false, code, error };
}

const ACCEPT_REF = /^([1-9]\.\d+) accepted$/;
const CHECK_REF = /^([1-9]\.\d+) check$/;
const firstLine = (body) => String(body || '').split('\n')[0];
const who = (e) => e.by || 'unknown';

// What happened in one session (spec §5): the entries from its SESSION marker
// to the next marker or the end of the log. Read-only.
function protocolOf({ decisionsText, canvasText, key = null, seq } = {}) {
  const text = String(decisionsText || '');
  const { entries } = parseDecisions(text);
  const markers = entries.filter((e) => e.kind === 'SESSION');
  if (!markers.length) return refuse('not-found', 'The log has no session marker. Start one with research-harness session start "<occasion>".');
  const marker = seq === undefined ? markers[markers.length - 1] : markers.find((m) => m.seq === seq);
  if (!marker) return refuse('not-found', `#${seq} is not a session marker; the markers are ${markers.map((m) => `#${m.seq}`).join(', ')}.`);
  const start = entries.indexOf(marker);
  const nextMarker = markers[markers.indexOf(marker) + 1];
  const end = nextMarker ? entries.indexOf(nextMarker) : entries.length;
  const section = entries.slice(start, end);
  const upTo = text.slice(0, nextMarker ? nextMarker.offset : text.length).replace(/\n+$/, '\n');
  const last = section[section.length - 1];

  const chain = verifyChain(text, key);
  const brokenHere = chain.broken && chain.broken.seq <= last.seq;
  const sealLine = brokenHere
    ? `broken at #${chain.broken.seq} (${chain.broken.why})`
    : section.every((e) => chain.verified.has(e.seq)) ? 'verified' : 'unverifiable here (no key)';

  const parsed = canvasText ? canvas.parseCanvas(canvasText) : null;
  const statementOf = (e, questionId) => {
    const q = parsed ? findQuestion(parsed, questionId).question : null;
    const found = q ? q.statements.find((s) => textHash(s.text) === e.hash) : null;
    return found ? found.text : `text changed since (text ${e.hash})`;
  };

  const out = [];
  if (brokenHere) out.push(`**BROKEN at #${chain.broken.seq}** — the log does not verify from this entry on; read what follows as unconfirmed.`, '');
  out.push(`# Session protocol — ${marker.ref}`, '', `Date: ${marker.date}`, `Participants: ${[...new Set(section.map(who))].join(', ')}`, '');

  const accepted = section.filter((e) => e.kind === 'DECISION');
  out.push('## Accepted', '');
  if (!accepted.length) out.push('Nothing was accepted.', '');
  for (const e of accepted) {
    const q = ACCEPT_REF.exec(e.ref);
    out.push(q ? `- **${q[1]}** (#${e.seq}) — ${statementOf(e, q[1])}` : `- **${e.ref}** (#${e.seq}) — ${firstLine(e.body)}`);
    if (e.explained) out.push(`  Explained: ${e.explained}`);
    out.push(`  By: ${who(e)}`);
    if (e.supersedes) out.push(`  Supersedes: #${e.supersedes}`);
  }
  out.push('');

  const noted = section.filter((e) => e.kind === 'DISCOVERY' || e.kind === 'CONSTRAINT');
  out.push('## Noted', '');
  if (!noted.length) out.push('Nothing was noted.', '');
  for (const e of noted) {
    out.push(`- ${e.kind} ${e.ref} (#${e.seq}) — ${firstLine(e.body)}`);
    if (e.why) out.push(`  Why: ${e.why}`);
    out.push(`  By: ${who(e)}`);
  }
  out.push('');

  const questions = [...new Set(parseDecisions(upTo).entries.map((e) => CHECK_REF.exec(e.ref.trim())).filter(Boolean).map((m) => m[1]))];
  const open = questions.flatMap((q) => openChecks(upTo, q));
  out.push('## Open at the end', '');
  if (!open.length) out.push('No check question was open.');
  for (const e of open) out.push(`- ${e.ref} #${e.seq} — ${firstLine(e.body)}`);
  out.push('', '---', '', `Seal: ${sealLine}. Entries #${marker.seq}–#${last.seq}.`, `Anchor: ${logAnchor(upTo)}`, '');
  return { ok: true, markdown: out.join('\n') };
}

module.exports = { protocolOf };
```

If requiring `./accept` from `protocol.js` creates a require cycle through `state.js`, move nothing: `accept.js` does not require `protocol.js`, so there is none.

- [ ] **Step 4: Wire the CLI**

Add `'out'` to `VALUE_FLAGS`; usage `'research-harness session protocol [<n>] [--out <file>]'`; in `session()`:

```js
  if (action === 'protocol') {
    if (rest.length > 1) return fail(`session protocol takes at most one entry number.\n${USAGE}`, 2);
    const seq = rest.length ? entryNumber(rest[0]) : undefined;
    if (seq === null) return fail(`session protocol takes an entry number, e.g. 12.\n${USAGE}`, 2);
    const state = loadState();
    if (state.error) return fail(state.error);
    const result = protocolOf({ decisionsText: state.decisionsText, canvasText: state.canvasText, key: state.key, seq });
    if (!result.ok) return fail(result.error);
    return writeOrSay(result.markdown, flags.out);
  }
```

with a shared helper (Task 6 uses it too; whichever task lands first adds it):

```js
// Read-only exports print, or write the one file the person named.
function writeOrSay(markdown, out) {
  if (out === undefined) {
    process.stdout.write(markdown);
    return 0;
  }
  fs.writeFileSync(out, markdown);
  say(`Written to ${out}.`);
  return 0;
}
```

- [ ] **Step 5: Run the suite**

Run: `node --test test/*.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "CLI: research-harness session protocol prints what one session decided"
```

---

### Task 6: Agenda in one place: `agendaOf`, the CLI export, the tab

**Files:**
- Create: `plugins/research-harness/hooks/lib/agenda.js`
- Modify: `plugins/research-harness/bin/canvas-serve.js` (`canvasState` adds `agenda`, `humanQuestions`)
- Modify: `plugins/research-harness/dashboard/canvas.html` (`HUMAN_QUESTIONS`, `agendaFindings`, `gapQuestions`, `renderAgenda`, poster chip)
- Modify: `plugins/research-harness/bin/research-harness.js` (`agenda`)
- Test: `plugins/research-harness/test/agenda.test.js` (new), `test/serve.test.js`, `test/view.test.js`, `test/cli.test.js`

**Interfaces:**
- Consumes: `by` (Task 1), `statusByNumber` (`profile.js`), `ledgerSummary` (`review.js`).
- Produces: `HUMAN_QUESTIONS` (object 1–9, moved verbatim from `canvas.html:788-798`); `agendaOf(parsed, decisionsText) → { fields: [{ number, question, findings: [{ seq, ref, date, body, by, why }] }], gaps: [{ number, question, questionId, text }] }`; `agendaMarkdown(agenda, { title, date, seal }) → string`. State from `viewState` gains `agenda` and `humanQuestions`.

- [ ] **Step 1: Write the failing tests**

`test/agenda.test.js` — on the fixture `test/fixtures/voice-uptake/research/` (read its canvas first to pick an element with a DISCOVERY finding and one empty question):

```js
test('agendaOf: open fields with their findings and By, unanswered questions, accepted fields left out', () => {
  const parsed = canvas.parseCanvas(canvasText);
  const a = agendaOf(parsed, decisionsText);
  // every listed field has findings, none is accepted
  for (const f of a.fields) {
    assert.ok(f.findings.length);
    assert.notEqual(profile.statusByNumber(parsed)[f.number].status, 'accepted');
    assert.equal(f.question, HUMAN_QUESTIONS[f.number]);
    for (const d of f.findings) assert.ok('by' in d);
  }
  // every gap is a question without statements
  for (const g of a.gaps) assert.equal(findQuestion(parsed, g.questionId).question.statements.length, 0);
});

test('a field leaves the agenda once accepted', () => {
  // take a field from agendaOf(...).fields, mark every statement of it [accepted] in the canvas text, and check it is gone
});

test('agendaMarkdown: header, per field the human question and findings with By, then Not answered yet', () => {
  const md = agendaMarkdown({ fields: [{ number: 7, question: 'What did we find?', findings: [{ seq: 4, ref: '7', date: '2026-10-08', body: 'A finding.\n**By:** B. Supervisor', by: 'B. Supervisor', why: null }] }], gaps: [{ number: 9, question: 'Where does it stop?', questionId: '9.1', text: 'What are the limits?' }] }, { title: 'Voice Uptake', date: '2026-10-08', seal: 'ledger: 4 entries, all verified' });
  assert.equal(md, [
    '# Agenda — Voice Uptake', '',
    'Date: 2026-10-08', 'Seal: ledger: 4 entries, all verified', '',
    '## 7 · What did we find?', '',
    '- #4 A finding. (By: B. Supervisor)', '',
    '## Not answered yet', '',
    '- 9 · Where does it stop? — 9.1 What are the limits?', '',
  ].join('\n'));
});
```

Fill the "leaves the agenda" test with real canvas edits once the fixture is read; it must not be left as a comment.

`test/serve.test.js` (use its `copyFixture()` and `viewState(root, pluginRoot)` → `{ ok, body }`):

```js
test('viewState carries the agenda and the human questions, computed by agendaOf', () => {
  const root = copyFixture();
  const { ok, body } = viewState(root, pluginRoot);
  assert.equal(ok, true);
  const state = stateLib.loadState(root, { pluginRoot });
  assert.deepEqual(body.agenda, agendaOf(state.parsed, state.decisionsText));
  assert.deepEqual(body.humanQuestions, HUMAN_QUESTIONS);
});
```

`test/view.test.js`:

```js
test('the view holds no copy of the agenda logic or the human questions; it renders what the server sends', () => {
  assert.doesNotMatch(html, /What puzzles us\?/);
  assert.doesNotMatch(html, /function gapQuestions|function agendaFindings/);
  assert.match(html, /s\.agenda/);
  assert.match(html, /humanQuestions/);
});
```

Plus one DOM test in the style of the existing async view tests (read `test/view.test.js` from line 354 for the harness they use): render the fixture state, open the "To talk about" tab, and check that every field in `body.agenda.fields` appears as `#agenda-field-<n>` and every gap's text appears.

`test/cli.test.js`: `agenda` prints `agendaMarkdown` of the project state (compare after building the same inputs in-process); `--out` writes the file.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/agenda.test.js test/serve.test.js test/view.test.js`
Expected: FAIL — module not found; `body.agenda` undefined; the view still holds `What puzzles us?`.

- [ ] **Step 3: Implement `hooks/lib/agenda.js`**

```js
'use strict';

const { parseDecisions } = require('./decisions');
const { statusByNumber } = require('./profile');

// The question each element answers, in the reading views' words
// (references/canvas-elements.md). Moved here from the view so the agenda the
// CLI prints and the tab the view shows cannot drift apart (spec §6).
const HUMAN_QUESTIONS = {
  1: 'What puzzles us?',
  2: 'Who cares, and what do they already know?',
  3: 'What exactly do we ask?',
  4: 'What is it made of?',
  5: 'Where do we look?',
  6: 'How do we look?',
  7: 'What did we find?',
  8: 'What does it change?',
  9: 'Where does it stop?',
};

const elementOf = (ref) => {
  const m = /^(\d+)/.exec(ref || '');
  return m ? Number(m[1]) : null;
};

// The state before a session: every field not yet accepted that has a
// finding, with its findings, and every question nobody has answered.
function agendaOf(parsed, decisionsText) {
  const statuses = statusByNumber(parsed);
  const { entries } = parseDecisions(decisionsText || '');
  const fields = [];
  const gaps = [];
  for (const e of parsed.elements) {
    const question = HUMAN_QUESTIONS[e.number] || e.title;
    const accepted = statuses[e.number] && statuses[e.number].status === 'accepted';
    const findings = accepted ? [] : entries
      .filter((d) => d.kind === 'DISCOVERY' && elementOf(d.ref) === e.number)
      .map((d) => ({ seq: d.seq, ref: d.ref, date: d.date, body: d.body, by: d.by, why: d.why }));
    if (findings.length) fields.push({ number: e.number, question, findings });
    for (const q of e.questions) {
      if (!q.statements.length) gaps.push({ number: e.number, question, questionId: q.id, text: q.text });
    }
  }
  return { fields, gaps };
}

function agendaMarkdown(agenda, { title, date, seal }) {
  const out = [`# Agenda — ${title}`, '', `Date: ${date}`, `Seal: ${seal}`, ''];
  for (const f of agenda.fields) {
    out.push(`## ${f.number} · ${f.question}`, '');
    for (const d of f.findings) out.push(`- #${d.seq} ${d.body.split('\n')[0]} (By: ${d.by || 'unknown'})`);
    out.push('');
  }
  if (agenda.gaps.length) {
    out.push('## Not answered yet', '');
    for (const g of agenda.gaps) out.push(`- ${g.number} · ${g.question} — ${g.questionId} ${g.text}`);
    out.push('');
  }
  if (!agenda.fields.length && !agenda.gaps.length) out.push('Nothing to talk about right now.', '');
  return out.join('\n');
}

module.exports = { HUMAN_QUESTIONS, agendaOf, agendaMarkdown };
```

Before relying on `q.text`, check the property name the parser gives a question's wording in `hooks/lib/canvas.js` (the view reads `g.question.text`); use the real one.

- [ ] **Step 4: Send it and render it**

`canvas-serve.js` `canvasState`: add `agenda: agendaOf(state.parsed, state.decisionsText),` and `humanQuestions: HUMAN_QUESTIONS,` to the returned object.

`canvas.html`:
- `var HUMAN_QUESTIONS = {};` replaces the literal object; where the state arrives (the function that assigns `state = ...` after `/api/state` or the fixture load), add `HUMAN_QUESTIONS = s.humanQuestions || {};` before the first render.
- Delete `gapQuestions` and `agendaFindings`. `renderAgenda(s)` iterates `s.agenda.fields` (each item's findings render through `renderEntryBody(d.body)` as now, and the element title through `f.question`) and `s.agenda.gaps` (`g.question`, `g.text`, `data-view-target="element-' + g.number + '"`).
- The poster chip that counted `agendaFindings(s, e).length` counts `(s.agenda.fields.filter(function (f) { return f.number === e.number; })[0] || { findings: [] }).findings.length`.
- The fixture files under `test/fixtures` or the scratchpad that the view tests load must carry `agenda` and `humanQuestions`; regenerate them through `viewState` rather than hand-editing.

- [ ] **Step 5: The `agenda` command**

Usage `'research-harness agenda [--out <file>]'`, `case 'agenda': return agenda(flags);`:

```js
// ---------- agenda ----------

// The "To talk about" tab as Markdown, before a session (spec §6). Read-only.
function agenda(flags) {
  const state = loadState();
  if (state.error) return fail(state.error);
  const fm = state.parsed.frontmatter;
  const markdown = agendaMarkdown(agendaOf(state.parsed, state.decisionsText), {
    title: fm.title || fm.project || 'Untitled',
    date: today(),
    seal: ledgerSummary(seal.verifyChain(state.decisionsText, state.key)),
  });
  return writeOrSay(markdown, flags.out);
}
```

(Import `ledgerSummary` from `review.js`; add `writeOrSay` from Task 5 if this task lands first.)

- [ ] **Step 6: Run the suite; check the tab in a real browser**

Run: `node --test test/*.test.js`
Expected: all pass. Then build a state body with `viewState` in a scratch script, serve `dashboard/` statically, open `canvas.html?fixture=<state>.json` with `cmux browser open-split`, open "To talk about", `screenshot`, `errors list`, `console list` — no errors, same items as before the change.

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "Agenda: one agendaOf for the CLI export and the To talk about tab"
```

---

### Task 7: Setting up the second clone

**Files:**
- Modify: `plugins/research-harness/bin/research-harness.js` (`key export`, `join`, `init` refusal, doctor checks)
- Modify: `plugins/research-harness/hooks/lib/state.js` (`ledgerRefusal` key pointer)
- Modify: `plugins/research-harness/hooks/lib/seal.js` (`sealedAppend` key-missing message)
- Test: `test/cli.test.js`, `test/join.test.js` (new)

**Interfaces:**
- Consumes: `identity.writeName`, `nameRefusal` (Task 1); `readKeyFile`, `keyPath`, `verifyChain` (`seal.js`).
- Produces: CLI `key export --out <file>.seal.key`, `join --key-file <file> --name "<name>"`; `ledgerRefusal` names `join` on a sealed log without a key.

- [ ] **Step 1: Write the failing tests** (`test/join.test.js`; copy `makeProject`/`run`/`stateDirOf` from `test/cli.test.js`, with a second state dir per "machine")

```js
test('key export writes the key to a .seal.key file, mode 600, and never prints it', () => {
  const root = keyed(); // makeProject + init + name
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-k-')), 'voice.seal.key');
  const r = run(root, ['key', 'export', '--out', out]);
  assert.equal(r.status, 0, r.stdout);
  const key = fs.readFileSync(out, 'utf8').trim();
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.ok(!r.stdout.includes(key));
  assert.match(r.stdout, /not as plain-text mail, not into the repository/);
  assert.equal(run(root, ['key', 'export', '--out', out]).status, 1, 'an existing file is not overwritten');
  assert.equal(run(root, ['key', 'export', '--out', out.replace('.seal.key', '.txt')]).status, 2);
  assert.equal(run(root, ['key', 'export']).status, 2);
});

test('join with the matching key copies it, sets the name, says the file can go, runs doctor', () => {
  const { root, exported } = keyedWithExport();
  const clone = duplicateProject(root); // copy research/ into a new tmp dir: a second clone path
  const r = run(clone, ['join', '--key-file', exported, '--name', 'B. Supervisor'], { RESEARCH_HARNESS_STATE_DIR: freshState() });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /can delete .*voice\.seal\.key now/);
  assert.match(r.stdout, /research-harness doctor/);
  assert.ok(fs.existsSync(exported), 'join never deletes the file');
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
  // first join succeeds; a second join with a different (verifying-nothing) key refuses with "already"; the same key again exits 0
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

test('doctor: name, key verifies the log; notes for a missing remote and pull.rebase=true', () => {
  // in a git repo (git init) with no remote and `git config pull.rebase true`:
  // doctor output contains "note: no git remote" and "note: pull.rebase is true … git config pull.rebase false";
  // with a key that does not verify the log (overwrite the key file with another 64-hex key): doctor fails with "does not verify"
});
```

Fill the two sketched tests with real code following the same helpers; neither may stay a comment.

The existing `test/cli.test.js:275` test (`sealed on another machine`) changes its expected exit code from 0 to 1.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/join.test.js`
Expected: FAIL — unknown command `key`, `join`.

- [ ] **Step 3: `key export` and `join`**

Add `'key-file'`, `'name'` to `VALUE_FLAGS` (`out` came with Task 5/6). Usage lines `'research-harness key export --out <file>.seal.key'`, `'research-harness join --key-file <file> --name "<name>"'`. Cases `case 'key': return keyCommand(positional, flags);`, `case 'join': return join(flags);`.

```js
// ---------- key export / join ----------

const EXPORT_SUFFIX = '.seal.key';

// The key holder's one step (spec §7): the project key into a file of their
// choosing, mode 600, never on stdout. The guard refuses this to the model.
function keyCommand(positional, flags) {
  if (positional[0] !== 'export' || positional.length !== 1) return fail(`key takes export.\n${USAGE}`, 2);
  if (typeof flags.out !== 'string' || !flags.out.endsWith(EXPORT_SUFFIX)) {
    return fail(`key export needs --out <file> ending in ${EXPORT_SUFFIX}.\n${USAGE}`, 2);
  }
  const root = project.projectDir({});
  let key;
  try {
    key = seal.readKey(root);
  } catch (err) {
    return fail(err.message);
  }
  if (!key) return fail('There is no sealing key for this project on this machine, so there is nothing to export.');
  try {
    fs.writeFileSync(flags.out, `${key.toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') return fail(`${flags.out} already exists; nothing was written.`);
    throw err;
  }
  say(`Key written to ${flags.out} (mode 0600). Hand it to the second person yourself — not as plain-text mail, not into the repository. They run: research-harness join --key-file <file> --name "<their name>"`);
  return 0;
}

// The second person's one step: check the key against this clone's log, copy
// it, set the name. A key that does not verify the log is refused before
// anything is copied — a wrong key here would report every later merge as
// broken.
function join(flags) {
  if (typeof flags['key-file'] !== 'string' || typeof flags.name !== 'string') return fail(`join needs --key-file <file> and --name "<name>".\n${USAGE}`, 2);
  const bad = identity.nameRefusal(flags.name);
  if (bad) return fail(bad, 2);
  let key;
  try {
    key = seal.readKeyFile(flags['key-file']);
  } catch (err) {
    return fail(err.message);
  }
  const state = loadState();
  if (state.error) return fail(state.error);
  const chain = seal.verifyChain(state.decisionsText, key);
  if (chain.status === 'broken') {
    return fail(`This key does not verify ${path.relative(state.root, state.paths.decisions)}: it fails at #${chain.broken.seq} (${chain.broken.why}). It belongs to another project, or the log was changed. Nothing was copied.`);
  }
  if (state.keyError) return fail(`${state.keyError}; nothing was copied.`);
  const file = seal.keyPath(state.root);
  if (state.key && !state.key.equals(key)) return fail(`A different key is already at ${file}; nothing was copied. If it is wrong, the person who set it up decides which key is the project's.`);
  if (!state.key) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, key.toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  identity.writeName(flags.name);
  say(`${state.key ? 'The same key was already here; kept.' : `Key copied to ${file}.`} Name set: ${flags.name.trim()}.`);
  say(`You can delete ${flags['key-file']} now; join does not delete it.`);
  say('research-harness doctor:');
  doctor();
  return 0;
}
```

- [ ] **Step 4: Close the trap**

`init` (the sealed-log branch at `bin/research-harness.js` ~line 186): replace the message and return 1:

```js
      return fail(`${path.relative(root, decisionsFile)} is sealed on another machine. Do not create a new key here: ask whoever holds the key to run research-harness key export --out <file>${EXPORT_SUFFIX}, then run research-harness join --key-file <file> --name "<your name>". Nothing was changed.`);
```

`state.js` `ledgerRefusal`, the `!state.key` branch:

```js
  if (!state.key) {
    const sealed = parseDecisions(state.decisionsText).entries.some((e) => e.seal !== null);
    return refuse(sealed
      ? 'No sealing key for this project on this machine, and the log is already sealed elsewhere; nothing is written. Get the project key from whoever holds it and run research-harness join --key-file <file> --name "<your name>". Do not run init: a new key would make the log read as broken.'
      : 'No sealing key for this project on this machine, so nothing is written: an entry counts only if it verifies (§4.7). Run `research-harness init --project <slug> --mode <mode>` once here to create the key, then retry.');
  }
```

`seal.js` `sealedAppend`: `throw new Error('no sealing key for this project on this machine; on a log sealed elsewhere run research-harness join, on a new project research-harness init');`

- [ ] **Step 5: Doctor checks**

Add to `doctor()`'s list: `checkKeyVerifies()` (inside a project with a key: `verifyChain(state.decisionsText, state.key).status === 'broken'` → fail `the key here does not verify decisions.md (fails at #n); run research-harness join with the project key`), and `checkGit()` returning notes only, `null` outside a git work tree:

```js
function checkGit() {
  const root = project.projectDir({});
  if (childProcess.spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' }).status !== 0) return [];
  const notes = [];
  const remotes = childProcess.spawnSync('git', ['remote'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (!remotes) notes.push({ ok: true, note: true, name: 'note', detail: 'no git remote; a second clone needs one' });
  const rebase = childProcess.spawnSync('git', ['config', '--get', 'pull.rebase'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  if (rebase && rebase !== 'false') notes.push({ ok: true, note: true, name: 'note', detail: `pull.rebase is ${rebase} here, so merge-log would refuse after a pull; run git config pull.rebase false` });
  return notes;
}
```

(spread into the checks array: `...checkGit()`). A missing remote and `pull.rebase` are notes, not failures: a project with one person and no remote is healthy.

- [ ] **Step 6: Run the suite**

Run: `node --test test/*.test.js`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "CLI: key export and join set up a second clone without a new key"
```

---

### Task 8: Guard: new subcommands and exported key files

**Files:**
- Modify: `plugins/research-harness/hooks/guard-promotion.js` (`CLI_READ_SUBS` ~line 241, the `log` special case ~line 1772, the denial text, `harnessRoot` names ~line 993 and the file-tool path check)
- Modify: `verification/SQ-29/probe-perimeter.js`
- Test: `plugins/research-harness/test/guard-promotion.test.js`

**Interfaces:**
- Consumes: the subcommand names of Tasks 1–7.
- Produces: allowed for the model: `agenda` and `session protocol [<n>]`, each only without `--out`. Denied: `name`, `session start`, `merge-log`, `key`, `join`, and any Bash word or file-tool path whose basename ends in `.seal.key`.

- [ ] **Step 1: Write the failing tests** (`test/guard-promotion.test.js`; reuse its `run(root, tool, input, env)` helper, which returns `{ permissionDecision, ... }`)

```js
test('0.5 subcommands: agenda and session protocol read; every writing one is the person\'s', () => {
  const root = project(); // the file's existing project helper
  const allow = ['research-harness agenda', 'research-harness session protocol', 'research-harness session protocol 12'];
  const deny = [
    'research-harness agenda --out notes.md',
    'research-harness agenda --out research/canvas.md',
    'research-harness session protocol --out p.md',
    'research-harness session protocol 12 --out p.md',
    'research-harness session start "Supervision"',
    'research-harness session',
    'research-harness name "A. Researcher"',
    'research-harness name',
    'research-harness merge-log',
    'research-harness merge-log --skip-decision 3',
    'research-harness key export --out k.seal.key',
    'research-harness join --key-file k.seal.key --name B',
  ];
  for (const command of allow) assert.notEqual(run(root, 'Bash', { command }).permissionDecision, 'deny', command);
  for (const command of deny) assert.equal(run(root, 'Bash', { command }).permissionDecision, 'deny', command);
});

test('an exported key file is the key: no tool reads, copies or writes a *.seal.key path', () => {
  const root = project();
  const file = path.join(os.tmpdir(), 'x', 'voice.seal.key');
  for (const [tool, input] of [
    ['Read', { file_path: file }],
    ['Write', { file_path: file, content: '00' }],
    ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
    ['Bash', { command: `cat ${file}` }],
    ['Bash', { command: 'cat ~/Downloads/voice.seal.key' }],
    ['Bash', { command: 'cp voice.seal.key /tmp/y' }],
    ['Bash', { command: 'base64 < voice.seal.key' }],
  ]) assert.equal(run(root, tool, input).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)}`);
  assert.notEqual(run(root, 'Bash', { command: 'cat notes.md' }).permissionDecision, 'deny');
});
```

Read the file's helpers first and use their real names (`project()` above stands for whatever creates a fixture project there).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/guard-promotion.test.js`
Expected: FAIL — `agenda` denied (not in `CLI_READ_SUBS`); `.seal.key` reads allowed.

- [ ] **Step 3: Implement**

- Next to the `log` special case (`if (invocation.sub.text === 'log')`, ~line 1773), add a case for `agenda` and `session`, modelled on `logKindOf` (which reads `invocation.rest`): `agenda` is allowed when no word of `invocation.rest` is opaque or is `--out`; `session` is allowed when the first non-flag word is literally `protocol`, the next word (if any) is a literal entry number (`/^#?\d+$/`), no word is opaque, and none is `--out`. Everything else returns the subcommand denial. Update that denial text (both occurrences) to list the read subcommands: `status, review, init, doctor, install-cli, title, agenda, session protocol, or log`.
- Do not add `name`, `merge-log`, `key`, `join` to `CLI_READ_SUBS`; their denial comes from the allowlist.
- Exported key files: wherever the guard tests a basename against `harnessRoot().names` (the `seal.KEY_FILE` check, used by `opaqueNamesState` ~line 1041) and wherever it tests a file-tool path against the state root, add a test `basename.endsWith('.seal.key')` that denies regardless of directory. A Bash word counts when its literal text (or the literal tail of an opaque word) ends in `.seal.key`.
- Perimeter probe: add rows `K1` (`cat <tmp>/voice.seal.key`), `K2` (`cp voice.seal.key /tmp/y`), `K3` (`research-harness key export --out k.seal.key`), `K4` (`research-harness agenda --out research/canvas.md`), each expecting DENY, following `shellRow`'s pattern; run the probe and record its new output in the file it writes, if it writes one.

- [ ] **Step 4: Run the suite and the probe**

Run: `node --test test/*.test.js && (cd ../.. && node --test verification/probe-benign.test.js && node verification/SQ-29/probe-perimeter.js >/dev/null; echo "probe exit $?")`
Expected: all pass; probe exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness verification .release/unreleased
git commit -m "Guard: agenda and session protocol read; *.seal.key and the 0.5 write commands stay the person's"
```

---

### Task 9: Names, sessions and a name filter in the view

**Files:**
- Modify: `plugins/research-harness/dashboard/canvas.html` (History renderer, field findings, agenda items, the `c=` stripping at ~line 821, a filter bar)
- Test: `plugins/research-harness/test/view.test.js`

**Interfaces:**
- Consumes: `decisions[i].by` (Task 1), kinds `SESSION`/`MERGE` (Task 2), `s.agenda` (Task 6).
- Produces: no new server API. URL fragment `#by=<encoded name>` or `#by=unknown`; absent means "All".

- [ ] **Step 1: Write the failing tests** (DOM tests in the style of the async tests from `test/view.test.js:354` onward; build the fixture state through `viewState` on a project whose log holds two named entries, one unnamed, one SESSION and one MERGE)

1. Every History card, every finding in a field view, and every agenda finding shows a quiet name line: `By A. Researcher`, `By B. Supervisor`, `By unknown`.
2. The SESSION entry renders in History as a divider (`role="separator"` element) holding the occasion and the date, not as a card; the MERGE entry renders as one quiet line starting `Merged from`. Neither appears in a field's findings or in the agenda.
3. The filter bar above History holds buttons `All`, `A. Researcher`, `B. Supervisor`, `unknown`, each with `aria-pressed`; exactly one is `true`; `All` on load.
4. Clicking `B. Supervisor`: History lists only B's entries (dividers stay, so sessions remain readable); a field view lists only B's findings; the agenda is unchanged; every badge, chip count and field status is unchanged (compare the poster's text before and after).
5. The fragment becomes `#by=B.%20Supervisor`; reloading the page with it restores the filter.
6. A URL with `#c=<code>&by=B.%20Supervisor`: after the code is read, the fragment still carries `by=` and the filter is applied.
7. A static check: `assert.doesNotMatch(html, /localStorage|sessionStorage/)` still holds (existing test).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/view.test.js`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

```js
  // The name filter (spec §8): which entries are listed, never what is
  // counted. Its state is the URL fragment, so a reload keeps it and nothing
  // lands in browser storage.
  var UNKNOWN = 'unknown';
  function nameOf(d) { return d.by || UNKNOWN; }
  function readByFilter() {
    var m = /(?:^|[#&])by=([^&]*)/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }
  var byFilter = readByFilter();
  function setByFilter(name) {
    byFilter = name;
    history.replaceState(null, '', location.pathname + location.search + (name ? '#by=' + encodeURIComponent(name) : ''));
    render();
  }
  function passesFilter(d) { return byFilter === null || nameOf(d) === byFilter; }
  function namesIn(decisions) {
    var names = [];
    var unknown = false;
    decisions.forEach(function (d) {
      if (d.kind === 'SESSION' || d.kind === 'MERGE') return;
      if (!d.by) unknown = true;
      else if (names.indexOf(d.by) < 0) names.push(d.by);
    });
    return unknown ? names.concat([UNKNOWN]) : names;
  }
```

- The `c=` stripping at ~line 821 keeps `by=`: replace the `history.replaceState(null, '', location.pathname + location.search)` there with one that rebuilds the fragment from `readByFilter()` (same expression as in `setByFilter`). Read `byFilter` before this line runs.
- Filter bar: `<div class="by-filter" role="group" aria-label="Show entries by">` with one `<button type="button" data-by="…" aria-pressed="true|false">` per entry of `['All'].concat(namesIn(s.decisions))` (`All` maps to `null`); a delegated click handler calls `setByFilter`.
- History: SESSION → `<div role="separator" class="session-divider">Session: <occasion> · <date></div>`; MERGE → `<p class="merge-line">Merged from <ref without "from "> — <first body line></p>`; other entries keep their cards, filtered with `passesFilter`, and gain `<p class="entry-by">By <name></p>` in the muted style of the `Why` line.
- Field findings (`findingsFor` callers in the field view) filter with `passesFilter`; the poster chip and the agenda use the unfiltered `s.agenda`.
- `parseFindingBody` already skips field lines once `ENTRY_LABEL` knows `By` (Task 1); render the name from `d.by`, not from the body.

- [ ] **Step 4: Run the suite; check in a real browser**

Run: `node --test test/*.test.js`
Expected: all pass. Then the browser pass from the spec: fixture state through `viewState`, static server, `cmux browser open-split`, click a name, `screenshot`, reload, `screenshot`, `errors list`, `console list` — the filter holds across the reload and the console is free of errors. Keep both screenshots for the ticket.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness .release/unreleased
git commit -m "View: names on every entry, session dividers, a name filter in the URL"
```

---

### Task 10: Docs

**Files:**
- Modify: `README.md` (new section "Two people, one canvas")
- Modify: `docs/technical-appendix.md` (`By` and its limits; `SESSION`, `MERGE`; `merge-log`)
- Modify: `plugins/research-harness/skills/*/SKILL.md` only where a skill lists the CLI's commands (grep for `research-harness doctor` to find such lists)

- [ ] **Step 1: README section** — in this order: what the setting is (two people, one canvas, one machine or two clones); the key holder's step (`key export`), the second person's step (install the plugin, `install-cli`, `git clone`, `join`), `git config pull.rebase false`; before a session `agenda --out`; `session start "<occasion>"`; after a session `session protocol --out`; when a pull conflicts on `decisions.md`, `merge-log`, then `git add`/`git commit`; the check refusal and `--skip-decision <n>` (spelled without `#`, with the sentence on resetting the marker by hand). State plainly that `By` is a statement, not proof: whoever holds the key can write any name.
- [ ] **Step 2: Technical appendix** — the `By` field and why existing seals stay valid (the body is already under seal); the two new kinds and that review and accept ignore them; the merge algorithm in five lines (verify both, shared prefix by seal, prefix case, renumber and re-seal ours after theirs with references rewritten, MERGE entry) and why re-sealing is sound (both clones hold the same key; the MERGE entry records the moves).
- [ ] **Step 3: Check** — `node --test test/*.test.js` (the `skills.test.js` and `references.test.js` tests read some of these files); write the prose to the `avoid-ai-tells` rules.
- [ ] **Step 4: Commit**

```bash
git add README.md docs plugins/research-harness .release/unreleased
git commit -m "Docs: two people, one canvas"
```

---

## After all tasks

- The full gate on `main` after the last merge: the suite, `scripts/release.test.js` + `verification/probe-benign.test.js`, the perimeter probe.
- One end-to-end pass by hand in two tmp clones following the README section word for word (`key export`, `join`, parallel `log`, `pull`, `merge-log`, `session start`, `agenda`, `session protocol`), before Daniel sees it.
- Release 0.5.0 per the recipe in the handoff: one user-facing CHANGELOG section merged from all `.release/unreleased/` fragments (SQ-171/172/173/175 included).
