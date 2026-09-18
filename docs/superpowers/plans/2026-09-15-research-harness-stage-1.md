# Research Harness — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship stage 1 of the `research-harness` Claude Code plugin — the canvas as version-controlled project state, the guard that stops the model from declaring commitments, the session-start injection, a command-line approval path, and the three skills — so that a paper project can be framed, reviewed, and accepted element by element.

**Architecture:** A plugin inside its own marketplace repo. State lives in the paper repo (`research/canvas.md`, `research/decisions.md`); the plugin is a parser shared by two hooks and one CLI, plus prose in `references/` and `skills/`. Everything is plain Node stdlib CommonJS — no `package.json`, no build, no dependencies. Shared code lives in `hooks/lib/` (the pattern `codebase-mapper` uses), and `bin/` requires it by relative path.

**Tech Stack:** Node ≥ 20 (stdlib only: `fs`, `path`, `crypto`, `os`, `node:test`, `node:assert/strict`). Claude Code plugin conventions: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `skills/<name>/SKILL.md`.

**Spec:** `docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md` — read it first; this plan argues from it and cites its sections as §n.

**Out of scope for this plan:** stage 2 (§7 — the local server and clickable session view). Stage 1 must be usable without it.

## Global Constraints

- **Everything in this repository is English** — file contents, code comments, commit messages, refusal texts. (Memory: the repo ships publicly.)
- **The plugin knows no root.** The only root a hook may use is `${CLAUDE_PLUGIN_ROOT}`; the project directory comes from `process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd()`. Never a home-directory path, never the author's local conventions. (§2)
- **A paper project is detected by the presence of `research/canvas.md`** (or `$RESEARCH_HARNESS_DIR/canvas.md`). In any other repo every hook exits 0 with no output. (§2)
- **Fixed identifiers** (§3): plugin name `research-harness`; skills `canvas`, `canvas-review`, `accept`; state dir `research/`; files `canvas.md`, `decisions.md`; env `RESEARCH_HARNESS_DIR`, `RESEARCH_HARNESS_LIBRARY`, plus `RESEARCH_HARNESS_STATE_DIR` for the transient session ledger (added by this plan, see Task 10); markers `[proposed] [tentative] [stated] [accepted]`; evidence tags `src:`, `unverified`, `mail`, `cal`; default profile `is-qualitative`.
- **No `commands/` directory, ever.** Slash commands are skills. (§5.1)
- **`inject-state.js` fails open** (any error → exit 0, no output). **`guard-promotion.js` fails closed** (cannot judge → deny with a reason). (§5.2, §5.3)
- **SessionStart injection ≤ 4096 bytes** UTF-8, truncated with a watermark on overflow. (§5.2)
- **The plugin ships no copyrighted text.** `references/` contains an original question set that cites its sources; never a copied table or paragraph. (§5.5)
- **Every refusal names the next legal action.** (§5.3)
- **Tests:** `node --test test/*.test.js` run from `plugins/research-harness/`. Each test builds its own temp project under `os.tmpdir()`; never touch the real home directory (always set `RESEARCH_HARNESS_STATE_DIR` in hook tests).
- **Commits:** one per task, English, ending with the session's own attribution line for the model actually running the task — not a hardcoded one. Also write `.release/unreleased/<ticket-ref>.md` before the commit: any range touching `plugins/research-harness` is refused without it.

---

## File structure

```
research-harness/                                   ← this repo = marketplace
  .claude-plugin/marketplace.json                   ← Task 1
  plugins/research-harness/
    .claude-plugin/plugin.json                      ← Task 1
    hooks/
      hooks.json                                    ← Task 1 (skeleton), Task 6, Task 7 (entries)
      inject-state.js                               ← Task 6
      guard-promotion.js                            ← Task 7
      lib/
        project.js                                  ← Task 2  (dirs, paths, project root)
        canvas.js                                   ← Task 2  (parser, element status)
        hash.js                                     ← Task 3  (text hash)
        decisions.js                                ← Task 3  (decision log parse/append)
        profile.js                                  ← Task 4  (profile + dependency graph)
        review.js                                   ← Task 4  (mechanical review)
        output.js                                   ← Task 6  (hook stdout writers)
        ledger.js                                   ← Task 6  (session ledger)
    references/
      canvas-elements.md                            ← Task 5  (question set = init template)
      amj-map.md                                    ← Task 5
      problematization.md                           ← Task 5
      profiles/is-qualitative.md                    ← Task 4
    bin/research-harness.js                         ← Task 8  (init / status / review / accept)
    skills/
      canvas/SKILL.md                               ← Task 9
      canvas-review/SKILL.md                        ← Task 9
      accept/SKILL.md                               ← Task 9
    test/
      fixtures/voice-uptake/research/canvas.md      ← Task 2  (synthetic, fictional)
      fixtures/voice-uptake/research/decisions.md   ← Task 3
      manifests.test.js                             ← Task 1
      canvas.test.js                                ← Task 2
      decisions.test.js                             ← Task 3
      profile.test.js                               ← Task 4
      references.test.js                            ← Task 5
      inject-state.test.js                          ← Task 6
      guard-promotion.test.js                       ← Task 7
      cli.test.js                                   ← Task 8
    README.md                                       ← Task 10
```

Responsibilities, one line each:

- `project.js` — where things are: project root, state dir, the two file paths. Nothing else.
- `canvas.js` — turn `canvas.md` text into elements → questions → statements with markers and tags; compute element status. Pure; no I/O.
- `hash.js` — the 8-hex text hash that binds an acceptance to the text it was given for.
- `decisions.js` — parse and append `decisions.md`. Append is the only write.
- `profile.js` — load a profile file, parse its dependency graph, compute violations.
- `review.js` — the mechanical part of `canvas-review`: empties, open elements, violations, untagged statements, stale and unlogged acceptances. Pure.
- `output.js` — the two hook output shapes with the byte budget.
- `ledger.js` — remember, per project and session, the highest decision sequence already injected.
- `inject-state.js` — SessionStart: assemble the summary, write it, fail open.
- `guard-promotion.js` — PreToolUse: compute before/after, apply the three prohibitions, fail closed.
- `research-harness.js` — the human's CLI. `accept` is the approval path; `init`, `status`, `review` are conveniences the skills call.

## The synthetic fixture

All tests use one fictional project, `voice-uptake` — the running example of the project's own discussion paper (a study of when members' suggestions receive serious consideration in meetings). It is invented there and invented here. No real study, no real person, no real transcript. This is the fixture strategy the spec promises in §11 (SQ-7): synthetic canvas, invented content.

---

### Task 1: Marketplace and plugin manifests

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/research-harness/.claude-plugin/plugin.json`
- Create: `plugins/research-harness/hooks/hooks.json` (skeleton, no hooks yet)
- Test: `plugins/research-harness/test/manifests.test.js`

**Interfaces:**
- Produces: the plugin identity every later task assumes — name `research-harness`, version `0.1.0`. `hooks.json` gets its entries in Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

`plugins/research-harness/test/manifests.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('plugin.json declares the fixed identity', () => {
  const plugin = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  assert.equal(plugin.name, 'research-harness');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof plugin.description, 'string');
  assert.equal(plugin.license, 'MIT');
});

test('marketplace.json lists the plugin with the same version and description', () => {
  const marketplace = readJson(path.join(repoRoot, '.claude-plugin', 'marketplace.json'));
  const plugin = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  assert.equal(marketplace.name, 'research-harness');
  const entry = marketplace.plugins.find((p) => p.name === 'research-harness');
  assert.ok(entry, 'marketplace entry missing');
  assert.equal(entry.source, './plugins/research-harness');
  assert.equal(entry.version, plugin.version, 'version drifted between marketplace and plugin');
  assert.equal(entry.description, plugin.description, 'description drifted between marketplace and plugin');
});

test('hooks.json is valid and every command is rooted at CLAUDE_PLUGIN_ROOT', () => {
  const hooks = readJson(path.join(pluginRoot, 'hooks', 'hooks.json'));
  assert.equal(typeof hooks.description, 'string');
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.equal(hook.type, 'command', `${event}: hook type`);
        assert.match(hook.command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[a-z-]+\.js"$/, `${event}: command shape`);
        assert.ok(hook.timeout <= 10, `${event}: timeout too long`);
      }
    }
  }
});

