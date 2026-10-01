# Profile `is-quantitative` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a second genre profile, `is-quantitative`, with a review check that reports findings logged before the hypotheses were accepted, a view that takes its dependency graph from the active profile, and a command that switches an existing canvas to another profile.

**Architecture:** A profile stays a Markdown file with machine-readable fenced blocks; `profile.js` learns one optional block, `checks`. `review.js` gains one pure check over the log's `seq` order. `state.js` carries the profile's checks next to its graph, `canvas-serve.js` sends the graph to the view, and the view's static graph copy goes. `research-harness profile <id>` rewrites one frontmatter line and appends a sealed CONSTRAINT entry.

**Tech Stack:** Node.js (CommonJS, no dependencies), `node:test`, plain HTML/JS dashboard.

**Spec:** `docs/superpowers/specs/2026-10-01-research-harness-0.5-design.md`, §9 only.

## Global Constraints

- Everything in the repo is English.
- No new npm dependencies.
- Reported, never enforced: no check in this plan blocks an accept, a log or a write.
- The `is-qualitative` profile, its graph and its behaviour do not change.
- `bin/research-harness.js` and `bin/canvas-serve.js` contain the word `serve`; the research-harness guard refuses a shell command whose text names it. Edit these files with the Edit tool, never with a sed/python heredoc.
- Run the suite from `plugins/research-harness`: `node --test test/*.test.js`. Baseline before this plan: 338 tests, 338 pass.
- The `By:` field (spec §3) is not built yet. The CONSTRAINT entry in Task 4 is written without it and gains it when §3 lands.
- Each task ends with a commit; untracked files are committed too.

## Review Focus

1. A canvas whose frontmatter names `is-quantitative` but runs on a plugin version without the file: the review and the view must say "profile not found", not crash. (Existing `profileError` path; Task 3 adds the test that the view gets `graph: null` and the error.)
2. A log with no entry on element 7: the check reports nothing, not "element 4 missing". (Task 2.)
3. A DECISION on element 4 that comes *after* the first element-7 entry still counts as "after", so the report stands. (Task 2.)
4. `research-harness profile` with an unknown id, a missing key, or a broken ledger: nothing is written, neither frontmatter nor log. (Task 4.)
5. Switching to the profile already set: refuse with a plain message, write nothing. (Task 4.)

---

### Task 1: The profile file, the module text, and an optional `checks` block

**Files:**
- Create: `plugins/research-harness/references/profiles/is-quantitative.md`
- Create: `plugins/research-harness/references/preregistration.md`
- Modify: `plugins/research-harness/hooks/lib/profile.js`
- Test: `plugins/research-harness/test/profile.test.js`

**Interfaces:**
- Produces: `parseChecks(markdown) → string[]`, `KNOWN_CHECKS = ['hypotheses-before-data']`, and `loadProfile(id, pluginRoot) → { id, graph, checks, text }` (adds `checks`; `[]` when the file has no `checks` block).

- [ ] **Step 1: Write the failing tests** (append to `test/profile.test.js`)

```js
test('parseChecks reads an optional fenced checks block and refuses unknown names', () => {
  assert.deepEqual(profile.parseChecks('no block'), []);
  assert.deepEqual(profile.parseChecks('x\n```checks\nhypotheses-before-data\n```\n'), ['hypotheses-before-data']);
  assert.throws(() => profile.parseChecks('```checks\nsomething-else\n```'), /unknown check: something-else/);
});

test('loadProfile loads is-quantitative with the hypothetico-deductive graph and its check', () => {
  const p = profile.loadProfile('is-quantitative', pluginRoot);
  assert.deepEqual(p.graph, { 1: [], 2: [1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [6], 8: [2, 4, 7], 9: [5, 7] });
  assert.deepEqual(p.checks, ['hypotheses-before-data']);
});

test('is-qualitative carries no checks, so its review is unchanged', () => {
  assert.deepEqual(profile.loadProfile('is-qualitative', pluginRoot).checks, []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd plugins/research-harness && node --test test/profile.test.js`
Expected: FAIL, `profile.parseChecks is not a function` and `profile not found: is-quantitative`.

- [ ] **Step 3: Implement `parseChecks` in `hooks/lib/profile.js`**

Add below `parseGraph`:

```js
const CHECKS_RE = /```checks\n([\s\S]*?)```/;
const KNOWN_CHECKS = ['hypotheses-before-data'];

// The second machine-readable part of a profile, and an optional one: the
// mechanical checks its modules add to the review. A name the review does not
// know is an error on load, not a check that silently never runs.
function parseChecks(markdown) {
  const block = CHECKS_RE.exec(String(markdown));
  if (!block) return [];
  const names = block[1].split('\n').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!KNOWN_CHECKS.includes(name)) throw new Error(`unknown check: ${name}`);
  }
  return names;
}
```

In `loadProfile`, change the return to:

```js
  return { id, graph: parseGraph(text), checks: parseChecks(text), text };
```

Export: `module.exports = { parseGraph, parseChecks, KNOWN_CHECKS, loadProfile, dependencyViolations, statusByNumber };`

- [ ] **Step 4: Write `references/profiles/is-quantitative.md`**

```markdown
# Profile: is-quantitative

Information systems, hypothetico-deductive work: experiments and surveys that
test hypotheses derived from prior theory. A sibling of `is-qualitative.md`;
copy, change, open a pull request. Mixed methods is not covered; it would be a
third profile.

A profile owns three things: which elements carry weight and how their
questions are read; the dependency graph; and which modules attach where. It
states its commitments in prose a researcher can dispute. It produces no score.

## Emphasis

The canvas's authors note that the theoretical framework is "either driving the
research (in quantitative studies) or emerging from it (in qualitative ones)"
(Dorobantu et al. 2024). This profile takes the first reading:

- **Element 2 (Prior Research) drives the question.** The gap, conflict or
  silence in prior findings is where the question comes from.
- **Element 4 (Constructs) holds the hypotheses**, each with its constructs and
  the theory behind it, firm before data exist. Read with Sparrowe & Mayer
  (2011), *Publishing in AMJ — Part 4*.
- **Element 6 (Design) holds manipulations, measures, the analysis plan and the
  power argument.** Read with Bono & McNamara (2011), *Publishing in AMJ —
  Part 2*.
- **Element 5 (Setting) is the population and the sample** the theory applies
  to.
- **Element 9 (Boundaries) is the scope of the generalization**, judged against
  the sample and the findings.

## Dependency graph

An element may not be `[accepted]` while an element it depends on is not.
Reported by `canvas-review`, never enforced. This is the order in which the
canvas presents its elements, which `is-qualitative.md` names as the
hypothetico-deductive one. Each edge is a design proposal, not settled method.

```graph
1 <-
2 <- 1
3 <- 1, 2
4 <- 2, 3
5 <- 3, 4
6 <- 4, 5
7 <- 6
9 <- 5, 7
8 <- 2, 4, 7
```

- `3 ← 2`: the question comes out of prior research, not from the phenomenon
  alone.
- `4 ← 2, 3`: hypotheses are derived from theory and answer the question.
- `5 ← 4`: the sample is chosen where the hypotheses apply.
- `6 ← 4, 5`: the design operationalizes the constructs in that sample.
- `9 ← 5, 7`: how far the result generalizes depends on the sample and on what
  was found.

## Modules

| Element | Module |
|---|---|
| 4, 6 | `references/preregistration.md` — hypotheses and analysis plan before data |
| all | `references/amj-map.md` — which part of *Publishing in AMJ* to read for each element |

```checks
hypotheses-before-data
```
```

- [ ] **Step 5: Write `references/preregistration.md`**

```markdown
# Hypotheses before data

Attached to elements 4 and 6 by the `is-quantitative` profile.

A hypothesis that is written after the data are in is a description of the
data. The sealed log already records the order in which things were accepted,
so it can show that the hypotheses (element 4) and the design with its
analysis plan (element 6) were accepted before the first finding (element 7)
was recorded.

`research-harness review` reports, under "Findings before hypotheses", every
case where the first log entry on element 7 comes before any acceptance on
element 4 or element 6. It blocks nothing. A finding logged early can have a
good reason, such as a pilot; the report makes the order visible, and the
researcher explains it.

This is not a preregistration with a registry. It is the order of a log that
the authors can publish an anchor for (`research-harness review`, "Anchor").
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/profile.test.js test/references.test.js`
Expected: PASS. If `references.test.js` checks that every file under `references/` is linked from somewhere, link `preregistration.md` from the profile's module table (already done above) and re-run.

- [ ] **Step 7: Run the full suite, commit**