test('there is no commands/ directory', () => {
  assert.equal(fs.existsSync(path.join(pluginRoot, 'commands')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/research-harness && node --test test/manifests.test.js`
Expected: FAIL — `ENOENT` on `plugin.json`.

- [ ] **Step 3: Write the manifests**

`plugins/research-harness/.claude-plugin/plugin.json`:

```json
{
  "name": "research-harness",
  "version": "0.1.0",
  "description": "A research harness for paper projects: the AMJ research canvas as version-controlled project state, with an enforced line between what an agent proposed and what the researcher accepted.",
  "author": {
    "name": "Daniel Heinz"
  },
  "homepage": "https://github.com/DanielHeinz7/research-harness/tree/main/plugins/research-harness",
  "repository": "https://github.com/DanielHeinz7/research-harness",
  "license": "MIT",
  "keywords": [
    "research",
    "academic-writing",
    "paper",
    "canvas",
    "qualitative",
    "harness"
  ]
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "research-harness",
  "owner": {
    "name": "Daniel Heinz"
  },
  "description": "Claude Code plugins for steering paper projects.",
  "version": "0.1.0",
  "plugins": [
    {
      "name": "research-harness",
      "source": "./plugins/research-harness",
      "description": "A research harness for paper projects: the AMJ research canvas as version-controlled project state, with an enforced line between what an agent proposed and what the researcher accepted.",
      "version": "0.1.0",
      "author": {
        "name": "Daniel Heinz"
      },
      "homepage": "https://github.com/DanielHeinz7/research-harness/tree/main/plugins/research-harness",
      "repository": "https://github.com/DanielHeinz7/research-harness",
      "license": "MIT",
      "category": "productivity",
      "keywords": [
        "research",
        "academic-writing",
        "paper",
        "canvas",
        "qualitative",
        "harness"
      ]
    }
  ]
}
```

`plugins/research-harness/hooks/hooks.json` (skeleton — entries come in Tasks 6 and 7):

```json
{
  "description": "research-harness stays silent unless the project contains research/canvas.md; SessionStart injects a ≤4 KiB canvas summary and fails open; PreToolUse denies any write that creates an [accepted] statement, alters a [stated] or [accepted] statement, promotes a proposal, or rewrites decisions.md, and fails closed when it cannot judge a diff.",
  "hooks": {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/research-harness && node --test test/manifests.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Add a LICENSE at the repo root**

`LICENSE` — MIT text with `Copyright (c) 2026 Daniel Heinz`.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin plugins/research-harness LICENSE
git commit -m "Add marketplace and plugin manifests

One marketplace, one plugin, versions checked for drift by a test.
hooks.json is a skeleton; the hooks arrive with their own tasks.

<attribution line for the model actually running this task>"
```

---

### Task 2: Canvas parser and the synthetic fixture

**Files:**
- Create: `plugins/research-harness/hooks/lib/project.js`
- Create: `plugins/research-harness/hooks/lib/canvas.js`
- Create: `plugins/research-harness/test/fixtures/voice-uptake/research/canvas.md`
- Test: `plugins/research-harness/test/canvas.test.js`

**Interfaces:**
- Produces (`project.js`): `projectDir(data) → string`, `stateDir(projectRoot) → string`, `canvasPath(projectRoot) → string`, `decisionsPath(projectRoot) → string`, `readIfExists(file) → string|null`, constants `CANVAS_FILE`, `DECISIONS_FILE`.
- Produces (`canvas.js`): `MARKERS`, `COMMITTED` (Set), `EMPTY_PLACEHOLDER`, `normalizeText(s)`, `parseMarkerGroup(paragraph) → {text, marker, tags}|null`, `parseCanvas(text) → {frontmatter, elements, problems}`, `elementStatus(element) → {status: 'empty'|'open'|'stated'|'accepted', open: number}`, `allStatements(parsed) → [{element, question, text, marker, tags, raw, line}]`.

The canvas grammar (§4.2), stated once here and implemented below:

- Frontmatter between two `---` lines, `key: value` per line.
- `# N · Title` starts element N (1–9). `## N.M question text` starts a sub-question.
- A **statement** under a sub-question ends at the line carrying its marker group — `[marker]` or `[marker, tag, tag]` — or at a blank line if it carries none. The first token is the authorization marker; the rest are evidence tags. Consecutive statements sit on consecutive lines (see the fixture), and a statement may still span several lines, ending at the line with the marker. A blank line alone is **not** the only boundary; deriving one from the other is what made three of this task's own tests fail on first implementation.
- `_(empty)_` alone on a line is the placeholder for "no statements".
- A paragraph without a valid marker group is an **unmarked** statement (`marker: null`) — recorded, reported by review, never committed.

- [ ] **Step 1: Write the fixture**

`plugins/research-harness/test/fixtures/voice-uptake/research/canvas.md`:

```markdown
---
project: voice-uptake
outlet: Organization Science
profile: is-qualitative
created: 2026-09-15
mode: seed
canvas-schema: 2
---

# 1 · Puzzle

## 1.1 What is the broad question this project speaks to?

When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]

## 1.2 What is it that you cannot yet explain, and what do you already know?

Speaking frequency is well documented; whether a proposal is taken up is not. [stated]
Uptake may be a property of the meeting's chairing style rather than of the proposal. [proposed]

## 1.3 Why does this matter — for practice, for theory, or both?

_(empty)_

# 2 · Audience and Prior Research

## 2.1 Who are the ten to twenty scholars whose conversation this joins?

_(empty)_

## 2.2 What has that conversation been about lately, and on what assumptions does it rest?

Prior work treats voice as an individual disposition. [proposed, unverified]

## 2.3 How has prior work handled this puzzle, and where is it inconsistent or silent?

_(empty)_

## 2.4 Which assumption of that work do you challenge, and on what grounds?

_(empty)_

# 3 · Research Question

## 3.1 In one sentence: what does this study answer?

Under what meeting conditions does a junior member's proposal get taken up? [stated, src: memo-03]

## 3.2 What would a well-informed person answer intuitively, and why is that not enough?

_(empty)_

## 3.3 How does answering it move the puzzle forward?

_(empty)_

# 4 · Theoretical Constructs and Relationships

## 4.1 What are the core concepts, and where does each definition come from?

_(empty)_

## 4.2 How do they relate — and is that relationship given in advance or emerging from the material?

_(empty)_

## 4.3 What mechanism explains the relationship?

_(empty)_

# 5 · Research Setting

## 5.1 Where is the study conducted, and how did you gain access?

Twelve recorded project meetings at a fictional engineering firm, access through a consulting engagement. [stated]

## 5.2 Why is this setting the right one for the question — what does it make visible?

_(empty)_

## 5.3 What would a more suitable setting be, and why are you not there?

_(empty)_

# 6 · Research Design and Analysis

## 6.1 What data, from where, collected how?

_(empty)_

## 6.2 How is the data analysed, and how does the procedure earn trust?

_(empty)_

## 6.3 Which choices in design or analysis would a sceptical reviewer challenge first?

_(empty)_

# 7 · Findings

## 7.1 What does the material show — separated from what you make of it?

_(empty)_

## 7.2 Which instances run counter to the pattern, and what happens to them?

_(empty)_

# 8 · Contributions

## 8.1 What does the field know now that it did not before?

_(empty)_

## 8.2 Which assumption in prior work does this change, and how?

_(empty)_

## 8.3 What follows for practice?

_(empty)_

# 9 · Boundary Conditions and Limitations

## 9.1 Where does the claim stop applying, and why?

_(empty)_

## 9.2 Which limitations follow from design choices, and which from the setting?

_(empty)_

## 9.3 What would refute the contribution?

_(empty)_
```

- [ ] **Step 2: Write the failing tests**

`plugins/research-harness/test/canvas.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const project = require('../hooks/lib/project');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'voice-uptake', 'research', 'canvas.md'),
  'utf8',
);

test('parseCanvas reads frontmatter, nine elements and their questions', () => {
  const parsed = canvas.parseCanvas(fixture);
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.frontmatter.project, 'voice-uptake');
  assert.equal(parsed.frontmatter.profile, 'is-qualitative');
  assert.equal(parsed.frontmatter.mode, 'seed');
  assert.equal(parsed.elements.length, 9);
  assert.deepEqual(parsed.elements.map((e) => e.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(parsed.elements[0].title, 'Puzzle');
  assert.deepEqual(parsed.elements[0].questions.map((q) => q.id), ['1.1', '1.2', '1.3']);
});

test('statements carry marker, tags and normalized text; placeholders are not statements', () => {
  const parsed = canvas.parseCanvas(fixture);
  const q12 = parsed.elements[0].questions[1];
  assert.equal(q12.statements.length, 2);
  assert.equal(q12.statements[0].marker, 'stated');
  assert.deepEqual(q12.statements[0].tags, []);
  assert.equal(q12.statements[1].marker, 'proposed');
  const q13 = parsed.elements[0].questions[2];
  assert.equal(q13.statements.length, 0, '_(empty)_ is not a statement');
  const q22 = parsed.elements[1].questions[1];
  assert.deepEqual(q22.statements[0].tags, ['unverified']);
  const q31 = parsed.elements[2].questions[0];
  assert.deepEqual(q31.statements[0].tags, ['src: memo-03']);
  assert.equal(q31.statements[0].text, "Under what meeting conditions does a junior member's proposal get taken up?");
});

test('parseMarkerGroup accepts only known markers', () => {
  assert.deepEqual(canvas.parseMarkerGroup('Claim. [accepted]'), { text: 'Claim.', marker: 'accepted', tags: [] });
  assert.deepEqual(canvas.parseMarkerGroup('Claim. [proposed, src: x, unverified]'), { text: 'Claim.', marker: 'proposed', tags: ['src: x', 'unverified'] });
  assert.equal(canvas.parseMarkerGroup('Claim. [verified]'), null);
  assert.equal(canvas.parseMarkerGroup('Claim without marker.'), null);
});

test('a paragraph without a marker is recorded as unmarked, not dropped', () => {
  const text = fixture.replace('_(empty)_', 'Because meetings are where allocation happens.');
  const parsed = canvas.parseCanvas(text);
  const q13 = parsed.elements[0].questions[2];
  assert.equal(q13.statements.length, 1);
  assert.equal(q13.statements[0].marker, null);
});

test('text outside a question and an unterminated frontmatter are problems', () => {
  const stray = canvas.parseCanvas('---\nproject: x\n---\n\nloose text\n\n# 1 · Puzzle\n');
  assert.match(stray.problems[0], /outside any question/);
  const open = canvas.parseCanvas('---\nproject: x\n');
  assert.match(open.problems[0], /not terminated/);
});

test('elementStatus derives from committed statements only', () => {
  const parsed = canvas.parseCanvas(fixture);
  const [e1, e2, e3, e4, e5] = parsed.elements;
  assert.deepEqual(canvas.elementStatus(e1), { status: 'stated', open: 1 }); // accepted + stated + one proposal → weakest committed is stated
  assert.deepEqual(canvas.elementStatus(e2), { status: 'open', open: 1 });   // only a proposal
  assert.deepEqual(canvas.elementStatus(e3), { status: 'stated', open: 0 });
  assert.deepEqual(canvas.elementStatus(e4), { status: 'empty', open: 0 });
  assert.deepEqual(canvas.elementStatus(e5), { status: 'stated', open: 0 });
});

test('elementStatus is accepted only when every committed statement is accepted', () => {
  const text = fixture.replace(
    'Speaking frequency is well documented; whether a proposal is taken up is not. [stated]',
    'Speaking frequency is well documented; whether a proposal is taken up is not. [accepted]',
  );
  const parsed = canvas.parseCanvas(text);
  assert.deepEqual(canvas.elementStatus(parsed.elements[0]), { status: 'accepted', open: 1 });
});

test('allStatements flattens with element and question ids', () => {
  const all = canvas.allStatements(canvas.parseCanvas(fixture));
  assert.equal(all.length, 6);
  assert.deepEqual(all.map((s) => s.question), ['1.1', '1.2', '1.2', '2.2', '3.1', '5.1']);
  assert.equal(all[0].element, 1);
  assert.equal(typeof all[0].line, 'number');
});

test('project paths honour RESEARCH_HARNESS_DIR and default to research/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  const saved = process.env.RESEARCH_HARNESS_DIR;
  delete process.env.RESEARCH_HARNESS_DIR;
  assert.equal(project.stateDir(root), path.join(root, 'research'));
  assert.equal(project.canvasPath(root), path.join(root, 'research', 'canvas.md'));
  process.env.RESEARCH_HARNESS_DIR = 'paper/state';
  assert.equal(project.decisionsPath(root), path.join(root, 'paper', 'state', 'decisions.md'));
  if (saved === undefined) delete process.env.RESEARCH_HARNESS_DIR; else process.env.RESEARCH_HARNESS_DIR = saved;
  assert.equal(project.readIfExists(path.join(root, 'nope.md')), null);
});

test('projectDir prefers CLAUDE_PROJECT_DIR, then data.cwd, then process.cwd', () => {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = '/from/env';
  assert.equal(project.projectDir({ cwd: '/from/data' }), '/from/env');
  delete process.env.CLAUDE_PROJECT_DIR;
  assert.equal(project.projectDir({ cwd: '/from/data' }), '/from/data');
  assert.equal(project.projectDir({}), process.cwd());
  if (saved !== undefined) process.env.CLAUDE_PROJECT_DIR = saved;
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/canvas.test.js`
Expected: FAIL — `Cannot find module '../hooks/lib/canvas'`.

- [ ] **Step 4: Write `project.js`**

`plugins/research-harness/hooks/lib/project.js`:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CANVAS_FILE = 'canvas.md';
const DECISIONS_FILE = 'decisions.md';

// The plugin knows no root. Claude Code sets CLAUDE_PROJECT_DIR; hook stdin
// carries cwd; process.cwd() is the last resort for the CLI.
function projectDir(data) {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    (data && typeof data.cwd === 'string' ? data.cwd : '') ||
    process.cwd()
  );
}

function stateDir(projectRoot) {
  const configured = process.env.RESEARCH_HARNESS_DIR || 'research';
  return path.resolve(projectRoot, configured);
}

function canvasPath(projectRoot) {
  return path.join(stateDir(projectRoot), CANVAS_FILE);
}

function decisionsPath(projectRoot) {
  return path.join(stateDir(projectRoot), DECISIONS_FILE);
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
}

module.exports = { CANVAS_FILE, DECISIONS_FILE, projectDir, stateDir, canvasPath, decisionsPath, readIfExists };
```

- [ ] **Step 5: Write `canvas.js`**

`plugins/research-harness/hooks/lib/canvas.js`:

```js
'use strict';

const MARKERS = ['proposed', 'tentative', 'stated', 'accepted'];
const COMMITTED = new Set(['stated', 'accepted']);
const EMPTY_PLACEHOLDER = '_(empty)_';

const ELEMENT_RE = /^# ([1-9]) · (.+)$/;
const QUESTION_RE = /^## ([1-9]\.\d+) (.+)$/;
const MARKER_GROUP_RE = /\s*\[([^[\]]+)\]\s*$/;

function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { data: {}, end: 0 };
  const data = {};
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return { data, end: i + 1 };
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (m) data[m[1]] = m[2].trim();
  }
  return { data, end: lines.length, unterminated: true };
}

// "Some text. [marker, tag, tag]" → { text, marker, tags } or null when the
// trailing bracket group is missing or its first token is not a known marker.
function parseMarkerGroup(paragraph) {
  const m = MARKER_GROUP_RE.exec(paragraph);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => p.trim()).filter(Boolean);
  if (!MARKERS.includes(parts[0])) return null;
  return { text: paragraph.slice(0, m.index).trim(), marker: parts[0], tags: parts.slice(1) };
}

function parseCanvas(text) {
  const lines = String(text).split('\n');
  const fm = parseFrontmatter(lines);
  const result = { frontmatter: fm.data, elements: [], problems: [] };
  if (fm.unterminated) result.problems.push('frontmatter is not terminated');

  let element = null;
  let question = null;
  let paragraph = [];
  let paragraphStart = -1;

  const flush = () => {
    if (!paragraph.length) return;
    const raw = paragraph.join('\n');
    const line = paragraphStart + 1;
    paragraph = [];
    paragraphStart = -1;
    if (raw.trim() === EMPTY_PLACEHOLDER) return;
    if (!question) {
      result.problems.push(`line ${line}: text outside any question`);
      return;
    }
    const group = parseMarkerGroup(raw);
    if (!group) {
      question.statements.push({ text: normalizeText(raw), marker: null, tags: [], raw, line });
      return;
    }
    question.statements.push({ text: normalizeText(group.text), marker: group.marker, tags: group.tags, raw, line });
  };

  for (let i = fm.end; i < lines.length; i += 1) {
    const l = lines[i];
    const el = ELEMENT_RE.exec(l);
    if (el) {
      flush();
      element = { number: Number(el[1]), title: el[2].trim(), questions: [], line: i + 1 };
      result.elements.push(element);
      question = null;
      continue;
    }
    const q = QUESTION_RE.exec(l);
    if (q) {
      flush();
      if (!element) {
        result.problems.push(`line ${i + 1}: question outside any element`);
        continue;
      }
      question = { id: q[1], text: q[2].trim(), statements: [], line: i + 1 };
      element.questions.push(question);
      continue;
    }
    if (l.trim() === '') {
      flush();
      continue;
    }
    if (!paragraph.length) paragraphStart = i;
    paragraph.push(l);
    // A statement ends at the line carrying its marker group; a blank line is
    // not the only boundary. A statement may still run over several lines: it
    // ends at the line that carries the marker. Text with no marker group, or
    // with an unknown one, keeps accumulating to the next blank line.
    if (parseMarkerGroup(paragraph.join('\n'))) flush();
  }
  flush();
  return result;
}

// Status comes from committed statements only (§4.4). Proposals sit alongside
// and never lower it; they are counted in `open`.
function elementStatus(element) {
  const all = element.questions.flatMap((q) => q.statements);
  const committed = all.filter((s) => COMMITTED.has(s.marker));
  const open = all.length - committed.length;
  if (!all.length) return { status: 'empty', open: 0 };
  if (!committed.length) return { status: 'open', open };
  const status = committed.every((s) => s.marker === 'accepted') ? 'accepted' : 'stated';
  return { status, open };
}

function allStatements(parsed) {
  const out = [];
  for (const el of parsed.elements) {
    for (const q of el.questions) {
      for (const s of q.statements) out.push({ element: el.number, question: q.id, ...s });
    }
  }
  return out;
}

module.exports = {
  MARKERS,
  COMMITTED,
  EMPTY_PLACEHOLDER,
  normalizeText,
  parseMarkerGroup,
  parseCanvas,
  elementStatus,
  allStatements,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/canvas.test.js`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/hooks/lib plugins/research-harness/test
git commit -m "Add the canvas parser and a synthetic fixture

canvas.md is nine elements, numbered questions, and paragraphs that end
in a marker group. The parser is pure and reports problems instead of
throwing, so a hook can decide whether to fail open or closed. Element
status derives from committed statements only; proposals are counted,
never demoting (spec 4.4).

The fixture is the discussion paper's own invented example, voice-uptake.

<attribution line for the model actually running this task>"
```

---

### Task 3: Text hash and the decision log

**Files:**
- Create: `plugins/research-harness/hooks/lib/hash.js`
- Create: `plugins/research-harness/hooks/lib/decisions.js`
- Create: `plugins/research-harness/test/fixtures/voice-uptake/research/decisions.md`
- Test: `plugins/research-harness/test/decisions.test.js`

**Interfaces:**
- Consumes: `normalizeText` from `canvas.js`.
- Produces (`hash.js`): `textHash(text) → 8 lowercase hex chars`.
- Produces (`decisions.js`): `KINDS`, `parseDecisions(text) → {entries: [{seq, date, kind, ref, hash, line}], maxSeq}`, `formatEntry({seq, date, kind, ref, hash?, body, why?, rejected?, supersedes?}) → string`, `header(project) → string`, `appendEntry(filePath, entryText) → void`.

Entry heading grammar (§4.7): `## [#<seq>] <YYYY-MM-DD> · <KIND> · <ref>` with an optional ` · text <hash>` suffix on acceptances. The hash is 8 hex — the spec's example shows 6 for illustration; Task 10 updates that example.

- [ ] **Step 1: Write the fixture**

`plugins/research-harness/test/fixtures/voice-uptake/research/decisions.md`:

```markdown
# Decision log — voice-uptake

## [#1] 2026-09-10 · CONSTRAINT · 5 Research Setting
Only the twelve recorded meetings may be used; no additional fieldwork before submission. [stated]

## [#2] 2026-09-12 · DISCOVERY · 1 Puzzle
Two meetings show proposals adopted weeks later without attribution to their originator. [tentative, src: memo-02]

## [#3] 2026-09-15 · DECISION · 1.1 accepted · text 3b7a1c9e
When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]
**Why:** the phenomenon, not a gap, drives the study.
**Rejected:** framing it as a voice-frequency question.
```

- [ ] **Step 2: Write the failing tests**

`plugins/research-harness/test/decisions.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { textHash } = require('../hooks/lib/hash');
const decisions = require('../hooks/lib/decisions');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'voice-uptake', 'research', 'decisions.md'),
  'utf8',
);

test('textHash is 8 hex chars and ignores whitespace differences', () => {
  const a = textHash('When do members\'  suggestions\nget taken up?');
  const b = textHash('When do members\' suggestions get taken up?');
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, b);
  assert.notEqual(a, textHash('When do members\' suggestions get taken up'));
});

test('parseDecisions reads seq, date, kind, ref and optional hash', () => {
  const parsed = decisions.parseDecisions(fixture);
  assert.equal(parsed.maxSeq, 3);
  assert.equal(parsed.entries.length, 3);
  assert.deepEqual(
    parsed.entries.map((e) => [e.seq, e.kind, e.ref, e.hash]),
    [
      [1, 'CONSTRAINT', '5 Research Setting', null],
      [2, 'DISCOVERY', '1 Puzzle', null],
      [3, 'DECISION', '1.1 accepted', '3b7a1c9e'],
    ],
  );
  assert.equal(parsed.entries[2].date, '2026-09-15');
});

test('parseDecisions on an empty or header-only file has maxSeq 0', () => {
  assert.equal(decisions.parseDecisions('').maxSeq, 0);
  assert.equal(decisions.parseDecisions(decisions.header('x')).maxSeq, 0);
});

test('formatEntry renders the heading grammar and optional fields', () => {
  const text = decisions.formatEntry({
    seq: 4,
    date: '2026-09-16',
    kind: 'DECISION',
    ref: '3.1 accepted',
    hash: 'deadbeef',
    body: 'Under what conditions ... [accepted]',
    why: 'because',
    rejected: 'the alternative',
  });
  assert.equal(
    text,
    '## [#4] 2026-09-16 · DECISION · 3.1 accepted · text deadbeef\n' +
      'Under what conditions ... [accepted]\n' +
      '**Why:** because\n' +
      '**Rejected:** the alternative\n',
  );
  const plain = decisions.formatEntry({ seq: 5, date: '2026-09-16', kind: 'DISCOVERY', ref: '2 Audience and Prior Research', body: 'x [tentative]', supersedes: 2 });
  assert.equal(plain, '## [#5] 2026-09-16 · DISCOVERY · 2 Audience and Prior Research\nx [tentative]\n**Supersedes:** #2\n');
  assert.throws(() => decisions.formatEntry({ seq: 6, date: '2026-09-16', kind: 'VERDICT', ref: 'x', body: 'y' }), /kind/);
});

test('appendEntry only ever appends, with exactly one blank line between entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  const file = path.join(dir, 'decisions.md');
  fs.writeFileSync(file, decisions.header('voice-uptake'));
  const before = fs.readFileSync(file, 'utf8');
  decisions.appendEntry(file, decisions.formatEntry({ seq: 1, date: '2026-09-16', kind: 'CONSTRAINT', ref: '5 Research Setting', body: 'x [stated]' }));
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(before));
  assert.equal(after, '# Decision log — voice-uptake\n\n## [#1] 2026-09-16 · CONSTRAINT · 5 Research Setting\nx [stated]\n');
  decisions.appendEntry(file, decisions.formatEntry({ seq: 2, date: '2026-09-16', kind: 'DISCOVERY', ref: '1 Puzzle', body: 'y [tentative]' }));
  const twice = fs.readFileSync(file, 'utf8');
  assert.ok(twice.startsWith(after));
  assert.equal(decisions.parseDecisions(twice).maxSeq, 2);
  assert.doesNotMatch(twice, /\n\n\n/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/decisions.test.js`
Expected: FAIL — `Cannot find module '../hooks/lib/hash'`.

- [ ] **Step 4: Write `hash.js`**

`plugins/research-harness/hooks/lib/hash.js`:

```js
'use strict';

const crypto = require('node:crypto');
const { normalizeText } = require('./canvas');

// Binds an acceptance to the text it was given for (§4.4). Whitespace-
// insensitive so a reflow does not invalidate an acceptance; any wording
// change does.
function textHash(text) {
  return crypto.createHash('sha256').update(normalizeText(text), 'utf8').digest('hex').slice(0, 8);
}

module.exports = { textHash };
```

- [ ] **Step 5: Write `decisions.js`**

`plugins/research-harness/hooks/lib/decisions.js`:

```js
'use strict';

const fs = require('node:fs');

const KINDS = ['DECISION', 'CONSTRAINT', 'DISCOVERY'];
const ENTRY_RE = /^## \[#(\d+)\] (\d{4}-\d{2}-\d{2}) · (DECISION|CONSTRAINT|DISCOVERY) · (.+?)(?: · text ([0-9a-f]{8}))?$/;

function header(project) {
  return `# Decision log — ${project}\n`;
}

function parseDecisions(text) {
  const entries = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = ENTRY_RE.exec(lines[i]);
    if (!m) continue;
    entries.push({ seq: Number(m[1]), date: m[2], kind: m[3], ref: m[4], hash: m[5] || null, line: i + 1 });
  }
  const maxSeq = entries.reduce((max, e) => Math.max(max, e.seq), 0);
  return { entries, maxSeq };
}

function formatEntry({ seq, date, kind, ref, hash, body, why, rejected, supersedes }) {
  if (!KINDS.includes(kind)) throw new Error(`unknown decision kind: ${kind}`);
  const heading = `## [#${seq}] ${date} · ${kind} · ${ref}${hash ? ` · text ${hash}` : ''}`;
  const lines = [heading, String(body).trim()];
  if (why) lines.push(`**Why:** ${why}`);
  if (rejected) lines.push(`**Rejected:** ${rejected}`);
  if (supersedes) lines.push(`**Supersedes:** #${supersedes}`);
  return `${lines.join('\n')}\n`;
}

// The only write this module performs. Never rewrites what is there.
function appendEntry(filePath, entryText) {
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    current = '';
  }
  const separator = current.length === 0 ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(filePath, `${separator}${entryText}`);
}

module.exports = { KINDS, header, parseDecisions, formatEntry, appendEntry };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/decisions.test.js test/canvas.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/hooks/lib plugins/research-harness/test
git commit -m "Add the text hash and the append-only decision log

An acceptance is bound to an 8-hex SHA-256 of the normalized statement
text, the way the design-mining artifact keys human reviews to fragment
text so they survive re-mining. decisions.md is parsed for sequence
numbers and hashes; appendEntry is its only write.

<attribution line for the model actually running this task>"
```

---

### Task 4: Genre profile, dependency graph, mechanical review

**Files:**
- Create: `plugins/research-harness/references/profiles/is-qualitative.md`
- Create: `plugins/research-harness/hooks/lib/profile.js`
- Create: `plugins/research-harness/hooks/lib/review.js`
- Test: `plugins/research-harness/test/profile.test.js`

**Interfaces:**
- Consumes: `parseCanvas`, `elementStatus`, `allStatements`, `COMMITTED` (canvas.js); `textHash` (hash.js); `parseDecisions` (decisions.js).
- Produces (`profile.js`): `parseGraph(markdown) → {1: [], 2: [1], ...}` (numbers), `loadProfile(id, pluginRoot) → {id, graph, text}`, `dependencyViolations(parsed, graph) → [{element, missing: [{element, status}]}]`.
- Produces (`review.js`): `mechanicalReview({parsed, graph, decisionsText}) → report` with fields `statuses`, `empty`, `open`, `violations`, `unmarked`, `untagged`, `conversationalStated`, `staleAcceptances`, `unloggedAcceptances`, `problems`.

- [ ] **Step 1: Write the profile file**

`plugins/research-harness/references/profiles/is-qualitative.md`:

```markdown
# Profile: is-qualitative

Information systems, qualitative and interpretive work. This is the default
profile and the only one shipped with the MVP. Other genres are Markdown
patches to this directory — copy this file, change the graph and the emphasis,
open a pull request.

A profile owns three things: which elements carry weight and how their
questions are read; the dependency graph; and which modules attach where. It
states its commitments in prose a researcher can dispute. It produces no score.

## Emphasis

The canvas's authors note that the theoretical framework is "either driving the
research (in quantitative studies) or emerging from it (in qualitative ones)",
and that "considering the research setting in great detail is critical for
qualitative research" (Dorobantu et al. 2024). This profile follows both:

- **Element 1 (Puzzle) starts from the phenomenon, not from a literature gap.**
  Read it with the problematization module (`references/problematization.md`):
  what in the setting is surprising, and which taken-for-granted assumption
  does it unsettle?
- **Element 2 (Prior Research) is engaged after the framing and as material.**
  Prior theory is something to problematize, not the source of the question.
- **Element 4 (Constructs) emerges from the material.** Its questions are
  answered late, and a firm answer before findings exist is a warning sign.
- **Element 5 (Setting) carries weight.** Access, rapport and what the setting
  makes visible are substantive, not administrative. Read with Bansal & Corley
  (2012), *Publishing in AMJ — Part 7*.
- **Element 9 (Boundaries) is declared before sampling.** The scope of the
  claim decides what is sampled, not the other way round.

## Dependency graph

An element may not be `[accepted]` while an element it depends on is not.
Reported by `canvas-review`, never enforced. Three edges differ from the order
in which the canvas presents its elements; each is a design proposal, not
settled method, and each is one line to change.

```graph
1 <-
3 <- 1
9 <- 1, 3
5 <- 3, 9
2 <- 1, 3
6 <- 5
7 <- 6
4 <- 2, 7
8 <- 2, 4, 7
```

- `9 → 5`: the boundary condition drives the sampling in qualitative work
  rather than following from it.
- `2 ← 3`: prior theory enters late and as material to be problematized — the
  stance of Monteiro et al. (2022).
- `4 ← 7`: the framework emerges from the research (Dorobantu et al. 2024).

## Modules

| Element | Module |
|---|---|
| 1, 2 | `references/problematization.md` |
| all | `references/amj-map.md` — which part of *Publishing in AMJ* to read for each element |
```

- [ ] **Step 2: Write the failing tests**

`plugins/research-harness/test/profile.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const profile = require('../hooks/lib/profile');
const review = require('../hooks/lib/review');
const { textHash } = require('../hooks/lib/hash');

const pluginRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');
const canvasText = fs.readFileSync(path.join(fixtureDir, 'canvas.md'), 'utf8');
const decisionsText = fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8');

test('parseGraph reads the fenced graph block into numeric adjacency', () => {
  const graph = profile.parseGraph('text\n```graph\n1 <-\n3 <- 1\n9 <- 1, 3\n```\nmore');
  assert.deepEqual(graph, { 1: [], 2: [], 3: [1], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [1, 3] });
  assert.throws(() => profile.parseGraph('no block here'), /graph block/);
  assert.throws(() => profile.parseGraph('```graph\n3 <- 3\n```'), /depends on itself/);
});

test('loadProfile loads is-qualitative and rejects unknown or unsafe ids', () => {
  const p = profile.loadProfile('is-qualitative', pluginRoot);
  assert.equal(p.id, 'is-qualitative');
  assert.deepEqual(p.graph[5], [3, 9]);
  assert.deepEqual(p.graph[4], [2, 7]);
  assert.throws(() => profile.loadProfile('../etc', pluginRoot), /profile id/);
  assert.throws(() => profile.loadProfile('does-not-exist', pluginRoot), /not found/);
});

test('dependencyViolations reports accepted elements whose dependencies are not accepted', () => {
  const graph = profile.loadProfile('is-qualitative', pluginRoot).graph;
  // Fixture: element 1 is stated (not accepted) → no violations.
  assert.deepEqual(profile.dependencyViolations(canvas.parseCanvas(canvasText), graph), []);
  // Accept 3.1 while element 1 stays stated → violation on 3.
  const text = canvasText.replace('[stated, src: memo-03]', '[accepted, src: memo-03]');
  const violations = profile.dependencyViolations(canvas.parseCanvas(text), graph);
  assert.deepEqual(violations, [{ element: 3, missing: [{ element: 1, status: 'stated' }] }]);
});

test('mechanicalReview assembles statuses, empties, open elements and untagged statements', () => {
  const graph = profile.loadProfile('is-qualitative', pluginRoot).graph;
  const report = review.mechanicalReview({ parsed: canvas.parseCanvas(canvasText), graph, decisionsText });
  assert.equal(report.statuses[1].status, 'stated');
  assert.deepEqual(report.empty, [4, 6, 7, 8, 9]);
  assert.deepEqual(report.open, [2]);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.unmarked, []);
  // untagged: every statement without an evidence tag
  assert.deepEqual(report.untagged.map((s) => s.question), ['1.1', '1.2', '1.2', '5.1']);
  // conversationalStated: the stated ones among them
  assert.deepEqual(report.conversationalStated.map((s) => s.question), ['1.2', '5.1']);
});

test('mechanicalReview cross-checks acceptances against the decision log', () => {
  const graph = profile.loadProfile('is-qualitative', pluginRoot).graph;
  const acceptedText = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement?";
  const goodLog = decisionsText.replace('text 3b7a1c9e', `text ${textHash(acceptedText)}`);
  const ok = review.mechanicalReview({ parsed: canvas.parseCanvas(canvasText), graph, decisionsText: goodLog });
  assert.deepEqual(ok.staleAcceptances, []);
  assert.deepEqual(ok.unloggedAcceptances, []);
  // The fixture's placeholder hash does not match → the acceptance is stale
  // and the accepted statement has no matching log entry.
  const bad = review.mechanicalReview({ parsed: canvas.parseCanvas(canvasText), graph, decisionsText });
  assert.deepEqual(bad.staleAcceptances.map((e) => e.seq), [3]);
  assert.deepEqual(bad.unloggedAcceptances.map((s) => s.question), ['1.1']);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/profile.test.js`
Expected: FAIL — `Cannot find module '../hooks/lib/profile'`.

- [ ] **Step 4: Write `profile.js`**

`plugins/research-harness/hooks/lib/profile.js`:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { elementStatus } = require('./canvas');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const BLOCK_RE = /```graph\n([\s\S]*?)```/;
const LINE_RE = /^([1-9])\s*<-\s*(.*)$/;

function parseGraph(markdown) {
  const block = BLOCK_RE.exec(String(markdown));
  if (!block) throw new Error('profile has no ```graph block');
  const graph = {};
  for (let n = 1; n <= 9; n += 1) graph[n] = [];
  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) throw new Error(`bad graph line: ${line}`);
    const from = Number(m[1]);
    const deps = m[2].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    for (const d of deps) {
      if (!Number.isInteger(d) || d < 1 || d > 9) throw new Error(`bad dependency in: ${line}`);
      if (d === from) throw new Error(`element ${from} depends on itself`);
    }
    graph[from] = deps;
  }
  return graph;
}