Run: `node --test test/*.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: fail 0.

```bash
git add plugins/research-harness/references plugins/research-harness/hooks/lib/profile.js plugins/research-harness/test/profile.test.js
git commit -m "Profile is-quantitative with a checks block"
```

---

### Task 2: The `hypotheses-before-data` check in the review

**Files:**
- Modify: `plugins/research-harness/hooks/lib/review.js`
- Modify: `plugins/research-harness/hooks/lib/state.js:38-55`
- Modify: `plugins/research-harness/bin/research-harness.js` (review output, around line 283–301; Edit tool only)
- Test: `plugins/research-harness/test/review.test.js`, `plugins/research-harness/test/cli.test.js`

**Interfaces:**
- Consumes: `loadProfile(...).checks` from Task 1.
- Produces: `findingsBeforeHypotheses(decisionsText) → Array<{ element: 4|6, finding: number }>`; `mechanicalReview({ parsed, graph, checks = [], decisionsText, key })` whose result adds `findingsBeforeHypotheses` (always an array); `loadState(...)` result adds `checks` (`[]` on a profile error).

- [ ] **Step 1: Write the failing unit tests** (append to `test/review.test.js`; add `const { formatEntry } = require('../hooks/lib/decisions');` at the top if absent)

```js
function logOf(entries) {
  return entries.map((e, i) => formatEntry({ seq: i + 1, date: '2026-10-01', body: 'x', ...e })).join('\n');
}

test('findingsBeforeHypotheses is silent without an entry on element 7', () => {
  const text = logOf([{ kind: 'DISCOVERY', ref: '2.1 check' }]);
  assert.deepEqual(review.findingsBeforeHypotheses(text), []);
});

test('findingsBeforeHypotheses reports elements 4 and 6 not accepted before the first finding', () => {
  const text = logOf([
    { kind: 'DECISION', ref: '4.1 accepted' },
    { kind: 'DISCOVERY', ref: '7.1 check' },
    { kind: 'DECISION', ref: '6.1 accepted' },
  ]);
  assert.deepEqual(review.findingsBeforeHypotheses(text), [{ element: 6, finding: 2 }]);
});

test('findingsBeforeHypotheses is silent when 4 and 6 were accepted first', () => {
  const text = logOf([
    { kind: 'DECISION', ref: '4.1 accepted' },
    { kind: 'DECISION', ref: '6.2 accepted' },
    { kind: 'CONSTRAINT', ref: '7' },
  ]);
  assert.deepEqual(review.findingsBeforeHypotheses(text), []);
});

test('mechanicalReview runs the check only when the profile names it', () => {
  const parsed = canvas.parseCanvas(canvasText);
  const text = logOf([{ kind: 'DISCOVERY', ref: '7.1 check' }]);
  assert.deepEqual(review.mechanicalReview({ parsed, graph: null, decisionsText: text }).findingsBeforeHypotheses, []);
  assert.equal(review.mechanicalReview({ parsed, graph: null, checks: ['hypotheses-before-data'], decisionsText: text }).findingsBeforeHypotheses.length, 2);
});
```

`canvas` and `canvasText` are already defined in `review.test.js`; if not, take them from `test/profile.test.js` lines 9–15.

- [ ] **Step 2: Run to verify they fail**

Run: `cd plugins/research-harness && node --test test/review.test.js`
Expected: FAIL, `review.findingsBeforeHypotheses is not a function`.

- [ ] **Step 3: Implement in `hooks/lib/review.js`**

Above `mechanicalReview`:

```js
// The element a log entry is about: `4.1 accepted`, `7.2 check`, a bare `7`.
const ELEMENT_REF_RE = /^([1-9])(?:\.\d+)?(?:\s|$)/;
function elementOfRef(ref) {
  const m = ELEMENT_REF_RE.exec(String(ref || '').trim());
  return m ? Number(m[1]) : null;
}

// The `hypotheses-before-data` check (references/preregistration.md): the
// sealed log orders events, so it can show whether the hypotheses (4) and the
// design (6) were accepted before the first finding (7) was recorded. It
// reports; it never blocks.
function findingsBeforeHypotheses(decisionsText) {
  const { entries } = parseDecisions(decisionsText || '');
  const first = entries.find((e) => elementOfRef(e.ref) === 7);
  if (!first) return [];
  return [4, 6]
    .filter((n) => !entries.some((e) => e.kind === 'DECISION' && elementOfRef(e.ref) === n && e.seq < first.seq))
    .map((n) => ({ element: n, finding: first.seq }));
}
```

Change the signature to `function mechanicalReview({ parsed, graph, checks = [], decisionsText, key = null })` and add to the returned object:

```js
    findingsBeforeHypotheses: checks.includes('hypotheses-before-data') ? findingsBeforeHypotheses(decisionsText) : [],