function loadProfile(id, pluginRoot) {
  if (!ID_RE.test(String(id))) throw new Error(`invalid profile id: ${id}`);
  const file = path.join(pluginRoot, 'references', 'profiles', `${id}.md`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_) {
    throw new Error(`profile not found: ${id}`);
  }
  return { id, graph: parseGraph(text), text };
}

function statusByNumber(parsed) {
  const map = {};
  for (const el of parsed.elements) map[el.number] = elementStatus(el);
  return map;
}

// Rule (§4.6): an element may not be accepted while a dependency is not.
function dependencyViolations(parsed, graph) {
  const statuses = statusByNumber(parsed);
  const out = [];
  for (const el of parsed.elements) {
    if (statuses[el.number].status !== 'accepted') continue;
    const missing = (graph[el.number] || [])
      .map((d) => ({ element: d, status: statuses[d] ? statuses[d].status : 'missing' }))
      .filter((d) => d.status !== 'accepted');
    if (missing.length) out.push({ element: el.number, missing });
  }
  return out;
}

module.exports = { parseGraph, loadProfile, dependencyViolations, statusByNumber };
```

- [ ] **Step 5: Write `review.js`**

`plugins/research-harness/hooks/lib/review.js`:

```js
'use strict';

const { allStatements } = require('./canvas');
const { textHash } = require('./hash');
const { parseDecisions } = require('./decisions');
const { dependencyViolations, statusByNumber } = require('./profile');

const ACCEPT_REF_RE = /^([1-9]\.\d+) accepted$/;

// The mechanical half of canvas-review (§5.4, items 1, 2, 5, 6, 7). The
// judgment half — fit, refutation, manuscript support — stays in the skill.
function mechanicalReview({ parsed, graph, decisionsText }) {
  const statuses = statusByNumber(parsed);
  const numbers = parsed.elements.map((e) => e.number);
  const statements = allStatements(parsed);
  const log = parseDecisions(decisionsText || '');

  const empty = numbers.filter((n) => statuses[n].status === 'empty');
  const open = numbers.filter((n) => statuses[n].status === 'open');
  const violations = graph ? dependencyViolations(parsed, graph) : [];
  const unmarked = statements.filter((s) => s.marker === null);
  const untagged = statements.filter((s) => s.marker !== null && s.tags.length === 0);
  const conversationalStated = untagged.filter((s) => s.marker === 'stated');

  // Acceptances recorded in the log must still match a statement's text.
  const acceptedByQuestion = new Map();
  for (const s of statements) {
    if (s.marker !== 'accepted') continue;
    if (!acceptedByQuestion.has(s.question)) acceptedByQuestion.set(s.question, []);
    acceptedByQuestion.get(s.question).push({ ...s, hash: textHash(s.text) });
  }
  const loggedHashes = new Set();
  const staleAcceptances = [];
  for (const e of log.entries) {
    if (e.kind !== 'DECISION' || !e.hash) continue;
    const m = ACCEPT_REF_RE.exec(e.ref);
    if (!m) continue;
    loggedHashes.add(e.hash);
    const live = (acceptedByQuestion.get(m[1]) || []).some((s) => s.hash === e.hash);
    if (!live) staleAcceptances.push({ seq: e.seq, ref: e.ref, hash: e.hash });
  }
  // Accepted statements with no log entry: someone edited the file by hand.
  const unloggedAcceptances = [];
  for (const list of acceptedByQuestion.values()) {
    for (const s of list) if (!loggedHashes.has(s.hash)) unloggedAcceptances.push({ question: s.question, line: s.line, hash: s.hash, text: s.text });
  }

  return {
    statuses,
    empty,
    open,
    violations,
    unmarked,
    untagged,
    conversationalStated,
    staleAcceptances,
    unloggedAcceptances,
    problems: parsed.problems,
  };
}

module.exports = { mechanicalReview };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: PASS (all files so far).

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/hooks/lib plugins/research-harness/references plugins/research-harness/test
git commit -m "Add the is-qualitative profile, the dependency graph and the mechanical review

A profile is one Markdown file: emphasis in prose, the dependency graph
in a fenced block the loader parses, and module attachments. The graph
has three edges that differ from the canvas's presentation order, each
with a source and each one line to change (spec 4.5, 4.6).

The mechanical review computes what a skill should not: empties, open
elements, violations, untagged statements, and acceptances whose text
hash no longer matches the log.

<attribution line for the model actually running this task>"
```

---

### Task 5: The references — question set, AMJ map, problematization

**Files:**
- Create: `plugins/research-harness/references/canvas-elements.md`
- Create: `plugins/research-harness/references/amj-map.md`
- Create: `plugins/research-harness/references/problematization.md`
- Test: `plugins/research-harness/test/references.test.js`

**Interfaces:**
- Produces: `canvas-elements.md` is **both** the question set the skills read **and** the template `init` copies (Task 8). It must parse with `parseCanvas` into nine elements whose question ids match the fixture.

**Copyright rule (§5.5), restated for the implementer:** every question below is original wording modelled on the structure of Table 1 in Dorobantu et al. (2024) and cites it. Do not paste any sentence from the paper. The same holds for the sensibilities grid — original questions, cited source.

- [ ] **Step 1: Write the failing test**

`plugins/research-harness/test/references.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');

const refDir = path.resolve(__dirname, '..', 'references');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'voice-uptake', 'research', 'canvas.md'), 'utf8');

test('canvas-elements.md parses as an empty canvas with the fixture\'s question ids', () => {
  const template = canvas.parseCanvas(fs.readFileSync(path.join(refDir, 'canvas-elements.md'), 'utf8'));
  assert.equal(template.problems.length, 0, template.problems.join('; '));
  assert.equal(template.elements.length, 9);
  const ids = template.elements.flatMap((e) => e.questions.map((q) => q.id));
  const fixtureIds = canvas.parseCanvas(fixture).elements.flatMap((e) => e.questions.map((q) => q.id));
  assert.deepEqual(ids, fixtureIds);
  assert.equal(canvas.allStatements(template).length, 0, 'the template carries no statements');
});

test('every reference cites its source and none quotes it', () => {
  for (const name of ['canvas-elements.md', 'amj-map.md', 'problematization.md']) {
    const text = fs.readFileSync(path.join(refDir, name), 'utf8');
    assert.match(text, /Dorobantu|Monteiro|Colquitt/, `${name} cites nothing`);
    assert.match(text, /doi\.org|jstor\.org/, `${name} has no resolvable reference`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/research-harness && node --test test/references.test.js`
Expected: FAIL — `ENOENT` on `canvas-elements.md`.

- [ ] **Step 3: Write `canvas-elements.md`**

`plugins/research-harness/references/canvas-elements.md`:

```markdown
---
project: <slug>
outlet: <target venue>
profile: is-qualitative
created: <YYYY-MM-DD>
mode: brainstorming
canvas-schema: 2
---

# 1 · Puzzle

## 1.1 What is the broad question this project speaks to?

_(empty)_

## 1.2 What is it that you cannot yet explain, and what do you already know?

_(empty)_

## 1.3 Why does this matter — for practice, for theory, or both?

_(empty)_

# 2 · Audience and Prior Research

## 2.1 Who are the ten to twenty scholars whose conversation this joins?

_(empty)_

## 2.2 What has that conversation been about lately, and on what assumptions does it rest?

_(empty)_

## 2.3 How has prior work handled this puzzle, and where is it inconsistent or silent?

_(empty)_

## 2.4 Which assumption of that work do you challenge, and on what grounds?

_(empty)_

# 3 · Research Question

## 3.1 In one sentence: what does this study answer?

_(empty)_

## 3.2 What would a well-informed person answer intuitively, and why is that not enough?

_(empty)_

## 3.3 How does answering it move the puzzle forward?

_(empty)_

# 4 · Theoretical Constructs and Relationships

## 4.1 What are the core concepts, and where does each definition come from?

_(empty)_

## 4.2 How do they relate — and is that relationship given in advance or emerging from the material?

_(empty)_

## 4.3 What mechanism explains the relationship?

_(empty)_

# 5 · Research Setting

## 5.1 Where is the study conducted, and how did you gain access?

_(empty)_

## 5.2 Why is this setting the right one for the question — what does it make visible?

_(empty)_

## 5.3 What would a more suitable setting be, and why are you not there?

_(empty)_

# 6 · Research Design and Analysis

## 6.1 What data, from where, collected how?

_(empty)_

## 6.2 How is the data analysed, and how does the procedure earn trust?

_(empty)_

## 6.3 Which choices in design or analysis would a sceptical reviewer challenge first?

_(empty)_

# 7 · Findings

## 7.1 What does the material show — separated from what you make of it?

_(empty)_

## 7.2 Which instances run counter to the pattern, and what happens to them?

_(empty)_

# 8 · Contributions

## 8.1 What does the field know now that it did not before?

_(empty)_

## 8.2 Which assumption in prior work does this change, and how?

_(empty)_

## 8.3 What follows for practice?

_(empty)_

# 9 · Boundary Conditions and Limitations

## 9.1 Where does the claim stop applying, and why?

_(empty)_

## 9.2 Which limitations follow from design choices, and which from the setting?

_(empty)_

## 9.3 What would refute the contribution?

_(empty)_

<!--
About this file

The nine elements and their grouping follow the AMJ Management Research
Canvas — Dorobantu, S., Gruber, M., Ravasi, D., & Wellman, N. (2024), Academy
of Management Journal, 67(5), 1163–1174, https://doi.org/10.5465/amj.2024.4005.
The questions above are this plugin's own wording, modelled on the structure
of the canvas's worksheet (Table 1 there), not copied from it. Read the
original for the authors' fuller set of prompts.

This file is also the template that `research-harness init` copies into a
paper project. Keep the heading grammar exactly: `# N · Title` and
`## N.M question`, with `_(empty)_` as the only body.

Element 1 is best read with references/problematization.md; the AMJ
editorial to read for each element is listed in references/amj-map.md.
-->
```

- [ ] **Step 4: Write `amj-map.md`**

`plugins/research-harness/references/amj-map.md`:

```markdown
# Which editorial to read for which element

The seven-part *Publishing in AMJ* series is the craft guidance behind the
canvas. This map tells the skills which part speaks to which element. The
plugin does not ship the texts; if `RESEARCH_HARNESS_LIBRARY` is set, look for
a local copy there, otherwise read the citation and stop.

| Element | Read | Also |
|---|---|---|
| 1 Puzzle | Part 1 — Topic Choice. Five criteria for a topic: significance, novelty, curiosity, scope, actionability. | `problematization.md` |
| 2 Audience and Prior Research | Part 3 — Setting the Hook | `problematization.md` |
| 3 Research Question | Part 3 — Setting the Hook | |
| 4 Constructs and Relationships | Part 4 — Grounding Hypotheses | in qualitative profiles the framework emerges; read Part 7 |
| 5 Research Setting | Part 2 — Research Design | Part 7 — Qualitative Research |
| 6 Design and Analysis | Part 2 — Research Design | Part 5 — Methods and Results |
| 7 Findings | Part 5 — Crafting the Methods and Results | Part 7 |
| 8 Contributions | Part 6 — Discussing the Implications | |
| 9 Boundary Conditions | Part 6 — Discussing the Implications | |

## References

- Colquitt, J. A., & George, G. (2011). Publishing in AMJ — Part 1: Topic Choice. *Academy of Management Journal, 54*(3), 432–435. https://www.jstor.org/stable/23045090
- Bono, J. E., & McNamara, G. (2011). Publishing in AMJ — Part 2: Research Design. *Academy of Management Journal, 54*(4), 657–660.
- Grant, A. M., & Pollock, T. G. (2011). Publishing in AMJ — Part 3: Setting the Hook. *Academy of Management Journal, 54*(5), 873–879. https://doi.org/10.5465/amj.2011.4000
- Sparrowe, R. T., & Mayer, K. J. (2011). Publishing in AMJ — Part 4: Grounding Hypotheses. *Academy of Management Journal, 54*(6), 1098–1102. https://www.jstor.org/stable/41413610
- Zhang, Y., & Shaw, J. D. (2012). Publishing in AMJ — Part 5: Crafting the Methods and Results. *Academy of Management Journal, 55*(1), 8–12. https://doi.org/10.5465/amj.2012.4001
- Geletkanycz, M., & Tepper, B. J. (2012). Publishing in AMJ — Part 6: Discussing the Implications. *Academy of Management Journal, 55*(2), 256–260. https://doi.org/10.5465/amj.2012.4002
- Bansal, P., & Corley, K. (2012). Publishing in AMJ — Part 7: What's Different About Qualitative Research? *Academy of Management Journal, 55*(3), 509–513. https://doi.org/10.5465/amj.2012.4003
- Dorobantu, S., Gruber, M., Ravasi, D., & Wellman, N. (2024). The AMJ Management Research Canvas. *Academy of Management Journal, 67*(5), 1163–1174. https://doi.org/10.5465/amj.2024.4005
```

- [ ] **Step 5: Write `problematization.md`**

`plugins/research-harness/references/problematization.md`:

```markdown
# Problematization — how to fill element 1 without gap-spotting

Attached to elements 1 and 2 by the `is-qualitative` profile.

The failure this module guards against is specific: an assistant will produce
an unlimited supply of plausible "X has received limited attention" gaps and
never a challenged assumption. Gap-spotting yields incremental work; the
contribution lies in unsettling something the literature takes for granted
(Alvesson & Sandberg 2011). The MIS Quarterly editors go further for emerging
digital phenomena and ask for *phenomenon-focused* problematization: start from
what is happening in the setting, and let theory enter later as something to be
questioned (Monteiro et al. 2022).

## Four sensibilities

Ask these of the material before touching the literature. They are this
plugin's paraphrase of the four sensibilities in Monteiro et al. (2022); read
the editorial for the authors' own account and examples.

1. **Talk with the setting, not at it.** What here is surprising? What does the
   current vocabulary fail to name? Which practice, object, or data source did
   you not expect to matter?
2. **Name the assumption you are unsettling.** Is it a root metaphor of the
   domain, an ideological premise, or a methodological belief about what
   counts as valid evidence? Say which, and say what in the material
   contradicts it.
3. **Ask how it came to be this way.** What earlier arrangement does this
   phenomenon extend, resurface, or break with? Nothing digital arrives from
   nowhere.
4. **Look for what the usual gaze leaves out.** Who is absent from the account,
   which outcome lands away from the assumed site of action, which category
   makes something invisible?

## The grid

Each sensibility can be asked along three lines of inquiry — what constitutes
the phenomenon, when it is constituted, and where. Use the grid to find the cell
your study actually occupies; do not try to fill all twelve.

| | What | When | Where |
|---|---|---|---|
| **Talk with the setting** | Which unfamiliar kinds of data would show this phenomenon? | Which older material would look different under a new framing? | Across which sites does the phenomenon travel, and which are hard to see? |
| **Name the assumption** | Which data are treated as reality here, and by whom? | Which taken-for-granted domain wisdom does a trace over time overturn? | Which venues and actors quietly define the boundaries of the change? |
| **Ask how it came to be** | How was this data constructed, and what counts as its ground truth? | Which present-day controversy or anomaly motivates the study? | Where is accountability located as practices cross boundaries? |
| **Look for what is left out** | Which data would reveal the politics of the phenomenon? | Which account has been routinely neglected? | Where do consequential outcomes arise beyond the assumed site of action? |

## How the `canvas` skill uses this

- In `seed` mode, element 1 is filled from this module: the agent asks the four
  sensibilities of the material and records answers as `[proposed]`, each with
  an `src:` tag pointing at the memo, meeting, or document it came from.
- Element 2.4 ("which assumption do you challenge") must name a sensibility
  and the assumption's kind (root metaphor / ideological / methodological).
- A statement in element 1 or 2 of the form "little research has examined …"
  is gap-spotting. Record it if the researcher says it, but propose the
  assumption behind it alongside as `[proposed]`.

## References

- Monteiro, E., Constantinides, P., Scott, S., Shaikh, M., & Burton-Jones, A. (2022). Qualitative Research Methods in Information Systems: A Call for Phenomenon-Focused Problematization. *MIS Quarterly, 46*(4), iii–xix. Editor's Comments. https://misq.umn.edu/
- Alvesson, M., & Sandberg, J. (2011). Generating Research Questions Through Problematization. *Academy of Management Review, 36*(2), 247–271. https://doi.org/10.5465/amr.2009.0188
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd plugins/research-harness && node --test test/references.test.js`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/references plugins/research-harness/test/references.test.js
git commit -m "Add the question set, the AMJ map and the problematization module

canvas-elements.md is the question set the skills read and the template
init copies; a test keeps it parseable and aligned with the fixture. All
three files are the plugin's own wording, modelled on and citing their
sources — no copyrighted text ships (spec 5.5).

<attribution line for the model actually running this task>"
```

---

### Task 6: Session ledger and the SessionStart hook

**Files:**
- Create: `plugins/research-harness/hooks/lib/output.js`
- Create: `plugins/research-harness/hooks/lib/ledger.js`
- Create: `plugins/research-harness/hooks/inject-state.js`
- Modify: `plugins/research-harness/hooks/hooks.json` (add the SessionStart entry)
- Test: `plugins/research-harness/test/inject-state.test.js`

**Interfaces:**
- Consumes: `project.js`, `canvas.js`, `profile.js`, `review.js`, `decisions.js`.
- Produces (`output.js`): `BUDGETS`, `writeContext(hookEventName, text)`, `writeDeny(reason)`, `projectedText(hookEventName, text)`.
- Produces (`ledger.js`): `stateRoot()`, `readSeen(projectRoot, sessionId) → number`, `writeSeen(projectRoot, sessionId, seq)`.
- Produces: the injection text format below, which `research-harness.js status` (Task 8) reuses via `summarize()` exported from `inject-state.js`.

Hook stdin (SessionStart): `{ session_id, cwd, hook_event_name: 'SessionStart', ... }`. Hook stdout: `{ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }`. Empty stdout and exit 0 means "nothing to add".

- [ ] **Step 1: Write the failing tests**

`plugins/research-harness/test/inject-state.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const script = path.join(pluginRoot, 'hooks', 'inject-state.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake');

function makeProject(withCanvas = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  if (withCanvas) {
    fs.mkdirSync(path.join(root, 'research'));
    for (const f of ['canvas.md', 'decisions.md']) {
      fs.copyFileSync(path.join(fixtureDir, 'research', f), path.join(root, 'research', f));
    }
  }
  return root;
}

function run(projectRoot, stateDir, data = {}) {
  // Claude Code sets CLAUDE_PROJECT_DIR; an inherited value would point every
  // fixture at the real project, so it is stripped here.
  const { CLAUDE_PROJECT_DIR: _ignored, ...ambient } = process.env;
  const out = childProcess.spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...ambient, RESEARCH_HARNESS_STATE_DIR: stateDir, CLAUDE_PLUGIN_ROOT: pluginRoot },
    input: JSON.stringify({ cwd: projectRoot, session_id: 'sess-1', hook_event_name: 'SessionStart', ...data }),
    encoding: 'utf8',
  });
  return out;
}

test('without a canvas the hook prints nothing and exits 0', () => {
  const root = makeProject(false);
  const out = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
});

test('with a canvas the hook injects a summary under 4 KiB naming empties, open elements and unseen decisions', () => {
  const root = makeProject();
  const out = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(out.status, 0, out.stderr);
  const json = JSON.parse(out.stdout);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  const text = json.hookSpecificOutput.additionalContext;
  assert.ok(Buffer.byteLength(text, 'utf8') <= 4096);
  assert.match(text, /voice-uptake/);
  assert.match(text, /profile is-qualitative/);
  assert.match(text, /mode seed/);
  assert.match(text, /Empty: 4, 6, 7, 8, 9/);
  assert.match(text, /Open \(proposals only\): 2/);
  assert.match(text, /Decisions not yet seen: #1 CONSTRAINT 5 Research Setting; #2 DISCOVERY 1 Puzzle; #3 DECISION 1\.1 accepted/);
  assert.match(text, /never write \[accepted\]/);
  assert.match(text, /\/research-harness:accept/);
});

test('a second session start with the same session id does not repeat decisions already injected', () => {
  const root = makeProject();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  run(root, stateDir);
  const again = JSON.parse(run(root, stateDir).stdout).hookSpecificOutput.additionalContext;
  assert.match(again, /Decisions not yet seen: none/);
  const other = JSON.parse(run(root, stateDir, { session_id: 'sess-2' }).stdout).hookSpecificOutput.additionalContext;
  assert.match(other, /Decisions not yet seen: #1/);
});

test('a malformed canvas or a missing profile does not stop the prompt', () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), '---\nproject: broken\n');
  const broken = run(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(broken.status, 0);
  assert.equal(broken.stdout, '');
  const root2 = makeProject();
  const text = fs.readFileSync(path.join(root2, 'research', 'canvas.md'), 'utf8').replace('profile: is-qualitative', 'profile: nope');
  fs.writeFileSync(path.join(root2, 'research', 'canvas.md'), text);
  const noProfile = run(root2, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  assert.equal(noProfile.status, 0);
  assert.match(JSON.parse(noProfile.stdout).hookSpecificOutput.additionalContext, /profile nope \(not found; dependencies not checked\)/);
});

test('over-budget text is truncated with a watermark', () => {
  const output = require('../hooks/lib/output');
  const long = 'x'.repeat(5000);
  const projected = output.projectedText('SessionStart', long);
  assert.ok(Buffer.byteLength(projected, 'utf8') <= 4096);
  assert.match(projected, /\[research-harness: truncated to 4096 bytes; run `research-harness status` for the full summary\]$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/inject-state.test.js`
Expected: FAIL — `Cannot find module` / script missing.

- [ ] **Step 3: Write `output.js`**

`plugins/research-harness/hooks/lib/output.js`:

```js
'use strict';

const BUDGETS = Object.freeze({ SessionStart: 4096, PreToolUse: 768 });

function byteLength(s) {
  return Buffer.byteLength(s, 'utf8');
}

function truncateUtf8(value, maxBytes) {
  let out = '';
  let bytes = 0;
  for (const ch of value) {
    const b = byteLength(ch);
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return out;
}

function projectedText(hookEventName, text) {
  const budget = BUDGETS[hookEventName] || 512;
  if (byteLength(text) <= budget) return text;
  const note = '\n[research-harness: truncated to 4096 bytes; run `research-harness status` for the full summary]';
  return `${truncateUtf8(text, Math.max(0, budget - byteLength(note)))}${note}`;
}

// additionalContext is the only channel the model reads (§5.2).
function writeContext(hookEventName, text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName, additionalContext: projectedText(hookEventName, text) },
  }));
}

function writeDeny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: projectedText('PreToolUse', reason),
    },
  }));
}

module.exports = { BUDGETS, projectedText, writeContext, writeDeny };
```

- [ ] **Step 4: Write `ledger.js`**

`plugins/research-harness/hooks/lib/ledger.js`:

```js
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Transient, per machine, never part of the paper (§5.2). Override for tests.
function stateRoot() {
  return process.env.RESEARCH_HARNESS_STATE_DIR || path.join(os.homedir(), '.claude', 'research-harness');
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function ledgerFile(projectRoot, sessionId) {
  return path.join(stateRoot(), digest(path.resolve(projectRoot)), `${digest(sessionId)}.json`);
}

function readSeen(projectRoot, sessionId) {
  if (!sessionId) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(ledgerFile(projectRoot, sessionId), 'utf8'));
    return Number.isInteger(data.seenSeq) ? data.seenSeq : 0;
  } catch (_) {
    return 0;
  }
}

function writeSeen(projectRoot, sessionId, seenSeq) {
  if (!sessionId) return;
  try {
    const file = ledgerFile(projectRoot, sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ seenSeq }));
  } catch (_) {
    // The ledger is an optimization. Failing to write it must never affect a hook.
  }
}

module.exports = { stateRoot, readSeen, writeSeen };
```

- [ ] **Step 5: Write `inject-state.js`**

`plugins/research-harness/hooks/inject-state.js`:

```js
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('./lib/project');
const canvas = require('./lib/canvas');
const profileLib = require('./lib/profile');
const { mechanicalReview } = require('./lib/review');
const { parseDecisions } = require('./lib/decisions');
const ledger = require('./lib/ledger');
const output = require('./lib/output');

const RULES = [
  'Rules for research/canvas.md: write only [proposed], [tentative], or [stated] as a transcription of what the researcher said.',
  'Never write [accepted]. Never alter or remove a [stated] or [accepted] statement — propose alongside as [proposed].',
  'Factual claims carry `src: <id>` or `unverified`, never nothing. An empty element is fine; plausible filler is not.',
  'Only the researcher accepts, via /research-harness:accept <n.m>. Skills: /research-harness:canvas, /research-harness:canvas-review.',
].join(' ');

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    return {};
  }
}

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
}

// Returns { text, maxSeq } or null when there is nothing to inject.
function summarize(projectRoot, { seenSeq = 0 } = {}) {
  const canvasText = project.readIfExists(project.canvasPath(projectRoot));
  if (canvasText === null) return null;
  const parsed = canvas.parseCanvas(canvasText);
  if (!parsed.elements.length) return null;

  const fm = parsed.frontmatter;
  const profileId = fm.profile || 'is-qualitative';
  let profileNote = `profile ${profileId}`;
  let graph = null;
  try {
    graph = profileLib.loadProfile(profileId, pluginRoot()).graph;
  } catch (_) {
    profileNote = `profile ${profileId} (not found; dependencies not checked)`;
  }

  const decisionsText = project.readIfExists(project.decisionsPath(projectRoot)) || '';
  const report = mechanicalReview({ parsed, graph, decisionsText });
  const log = parseDecisions(decisionsText);

  const statusLine = parsed.elements
    .map((e) => {
      const s = report.statuses[e.number];
      return `${e.number} ${s.status}${s.open ? ` (+${s.open} open)` : ''}`;
    })
    .join(' · ');
  const list = (arr) => (arr.length ? arr.join(', ') : 'none');
  const unseen = log.entries.filter((e) => e.seq > seenSeq);
  const unseenLine = unseen.length ? unseen.map((e) => `#${e.seq} ${e.kind} ${e.ref}`).join('; ') : 'none';
  const violationLine = report.violations.length
    ? report.violations.map((v) => `${v.element} accepted but ${v.missing.map((m) => `${m.element} is ${m.status}`).join(', ')}`).join('; ')
    : 'none';
  const staleLine = report.staleAcceptances.length ? report.staleAcceptances.map((s) => `#${s.seq}`).join(', ') : 'none';

  const text = [
    `research-harness · paper project "${fm.project || '?'}" · ${profileNote} · mode ${fm.mode || '?'}`,
    `Elements: ${statusLine}`,
    `Empty: ${list(report.empty)} · Open (proposals only): ${list(report.open)}`,
    `Dependency violations: ${violationLine} · Stale acceptances: ${staleLine}`,
    `Decisions not yet seen: ${unseenLine}`,
    RULES,
  ].join('\n');
  return { text, maxSeq: log.maxSeq };
}

function main() {
  try {
    const data = readStdin();
    const projectRoot = project.projectDir(data);
    const sessionId = typeof data.session_id === 'string' ? data.session_id : '';
    const summary = summarize(projectRoot, { seenSeq: ledger.readSeen(projectRoot, sessionId) });
    if (!summary) return;
    ledger.writeSeen(projectRoot, sessionId, summary.maxSeq);
    output.writeContext('SessionStart', summary.text);
  } catch (_) {
    // Fail open: a hook must never stop a prompt (§5.2).
  }
}

if (require.main === module) main();

module.exports = { summarize, RULES };
```

- [ ] **Step 6: Register the hook**

Replace `"hooks": {}` in `plugins/research-harness/hooks/hooks.json` with:

```json
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-state.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: PASS. If the `Decisions not yet seen` assertion fails on wording, fix the hook text — the test is the contract.

- [ ] **Step 8: Commit**

```bash
git add plugins/research-harness/hooks plugins/research-harness/test/inject-state.test.js
git commit -m "Inject the canvas summary at session start

One SessionStart hook, under 4 KiB, fails open. It names empty and open
elements, dependency violations, stale acceptances, and the decisions
this session has not yet seen, then restates the four writing rules.
A per-project, per-session ledger under the state dir keeps decisions
from being injected twice.

<attribution line for the model actually running this task>"
```

---

### Task 7: The guard — `guard-promotion.js`

**Files:**
- Create: `plugins/research-harness/hooks/guard-promotion.js`
- Modify: `plugins/research-harness/hooks/hooks.json` (add the PreToolUse entry)
- Test: `plugins/research-harness/test/guard-promotion.test.js`

**Interfaces:**
- Consumes: `project.js`, `canvas.js` (`parseCanvas`, `allStatements`, `COMMITTED`), `output.js` (`writeDeny`).
- Produces: `canvasVerdict(beforeText, afterText) → string|null` and `bashVerdict(command) → string|null`, exported for tests and for stage 2.

Hook stdin (PreToolUse): `{ tool_name: 'Edit'|'Write'|'NotebookEdit'|'Bash', tool_input: {...}, cwd, session_id }`. `Write` carries `file_path` + `content`; `Edit` carries `file_path`, `old_string`, `new_string`, optional `replace_all`; `NotebookEdit` carries `notebook_path`; `Bash` carries `command`. Deny output shape is in `output.js`. Empty stdout + exit 0 = allow.

**The rules, restated from §5.3 and §4.4 so the implementer has them in one place:**

- R0 — structure: every element and question heading present before must be present after.
- R1 — no `[accepted]` statement may appear that was not already accepted with the same text.
- R2 — every `[stated]`/`[accepted]` statement present before must be present after with the same marker (tags may change).
- R3 — a statement whose text was `[proposed]`/`[tentative]` before may not be `[stated]` after.
- decisions.md — `after.startsWith(before)`.
- Bash — if the command mentions `canvas.md` or `decisions.md`: allow only recognizable read-only commands and the CLI's `init|status|review` subcommands; everything else is denied. `accept` via Bash is denied: that is the model declaring a commitment.
- Cannot judge (parse problems, `old_string` not found or ambiguous, notebook tools) → deny.

- [ ] **Step 1: Write the failing tests**

`plugins/research-harness/test/guard-promotion.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const script = path.join(pluginRoot, 'hooks', 'guard-promotion.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');
const guard = require('../hooks/guard-promotion');

const canvasText = fs.readFileSync(path.join(fixtureDir, 'canvas.md'), 'utf8');
const decisionsText = fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), canvasText);
  fs.writeFileSync(path.join(root, 'research', 'decisions.md'), decisionsText);
  return root;
}

function run(projectRoot, toolName, toolInput) {
  const { CLAUDE_PROJECT_DIR: _ignored, ...ambient } = process.env;
  const out = childProcess.spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot },
    input: JSON.stringify({ cwd: projectRoot, session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
}

const STATED = 'Speaking frequency is well documented; whether a proposal is taken up is not. [stated]';
const PROPOSED = 'Uptake may be a property of the meeting\'s chairing style rather than of the proposal. [proposed]';

test('files outside the state dir are not the guard\'s business', () => {
  const root = makeProject();
  assert.equal(run(root, 'Write', { file_path: path.join(root, 'manuscript.md'), content: 'x [accepted]' }), null);
  assert.equal(run(root, 'Bash', { command: 'ls -la' }), null);
});

test('editing, adding and removing proposals is allowed', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: 'Uptake may depend on who chairs. [tentative]' }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: '' }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: '## 1.3 Why does this matter — for practice, for theory, or both?\n\n_(empty)_', new_string: '## 1.3 Why does this matter — for practice, for theory, or both?\n\nBecause allocation happens in meetings. [proposed, src: memo-01]' }), null);
});

test('transcribing a new [stated] statement is allowed; adding a tag to one is allowed', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: `${STATED}\nThe researcher recorded all twelve meetings personally. [stated]` }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: STATED.replace('[stated]', '[stated, src: memo-05]') }), null);
});

test('creating an [accepted] statement is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const out = run(root, 'Edit', { file_path: file, old_string: '_(empty)_\n\n# 2 ', new_string: 'It matters. [accepted]\n\n# 2 ' });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /\[accepted\]/);
  assert.match(out.permissionDecisionReason, /research-harness:accept/);
});

test('altering, removing or downgrading a [stated] or [accepted] statement is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const newString of [
    STATED.replace('well documented', 'poorly documented'),
    '',
    STATED.replace('[stated]', '[proposed]'),
  ]) {
    const out = run(root, 'Edit', { file_path: file, old_string: STATED, new_string: newString });
    assert.equal(out.permissionDecision, 'deny', `should deny: ${JSON.stringify(newString)}`);
    assert.match(out.permissionDecisionReason, /propose .* alongside/i);
  }
  const accepted = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]";
  const out = run(root, 'Edit', { file_path: file, old_string: accepted, new_string: accepted.replace('serious', 'real') });
  assert.equal(out.permissionDecision, 'deny');
});

test('promoting a proposal to [stated] or [accepted] is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const marker of ['[stated]', '[accepted]']) {
    const out = run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: PROPOSED.replace('[proposed]', marker) });
    assert.equal(out.permissionDecision, 'deny', marker);
  }
});

test('Write is judged as a whole file; removing a heading is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText.replace(PROPOSED, '') }), null);
  const out = run(root, 'Write', { file_path: file, content: canvasText.replace('## 9.3 What would refute the contribution?\n\n_(empty)_\n', '') });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /heading/);
});

test('creating canvas.md where none exists is allowed unless it carries [accepted]', () => {
  const root = makeProject();
  fs.unlinkSync(path.join(root, 'research', 'canvas.md'));
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText.replace('[accepted]', '[proposed]') }), null);
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText }).permissionDecision, 'deny');
});

test('the guard fails closed when it cannot judge', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const missing = run(root, 'Edit', { file_path: file, old_string: 'this text is not in the file', new_string: 'x' });
  assert.equal(missing.permissionDecision, 'deny');
  assert.match(missing.permissionDecisionReason, /old_string/);
  const ambiguous = run(root, 'Edit', { file_path: file, old_string: '_(empty)_', new_string: 'y [proposed]' });
  assert.equal(ambiguous.permissionDecision, 'deny');
  const garbage = run(root, 'Write', { file_path: file, content: 'not a canvas at all' });
  assert.equal(garbage.permissionDecision, 'deny');
  const notebook = run(root, 'NotebookEdit', { notebook_path: file, new_source: 'x' });
  assert.equal(notebook.permissionDecision, 'deny');
});

test('decisions.md may only be appended to', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'decisions.md');
  assert.equal(run(root, 'Write', { file_path: file, content: `${decisionsText}\n## [#4] 2026-09-16 · DISCOVERY · 2 Audience and Prior Research\nx [tentative]\n` }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: '**Rejected:** framing it as a voice-frequency question.\n', new_string: '**Rejected:** framing it as a voice-frequency question.\n\n## [#4] 2026-09-16 · DISCOVERY · 1 Puzzle\ny [tentative]\n' }), null);
  const rewrite = run(root, 'Edit', { file_path: file, old_string: 'CONSTRAINT', new_string: 'DECISION' });
  assert.equal(rewrite.permissionDecision, 'deny');
  assert.match(rewrite.permissionDecisionReason, /append/);
  assert.equal(run(root, 'Write', { file_path: file, content: '# fresh\n' }).permissionDecision, 'deny');
});

test('Bash: reading the state files is allowed, writing them is denied, accept via Bash is denied', () => {
  const root = makeProject();
  for (const cmd of [
    'cat research/canvas.md',
    'grep -n accepted research/canvas.md | head',
    'sed -n 1,20p research/decisions.md',
    'git diff -- research/canvas.md',
    'node "/x/bin/research-harness.js" status',
    'node "/x/bin/research-harness.js" review',
    'node "/x/bin/research-harness.js" init --project p --mode seed',
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
  for (const cmd of [
    'echo "x [accepted]" >> research/canvas.md',
    'cat other.md > research/canvas.md',
    'sed -i "s/stated/accepted/" research/canvas.md',
    'cat research/canvas.md | tee research/canvas.md',
    'python3 -c "open(\'research/decisions.md\',\'w\').write(\'\')"',
    'node "/x/bin/research-harness.js" accept 1.2',
    'mv research/canvas.md /tmp/x',
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
});

test('canvasVerdict and bashVerdict are exported for reuse', () => {
  assert.equal(guard.canvasVerdict(canvasText, canvasText), null);
  assert.match(guard.canvasVerdict(canvasText, canvasText.replace('[stated, src: memo-03]', '[accepted, src: memo-03]')), /\[accepted\]/);
  assert.equal(guard.bashVerdict('wc -l research/canvas.md'), null);
  assert.match(guard.bashVerdict('rm research/canvas.md'), /read-only/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/guard-promotion.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `guard-promotion.js`**

`plugins/research-harness/hooks/guard-promotion.js`:

```js
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('./lib/project');
const canvas = require('./lib/canvas');
const output = require('./lib/output');

const NEXT_STEP = 'Propose the change as [proposed] alongside the existing statement, or let the researcher make it with /research-harness:accept.';

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    return {};
  }
}

// ---------- canvas.md ----------

function headingKeys(parsed) {
  const keys = [];
  for (const el of parsed.elements) {
    keys.push(`#${el.number}`);
    for (const q of el.questions) keys.push(`##${q.id}`);
  }
  return keys;
}

// Returns a refusal reason, or null when the write is permitted (§5.3, §4.4).
function canvasVerdict(beforeText, afterText) {
  const before = canvas.parseCanvas(beforeText || '');
  const after = canvas.parseCanvas(afterText || '');
  if (after.problems.length) {
    return `Cannot judge this write: ${after.problems[0]}. Keep the canvas structure — frontmatter, "# N · Title", "## N.M question", statements ending in a marker group. ${NEXT_STEP}`;
  }
  if (!after.elements.length) {
    return `Cannot judge this write: the result has no elements. ${NEXT_STEP}`;
  }
  const afterHeadings = new Set(headingKeys(after));
  for (const key of headingKeys(before)) {
    if (!afterHeadings.has(key)) return `Removing or renaming the heading ${key} is not allowed; every element and question heading stays. ${NEXT_STEP}`;
  }

  const key = (s) => `${s.question}|${s.text}`;
  const b = canvas.allStatements(before);
  const a = canvas.allStatements(after);
  const bByKey = new Map(b.map((s) => [key(s), s]));
  const aByKey = new Map(a.map((s) => [key(s), s]));

  for (const s of a) {
    if (s.marker !== 'accepted') continue;
    const prev = bByKey.get(key(s));
    if (!prev || prev.marker !== 'accepted') {
      return `Only the researcher may write [accepted] (question ${s.question}). ${NEXT_STEP}`;
    }
  }
  for (const s of b) {
    if (!canvas.COMMITTED.has(s.marker)) continue;
    const next = aByKey.get(key(s));
    if (!next || next.marker !== s.marker) {
      return `The [${s.marker}] statement in question ${s.question} must not be altered, removed, or downgraded — it records what the researcher said or accepted. ${NEXT_STEP}`;
    }
  }
  for (const s of a) {
    if (s.marker !== 'stated') continue;
    const prev = bByKey.get(key(s));
    if (prev && !canvas.COMMITTED.has(prev.marker)) {
      return `A [${prev.marker}] statement cannot be promoted to [stated] by the model (question ${s.question}); only the researcher confirms it. ${NEXT_STEP}`;
    }
  }
  return null;
}

// Apply an Edit the way the tool would; null when it could not be applied unambiguously.
function applyEdit(current, toolInput) {
  const { old_string: oldString, new_string: newString, replace_all: replaceAll } = toolInput;
  if (typeof oldString !== 'string' || typeof newString !== 'string') return null;
  const first = current.indexOf(oldString);
  if (first < 0) return null;
  const second = current.indexOf(oldString, first + oldString.length);
  if (second >= 0 && !replaceAll) return null;
  return replaceAll ? current.split(oldString).join(newString) : `${current.slice(0, first)}${newString}${current.slice(first + oldString.length)}`;
}

// ---------- Bash ----------

const READ_ONLY_RE = /^\s*(?:cat|head|tail|less|more|wc|grep|rg|diff|stat|ls|file|md5sum|shasum|sed\s+-n|awk|git\s+(?:diff|log|show|status|blame))\b/;
const WRITE_HINT_RE = /(?:>>?|\|)\s*\S*(?:canvas|decisions)\.md|\btee\b|\s-i\b|\s--in-place\b/;
const CLI_READ_RE = /research-harness\.js"?\s+(?:status|review|init)\b/;

function bashVerdict(command) {
  const cmd = String(command || '');
  if (!/(?:canvas|decisions)\.md/.test(cmd)) return null;
  if (CLI_READ_RE.test(cmd)) return null;
  if (READ_ONLY_RE.test(cmd) && !WRITE_HINT_RE.test(cmd)) return null;
  return `Only read-only shell access to canvas.md and decisions.md is allowed here (cat, grep, sed -n, git diff, or research-harness status/review/init). Use the Edit tool for [proposed] and [tentative] statements; acceptance is the researcher's act via /research-harness:accept.`;
}

// ---------- main ----------

function targetOf(projectRoot, toolInput) {
  const raw = toolInput.file_path || toolInput.notebook_path || toolInput.path;
  if (typeof raw !== 'string' || !raw) return null;
  const resolved = path.resolve(projectRoot, raw);
  if (resolved === path.resolve(project.canvasPath(projectRoot))) return { kind: 'canvas', file: resolved };
  if (resolved === path.resolve(project.decisionsPath(projectRoot))) return { kind: 'decisions', file: resolved };
  return null;
}

function main() {
  let reason = null;
  try {
    const data = readStdin();
    const toolName = typeof data.tool_name === 'string' ? data.tool_name : '';
    const toolInput = data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
    const projectRoot = project.projectDir(data);

    if (toolName === 'Bash') {
      reason = bashVerdict(toolInput.command);
    } else if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
      const target = targetOf(projectRoot, toolInput);
      if (!target) return;
      if (toolName === 'NotebookEdit') {
        reason = `${path.basename(target.file)} is not a notebook. Use the Edit tool. ${NEXT_STEP}`;
      } else {
        const before = project.readIfExists(target.file) || '';
        const after = toolName === 'Write' ? (typeof toolInput.content === 'string' ? toolInput.content : null) : applyEdit(before, toolInput);
        if (after === null) {
          reason = `Cannot judge this edit: old_string was not found exactly once in ${path.basename(target.file)}. Re-read the file and retry with a unique old_string.`;
        } else if (target.kind === 'decisions') {
          reason = after.startsWith(before) ? null : 'decisions.md is append-only: existing entries are never edited. Append a new entry that names the one it supersedes.';
        } else {
          reason = canvasVerdict(before, after);
        }
      }
    }
  } catch (err) {
    // Fail closed: a guard that lets writes through on error is a hole (§5.3).
    reason = `research-harness could not evaluate this write (${err && err.message ? err.message : 'unknown error'}); it is denied. ${NEXT_STEP}`;
  }
  if (reason) output.writeDeny(reason);
}

if (require.main === module) main();

module.exports = { canvasVerdict, bashVerdict, applyEdit };
```

- [ ] **Step 4: Register the hook**

Add to `"hooks"` in `plugins/research-harness/hooks/hooks.json`, after the `SessionStart` entry:

```json
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard-promotion.js\"",
            "timeout": 10
          }
        ]
      }
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: PASS. Pay attention to the "fails closed" test: `_(empty)_` occurs many times in the fixture, so the ambiguous Edit must be denied — that is the `applyEdit` null path.

- [ ] **Step 6: Commit**

```bash
git add plugins/research-harness/hooks plugins/research-harness/test/guard-promotion.test.js
git commit -m "Add the guard that keeps commitments in the researcher's hands

One PreToolUse hook on Edit, Write, NotebookEdit and Bash. It computes
the file before and after, then applies four rules: headings stay; no
[accepted] appears that was not already accepted; no [stated] or
[accepted] statement is altered, removed or downgraded; no proposal is
promoted. decisions.md is append-only. Shell access to the two files is
read-only, and accept via Bash is denied because that is the model
declaring a commitment. When the guard cannot judge, it denies and says
why (spec 5.3).

<attribution line for the model actually running this task>"
```

---

### Task 8: The CLI — `init`, `status`, `review`, `accept`

**Files:**
- Create: `plugins/research-harness/bin/research-harness.js`
- Test: `plugins/research-harness/test/cli.test.js`

**Interfaces:**
- Consumes: everything in `hooks/lib/`, `summarize` from `hooks/inject-state.js`, the template `references/canvas-elements.md`.
- Produces: the four subcommands the skills call (Task 9). Exit code 0 on success, 1 on refusal, 2 on usage error; all messages on stdout so the `!` line in a skill embeds them.

```
research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--profile <id>]
research-harness status
research-harness review
research-harness accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]
```

`accept` is the approval path (§5.4): it promotes exactly one statement in question `n.m` to `[accepted]`, keeps its tags, appends a `DECISION` entry carrying the text hash, and refuses when a dependency of the element is not accepted. When the question has more than one candidate statement, `--match` must select exactly one.

- [ ] **Step 1: Write the failing tests**

`plugins/research-harness/test/cli.test.js`:

```js
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
  const { CLAUDE_PROJECT_DIR: _ignored, ...ambient } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot, RESEARCH_HARNESS_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')) },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/research-harness && node --test test/cli.test.js`
Expected: FAIL — `bin/research-harness.js` missing.

- [ ] **Step 3: Write the CLI**

`plugins/research-harness/bin/research-harness.js`:

```js
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('../hooks/lib/project');
const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');
const profileLib = require('../hooks/lib/profile');
const { mechanicalReview } = require('../hooks/lib/review');
const { summarize } = require('../hooks/inject-state');

const MODES = ['brainstorming', 'seed', 'import'];
const USAGE = [
  'research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--profile <id>]',
  'research-harness status',
  'research-harness review',
  'research-harness accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]',
].join('\n');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function say(text) {
  process.stdout.write(`${text}\n`);
}

function fail(text, code = 1) {
  say(text);
  return code;
}

// ---------- init ----------

function init(flags) {
  const root = project.projectDir({});
  if (!flags.project || typeof flags.project !== 'string') return fail(`--project is required.\n${USAGE}`, 2);
  if (!MODES.includes(flags.mode)) return fail(`--mode must be one of ${MODES.join(', ')}.\n${USAGE}`, 2);
  const profileId = typeof flags.profile === 'string' ? flags.profile : 'is-qualitative';
  try {
    profileLib.loadProfile(profileId, pluginRoot());
  } catch (err) {
    return fail(err.message, 2);
  }
  const canvasFile = project.canvasPath(root);
  if (fs.existsSync(canvasFile)) return fail(`${path.relative(root, canvasFile)} already exists; nothing written.`);

  const template = fs.readFileSync(path.join(pluginRoot(), 'references', 'canvas-elements.md'), 'utf8');
  const body = template.replace(/^---[\s\S]*?---\n/, '').replace(/\n<!--[\s\S]*?-->\s*$/, '\n');
  const frontmatter = [
    '---',
    `project: ${flags.project}`,
    `outlet: ${typeof flags.outlet === 'string' ? flags.outlet : ''}`,
    `profile: ${profileId}`,
    `created: ${today()}`,
    `mode: ${flags.mode}`,
    'canvas-schema: 2',
    '---',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(canvasFile), { recursive: true });
  fs.writeFileSync(canvasFile, `${frontmatter}${body}`);
  const decisionsFile = project.decisionsPath(root);
  if (!fs.existsSync(decisionsFile)) fs.writeFileSync(decisionsFile, decisions.header(flags.project));
  say(`Created ${path.relative(root, canvasFile)} and ${path.relative(root, decisionsFile)} (profile ${profileId}, mode ${flags.mode}).`);
  say('Every element is empty. That is the correct starting state.');
  return 0;
}

// ---------- status / review ----------

function loadState() {
  const root = project.projectDir({});
  const canvasText = project.readIfExists(project.canvasPath(root));
  if (canvasText === null) return { error: `This is not a paper project: no ${path.relative(root, project.canvasPath(root)) || 'research/canvas.md'}. Run research-harness init first.` };
  const parsed = canvas.parseCanvas(canvasText);
  const decisionsText = project.readIfExists(project.decisionsPath(root)) || '';
  let graph = null;
  let profileError = null;
  try {
    graph = profileLib.loadProfile(parsed.frontmatter.profile || 'is-qualitative', pluginRoot()).graph;
  } catch (err) {
    profileError = err.message;
  }
  return { root, canvasText, parsed, decisionsText, graph, profileError };
}

function status() {
  const root = project.projectDir({});
  const summary = summarize(root, { seenSeq: 0 });
  if (!summary) return fail(`This is not a paper project: no research/canvas.md (or the file has no elements). Run research-harness init first.`);
  say(summary.text);
  return 0;
}

function review() {
  const state = loadState();
  if (state.error) return fail(state.error);
  const report = mechanicalReview({ parsed: state.parsed, graph: state.graph, decisionsText: state.decisionsText });
  const list = (arr) => (arr.length ? arr.join(', ') : 'none');
  const stmt = (s) => `${s.question} [${s.marker === null ? 'unmarked' : s.marker}] (line ${s.line}): ${s.text}`;
  const lines = ['# Mechanical review', ''];
  if (state.profileError) lines.push(`> ${state.profileError}; dependencies not checked.`, '');
  if (report.problems.length) lines.push('## Parse problems', ...report.problems, '');
  lines.push('## Element status', ...state.parsed.elements.map((e) => `${e.number} ${e.title}: ${report.statuses[e.number].status}${report.statuses[e.number].open ? ` (+${report.statuses[e.number].open} open)` : ''}`), '');
  lines.push('## Empty elements', list(report.empty), '');
  lines.push('## Open elements (proposals only)', list(report.open), '');
  lines.push('## Dependency violations', ...(report.violations.length ? report.violations.map((v) => `element ${v.element} is accepted but ${v.missing.map((m) => `element ${m.element} is ${m.status}`).join(', ')}`) : ['none']), '');
  lines.push('## Unmarked statements', ...(report.unmarked.length ? report.unmarked.map(stmt) : ['none']), '');
  lines.push('## Untagged statements', '(no `src:` or `unverified` — decide whether each is a factual claim)', ...(report.untagged.length ? report.untagged.map(stmt) : ['none']), '');
  lines.push('## Conversational [stated] statements (review periodically)', ...(report.conversationalStated.length ? report.conversationalStated.map(stmt) : ['none']), '');
  lines.push('## Stale acceptances', ...(report.staleAcceptances.length ? report.staleAcceptances.map((s) => `#${s.seq} ${s.ref} — text ${s.hash} no longer matches any accepted statement`) : ['none']), '');
  lines.push('## Unlogged acceptances', ...(report.unloggedAcceptances.length ? report.unloggedAcceptances.map((s) => `${s.question} (line ${s.line}): ${s.text}`) : ['none']), '');
  say(lines.join('\n'));
  return 0;
}

// ---------- accept ----------

function replaceMarker(raw, newMarker) {
  return raw.replace(/\[([^[\]]+)\]\s*$/, (_, group) => {
    const parts = group.split(',').map((p) => p.trim()).filter(Boolean);
    parts[0] = newMarker;
    return `[${parts.join(', ')}]`;
  });
}

function accept(positional, flags) {
  const state = loadState();
  if (state.error) return fail(state.error);
  const questionId = positional[0];
  if (!questionId || !/^[1-9]\.\d+$/.test(questionId)) return fail(`accept needs a question id like 3.1.\n${USAGE}`, 2);
  if (state.profileError) return fail(`${state.profileError}; cannot check dependencies, so nothing is accepted.`);

  const element = state.parsed.elements.find((e) => e.questions.some((q) => q.id === questionId));
  const question = element && element.questions.find((q) => q.id === questionId);
  if (!question) return fail(`There is no question ${questionId} in the canvas.`);

  let candidates = question.statements.filter((s) => s.marker !== null && s.marker !== 'accepted');
  if (typeof flags.match === 'string') candidates = candidates.filter((s) => s.text.includes(flags.match));
  if (!candidates.length) return fail(`Question ${questionId}: nothing to accept${typeof flags.match === 'string' ? ` matching "${flags.match}"` : ''}.`);
  if (candidates.length > 1) {
    return fail(`Question ${questionId} has ${candidates.length} candidates; pick one with --match <substring>:\n${candidates.map((s) => `  - [${s.marker}] ${s.text}`).join('\n')}`);
  }
  const target = candidates[0];

  const statuses = profileLib.statusByNumber(state.parsed);
  const unmet = (state.graph[element.number] || [])
    .map((d) => ({ element: d, status: statuses[d] ? statuses[d].status : 'missing' }))
    .filter((d) => d.status !== 'accepted');
  if (unmet.length) {
    return fail(`Cannot accept ${questionId}: element ${element.number} depends on ${unmet.map((d) => `element ${d.element} is ${d.status}`).join(', ')}. Accept those first, or change the graph in the profile.`);
  }

  const lines = state.canvasText.split('\n');
  const start = target.line - 1;
  const count = target.raw.split('\n').length;
  const replaced = replaceMarker(target.raw, 'accepted');
  lines.splice(start, count, ...replaced.split('\n'));
  fs.writeFileSync(project.canvasPath(state.root), lines.join('\n'));

  const log = decisions.parseDecisions(state.decisionsText);
  const hash = textHash(target.text);
  decisions.appendEntry(project.decisionsPath(state.root), decisions.formatEntry({
    seq: log.maxSeq + 1,
    date: today(),
    kind: 'DECISION',
    ref: `${questionId} accepted`,
    hash,
    body: `${target.text} [accepted${target.tags.length ? `, ${target.tags.join(', ')}` : ''}]`,
    why: typeof flags.why === 'string' ? flags.why : undefined,
    rejected: typeof flags.rejected === 'string' ? flags.rejected : undefined,
  }));
  say(`Accepted ${questionId} (was [${target.marker}]): ${target.text}`);
  say(`Logged as #${log.maxSeq + 1} with text ${hash}.`);
  return 0;
}

// ---------- entry ----------

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();
  switch (command) {
    case 'init': return init(flags);
    case 'status': return status();
    case 'review': return review();
    case 'accept': return accept(positional, flags);
    default: return fail(USAGE, 2);
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, replaceMarker };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: PASS. If the `accept 3.1` refusal wording differs, align the message with the test (`element 1 is stated`).

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/bin plugins/research-harness/test/cli.test.js
git commit -m "Add the CLI: init, status, review, and the accept approval path

accept promotes one statement to [accepted], keeps its evidence tags,
refuses when a dependency is not accepted, and appends a DECISION entry
carrying the text hash. It is the human's path from stage 1 on (spec
5.4); the guard denies the model from running it through Bash.