```

Export `findingsBeforeHypotheses` next to `mechanicalReview`.

- [ ] **Step 4: Carry `checks` through `hooks/lib/state.js`**

Replace the profile block (around lines 38–44) with:

```js
  let graph = null;
  let checks = [];
  let profileError = null;
  try {
    const loaded = profileLib.loadProfile(parsed.frontmatter.profile || 'is-qualitative', pluginRoot || defaultPluginRoot());
    graph = loaded.graph;
    checks = loaded.checks;
  } catch (err) {
    profileError = err.message;
  }
```

and add `checks` to the returned object after `graph`.

- [ ] **Step 5: Print the section in `bin/research-harness.js` (Edit tool)**

Pass `checks: state.checks` to the `mechanicalReview` call in `review()`. After the `## Dependency violations` line add:

```js
  if (state.checks.includes('hypotheses-before-data')) {
    lines.push('## Findings before hypotheses', '(reported, never enforced; see references/preregistration.md)', ...(report.findingsBeforeHypotheses.length ? report.findingsBeforeHypotheses.map((f) => `#${f.finding} on element 7 comes before any acceptance on element ${f.element}`) : ['none']), '');
  }
```

- [ ] **Step 6: Write the CLI test** (append to `test/cli.test.js`)

```js
test('review prints "Findings before hypotheses" only under a profile with that check', () => {
  const root = keyedProject();
  const canvasFile = path.join(root, 'research', 'canvas.md');
  assert.doesNotMatch(run(root, ['review']).stdout, /Findings before hypotheses/);
  fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, 'utf8').replace(/^profile: .*$/m, 'profile: is-quantitative'));
  const out = run(root, ['review']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /## Findings before hypotheses\n\(reported, never enforced/);
});
```

- [ ] **Step 7: Run tests, then the full suite**

Run: `node --test test/review.test.js test/cli.test.js` → PASS. Then `node --test test/*.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'` → fail 0.

- [ ] **Step 8: Commit**

```bash
git add plugins/research-harness/hooks/lib/review.js plugins/research-harness/hooks/lib/state.js plugins/research-harness/bin/research-harness.js plugins/research-harness/test/review.test.js plugins/research-harness/test/cli.test.js
git commit -m "Review: report findings logged before the hypotheses were accepted"
```

---

### Task 3: The view takes its graph from the profile

**Files:**
- Modify: `plugins/research-harness/bin/canvas-serve.js` (state object, around lines 63–83; Edit tool only)
- Modify: `plugins/research-harness/dashboard/canvas.html:783-788, 1150, 1205`
- Test: `plugins/research-harness/test/serve.test.js`, `plugins/research-harness/test/view.test.js`

**Interfaces:**
- Consumes: `state.graph`, `state.checks` from Task 2.
- Produces: `/api/state` carries `graph` (the profile's adjacency object, or `null` on a profile error) and `review.findingsBeforeHypotheses`.

- [ ] **Step 1: Write the failing tests**

In `test/serve.test.js` (add `const { viewState } = require('../bin/canvas-serve');` and `const profileLib = require('../hooks/lib/profile');` if absent; reuse the file's existing project helper that creates a fixture root, named `makeProject` in `cli.test.js` — check the name in `serve.test.js` around line 22):

```js
test('viewState sends the active profile graph, and null with the error for an unknown profile', () => {
  const root = makeProject();
  const pluginRoot = path.resolve(__dirname, '..');
  const s = viewState(root, pluginRoot);
  assert.deepEqual(s.graph, profileLib.loadProfile('is-qualitative', pluginRoot).graph);
  const canvasFile = path.join(root, 'research', 'canvas.md');
  fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, 'utf8').replace(/^profile: .*$/m, 'profile: is-quantitative'));
  assert.deepEqual(viewState(root, pluginRoot).graph, profileLib.loadProfile('is-quantitative', pluginRoot).graph);
  fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, 'utf8').replace(/^profile: .*$/m, 'profile: no-such-profile'));
  const broken = viewState(root, pluginRoot);
  assert.equal(broken.graph, null);
  assert.match(broken.profileError, /profile not found/);
});
```

If `viewState` returns `{ ok, state }` rather than the state itself, read `.state` (check its return at `bin/canvas-serve.js` `viewState`).

In `test/view.test.js`:

```js
test('canvas.html takes the dependency graph from the state, not from a copy of a profile', () => {
  assert.doesNotMatch(html, /PROFILE_GRAPHS/);
  assert.doesNotMatch(html, /'is-qualitative':\s*\{/);
  assert.match(html, /s\.graph/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/serve.test.js test/view.test.js`
Expected: FAIL (`graph` undefined; `PROFILE_GRAPHS` present).

- [ ] **Step 3: Send the graph from `bin/canvas-serve.js` (Edit tool)**

In the state builder, pass `checks: state.checks` to `mechanicalReview`, and add to the returned object after `frontmatter`:

```js
    // The active profile's graph, so the view never holds a copy of one.
    graph: state.graph || null,
```

- [ ] **Step 4: Use it in `dashboard/canvas.html`**

Delete the `PROFILE_GRAPHS` block and its comment (lines 783–788). At both former use sites (around lines 1150 and 1205) replace

```js
    var graph = (s.frontmatter && PROFILE_GRAPHS[s.frontmatter.profile]) || null;
```

with

```js
    var graph = s.graph || null;
```

If the fixture mode (`?fixture=`) builds a state without `graph`, `computeAccent` already returns null for a null graph; nothing else changes.

- [ ] **Step 5: Run the tests, then the full suite**

Run: `node --test test/serve.test.js test/view.test.js` → PASS; full suite → fail 0.

- [ ] **Step 6: Check in a real browser**

Run `research-harness serve` against a tmp copy of the test fixture (`test/fixtures/voice-uptake`), open the printed URL with `cmux browser`, take a screenshot and read `console list` / `errors list`. Expected: the poster renders with its accent on an open field, and the console has no errors. Then switch the copy's frontmatter to `profile: is-quantitative`, reload, and confirm the same. Report both screenshots in the ticket.

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/bin/canvas-serve.js plugins/research-harness/dashboard/canvas.html plugins/research-harness/test/serve.test.js plugins/research-harness/test/view.test.js
git commit -m "View: dependency graph comes from the active profile"
```

---

### Task 4: `research-harness profile [<id>]`

**Files:**
- Modify: `plugins/research-harness/bin/research-harness.js` (usage list near line 30, a new section after `title`, the dispatch near line 748; Edit tool only)
- Modify: `plugins/research-harness/README.md` (the profile paragraph near line 518)
- Create: `.release/unreleased/is-quantitative-profile.md`
- Test: `plugins/research-harness/test/cli.test.js`

**Interfaces:**
- Consumes: `profileLib.loadProfile`, `appendLog({ root, kind, ref, body, pluginRoot })` from `hooks/lib/log.js` (returns `{ ok, seq, seal }` or a refusal `{ ok: false, error, code }`; check its exact refusal shape at `hooks/lib/log.js:43-74`), `titleLine`-style frontmatter handling.
- Produces: CLI `research-harness profile` (prints the active id) and `research-harness profile <id>` (switches).

- [ ] **Step 1: Write the failing CLI tests** (append to `test/cli.test.js`)

```js
test('profile prints the active profile and switches to another, with a sealed log entry', () => {
  const root = keyedProject();
  assert.equal(run(root, ['profile']).stdout.trim(), 'is-qualitative');
  const out = run(root, ['profile', 'is-quantitative']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Profile set: is-quantitative \(was is-qualitative\), logged as #\d+/);
  assert.match(fs.readFileSync(path.join(root, 'research', 'canvas.md'), 'utf8'), /^profile: is-quantitative$/m);
  assert.match(readLog(root), /· CONSTRAINT · profile · seal [0-9a-f]{16}\nProfile changed from is-qualitative to is-quantitative\./);
  assert.match(run(root, ['review']).stdout, /## Decision log\n.*verified/);
});

test('profile refuses an unknown id, the active id, and a missing key, writing nothing', () => {
  const root = keyedProject();
  const canvasFile = path.join(root, 'research', 'canvas.md');
  const before = fs.readFileSync(canvasFile, 'utf8');
  const logBefore = readLog(root);
  const unknown = run(root, ['profile', 'no-such-profile']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /profile not found: no-such-profile/);
  const same = run(root, ['profile', 'is-qualitative']);
  assert.notEqual(same.status, 0);
  assert.match(same.stderr, /already uses is-qualitative/);
  const nokey = run(root, ['profile', 'is-quantitative'], { RESEARCH_HARNESS_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')) });
  assert.notEqual(nokey.status, 0);
  assert.equal(fs.readFileSync(canvasFile, 'utf8'), before);
  assert.equal(readLog(root), logBefore);
});
```

If the `Decision log` regex does not match the review's actual wording, read one `review` output from the existing tests and match its "verified" line instead.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/cli.test.js`
Expected: FAIL, unknown command `profile`.

- [ ] **Step 3: Implement (Edit tool on `bin/research-harness.js`)**

Usage list, after the `title` line:

```js
  'research-harness profile [<id>]',
```

New section after `title()`:

```js
// ---------- profile ----------

// Which genre profile the canvas runs on (§4.5, 0.5 spec §9). Switching
// changes which dependencies the review reports and which checks run, so it
// is recorded: a sealed CONSTRAINT entry first, then the one frontmatter line.
// The log is written first because it is the step that can refuse (no key, a
// broken ledger); a refused switch leaves both files as they were.
function profile(positional) {
  const root = project.projectDir({});
  const canvasFile = project.canvasPath(root);
  if (!fs.existsSync(canvasFile)) {
    return fail(`This is not a paper project: no ${path.relative(root, canvasFile)}. Run research-harness init first.`);
  }
  const text = fs.readFileSync(canvasFile, 'utf8');
  const current = canvasLib.parseCanvas(text).frontmatter.profile || 'is-qualitative';
  if (!positional.length) {
    say(current);
    return 0;
  }
  const wanted = positional[0];
  try {
    profileLib.loadProfile(wanted, pluginRoot());
  } catch (err) {
    return fail(err.message);
  }
  if (wanted === current) return fail(`The canvas already uses ${current}; nothing changed.`);
  const lines = text.split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) return fail(`${path.relative(root, canvasFile)} has no frontmatter, so there is nowhere to set a profile.`);
  const at = lines.slice(1, end).findIndex((line) => /^profile:/.test(line));
  const logged = appendLog({
    root,
    kind: 'CONSTRAINT',
    ref: 'profile',
    body: `Profile changed from ${current} to ${wanted}.`,
    pluginRoot: pluginRoot(),
  });
  if (!logged.ok) return fail(logged.error);
  if (at >= 0) lines[at + 1] = `profile: ${wanted}`;
  else lines.splice(end, 0, `profile: ${wanted}`);
  fs.writeFileSync(canvasFile, lines.join('\n'));
  say(`Profile set: ${wanted} (was ${current}), logged as #${logged.seq}. Run research-harness review to see what the new graph reports.`);
  return 0;
}
```

Dispatch, after `case 'title'`:

```js
    case 'profile': return profile(positional);
```

Adjust the `fail(logged.error)` call to `fail(logged.error, ...)` if `log()` in the same file passes an exit code from the refusal; mirror whatever `log()` does with an `appendLog` refusal.

- [ ] **Step 4: Run the tests, then the full suite**

Run: `node --test test/cli.test.js` → PASS; full suite → fail 0. Also `node verification/SQ-29/probe-perimeter.js` from the repo root → exit 0 (a new writing command).

- [ ] **Step 5: Docs and release fragment**

README, in the paragraph that names `profile: is-qualitative` (near line 518), add:

```markdown
Two profiles ship: `is-qualitative` (the default) and `is-quantitative` for
hypothesis-testing experiments and surveys. `research-harness profile` prints
the active one; `research-harness profile <id>` switches an existing canvas and
records the switch in the decision log. Under `is-quantitative`, the review
also reports findings logged before the hypotheses and the design were
accepted (`references/preregistration.md`).
```

`.release/unreleased/is-quantitative-profile.md`:

```markdown
---
title: A profile for hypothesis-testing studies
bump: minor
plugins:
  - research-harness
---

A second canvas profile, `is-quantitative`, follows the order of experiments
and surveys: prior research leads to the question, the question to the
hypotheses, the hypotheses to sample and design. Switch an existing canvas with
`research-harness profile is-quantitative`; the switch is recorded in the
decision log. Under this profile the review reports any finding that was logged
before the hypotheses and the design were accepted. The session view now takes
its dependency graph from the active profile.
```

- [ ] **Step 6: Commit**

```bash
git add plugins/research-harness/bin/research-harness.js plugins/research-harness/test/cli.test.js plugins/research-harness/README.md .release/unreleased/is-quantitative-profile.md
git commit -m "CLI: research-harness profile shows and switches the canvas profile"
```

---

## Not in this plan

- Switching the metacognition canvas. That is Daniel's and the supervisor's step after they confirm the profile's content.
- `By:` on the CONSTRAINT entry (spec §3).
- A release. 0.5.0 ships after the other sections; this fragment waits in `.release/unreleased/`.