<attribution line for the model actually running this task>"
```

---

### Task 9: The three skills

**Files:**
- Create: `plugins/research-harness/skills/canvas/SKILL.md`
- Create: `plugins/research-harness/skills/canvas-review/SKILL.md`
- Create: `plugins/research-harness/skills/accept/SKILL.md`

**Interfaces:**
- Consumes: the CLI subcommands (Task 8), `references/` (Tasks 4, 5), the rules injected by Task 6.
- Produces: the three slash commands `/research-harness:canvas`, `/research-harness:canvas-review`, `/research-harness:accept`.

Frontmatter is minimal — `name` and `description` phrased as *"Use when …"* — except `accept`, which is human-only (`disable-model-invocation: true`, `allowed-tools: Bash(node:*)`) and runs the CLI in a `!` line, exactly like Toolshed's `board` skill.

- [ ] **Step 1: Write `skills/canvas/SKILL.md`**

```markdown
---
name: canvas
description: Use when starting or continuing the research canvas of a paper project — framing elements 1 to 9 in brainstorming, seed, or import mode. Writes proposals; never accepts.
---

# The research canvas

You are filling `research/canvas.md`, the nine-element state of this paper
project. Read these before you write anything:

- `${CLAUDE_PLUGIN_ROOT}/references/canvas-elements.md` — the question set
- the profile named in the canvas frontmatter, under
  `${CLAUDE_PLUGIN_ROOT}/references/profiles/` — emphasis and the dependency graph
- `${CLAUDE_PLUGIN_ROOT}/references/problematization.md` — for elements 1 and 2
- `${CLAUDE_PLUGIN_ROOT}/references/amj-map.md` — which editorial to read per element

## First: is there a canvas?

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" status`.

If it reports no canvas, ask the researcher for three things and then run
`init`: the project slug, the mode (`brainstorming` — nothing exists yet;
`seed` — material and a phenomenon exist, no manuscript; `import` — a
manuscript exists), and the target outlet if known. Example:

    node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" init --project <slug> --mode seed --outlet "<venue>"

## What you may write

Every statement is one paragraph ending in a marker group.

- `[proposed]` — your suggestion. Most of what you write.
- `[tentative]` — something found in the material, not yet confirmed.
- `[stated]` — **only** a transcription of what the researcher said in this
  conversation. Write it in their words. Never mark your own reading of a
  document as `[stated]`.
- `[accepted]` — **never.** The guard will deny it. Acceptance is the
  researcher's act: tell them to run `/research-harness:accept <n.m>`.

Never alter or delete a `[stated]` or `[accepted]` statement. If you think one
is wrong, write a `[proposed]` paragraph next to it that says why.

Every factual claim carries an evidence tag after the marker: `src: <id>`
pointing at a memo, document, meeting, or reference the researcher can find,
or `unverified` when you looked and found nothing. `[proposed, src: memo-03]`,
`[tentative, unverified]`. A claim with no tag is a claim you have not thought
about.

**An empty element is a correct state.** `_(empty)_` is better than a
plausible paragraph. Do not fill an element because it is empty; fill it
because the researcher gave you something or the material shows something.

## How to work

One element at a time, in the order the profile's dependency graph suggests,
starting where the mode says:

- `brainstorming`: element 1, in dialogue. Use the five topic criteria from
  Part 1 of the AMJ series (significance, novelty, curiosity, scope,
  actionability) as questions, not as a checklist to satisfy.
- `seed`: element 1 through the four sensibilities in `problematization.md`.
  Ask them of the material. Do not open the literature until element 1 and 3
  hold something the researcher has confirmed.
- `import`: read the manuscript and reconstruct all nine elements as
  `[proposed]`, each with an `src:` tag naming the section it came from. Do
  not mark anything `[stated]` — you are reading a manuscript, not hearing
  the author.

Ask one question at a time. Record the researcher's answer as `[stated]`,
your reading of it as `[proposed]`. When an element holds something they
have confirmed, tell them how to accept it and move on.

Do not quote raw material (transcripts, field notes) into the canvas. Cite it
with `src:`. The canvas travels; the material does not.

When you finish a session, run `status` again and report what is empty, what
is open, and what is ready for acceptance.
```

- [ ] **Step 2: Write `skills/canvas-review/SKILL.md`**

```markdown
---
name: canvas-review
description: Use when reviewing a paper project's research canvas for gaps, incoherence, unmet dependencies, missing evidence, and statements the manuscript no longer supports. Argues against the canvas; writes only proposals.
---

# Reviewing the canvas

This review argues against the canvas. It does not tidy it. A review that only
checks whether the pieces fit produces a coherent canvas around a bad study.

## 1. The mechanical part

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" review` and read the
report. It lists: empty elements; open elements (proposals only); dependency
violations; unmarked and untagged statements; conversational `[stated]`
statements; acceptances whose text hash no longer matches; accepted statements
with no log entry. Report all of it verbatim to the researcher first.

Then read the profile named in the canvas frontmatter under
`${CLAUDE_PLUGIN_ROOT}/references/profiles/` and
`${CLAUDE_PLUGIN_ROOT}/references/canvas-elements.md`.

## 2. Fit — where elements contradict each other

Check these pairs and write what you find:

- 8 against 3: do the contributions answer the research question, or a
  different one?
- 9 against 5 and 6: do the boundary conditions contradict the setting or the
  design (a claim about "organizations" from one team; a process claim from a
  cross-section)?
- 4 against 7: in a qualitative profile, does the framework claim more than
  the findings show?
- 2 against 1: does the prior-research account start from the phenomenon, or
  is it gap-spotting ("little research has examined …")?
- 3 against 1: is the question the one the puzzle poses, or a narrower one
  that was easier to answer?

## 3. Refutation — one element at a time

For every element that holds a committed statement, write one paragraph
answering: **what would have to be true for this element to be wrong, and
does the material or the literature say it?** Try to refute before you report
fit. If you cannot construct a refutation, say that too — it is information.

## 4. Manuscript support

If the researcher names a manuscript, read it and check every `[stated]` and
`[accepted]` statement against it. List those the manuscript no longer
supports, with the section that contradicts them.

## 5. Untagged statements

For each statement in the "untagged" list, decide whether it makes a factual
claim. If it does, propose the tag: `src: <where>` if you can locate it,
`unverified` if you cannot. Do not add the tag to a `[stated]` or `[accepted]`
statement yourself; propose it alongside.

## What you write

Only `[proposed]` paragraphs in the canvas, next to the statement they concern,
and `DISCOVERY` entries appended to `research/decisions.md` in this form:

    ## [#<next seq>] <YYYY-MM-DD> · DISCOVERY · <element or n.m>
    <one paragraph> [proposed]

Never edit an existing entry. Never change a marker. When you are done, list
the findings by element, most consequential first, and stop — the researcher
decides what to do with them.
```

- [ ] **Step 3: Write `skills/accept/SKILL.md`**

```markdown
---
name: accept
description: Accept one statement of the research canvas as a commitment of the project (researcher only). Usage — /research-harness:accept <n.m> [--match <substring>] [--why <text>]
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Accepting a canvas statement:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" accept $ARGUMENTS`

The output above is the result. If it says "Accepted", the statement now
carries `[accepted]` and the decision log has a new entry with the text hash.
If it refused — an unmet dependency, an ambiguous question, nothing to accept
— it names what to do.

If nothing was printed above, the arguments did not reach the command. Run it
yourself from the prompt with the `!` prefix, which executes a shell command
outside the model:

    ! node "<plugin root>/bin/research-harness.js" accept <n.m>

Report the result to the researcher. Do not run `accept` through the Bash tool;
the guard denies it, because acceptance is the researcher's act, not the
model's.
```

- [ ] **Step 4: Verify the skills load**

No automated test for prose. Verify by reading each file once against the three constraints: frontmatter is `name` + `description` (+ the two extra lines for `accept` only); every path is under `${CLAUDE_PLUGIN_ROOT}`; no `[accepted]` instruction anywhere except the prohibition.

Run: `grep -rn "accepted" plugins/research-harness/skills/*/SKILL.md`
Expected: every hit is inside a sentence that forbids or describes it, none instructs writing it.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/skills
git commit -m "Add the canvas, canvas-review and accept skills

canvas fills the nine elements in dialogue and writes only proposals,
tentative findings, and transcriptions of what the researcher said.
canvas-review runs the mechanical report, then argues against the
canvas element by element before reporting fit. accept is the human's
button: disable-model-invocation, a single ! line into the CLI, the way
Toolshed's board skill reaches its store.

<attribution line for the model actually running this task>"
```

---

### Task 10: README, spec touch-ups, and a live installation check

**Files:**
- Create: `plugins/research-harness/README.md`
- Modify: `docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md` (§3 table: add `RESEARCH_HARNESS_STATE_DIR`; §5: note that shared code lives in `hooks/lib/`)
- Modify: `README.md` (repo root — link the plugin README, add the install line)

**Interfaces:**
- Consumes: everything.
- Produces: an installable plugin and a spec that matches what was built.

- [ ] **Step 1: Write the plugin README**

`plugins/research-harness/README.md`:

```markdown
# research-harness

A research harness for paper projects. It keeps the framing of a study — the
nine elements of the AMJ Management Research Canvas — as version-controlled
state inside the paper's own repository, and it enforces one line: **an agent
may propose, but only the researcher accepts.**

## Install

From Claude Code:

    /plugin marketplace add DanielHeinz7/research-harness
    /plugin install research-harness@research-harness

Or from a local checkout: `/plugin marketplace add /path/to/research-harness`.

## Use

In a paper project's repository:

1. `/research-harness:canvas` — creates `research/canvas.md` and
   `research/decisions.md` if they do not exist, then works through the
   elements with you. Everything it writes is `[proposed]`, `[tentative]`, or
   a `[stated]` transcription of your words.
2. `/research-harness:accept 3.1` — you accept a statement. The CLI promotes
   it to `[accepted]`, appends a decision-log entry carrying a hash of the
   text, and refuses if an element it depends on is not accepted yet.
3. `/research-harness:canvas-review` — argues against the canvas: gaps,
   contradictions between elements, unmet dependencies, claims without a
   source, acceptances whose text has since changed.

At every session start the plugin injects a short summary: which elements are
empty, which hold only proposals, which dependencies are violated, and which
decisions you have not seen yet.

## What it enforces

A hook denies any write by the model that would create an `[accepted]`
statement, alter or remove a `[stated]` or `[accepted]` statement, promote a
proposal, or rewrite the decision log. Shell access to the two state files is
read-only. When the hook cannot judge a write, it denies it and says why.

What it does not enforce, because it cannot: whether a `[stated]` transcription
is faithful, and whether a cited source actually supports a claim. The review
lists both for you.

## Files in your project

    research/
      canvas.md       nine elements, numbered questions, statements with markers
      decisions.md    append-only log: DECISION | CONSTRAINT | DISCOVERY

Both belong in Git. The canvas is a record of framing; it cites material with
`src:` tags and never quotes it.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `RESEARCH_HARNESS_DIR` | state directory inside the project | `research` |
| `RESEARCH_HARNESS_LIBRARY` | local full-text copies of the cited editorials | unset |
| `RESEARCH_HARNESS_STATE_DIR` | transient session ledger (not part of the paper) | `~/.claude/research-harness` |

The genre profile is named in the canvas frontmatter (`profile: is-qualitative`).
One profile ships. Others are a Markdown file each under
`references/profiles/` — contributions welcome.

## Where the questions come from

The question set is the plugin's own wording, modelled on the canvas by
Dorobantu, Gruber, Ravasi & Wellman (2024), read alongside the seven-part
*Publishing in AMJ* series and the MIS Quarterly editorial on phenomenon-focused
problematization. Full references in the repository's `REFERENCES.md`. None of
those texts ships with the plugin.

## Development

    cd plugins/research-harness
    node --test test/*.test.js

Plain Node, no dependencies, no build.
```

- [ ] **Step 2: Spec touch-ups**

In `docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md`:

1. In the §3 table, after the `Library override` row, add:
   `| Session-ledger override | `RESEARCH_HARNESS_STATE_DIR` (transient, tests only) |`
2. ~~§4.7 hash width~~ — already applied while Task 3 was in flight, because three later tasks read §4.7 and the 6-hex example contradicted the implementation. Nothing to do.
3. In §5, after "No `package.json`, no build step, no `lib/`", change to: "No `package.json`, no build step. Shared code lives in `hooks/lib/` — the layout `codebase-mapper` uses — and `bin/` requires it by relative path."

- [ ] **Step 3: Update the repo README**

In the root `README.md`, replace the line `**Status:** repository created, MVP designed, not yet implemented.` with:

```markdown
**Status:** stage 1 implemented — canvas, guard, session injection, CLI approval path, three skills. Stage 2 (clickable session view) not started.
See [the plugin README](plugins/research-harness/README.md) and [the MVP design](docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md).
```

- [ ] **Step 4: Run the full suite**

Run: `cd plugins/research-harness && node --test test/*.test.js`
Expected: PASS, every file.

- [ ] **Step 5: Live installation check (manual, not automated)**

This verifies two assumptions the tests cannot: that Claude Code loads the plugin from this layout, and that the `!` line in the `accept` skill receives `$ARGUMENTS`.

1. In Claude Code: `/plugin marketplace add /absolute/path/to/research-harness`, then `/plugin install research-harness@research-harness`, then `/reload-plugins`.
2. Open a scratch directory as a project. Confirm no injection appears at session start (no canvas → silent).
3. Run `/research-harness:canvas`; answer its three questions so it runs `init`. Confirm `research/canvas.md` exists.
4. Ask the model to add an `[accepted]` statement. Confirm the guard denies it and the reason names `/research-harness:accept`.
5. Have the model add a `[proposed]` statement to 1.1. Run `/research-harness:accept 1.1`. Confirm the output says "Accepted" and `decisions.md` has entry `#1` with a hash.
   - If nothing is printed, `$ARGUMENTS` did not reach the `!` line. Fall back: run `! node "<plugin root>/bin/research-harness.js" accept 1.1` from the prompt. Record which of the two worked in the plugin README under **Use**, step 2.
6. Start a new session in the same directory. Confirm the injection appears, names element 1 as accepted, and lists decision `#1`.

Record the outcome of step 5 in the commit message.

- [ ] **Step 6: Commit**

```bash
git add README.md plugins/research-harness/README.md docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md
git commit -m "Document the plugin and align the spec with what was built

Plugin README with install, use, what is enforced and what is not. The
spec gains the session-ledger override, the 8-hex hash, and the note
that shared code lives in hooks/lib. Live check: <record here whether
\$ARGUMENTS reached the accept skill's ! line, or the ! prompt prefix
was needed>.

<attribution line for the model actually running this task>"
```

---

## Self-review against the spec

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 contract, detection by `research/canvas.md`, silence elsewhere | 2 (`project.js`), 6, 7 (both hooks exit silently) |
| §3 fixed identifiers, env overrides | 1, 2, 6, 10 |
| §4.1–4.2 nine elements, grammar, empty placeholder | 2, 5 |
| §4.3 two axes, four markers, evidence tags, `[stated]` as transcription | 2 (parser), 7 (guard), 9 (skills) |
| §4.4 status from committed only; acceptance bound to text hash | 2 (`elementStatus`), 3 (`textHash`), 4 (`review.js` stale check), 8 (`accept` writes hash) |
| §4.5 genre profile, one shipped | 4 |
| §4.6 dependency graph, reported not enforced; refused by `accept` | 4 (violations), 8 (`accept` refuses unmet) |
| §4.7 decisions.md append-only, kinds, seq | 3, 7 (guard), 8 |
| §5.1 manifests, no `commands/` | 1 |
| §5.2 SessionStart ≤ 4 KiB, fails open, ledger | 6 |
| §5.3 guard rules, Bash, fails closed, refusal names next step | 7 |
| §5.4 three skills incl. `accept` with `disable-model-invocation` | 8 (CLI), 9 (skills) |
| §5.5 references without copyrighted text | 5, tested |
| §6 three modes, import → everything `[proposed]` | 8 (`init --mode`), 9 (`canvas` skill) |
| §7 stage 2 | out of scope, stated in header |
| §8 two stages | this plan = stage 1 |
| §9 validation runs | not a build task; runs after Task 10 on the real project |
| §11 SQ-7 synthetic fixture | 2, 3 |

**Gap found and closed in review:** §4.3 says `canvas-review` reports factual statements with neither `src:` nor `unverified`; the parser cannot know "factual", so `review.js` reports *all* untagged statements and the skill decides (Task 4 test names this, Task 9 skill step 5 instructs it). Recorded in the review output header text.

**Placeholder scan:** none — every code step is complete; the one deliberate blank is the commit message in Task 10 Step 6, which records a manual test outcome.

**Type consistency:** `parseCanvas / elementStatus / allStatements / COMMITTED` (Task 2) are used by 4, 6, 7, 8 with those names. `textHash` (3) is used by 4, 8. `parseDecisions / formatEntry / appendEntry / header` (3) by 4, 8. `loadProfile / statusByNumber / dependencyViolations` (4) by 6, 8. `mechanicalReview` (4) by 6, 8. `summarize` (6) by 8. `writeContext / writeDeny / projectedText` (6) by 6, 7. The `status` line format asserted in Task 6's test (`Empty: 4, 6, 7, 8, 9`, `Open (proposals only): 2`, `Decisions not yet seen: …`) is the same string Task 8's `status` test asserts, because `status` calls `summarize`.
