# Desktop app, sub-project 2: Claude Code in the agent column — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the tasks run as Sidequest tickets in worktrees (owner's instruction, 2026-10-15).

**Goal:** The person's own, unmodified `claude` runs in a terminal in the app's agent column, with the bundled research-harness plugin and its guard active, and statement numbers in its output link to the statement in the session view.

**Architecture:** `desktop/` gains an `agent/` folder: small pure modules (find Claude Code, read its sign-in state, build argv and environment, read the plugin's marker, find statement numbers in a terminal line), one `node-pty` session, a controller that ties them together, and a column page with `xterm.js` in its own `WebContentsView`. The plugin gains `hooks/lib/numbers.js`, a session marker in the SessionStart hook, and two messages in the session view (reveal, lookup). The shell page reserves the column and relays between the main process and the session view.

**Tech Stack:** Electron 44.5.1 (main process, `WebContentsView`, `ipcMain`), `node-pty` 1.1.0, `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0, `node:test`, Playwright (through `NODE_PATH`, as today).

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-app-claude-code-design.md` (approved, `03d652b`). It builds on `docs/superpowers/specs/2026-10-15-desktop-app-shell-design.md`. Sub-project 3 (`docs/superpowers/specs/2026-10-15-desktop-app-agent-sdk-design.md` §5.1) reuses the column contract defined here and takes its channel names from this plan.

## Global constraints

- Claude Code 2.1.295 or later; older versions are refused with "Claude Code needs an update for the guard to work" (spec §5.1, §7).
- Launch argv: `claude --plugin-dir <bundled plugin> --settings '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}'`, plus `--continue` and `--ax-screen-reader` when chosen. Never `--bare`, `--safe-mode`, `--dangerously-skip-permissions`, `--permission-mode`, `--system-prompt` or `--append-system-prompt` (spec §5.2).
- Argv goes to the pty without a shell. The only shell command the app runs is the fixed installer line `curl -fsSL https://claude.ai/install.sh | bash` and the fixed `$SHELL -lc` probes in `locate.js`; no part of either comes from input.
- `ELECTRON_RUN_AS_NODE=1` is set inside `agent/shims/node` only, never in the pty's environment (spec §5.3).
- From `claude auth status --json` only `loggedIn`, `authMethod` and `subscriptionType` are kept; `email`, `orgId`, `orgName` and every other key are dropped at parse time (spec §5.1).
- The app never reads Claude Code's config, credentials or Keychain item, never edits Claude Code's settings, never ships or downloads the binary itself (spec §3, §5.1, §6).
- The column view holds no write token and cannot reach the local API: its page has `connect-src 'none'` and its preload exposes only `window.agentColumn` (spec §5).
- No Claude Code or Anthropic logo; the name "Claude Code" appears in plain text only (spec §3, §6).
- Galley-proof world: tokens from `plugins/research-harness/dashboard/app.html` `:root` (`--paper`, `--ink`, `--ink-2`, `--line`, `--edge`, `--red`, `--blue`, `--sans`, `--mono`, `--t-label`, `--t-body`, `--t-head`) and its dark block. Red stays reserved for queries; the guard warning uses ink, an icon and words (spec §6).
- WCAG 2.2 AA for the frame, keyboard operation, visible focus in light and dark. Ctrl+` moves focus between session view and terminal (spec §6).
- No toasts: every outcome and error sits in the column next to what caused it (spec §7).
- One Claude Code session at a time (spec §5.5, §10).
- The plugin stays free of dependencies; `node-pty` and `xterm.js` live in `desktop/` only (spec §5).
- Repo language is English (plan, code, commits, tickets).
- Rendered tests (Playwright) are skipped without Playwright and must be run with it: `NODE_PATH` points at any `node_modules` folder that holds `playwright`, as the plugin's rendered tests do today (SQ-231 is still open). The commands below write this as `NODE_PATH=<…>`.

## Probe results (Task 0, done while writing this plan, 2026-10-15)

Spec §8 makes probing the real Claude Code the first task. Items (a) to (c) were run on this machine with Claude Code 2.1.300, a copy of the plugin at a scratch path (as the app's bundled copy will be), and a copy of the fixture project `test/fixtures/voice-uptake`. The plugin is also installed at user scope here (`claude plugin list`: `research-harness@research-harness`, Version 0.5.0, Scope: user). Item (d) needs the column's terminal theme and runs in Task 10, step 8.

**(a) `--plugin-dir` overrides the user-scope install.** Command: `claude --plugin-dir <copy> --settings '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}' --debug-file a-debug.log --model haiku -p "Reply with the single word OK."`. Debug log:

```
[DEBUG] Plugin "research-harness" from --plugin-dir overrides installed version
[DEBUG] Hooks: SessionStart:startup [node "<copy>/hooks/inject-state.js"] (plugin research-harness@inline) ...
```

The SessionStart hook ran once, from the copy (`grep -c 'inject-state.js"\] (plugin'` → 1). Also in the log: `Plugin research-harness@inline not found in any marketplace, skipping`. The `enabledPlugins` key in `--settings` changes nothing for an inline plugin, but it does no harm. It stays because the spec names it.

**(b) Without `node` on `PATH`, every tool call is blocked.** Same flags, environment `env -i HOME=… PATH=/usr/bin:/bin:/usr/sbin:/sbin` (`ls /usr/bin/node` → No such file or directory), prompt asking for `echo probe-b`. Output:

```
PreToolUse:Bash hook error: [node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-promotion.js"]: failed; blocking because onFailure is "block"
/bin/sh: node: command not found
```

Debug log: `PreToolUse:Bash [node ".../guard-promotion.js"] (plugin research-harness@inline) finished with status 127`.

**(c) With the node shim, the guard denies an accept.** `PATH=<shims>:/usr/bin:/bin:/usr/sbin:/sbin`, where `shims/node` is `ELECTRON_RUN_AS_NODE=1 exec "<desktop>/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$@"` (`node -e 'console.log(process.versions.electron, process.version)'` through it → `44.5.1 v24.21.0`). First attempt: the model refused the edit itself, because the SessionStart rules forbid `[accepted]`, so the guard was never reached. Second attempt, with the prompt saying a hook is expected to deny the edit: the Edit was made and denied:

```
PreToolUse:Edit hook error: A [proposed] statement cannot be promoted to [accepted] by the model (question 1.2); only the researcher confirms it. ...
[DEBUG] Hooks: PreToolUse:Edit [node ".../guard-promotion.js"] (plugin research-harness@inline) finished with status 0 (191ms)
[DEBUG] Hook PreToolUse (node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-promotion.js") returned permissionDecision: deny
```

`git status --porcelain` in the project afterwards: empty. Each guard run through the shim took about 200 ms (Electron start-up), against 20 ms for the failed start in (b).

**`node-pty` under Electron 44.** `npm install node-pty@1.1.0` ships prebuilds for `darwin-arm64` and `darwin-x64`. With npm's install-script policy the post-install script did not run, and the first spawn failed with `Error: posix_spawnp failed.` because `prebuilds/darwin-arm64/spawn-helper` was `-rw-r--r--`. After `chmod +x` on it, `ELECTRON_RUN_AS_NODE=1 Electron -e "<pty.spawn('/bin/echo',['pty-ok'])>"` printed `DATA:pty-ok` and `EXIT {"exitCode":0,"signal":0}`. So `node-pty@1.1.0` goes into `allowScripts` (Task 7), and the packaged app unpacks it (Task 11).

**`claude auth status --json` keys** on this machine: `loggedIn, authMethod, apiProvider, analyticsDisabled, projectsDirectory, configDirectory, email, orgId, orgName, subscriptionType`; values kept: `{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max"}`. **Not tried:** the output when signed out (signing out would end the owner's session). The parser treats anything but `loggedIn === true` as signed out.

**Release dates of the pinned packages** (`npm view <pkg> time`): `node-pty` 1.1.0 2025-12-22, `@xterm/xterm` 6.0.0 2025-12-22, `@xterm/addon-fit` 0.11.0 2025-12-22.

## What the live code says, and how this plan follows it

- **Statement numbers already exist (SQ-239).** `dashboard/canvas.html` numbers a statement by its question: `function statementNumber(q, index) { return q.id + (index ? String.fromCharCode(97 + index) : ''); }`, so 3.1, then 3.1b, 3.1c. Question ids match `/^## ([1-9]\.\d+) /` (`hooks/lib/canvas.js:10`). Spec §5.6 says this scheme moves into `numbers.js` unchanged. The link token is therefore `N.k` with an optional letter: `3.4`, `3.1b`. In the fixture `voice-uptake` the numbers are 1.1, 1.2, 1.2b (proposed), 2.2 (proposed), 3.1, 5.1.
- **The view cannot load a shared script.** The rendered tests read `canvas.html` from disk (`test/view.test.js:11`, `test/reflow.test.js:8`), and the page has one inline `<script>`. So `canvas.html` keeps its inline copy of `statementNumber`, and a test checks that it is the same text as `numbers.statementNumber.toString()`. That is how "one function" holds.
- **The shell has no agent column yet.** `app.html` lays out `#shell` as `var(--side) minmax(0, 1fr)`. Task 8 adds the third column.
- **Present goes fullscreen.** `canvas.html` `enterPresent()` calls `requestFullscreen()`. The main process hides the column on the window's `enter-html-full-screen` event and shows it again on `leave-html-full-screen`. No protocol change is needed for this.
- **The app already runs the plugin CLI as Node** with `process.execPath` and `ELECTRON_RUN_AS_NODE` (`hooks/lib/app-cli.js:14`). The node shim uses the same binary (`RH_ELECTRON = process.execPath`).
- **The bundled git needs its environment** (`desktop/main.js` `gitEnv()`): `GIT_EXEC_PATH`, `GIT_CONFIG_SYSTEM`, `GIT_TEMPLATE_DIR`. The git shim sets these three inside the shim only. It does not set the app's credential-manager config (`GIT_CONFIG_COUNT`…): in the agent's session, git reads the person's own git config, as it would in their terminal.

## Review focus

1. **App started from Finder.** launchd's `PATH` lacks `~/.local/bin` and Homebrew. Expected: Claude Code is found at `~/.local/bin/claude` or through the login shell, and the pty gets the login shell's `PATH` behind the shims. Pinned in Task 4 (locate with `PATH=/usr/bin:/bin`) and Task 5 (env).
2. **A login shell that prints a banner or runs `echo` in its rc files.** Expected: the probe output is still parsed correctly. Pinned in Task 4 with a fake shell that prints noise before and after.
3. **A terminal line with wide characters** (Claude Code's `⏺`, an emoji, CJK) before a number. Expected: the link covers exactly the number's cells. Pinned in Task 6 (`mapToCells`).
4. **A marker left over from an earlier session, or written by another copy of the plugin.** Expected: the guard is confirmed only by this session's fresh marker from the bundled copy. Pinned in Task 6 (classify) and Task 9 (fresh path per session, old file removed).
5. **The window zoomed with Cmd+plus.** Expected: the column still sits exactly over its slot. Pinned in Task 9 (`columnBounds` scales by the zoom factor).

---

### Task 1: `numbers.js`, numbers in the SessionStart summary and in the canvas skill

**Files:**
- Create: `plugins/research-harness/hooks/lib/numbers.js`
- Create: `plugins/research-harness/test/numbers.test.js`
- Modify: `plugins/research-harness/hooks/inject-state.js` (add one summary line before `RULES`)
- Modify: `plugins/research-harness/test/inject-state.test.js` (new test)
- Modify: `plugins/research-harness/skills/canvas/SKILL.md` (one line on numbering)
- Check, unchanged: `plugins/research-harness/test/cli.test.js` (`research-harness status` prints the same summary)

**Interfaces:**
- Produces: `statementNumber(q, index) -> string` (`q` has `id`), `numberedStatements(parsed) -> Array<{ num, question, index, marker, text, hidden }>` in file order, `openProposalNumbers(parsed) -> string[]` (non-hidden `proposed` statements).

- [ ] **Step 1: Write the failing tests**

`plugins/research-harness/test/numbers.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const canvas = require('../hooks/lib/canvas');
const numbers = require('../hooks/lib/numbers');

const fixture = (name) => canvas.parseCanvas(fs.readFileSync(path.join(__dirname, 'fixtures', name, 'research', 'canvas.md'), 'utf8'));

test('a statement is numbered by its question, further statements get b, c', () => {
  assert.equal(numbers.statementNumber({ id: '3.1' }, 0), '3.1');
  assert.equal(numbers.statementNumber({ id: '3.1' }, 1), '3.1b');
  assert.equal(numbers.statementNumber({ id: '3.1' }, 2), '3.1c');
});

test('numbers follow file order in the fixture', () => {
  assert.deepEqual(numbers.numberedStatements(fixture('voice-uptake')).map((s) => s.num), ['1.1', '1.2', '1.2b', '2.2', '3.1', '5.1']);
  assert.deepEqual(numbers.openProposalNumbers(fixture('voice-uptake')), ['1.2b', '2.2']);
});

test('the session view carries the same function, character for character', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'canvas.html'), 'utf8');
  assert.ok(html.includes(numbers.statementNumber.toString()), 'canvas.html statementNumber differs from hooks/lib/numbers.js');
});
```

Add to `plugins/research-harness/test/inject-state.test.js`, after the existing summary tests (the file already has helpers to run the hook against a project; use the same one the "with a canvas the hook injects a summary" test uses, on a copy of `test/fixtures/voice-uptake`):

```js
test('the summary lists open proposals by statement number', () => {
  const root = copyFixture('voice-uptake');            // the helper this file uses for fixture projects
  const { text } = summarize(root);
  assert.match(text, /^Open proposals by number \(cite statements as 3\.1 or 3\.1b\): 1\.2b, 2\.2$/m);
});
```

If the file has no `copyFixture`, copy with `fs.cpSync(path.join(__dirname, 'fixtures', 'voice-uptake'), dir, { recursive: true })` into `fs.mkdtempSync(path.join(os.tmpdir(), 'rh-numbers-'))`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd plugins/research-harness && node --test test/numbers.test.js test/inject-state.test.js`
Expected: FAIL, `Cannot find module '../hooks/lib/numbers'`, and the summary test fails on the missing line.

- [ ] **Step 3: Write `numbers.js`**

```js
'use strict';
// Statement numbers. A statement is numbered by its question: 3.1, then 3.1b,
// 3.1c for further statements of the same question (the scheme the session
// view has used since SQ-239, moved here unchanged). The view keeps an inline
// copy of statementNumber, because its page loads no script files;
// test/numbers.test.js checks the two are the same text.

function statementNumber(q, index) { return q.id + (index ? String.fromCharCode(97 + index) : ''); }

function numberedStatements(parsed) {
  const out = [];
  for (const element of parsed.elements) {
    for (const q of element.questions) {
      q.statements.forEach((st, index) => {
        out.push({ num: statementNumber(q, index), question: q.id, index, marker: st.marker, text: st.text, hidden: Boolean(st.hidden) });
      });
    }
  }
  return out;
}

function openProposalNumbers(parsed) {
  return numberedStatements(parsed).filter((s) => s.marker === 'proposed' && !s.hidden).map((s) => s.num);
}

module.exports = { statementNumber, numberedStatements, openProposalNumbers };
```

- [ ] **Step 4: Add the summary line**

In `hooks/inject-state.js`, require `const numbers = require('./lib/numbers');` with the other libs. In `summarize()`, before `const text = [`, add:

```js
  // At most 20 numbers, so a canvas full of proposals stays inside the 4 KiB budget.
  const proposalNums = numbers.openProposalNumbers(parsed);
  const proposalLine = proposalNums.length
    ? proposalNums.slice(0, 20).join(', ') + (proposalNums.length > 20 ? `, +${proposalNums.length - 20} more` : '')
    : 'none';
```

and in the array, directly before `RULES`:

```js
    `Open proposals by number (cite statements as 3.1 or 3.1b): ${proposalLine}`,
```

- [ ] **Step 5: Add the line to the canvas skill**

In `plugins/research-harness/skills/canvas/SKILL.md`, in the section that tells the agent how to write statements, add one line:

```markdown
Statements are numbered by their question: the first statement under 3.1 is 3.1, the next ones 3.1b, 3.1c. Cite statements by these numbers; the desktop app turns them into links to the statement.
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd plugins/research-harness && node --test test/numbers.test.js test/inject-state.test.js test/cli.test.js`
Expected: PASS. The 4 KiB test in `inject-state.test.js` still passes.

- [ ] **Step 7: Commit**

```bash
git add plugins/research-harness/hooks/lib/numbers.js plugins/research-harness/test/numbers.test.js plugins/research-harness/hooks/inject-state.js plugins/research-harness/test/inject-state.test.js plugins/research-harness/skills/canvas/SKILL.md
git commit -m "Statement numbers in one module, in the session summary and the canvas skill"
```

### Task 2: The SessionStart hook writes the app's session marker

**Files:**
- Modify: `plugins/research-harness/hooks/inject-state.js` (`main()`)
- Modify: `plugins/research-harness/test/inject-state.test.js`

**Interfaces:**
- Consumes: env `RESEARCH_HARNESS_APP_MARKER` (absolute path), `CLAUDE_PLUGIN_ROOT`.
- Produces: the file at that path, JSON `{ "pluginRoot": string, "version": string|null, "pid": number }`, written atomically (temporary file in the same folder, then rename). `pluginRoot` is `pluginRoot()` from this file; `version` comes from `<pluginRoot>/.claude-plugin/plugin.json`; `pid` is the hook's `process.pid` and only informational.

- [ ] **Step 1: Write the failing tests**

In `test/inject-state.test.js`, using the file's existing way of running the hook as a child process (`execFileSync(process.execPath, [hook], { input, env })`):

```js
test('with RESEARCH_HARNESS_APP_MARKER set, the hook writes the marker and its output is unchanged', () => {
  const root = copyFixture('voice-uptake');
  const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-marker-')), 'marker.json');
  const plain = runHook(root, {});
  const marked = runHook(root, { RESEARCH_HARNESS_APP_MARKER: marker });
  assert.equal(marked.stdout, plain.stdout);
  const written = JSON.parse(fs.readFileSync(marker, 'utf8'));
  assert.equal(written.pluginRoot, path.resolve(__dirname, '..'));
  assert.equal(written.version, require('../.claude-plugin/plugin.json').version);
  assert.equal(typeof written.pid, 'number');
});

test('the marker is written in a folder without a canvas too, and the hook stays silent there', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-empty-'));
  const marker = path.join(empty, 'marker.json');
  const out = runHook(empty, { RESEARCH_HARNESS_APP_MARKER: marker });
  assert.equal(out.stdout, '');
  assert.ok(fs.existsSync(marker));
});

test('an unwritable or relative marker path never stops the hook', () => {
  const root = copyFixture('voice-uptake');
  for (const bad of ['/nonexistent-dir/marker.json', 'relative/marker.json']) {
    const out = runHook(root, { RESEARCH_HARNESS_APP_MARKER: bad });
    assert.equal(out.status, 0);
    assert.match(out.stdout, /research-harness · paper project/);
  }
  assert.equal(fs.existsSync(path.join(root, 'relative')), false, 'a relative path is ignored, not resolved against the project');
});
```

`runHook(root, extraEnv)` runs `hooks/inject-state.js` with `CLAUDE_PROJECT_DIR=root`, stdin `{}`, and returns `{ stdout, status }`; use the file's helper if one exists, otherwise add this one with `childProcess.spawnSync`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd plugins/research-harness && node --test test/inject-state.test.js`
Expected: FAIL on the missing marker file.

- [ ] **Step 3: Implement**

In `hooks/inject-state.js`:

```js
// The desktop app asks for a marker to show that the plugin's hooks are loaded
// in its Claude Code session (spec 2026-10-15-desktop-app-claude-code §5.4).
// Without the variable nothing changes. A marker that cannot be written is the
// app's problem to report, never a reason to stop the session.
function writeAppMarker() {
  const file = process.env.RESEARCH_HARNESS_APP_MARKER;
  if (!file || !path.isAbsolute(file)) return;
  try {
    const root = pluginRoot();
    let version = null;
    try { version = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version || null; } catch (_) { /* no version to report */ }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ pluginRoot: root, version, pid: process.pid }));
    fs.renameSync(tmp, file);
  } catch (_) {
    // Fail open, as the summary does.
  }
}
```

Call `writeAppMarker();` as the first line inside `main()`'s `try`, before `readStdin()`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd plugins/research-harness && node --test test/inject-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/hooks/inject-state.js plugins/research-harness/test/inject-state.test.js
git commit -m "SessionStart hook writes the desktop app's session marker when asked"
```

### Task 3: The session view reveals and looks up a statement by number

**Files:**
- Modify: `plugins/research-harness/dashboard/canvas.html` (`listenToShell`, `scrollToLinked`, one new function)
- Modify: `plugins/research-harness/test/app-shell.test.js` (new rendered test)

**Interfaces:**
- Produces, parent → view (same origin, from `window.parent` only, as the existing messages):
  - `{ type: 'harness-reveal', num: string }`: switches to the poster tab, scrolls the statement `#st-<num>` to the centre and focuses it. A proposal's element is its margin query, so focusing it lights the query and its slot as a person's focus does.
  - `{ type: 'harness-lookup', id: number, num: string }` → view answers `window.parent.postMessage({ type: 'harness-lookup-result', id, words }, origin)`, `words` = the statement's first 8 words, followed by ` …` if there are more, or `null` when no visible statement has that number.

- [ ] **Step 1: Write the failing test**

In `test/app-shell.test.js`, using its helpers `startApp`, `openPage(t, srv, { host: true })` and `sessionView(page)`, and the open flow of the test "with a host bridge, Choose… fills the field from the native picker":

```js
test('the session view reveals a statement by number and answers lookups', { skip, timeout: 120000 }, async (t) => {
  const root = path.join(tmp(), 'voice-uptake');
  fs.cpSync(path.join(__dirname, 'fixtures', 'voice-uptake'), root, { recursive: true });
  const srv = await startApp(t);
  const page = await openPage(t, srv, { host: true });
  await page.getByRole('button', { name: 'Open project…' }).click();
  await page.evaluate((picked) => { window.__picked = picked; }, root);
  await page.getByRole('button', { name: 'Choose…' }).click();
  await page.locator('#dlg').getByRole('button', { name: 'Open project' }).click();
  await sessionView(page).locator('#poster.active').waitFor();

  const ask = (num) => page.evaluate((n) => new Promise((resolve) => {
    const frame = document.getElementById('session-frame');
    window.addEventListener('message', function on(e) {
      if (e.data && e.data.type === 'harness-lookup-result' && e.data.id === 7) { window.removeEventListener('message', on); resolve(e.data.words); }
    });
    frame.contentWindow.postMessage({ type: 'harness-lookup', id: 7, num: n }, location.origin);
  }), num);
  assert.match(await ask('1.2b'), /^Uptake may be a property of the meeting's/);
  assert.equal(await ask('9.9'), null);

  await page.evaluate(() => document.getElementById('session-frame').contentWindow.postMessage({ type: 'harness-reveal', num: '1.2b' }, location.origin));
  await sessionView(page).locator('[id="st-1.2b"]:focus').waitFor();
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd plugins/research-harness && NODE_PATH=<a node_modules holding playwright> node --test --test-name-pattern "reveals a statement" test/app-shell.test.js`
Expected: FAIL (timeout waiting for `harness-lookup-result`). Without `NODE_PATH` the test is skipped; it must run with it.

- [ ] **Step 3: Implement in `canvas.html`**

Replace the body of `scrollToLinked()` so it calls a shared helper:

```js
  function revealById(id) {
    var target = document.getElementById(id);
    if (!target) return false;
    layoutIn(app);
    if (target.scrollIntoView) target.scrollIntoView({ block: 'center' });
    if (target.focus) target.focus({ preventScroll: true });
    return true;
  }

  function scrollToLinked() {
    var linked = STATEMENT_HASH.exec(location.hash);
    if (linked) revealById(linked[1]);
  }

  // The app's agent column asks for a statement by number (a link in the
  // agent's reply). Hidden statements are not shown, so they are not found.
  function lookupStatement(num) {
    if (!state) return null;
    for (var a = 0; a < state.elements.length; a++) {
      var qs = state.elements[a].questions;
      for (var b = 0; b < qs.length; b++) {
        for (var c = 0; c < qs[b].statements.length; c++) {
          var st = qs[b].statements[c];
          if (statementNumber(qs[b], c) !== num || st.hidden) continue;
          var words = String(st.text || '').trim().split(/\s+/).filter(Boolean);
          return words.length > 8 ? words.slice(0, 8).join(' ') + ' …' : words.join(' ');
        }
      }
    }
    return null;
  }
```

In `listenToShell`, after the `harness-refresh` branch:

```js
      if (msg.type === 'harness-reveal' && typeof msg.num === 'string') {
        showTab('poster');
        revealById('st-' + msg.num);
      }
      if (msg.type === 'harness-lookup' && typeof msg.num === 'string') {
        window.parent.postMessage({ type: 'harness-lookup-result', id: msg.id, words: lookupStatement(msg.num) }, window.location.origin);
      }
```

`state` is the view's current state variable (the one `statementSigs(s)` and `acceptRecord` read); use whatever name the file uses for it.

- [ ] **Step 4: Run the test, the view tests and the numbers parity test**

Run: `cd plugins/research-harness && NODE_PATH=<…> node --test test/app-shell.test.js test/view.test.js test/numbers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/dashboard/canvas.html plugins/research-harness/test/app-shell.test.js
git commit -m "Session view reveals and looks up a statement by number for the shell"
```

### Task 4: Find Claude Code and read its sign-in state

**Files:**
- Create: `desktop/agent/run.js`, `desktop/agent/locate.js`, `desktop/agent/auth.js`
- Create: `desktop/test/agent-locate.test.js`, `desktop/test/agent-auth.test.js`

**Interfaces:**
- Produces:
  - `run(file, args, { timeout = 10000, env } = {}) -> Promise<{ code: number|null, stdout: string, stderr: string }>`, never rejects; `execFile`, no shell.
  - `MIN_VERSION = '2.1.295'`, `compareVersions(a, b) -> -1|0|1`, `parseVersion(text) -> string|null`.
  - `loginShellValue({ shell, script, run }) -> Promise<string|null>`: runs `shell -lc <script>` and returns what sits between the markers `__RH__` and `__RH_END__`.
  - `loginPath({ shell, run }) -> Promise<string>`: the login shell's `PATH`, or `/usr/bin:/bin:/usr/sbin:/sbin`.
  - `locate({ home, shell, run }) -> Promise<{ path, version, supported } | null>`.
  - `parseAuthStatus(stdout) -> { loggedIn: boolean, method: string|null, plan: string|null }`, `planLabel(plan) -> string|null`, `authStatus(claudePath, { run }) -> Promise<{ loggedIn, method, plan }>`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/agent-locate.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../agent/run');
const { compareVersions, parseVersion, locate, loginPath, MIN_VERSION } = require('../agent/locate');

function fakeHome(script) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-home-'));
  if (script) {
    fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(home, '.local', 'bin', 'claude'), script, { mode: 0o755 });
  }
  return home;
}
// A login shell whose rc files print noise around everything.
function noisyShell(dir, answer) {
  const file = path.join(dir, 'noisy-sh');
  fs.writeFileSync(file, `#!/bin/sh\necho "Welcome back"\nprintf '%s' "${answer}"\necho "last login"\n`, { mode: 0o755 });
  return file;
}

test('versions compare numerically', () => {
  assert.equal(compareVersions('2.1.295', '2.1.295'), 0);
  assert.equal(compareVersions('2.1.300', '2.1.295'), 1);
  assert.equal(compareVersions('2.1.29', '2.1.295'), -1);
  assert.equal(compareVersions('10.0.0', '9.9.9'), 1);
  assert.equal(parseVersion('2.1.300 (Claude Code)\n'), '2.1.300');
  assert.equal(parseVersion('garbage'), null);
  assert.equal(MIN_VERSION, '2.1.295');
});

test('finds ~/.local/bin/claude with a launchd PATH and reads its version', async () => {
  const home = fakeHome('#!/bin/sh\necho "2.1.300 (Claude Code)"\n');
  const found = await locate({ home, shell: '/bin/sh', run: (f, a, o) => run(f, a, { ...o, env: { PATH: '/usr/bin:/bin' } }) });
  assert.deepEqual(found, { path: path.join(home, '.local', 'bin', 'claude'), version: '2.1.300', supported: true });
});

test('an old Claude Code is found but not supported', async () => {
  const home = fakeHome('#!/bin/sh\necho "2.1.200 (Claude Code)"\n');
  const found = await locate({ home, shell: '/bin/sh', run });
  assert.equal(found.supported, false);
  assert.equal(found.version, '2.1.200');
});

test('falls back to the login shell, through its noise', async () => {
  const home = fakeHome(null);
  const elsewhere = fakeHome('#!/bin/sh\necho "2.1.296 (Claude Code)"\n');
  const claude = path.join(elsewhere, '.local', 'bin', 'claude');
  const shell = noisyShell(home, `__RH__${claude}__RH_END__`);
  const found = await locate({ home, shell, run });
  assert.equal(found.path, claude);
  assert.equal(found.version, '2.1.296');
});

test('nothing found is null, not an error', async () => {
  const home = fakeHome(null);
  assert.equal(await locate({ home, shell: noisyShell(home, ''), run }), null);
});

test('the login PATH comes through the noise, with a fallback', async () => {
  const home = fakeHome(null);
  assert.equal(await loginPath({ shell: noisyShell(home, '__RH__/opt/homebrew/bin:/usr/bin__RH_END__'), run }), '/opt/homebrew/bin:/usr/bin');
  assert.equal(await loginPath({ shell: path.join(home, 'missing-shell'), run }), '/usr/bin:/bin:/usr/sbin:/sbin');
});
```

`desktop/test/agent-auth.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAuthStatus, planLabel } = require('../agent/auth');

const FULL = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'person@example.invalid', orgId: 'org-fake', orgName: 'Fake Org', subscriptionType: 'pro' });

test('keeps loggedIn, method and plan, and nothing else', () => {
  const parsed = parseAuthStatus(FULL);
  assert.deepEqual(parsed, { loggedIn: true, method: 'claude.ai', plan: 'pro' });
  assert.doesNotMatch(JSON.stringify(parsed), /example\.invalid|Fake Org|org-fake/);
});

test('anything but loggedIn true is signed out', () => {
  assert.equal(parseAuthStatus('{"loggedIn":false}').loggedIn, false);
  assert.equal(parseAuthStatus('{"loggedIn":"yes"}').loggedIn, false);
  assert.equal(parseAuthStatus('not json').loggedIn, false);
  assert.equal(parseAuthStatus('').loggedIn, false);
});

test('plan labels are plain text, unknown plans show none', () => {
  assert.equal(planLabel('pro'), 'Claude Pro');
  assert.equal(planLabel('max'), 'Claude Max');
  assert.equal(planLabel('team'), 'Claude Team');
  assert.equal(planLabel('enterprise'), 'Claude Enterprise');
  assert.equal(planLabel('something-new'), null);
  assert.equal(planLabel(null), null);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd desktop && node --test test/agent-locate.test.js test/agent-auth.test.js`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`desktop/agent/run.js`:

```js
'use strict';
// Runs a program without a shell and always resolves, so callers decide what
// a failure means. Output is capped at 1 MB.
const childProcess = require('node:child_process');

function run(file, args, { timeout = 10000, env } = {}) {
  return new Promise((resolve) => {
    childProcess.execFile(file, args, { timeout, env, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : null) : 0;
      resolve({ code, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

module.exports = { run };
```

`desktop/agent/locate.js`:

```js
'use strict';
// Finds the person's Claude Code. An app started from Finder gets launchd's
// short PATH, without ~/.local/bin, so the native installer's launcher is
// checked first and the login shell is asked once after that. Never reads
// Claude Code's config, credentials or Keychain item (spec §5.1).
const fs = require('node:fs');
const path = require('node:path');

const MIN_VERSION = '2.1.295';          // first version with onFailure, which the guard needs
const FALLBACK_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function parseVersion(text) {
  const m = /(\d+\.\d+\.\d+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

// rc files may print anything; the markers keep the answer apart from it.
async function loginShellValue({ shell, script, run }) {
  const res = await run(shell, ['-lc', `printf '__RH__%s__RH_END__' "${script}"`], { timeout: 5000 });
  const m = /__RH__([\s\S]*?)__RH_END__/.exec(res.stdout);
  return m ? m[1].trim() : null;
}

async function loginPath({ shell, run }) {
  const value = await loginShellValue({ shell, script: '$PATH', run });
  return value || FALLBACK_PATH;
}

function executable(file) {
  try { fs.accessSync(file, fs.constants.X_OK); return true; } catch (_) { return false; }
}

async function locate({ home, shell, run }) {
  let file = path.join(home, '.local', 'bin', 'claude');
  if (!executable(file)) {
    file = await loginShellValue({ shell, script: '$(command -v claude)', run });
    if (!file || !path.isAbsolute(file) || !executable(file)) return null;
  }
  const res = await run(file, ['--version'], { timeout: 10000 });
  const version = parseVersion(res.stdout);
  if (!version) return null;
  return { path: file, version, supported: compareVersions(version, MIN_VERSION) >= 0 };
}

module.exports = { MIN_VERSION, compareVersions, parseVersion, loginShellValue, loginPath, locate };
```

`desktop/agent/auth.js`:

```js
'use strict';
// Reads whether the person is signed in, and with which plan. email, orgId,
// orgName and every other key are dropped here and never stored or shown.
const PLAN_LABELS = { pro: 'Claude Pro', max: 'Claude Max', team: 'Claude Team', enterprise: 'Claude Enterprise' };

function parseAuthStatus(stdout) {
  let j = null;
  try { j = JSON.parse(stdout); } catch (_) { j = null; }
  if (!j || typeof j !== 'object') return { loggedIn: false, method: null, plan: null };
  return {
    loggedIn: j.loggedIn === true,
    method: typeof j.authMethod === 'string' ? j.authMethod : null,
    plan: typeof j.subscriptionType === 'string' ? j.subscriptionType : null,
  };
}

function planLabel(plan) {
  return Object.prototype.hasOwnProperty.call(PLAN_LABELS, plan) ? PLAN_LABELS[plan] : null;
}

async function authStatus(claudePath, { run }) {
  const res = await run(claudePath, ['auth', 'status', '--json'], { timeout: 15000 });
  return parseAuthStatus(res.stdout);
}

module.exports = { parseAuthStatus, planLabel, authStatus };
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd desktop && node --test test/agent-locate.test.js test/agent-auth.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/run.js desktop/agent/locate.js desktop/agent/auth.js desktop/test/agent-locate.test.js desktop/test/agent-auth.test.js
git commit -m "Desktop agent: find Claude Code, check its version, read sign-in without email or org"
```

### Task 5: Launch argv, the pty's environment, and the node and git shims

**Files:**
- Create: `desktop/agent/launch.js`, `desktop/agent/shims/node`, `desktop/agent/shims/git` (both mode 755)
- Create: `desktop/test/agent-launch.test.js`

**Interfaces:**
- Consumes: `gitEnv()` values from `desktop/main.js` (`RESEARCH_HARNESS_GIT`, `GIT_EXEC_PATH`, `GIT_CONFIG_SYSTEM`, `GIT_TEMPLATE_DIR`).
- Produces:
  - `SESSION_SETTINGS` (the exact JSON string from the spec), `FORBIDDEN_FLAGS`.
  - `claudeArgs({ pluginRoot, resume, screenReader }) -> string[]`.
  - `agentEnv({ base, loginPath, shimsDir, electronPath, git: { bin, execPath, configSystem, templateDir }, markerPath }) -> object`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/agent-launch.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const path = require('node:path');
const { claudeArgs, agentEnv, SESSION_SETTINGS, FORBIDDEN_FLAGS } = require('../agent/launch');

const SHIMS = path.join(__dirname, '..', 'agent', 'shims');

test('the argument list is the spec\'s, and never a forbidden flag', () => {
  assert.deepEqual(claudeArgs({ pluginRoot: '/app/plugin' }), ['--plugin-dir', '/app/plugin', '--settings', '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}']);
  assert.deepEqual(claudeArgs({ pluginRoot: '/p', resume: true, screenReader: true }).slice(4), ['--continue', '--ax-screen-reader']);
  assert.equal(SESSION_SETTINGS, '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}');
  for (const opts of [{}, { resume: true }, { screenReader: true }, { resume: true, screenReader: true }]) {
    const args = claudeArgs({ pluginRoot: '/p', ...opts });
    for (const flag of FORBIDDEN_FLAGS) assert.ok(!args.includes(flag), flag);
  }
  assert.deepEqual(FORBIDDEN_FLAGS, ['--bare', '--safe-mode', '--dangerously-skip-permissions', '--permission-mode', '--system-prompt', '--append-system-prompt']);
});

const GIT = { bin: '/app/git/bin/git', execPath: '/app/git/libexec/git-core', configSystem: '/app/git/etc/gitconfig', templateDir: '/app/git/share/git-core/templates' };

test('PATH has the shims first, then the login PATH; ELECTRON_RUN_AS_NODE never reaches the pty', () => {
  const env = agentEnv({
    base: { HOME: '/Users/p', USER: 'p', SHELL: '/bin/zsh', LANG: 'de_DE.UTF-8', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require x', CLAUDECODE: '1', SECRET_TOKEN: 's' },
    loginPath: '/opt/homebrew/bin:/usr/bin:/bin', shimsDir: SHIMS, electronPath: '/app/Electron', git: GIT, markerPath: '/data/agent/marker-1.json',
  });
  assert.equal(env.PATH, `${SHIMS}:/opt/homebrew/bin:/usr/bin:/bin`);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.CLAUDECODE, undefined);
  assert.equal(env.SECRET_TOKEN, undefined);
  assert.equal(env.HOME, '/Users/p');
  assert.equal(env.LANG, 'de_DE.UTF-8');
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.RH_ELECTRON, '/app/Electron');
  assert.equal(env.RH_GIT, GIT.bin);
  assert.equal(env.RESEARCH_HARNESS_APP_MARKER, '/data/agent/marker-1.json');
  assert.equal(env.GIT_EXEC_PATH, undefined, 'git variables are set inside the git shim only');
});

test('the node shim runs Electron as Node and keeps the variable to itself', () => {
  const out = childProcess.execFileSync(path.join(SHIMS, 'node'), ['-e', 'process.stdout.write(JSON.stringify({ e: process.versions.electron || null, v: process.env.ELECTRON_RUN_AS_NODE }))'], {
    env: { PATH: '/usr/bin:/bin', RH_ELECTRON: require('electron') }, encoding: 'utf8',
  });
  const r = JSON.parse(out);
  assert.match(r.e, /^\d+\./);
  assert.equal(r.v, '1');
});

test('the shims fail closed with a message when the app did not set them up', () => {
  for (const name of ['node', 'git']) {
    const r = childProcess.spawnSync(path.join(SHIMS, name), ['--version'], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    assert.equal(r.status, 127, name);
    assert.match(r.stderr, /research-harness app/);
  }
});

test('the git shim runs the bundled git with its helper paths', () => {
  const { gitPath } = require('../git-path');
  const bin = gitPath();
  const dir = path.resolve(bin, '..', '..');
  const out = childProcess.execFileSync(path.join(SHIMS, 'git'), ['--exec-path'], {
    env: { PATH: '/usr/bin:/bin', RH_GIT: bin, RH_GIT_EXEC_PATH: path.join(dir, 'libexec', 'git-core'), RH_GIT_CONFIG_SYSTEM: path.join(dir, 'etc', 'gitconfig'), RH_GIT_TEMPLATE_DIR: path.join(dir, 'share', 'git-core', 'templates') },
    encoding: 'utf8',
  });
  assert.equal(out.trim(), path.join(dir, 'libexec', 'git-core'));
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd desktop && node --test test/agent-launch.test.js`
Expected: FAIL, module and shims missing.

- [ ] **Step 3: Implement**

`desktop/agent/launch.js`:

```js
'use strict';
// The one argument vector and environment for the person's claude (spec
// §5.2, §5.3). The vector goes to the pty without a shell.

const SESSION_SETTINGS = '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}';
const FORBIDDEN_FLAGS = ['--bare', '--safe-mode', '--dangerously-skip-permissions', '--permission-mode', '--system-prompt', '--append-system-prompt'];

function claudeArgs({ pluginRoot, resume = false, screenReader = false }) {
  const args = ['--plugin-dir', pluginRoot, '--settings', SESSION_SETTINGS];
  if (resume) args.push('--continue');
  if (screenReader) args.push('--ax-screen-reader');
  return args;
}

// Only these come from the app's own environment. Anything else in it, such
// as ELECTRON_RUN_AS_NODE or NODE_OPTIONS from a developer's shell, would
// change how the agent's programs run.
const KEEP = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE'];

function agentEnv({ base, loginPath, shimsDir, electronPath, git, markerPath }) {
  const env = {};
  for (const key of KEEP) if (typeof base[key] === 'string') env[key] = base[key];
  return {
    ...env,
    PATH: `${shimsDir}:${loginPath}`,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    RH_ELECTRON: electronPath,
    RH_GIT: git.bin,
    RH_GIT_EXEC_PATH: git.execPath,
    RH_GIT_CONFIG_SYSTEM: git.configSystem,
    RH_GIT_TEMPLATE_DIR: git.templateDir,
    RESEARCH_HARNESS_APP_MARKER: markerPath,
  };
}

module.exports = { SESSION_SETTINGS, FORBIDDEN_FLAGS, claudeArgs, agentEnv };
```

`desktop/agent/shims/node` (mode 755):

```sh
#!/bin/sh
# The app's own Electron binary, run as Node, so the guard, the session hook
# and research-harness work on a Mac without Node. ELECTRON_RUN_AS_NODE is set
# here only, never in the agent's environment.
if [ -z "$RH_ELECTRON" ]; then
  echo "node: this shim belongs to the research-harness app, which did not set RH_ELECTRON" >&2
  exit 127
fi
ELECTRON_RUN_AS_NODE=1 exec "$RH_ELECTRON" "$@"
```

`desktop/agent/shims/git` (mode 755):

```sh
#!/bin/sh
# The git the app bundles (dugite), with the paths it needs to find its helpers.
if [ -z "$RH_GIT" ]; then
  echo "git: this shim belongs to the research-harness app, which did not set RH_GIT" >&2
  exit 127
fi
GIT_EXEC_PATH="$RH_GIT_EXEC_PATH" GIT_CONFIG_SYSTEM="$RH_GIT_CONFIG_SYSTEM" GIT_TEMPLATE_DIR="$RH_GIT_TEMPLATE_DIR" exec "$RH_GIT" "$@"
```

Run `chmod 755 desktop/agent/shims/node desktop/agent/shims/git` and check with `git ls-files -s desktop/agent/shims` after `git add` that both show mode `100755`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd desktop && node --test test/agent-launch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/launch.js desktop/agent/shims/node desktop/agent/shims/git desktop/test/agent-launch.test.js
git commit -m "Desktop agent: launch argv, a narrow environment, node and git shims"
```

### Task 6: Reading the marker, and finding statement numbers in a terminal line

**Files:**
- Create: `desktop/agent/marker.js`, `desktop/agent/statement-links.js`
- Create: `desktop/test/agent-marker.test.js`, `desktop/test/agent-statement-links.test.js`

**Interfaces:**
- Consumes: the marker JSON from Task 2.
- Produces:
  - `readMarker(file) -> { pluginRoot, version } | null`
  - `classify(marker, { bundledRoot }) -> { kind: 'bundled'|'other'|'missing', version: string|null }` (compares real paths)
  - `waitForMarker(file, { timeoutMs = 15000, intervalMs = 250, exited = () => false }) -> Promise<marker|null>`; returns early when `exited()` is true
  - `guardLine(result, { exited }) -> { text: string, detail: string|null, warn: boolean }`
  - `statement-links.js` works both in Node (`module.exports`) and in the column page (`window.statementLinks`): `findStatementTokens(text) -> Array<{ num, start, end }>` (string indices, `end` exclusive), `mapToCells(cells) -> { text, cellAt: number[] }` where `cells` is `Array<{ chars: string, width: number }>` as xterm's buffer gives them, and `cellAt[i]` is the cell column of string index `i`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/agent-marker.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readMarker, classify, waitForMarker, guardLine } = require('../agent/marker');

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rh-mk-'));

test('the three outcomes of spec §5.4', () => {
  const bundled = dir();
  const other = dir();
  assert.deepEqual(classify({ pluginRoot: bundled, version: '0.5.0' }, { bundledRoot: bundled }), { kind: 'bundled', version: '0.5.0' });
  assert.deepEqual(classify({ pluginRoot: other, version: '0.4.2' }, { bundledRoot: bundled }), { kind: 'other', version: '0.4.2' });
  assert.deepEqual(classify(null, { bundledRoot: bundled }), { kind: 'missing', version: null });
});

test('a symlinked path to the bundled copy still counts as the bundled copy', () => {
  const bundled = dir();
  const link = path.join(dir(), 'link');
  fs.symlinkSync(bundled, link);
  assert.equal(classify({ pluginRoot: link, version: '0.5.0' }, { bundledRoot: bundled }).kind, 'bundled');
});

test('a malformed marker is no marker', () => {
  const d = dir();
  for (const body of ['', 'not json', '{"version":"1"}', '{"pluginRoot":42}']) {
    fs.writeFileSync(path.join(d, 'm.json'), body);
    assert.equal(readMarker(path.join(d, 'm.json')), null, body);
  }
});

test('waits for the marker, and stops early when the session ended', async () => {
  const d = dir();
  const file = path.join(d, 'm.json');
  setTimeout(() => fs.writeFileSync(file, JSON.stringify({ pluginRoot: d, version: '0.5.0', pid: 1 })), 100);
  assert.equal((await waitForMarker(file, { timeoutMs: 2000, intervalMs: 20 })).pluginRoot, d);
  const started = Date.now();
  assert.equal(await waitForMarker(path.join(d, 'never.json'), { timeoutMs: 5000, intervalMs: 20, exited: () => true }), null);
  assert.ok(Date.now() - started < 1000);
});

test('the guard lines say what the spec says', () => {
  assert.deepEqual(guardLine({ kind: 'bundled', version: '0.5.0' }, {}), { text: 'Guard on · research-harness 0.5.0', detail: null, warn: false });
  assert.deepEqual(guardLine({ kind: 'other', version: '0.4.2' }, {}), { text: 'Guard on · research-harness 0.4.2 from your Claude Code settings', detail: null, warn: false });
  const missing = guardLine({ kind: 'missing', version: null }, { exited: false });
  assert.equal(missing.text, "Guard not confirmed. The agent's writes may not be checked in this session.");
  assert.match(missing.detail, /organisation's settings may turn hooks off.*The app cannot stop Claude Code/);
  assert.match(guardLine({ kind: 'missing', version: null }, { exited: true }).detail, /The session did not start/);
});
```

`desktop/test/agent-statement-links.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findStatementTokens, mapToCells } = require('../agent/statement-links');

const nums = (s) => findStatementTokens(s).map((t) => t.num);

test('matches statement numbers, with and without a letter', () => {
  assert.deepEqual(nums('3.4'), ['3.4']);
  assert.deepEqual(nums('see 3.4.'), ['3.4']);
  assert.deepEqual(nums('(1.2b) and 2.2, then 9.999'), ['1.2b', '2.2', '9.999']);
  assert.deepEqual(nums('3.4-3.6'), ['3.4', '3.6']);
});

test('does not match versions or longer numbers', () => {
  assert.deepEqual(nums('Claude Code 2.1.300'), []);
  assert.deepEqual(nums('version 0.5.0'), []);
  assert.deepEqual(nums('3.4.1'), []);
  assert.deepEqual(nums('v3.4'), []);
  assert.deepEqual(nums('13.4'), []);
  assert.deepEqual(nums('3.1000'), []);
  assert.deepEqual(nums('3.0'), []);
  assert.deepEqual(nums('3.1bc'), []);
});

test('reports string ranges', () => {
  assert.deepEqual(findStatementTokens('see 1.2b now'), [{ num: '1.2b', start: 4, end: 8 }]);
});

test('maps string indices to terminal cells across wide characters', () => {
  // "⏺ 中 1.2": ⏺ is one cell, 中 two cells (xterm gives the second cell empty chars, width 0).
  const cells = [{ chars: '⏺', width: 1 }, { chars: ' ', width: 1 }, { chars: '中', width: 2 }, { chars: '', width: 0 }, { chars: ' ', width: 1 }, { chars: '1', width: 1 }, { chars: '.', width: 1 }, { chars: '2', width: 1 }];
  const { text, cellAt } = mapToCells(cells);
  assert.equal(text, '⏺ 中 1.2');
  const [tok] = findStatementTokens(text);
  assert.equal(cellAt[tok.start], 5);
  assert.equal(cellAt[tok.end - 1], 7);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd desktop && node --test test/agent-marker.test.js test/agent-statement-links.test.js`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`desktop/agent/marker.js`:

```js
'use strict';
// The plugin's SessionStart hook writes a marker when the app asks for one
// (RESEARCH_HARNESS_APP_MARKER). It shows that the plugin's hooks are loaded
// and not switched off in this session; it does not test the guard itself
// (spec §5.4). pid in the marker is informational and not compared.
const fs = require('node:fs');

function readMarker(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j || typeof j.pluginRoot !== 'string') return null;
    return { pluginRoot: j.pluginRoot, version: typeof j.version === 'string' ? j.version : null };
  } catch (_) {
    return null;
  }
}

function real(p) {
  try { return fs.realpathSync(p); } catch (_) { return p; }
}

function classify(marker, { bundledRoot }) {
  if (!marker) return { kind: 'missing', version: null };
  return { kind: real(marker.pluginRoot) === real(bundledRoot) ? 'bundled' : 'other', version: marker.version };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForMarker(file, { timeoutMs = 15000, intervalMs = 250, exited = () => false } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const marker = readMarker(file);
    if (marker) return marker;
    if (exited() || Date.now() >= until) return null;
    await sleep(intervalMs);
  }
}

function guardLine(result, { exited = false } = {}) {
  if (result.kind === 'bundled') return { text: `Guard on · research-harness ${result.version}`, detail: null, warn: false };
  if (result.kind === 'other') return { text: `Guard on · research-harness ${result.version} from your Claude Code settings`, detail: null, warn: false };
  return {
    text: "Guard not confirmed. The agent's writes may not be checked in this session.",
    detail: exited
      ? 'The session did not start.'
      : "Claude Code did not report the research-harness hooks. Your organisation's settings may turn hooks off. The app cannot stop Claude Code.",
    warn: true,
  };
}

module.exports = { readMarker, classify, waitForMarker, guardLine };
```

`desktop/agent/statement-links.js`:

```js
'use strict';
// Statement numbers in the agent's output: question id N.k (N 1 to 9, k 1 to
// 999), optionally a letter for further statements of the question (3.1b), as
// hooks/lib/numbers.js numbers them. Not part of a longer number such as
// 2.1.300 or 0.5.0. Loaded by the column page as a plain script, and by tests
// through require. Sub-project 3 uses this file unchanged.
(function (root) {
  var TOKEN = /(?<![\w.])([1-9]\.[1-9]\d{0,2}[a-z]?)(?![\w]|\.\d)/g;

  function findStatementTokens(text) {
    var out = [];
    var m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(String(text))) !== null) out.push({ num: m[1], start: m.index, end: m.index + m[1].length });
    return out;
  }

  // xterm keeps one cell per column; a wide character fills two cells, the
  // second with empty chars. Link ranges are in cells, matches in string
  // indices, so each string index gets the cell it came from.
  function mapToCells(cells) {
    var text = '';
    var cellAt = [];
    for (var x = 0; x < cells.length; x++) {
      var chars = cells[x].chars;
      if (!chars && cells[x].width === 0) continue;
      var s = chars || ' ';
      for (var i = 0; i < s.length; i++) cellAt.push(x);
      text += s;
    }
    return { text: text, cellAt: cellAt };
  }

  var api = { findStatementTokens: findStatementTokens, mapToCells: mapToCells };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.statementLinks = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd desktop && node --test test/agent-marker.test.js test/agent-statement-links.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/marker.js desktop/agent/statement-links.js desktop/test/agent-marker.test.js desktop/test/agent-statement-links.test.js
git commit -m "Desktop agent: read the session marker, find statement numbers in terminal lines"
```

### Task 7: One pty session, and the packages

**Files:**
- Modify: `desktop/package.json` (dependencies, `allowScripts`), `desktop/package-lock.json` (through `npm install`)
- Create: `desktop/agent/session.js`
- Create: `desktop/test/agent-session.test.js`

**Interfaces:**
- Produces: `createSession({ file, args, cwd, env, cols = 80, rows = 24 }) -> { pid, onData(cb), onExit(cb(code, signal)), write(data), resize(cols, rows), kill() }`. `kill()` is safe to call twice and after exit.

- [ ] **Step 1: Add the packages**

```bash
cd desktop && npm install --save-exact node-pty@1.1.0 @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0
```

Then add `"node-pty@1.1.0": true` to `allowScripts` in `desktop/package.json` beside `dugite@3.2.3`, and run `npm install` again so the post-install script runs. Check: `ls -l node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper` shows `-rwxr-xr-x`. Without that, every spawn fails with `posix_spawnp failed.` (probe above).

- [ ] **Step 2: Write the failing test**

`desktop/test/agent-session.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession } = require('../agent/session');

function collect(session) {
  let out = '';
  session.onData((d) => { out += d; });
  return new Promise((resolve) => session.onExit((code) => resolve({ out, code })));
}

test('runs a program in a pty, without a shell, and reports its exit code', async () => {
  const s = createSession({ file: '/bin/echo', args: ['a b', '$HOME', ';', 'ls'], cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } });
  const { out, code } = await collect(s);
  assert.match(out, /a b \$HOME ; ls/);
  assert.equal(code, 0);
});

test('a failing program reports its code; kill is safe twice', async () => {
  const s = createSession({ file: '/bin/sh', args: ['-c', 'exit 3'], cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } });
  const { code } = await collect(s);
  assert.equal(code, 3);
  s.kill();
  s.kill();
});

test('input reaches the program and resize does not throw', async () => {
  const s = createSession({ file: '/bin/cat', args: [], cwd: '/tmp', env: { PATH: '/usr/bin:/bin' } });
  const done = collect(s);
  s.resize(100, 30);
  s.write('hello\r');
  await new Promise((r) => setTimeout(r, 200));
  s.kill();
  assert.match((await done).out, /hello/);
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd desktop && node --test test/agent-session.test.js`
Expected: FAIL, `Cannot find module '../agent/session'`.

- [ ] **Step 4: Implement `desktop/agent/session.js`**

```js
'use strict';
// One process in a pseudo-terminal. The argument vector goes to the program
// directly; there is no shell in between.
const pty = require('node-pty');

function createSession({ file, args, cwd, env, cols = 80, rows = 24 }) {
  const proc = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd, env });
  let exited = false;
  proc.onExit(() => { exited = true; });
  return {
    pid: proc.pid,
    onData: (cb) => proc.onData(cb),
    onExit: (cb) => proc.onExit(({ exitCode, signal }) => cb(exitCode, signal)),
    write: (data) => { if (!exited) proc.write(data); },
    resize: (c, r) => { if (!exited && c > 0 && r > 0) proc.resize(c, r); },
    kill: () => { if (!exited) { exited = true; try { proc.kill(); } catch (_) { /* already gone */ } } },
  };
}

module.exports = { createSession };
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `cd desktop && node --test test/agent-session.test.js && npm test`
Expected: PASS; the existing `git-path` and smoke tests are unaffected.

- [ ] **Step 6: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/agent/session.js desktop/test/agent-session.test.js
git commit -m "Desktop agent: node-pty session and the terminal packages"
```

### Task 8: The shell page reserves the agent column and relays numbers

**Files:**
- Modify: `plugins/research-harness/dashboard/app.html` (grid, `#agent-slot`, sidebar entry, bridge calls, relay)
- Modify: `desktop/preload.js` (bridge additions)
- Modify: `plugins/research-harness/test/app-shell.test.js` (fake host gains the agent calls; new tests)

**Interfaces:**
- Consumes: the view messages from Task 3.
- Produces, `window.harnessHost` additions (all optional; a browser has none, and the page then never shows the column):
  - `agentBounds(rect | null)`, `rect = { x, y, width, height }` in CSS pixels of the shell page.
  - `agentProject(folder)`: the shell opened a project (on every `enterProject` with a changed folder).
  - `setUpAgent()`: the sidebar's "Set up the agent…".
  - `onAgentShown(cb(shown: boolean))`: the main process shows or hides the column.
  - `onAgentLookup(cb(num) -> Promise<string|null>)`: the main process asks for a number's first words.
  - `onAgentReveal(cb(num))`.
  - `onAgentFocusView(cb())`: Ctrl+` moved focus here; focus the session view.
- IPC channel names (main ⇄ shell preload): `agent:bounds`, `agent:project`, `agent:setup` (renderer → main, `ipcRenderer.send`); `agent:shown`, `agent:lookup` (payload `{ id, num }`), `agent:reveal` (payload `num`), `agent:focus-view` (main → renderer); `agent:lookup-result` (renderer → main, payload `{ id, words }`).

- [ ] **Step 1: Write the failing tests**

In `test/app-shell.test.js`, extend the fake host in `openPage` (line 94) so tests can drive it:

```js
      window.__agent = { bounds: [], projects: [], setups: 0, shown: null, lookup: null, reveal: null, focusView: null };
      window.harnessHost = {
        pickFolder: async () => window.__picked || null,
        pickFile: async () => window.__picked || null,
        saveFile: async () => window.__picked || null,
        reveal: async () => {},
        openExternal: async () => {},
        agentBounds: (rect) => { window.__agent.bounds.push(rect); },
        agentProject: (folder) => { window.__agent.projects.push(folder); },
        setUpAgent: () => { window.__agent.setups++; },
        onAgentShown: (cb) => { window.__agent.shown = cb; },
        onAgentLookup: (cb) => { window.__agent.lookup = cb; },
        onAgentReveal: (cb) => { window.__agent.reveal = cb; },
        onAgentFocusView: (cb) => { window.__agent.focusView = cb; },
      };
```

New tests. Add two helpers to the test file: `copyFixture(name)` copies `test/fixtures/<name>` into a fresh `tmp()` folder and returns its path; `openFixture(page, root)` opens it as Task 3's test does (Open project…, Choose… with `window.__picked`, then waits for `#poster.active` in the session view), and rewrite Task 3's test to use both.

```js
test('the agent column appears beside the session view when the app shows it, and reports its bounds', { skip, timeout: 120000 }, async (t) => {
  const root = copyFixture('voice-uptake');
  const page = await openPage(t, await startApp(t), { host: true });
  await openFixture(page, root);
  assert.equal((await page.evaluate(() => window.__agent.projects)).length, 1, 'the shell tells the app once which folder is open');
  assert.equal(await page.locator('#agent-slot').isVisible(), false);
  await page.evaluate(() => window.__agent.shown(true));
  await page.locator('#agent-slot').waitFor();
  const last = await page.evaluate(() => window.__agent.bounds[window.__agent.bounds.length - 1]);
  const box = await page.locator('#agent-slot').boundingBox();
  assert.deepEqual(last, { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) });
  const frameBox = await page.locator('#session-frame').boundingBox();
  assert.ok(frameBox.x + frameBox.width <= box.x + 1, 'the column sits right of the session view');
  await page.evaluate(() => window.__agent.shown(false));
  assert.equal(await page.evaluate(() => window.__agent.bounds[window.__agent.bounds.length - 1]), null);
  await page.getByRole('button', { name: 'Set up the agent…' }).click();
  assert.equal(await page.evaluate(() => window.__agent.setups), 1);
});

test('the shell answers number lookups from the session view and reveals the statement', { skip, timeout: 120000 }, async (t) => {
  const root = copyFixture('voice-uptake');
  const page = await openPage(t, await startApp(t), { host: true });
  await openFixture(page, root);
  assert.match(await page.evaluate(() => window.__agent.lookup('1.2b')), /^Uptake may be a property/);
  assert.equal(await page.evaluate(() => window.__agent.lookup('2.1.300')), null);
  await page.evaluate(() => window.__agent.reveal('2.2'));
  await sessionView(page).locator('[id="st-2.2"]:focus').waitFor();
});

test('in a plain browser there is no agent column and no set-up entry', { skip, timeout: 120000 }, async (t) => {
  const root = copyFixture('voice-uptake');
  const page = await openPage(t, await startApp(t), { host: false });
  await openFixture(page, root);
  assert.equal(await page.locator('#agent-slot').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Set up the agent…' }).count(), 0);
});
```

`openFixture` for `host: false` types the path into the "Project folder" field instead of using Choose… (as the test "in a plain browser, Open project… shows a labelled path field" does).

- [ ] **Step 2: Run them and see them fail**

Run: `cd plugins/research-harness && NODE_PATH=<…> node --test --test-name-pattern "agent|lookups" test/app-shell.test.js`
Expected: FAIL (`#agent-slot` missing).

- [ ] **Step 3: Implement in `app.html`**

CSS, beside the `#shell` rules:

```css
  #shell { --agent: clamp(24rem, 14rem + 22vw, 40rem); }
  #shell.with-agent { grid-template-columns: var(--side) minmax(0, 1fr) var(--agent); }
  #shell.no-side.with-agent { grid-template-columns: minmax(0, 1fr) var(--agent); }
  /* The terminal is drawn by the app over this slot; the page only keeps the room free. */
  #agent-slot { border-left: 1px solid var(--line); background: var(--paper); min-height: 0; }
  #agent-slot[hidden] { display: none; }
```

and inside `@media (max-width: 52rem)`:

```css
    #agent-slot { height: 70vh; border-left: 0; border-top: 1px solid var(--line); }
    #agent-toggle { display: inline-flex; }
```

Below the breakpoint the column folds into a toggle (spec §6): `#agent-toggle` is a `button.btn.side-btn` in the Project group, label "Show the agent" / "Hide the agent", hidden above the breakpoint (`#agent-toggle { display: none; }` outside the media query). When folded, the slot is hidden and the bounds are `null`.

Markup: after `</main>` add `<div id="agent-slot" role="region" aria-label="Agent" hidden></div>`. In the People group's sibling, the Project group, after the "New project…" button add `<button type="button" class="btn side-btn" id="btn-agent-setup" hidden>Set up the agent…</button>` and the toggle button.

Script, after `var host = window.harnessHost || null;` and the helpers:

```js
  // -- Agent column -----------------------------------------------------------
  // The app draws Claude Code's terminal in its own view over #agent-slot; this
  // page keeps the room free, reports where it is, and relays statement
  // numbers between the app and the session view. In a browser there is no
  // host and so no column.
  var agentShown = false;
  var agentFolded = false;
  var lookups = {};
  var lookupSeq = 0;

  function agentRect() {
    var slot = $('agent-slot');
    if (!agentShown || slot.hidden) return null;
    var r = slot.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }
  function reportAgent() { if (host && host.agentBounds) host.agentBounds(agentRect()); }

  function showAgent(shown) {
    agentShown = shown;
    var narrow = window.matchMedia('(max-width: 52rem)').matches;
    $('agent-slot').hidden = !shown || (narrow && agentFolded);
    $('shell').classList.toggle('with-agent', shown && !narrow);
    $('btn-agent-setup').hidden = shown || !current;
    $('agent-toggle').textContent = agentFolded ? 'Show the agent' : 'Hide the agent';
    $('agent-toggle').hidden = !shown;
    reportAgent();
  }

  function setUpAgentColumn() {
    if (!host || !host.onAgentShown) return;
    host.onAgentShown(showAgent);
    host.onAgentLookup(function (num) {
      return new Promise(function (resolve) {
        var id = ++lookupSeq;
        lookups[id] = resolve;
        setTimeout(function () { if (lookups[id]) { delete lookups[id]; resolve(null); } }, 1500);
        tellView({ type: 'harness-lookup', id: id, num: num });
      });
    });
    host.onAgentReveal(function (num) { tellView({ type: 'harness-reveal', num: num }); });
    host.onAgentFocusView(function () { frame.focus(); });
    window.addEventListener('message', function (event) {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      var msg = event.data || {};
      if (msg.type === 'harness-lookup-result' && lookups[msg.id]) {
        var resolve = lookups[msg.id];
        delete lookups[msg.id];
        resolve(typeof msg.words === 'string' ? msg.words : null);
      }
    });
    new ResizeObserver(reportAgent).observe($('agent-slot'));
    window.addEventListener('resize', function () { showAgent(agentShown); });
    $('btn-agent-setup').addEventListener('click', function () { host.setUpAgent(); });
    $('agent-toggle').addEventListener('click', function () { agentFolded = !agentFolded; showAgent(agentShown); });
  }
  setUpAgentColumn();
```

In `enterProject(root, reloadView)`, after `current = root;`, add `if (changed && host && host.agentProject) host.agentProject(root);` and after `renderSidebar(lastState);` add `if (host && host.onAgentShown) showAgent(agentShown);` so the set-up entry appears once a project is open.

The id of the grid container is `shell` (`#shell` in the CSS); use the file's element if it differs.

- [ ] **Step 4: Implement the bridge in `desktop/preload.js`**

```js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('harnessHost', {
  pickFolder: () => ipcRenderer.invoke('host:pick-folder'),
  pickFile: (opts) => ipcRenderer.invoke('host:pick-file', opts),
  saveFile: (opts) => ipcRenderer.invoke('host:save-file', opts),
  reveal: (p) => ipcRenderer.invoke('host:reveal', p),
  openExternal: (url) => ipcRenderer.invoke('host:open-external', url),
  agentBounds: (rect) => ipcRenderer.send('agent:bounds', rect),
  agentProject: (folder) => ipcRenderer.send('agent:project', folder),
  setUpAgent: () => ipcRenderer.send('agent:setup'),
  onAgentShown: (cb) => ipcRenderer.on('agent:shown', (e, shown) => cb(shown === true)),
  onAgentLookup: (cb) => ipcRenderer.on('agent:lookup', async (e, { id, num }) => {
    let words = null;
    try { words = await cb(String(num)); } catch (_) { words = null; }
    ipcRenderer.send('agent:lookup-result', { id, words });
  }),
  onAgentReveal: (cb) => ipcRenderer.on('agent:reveal', (e, num) => cb(String(num))),
  onAgentFocusView: (cb) => ipcRenderer.on('agent:focus-view', () => cb()),
});
```

- [ ] **Step 5: Run the shell tests in light and dark**

Run: `cd plugins/research-harness && NODE_PATH=<…> node --test test/app-shell.test.js`
Expected: PASS, including the existing "keyboard path, focus contrast and reflow" tests for both colour schemes. The new "Set up the agent…" button must pass the same focus-contrast check; it uses the existing `.btn.side-btn` style.

- [ ] **Step 6: Commit**

```bash
git add plugins/research-harness/dashboard/app.html plugins/research-harness/test/app-shell.test.js desktop/preload.js
git commit -m "Shell page reserves the agent column and relays statement numbers"
```

### Task 9: The agent controller and the main-process wiring

**Files:**
- Create: `desktop/agent/controller.js` (Electron-free), `desktop/agent/index.js` (Electron glue), `desktop/agent/store.js`
- Modify: `desktop/main.js` (start the agent part with the window; `gitEnv()` exported to it)
- Create: `desktop/test/agent-controller.test.js`

**Interfaces:**
- Consumes: Tasks 4 to 7 (`locate`, `loginPath`, `authStatus`, `planLabel`, `claudeArgs`, `agentEnv`, `createSession`, `waitForMarker`, `classify`, `guardLine`); the shell IPC channels from Task 8.
- Produces:
  - `store.js`: `readAgentStore(dataDir) -> { way: string|null, notNow: boolean, screenReader: boolean, started: string[] }`, `writeAgentStore(dataDir, patch)`. File `<userData>/agent.json`. It holds no email, organisation, token or credential.
  - `controller.js`: `createController(deps) -> { state(), on(event, cb), refresh(), run(step), setProject(folder), write(data), resize(cols, rows), dispose() }`. Events: `'state'` (the state object), `'data'` (terminal output chunk), `'clear'` (a new process starts; the column clears its terminal).
  - State object (sent to the column page as is): `{ phase, version, plan, guard, exit, project, sessionProject, canContinue, screenReader, screenReaderMode, pluginVersion, step }` with `phase ∈ 'no-project' | 'checking' | 'missing' | 'outdated' | 'signed-out' | 'ready' | 'step-running' | 'step-failed' | 'running' | 'exited'`, `guard = null | { text, detail, warn }`, `exit = null | { code, words }`, `step = null | 'install' | 'login' | 'update'`.
  - Steps for `run(step)`: `'install' | 'login' | 'update' | 'start' | 'continue' | 'new' | 'restart' | 'not-now' | 'screen-reader-on' | 'screen-reader-off'`.
  - `index.js`: `setUpAgent({ win, pluginRoot, pluginVersion, gitEnv, dataDir })`, also exports the pure `columnBounds(rect, zoom) -> { x, y, width, height }`.
  - Column IPC channels (main ⇄ column preload): `column:state`, `column:data`, `column:clear`, `column:focus` (main → column); `column:run` (step), `column:write`, `column:resize` (`{ cols, rows }`) (column → main, `send`); `column:lookup` (num → words, `invoke`), `column:reveal` (num, `send`), `column:focus-view` (`send`, Ctrl+` pressed inside the terminal page, for when the menu accelerator is swallowed).

- [ ] **Step 1: Write the failing controller test**

`desktop/test/agent-controller.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createController } = require('../agent/controller');
const { readAgentStore } = require('../agent/store');

function fakeSession() {
  const ev = new EventEmitter();
  return { pid: 1, written: [], onData: (cb) => ev.on('data', cb), onExit: (cb) => ev.on('exit', cb), write(d) { this.written.push(d); }, resize() {}, kill() { this.killed = true; }, emitData: (d) => ev.emit('data', d), exit: (code) => ev.emit('exit', code, 0) };
}

function setup(over = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-ctl-'));
  const bundled = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-plugin-'));
  const spawned = [];
  const deps = {
    dataDir, pluginRoot: bundled, pluginVersion: '0.5.0', shimsDir: '/app/shims', electronPath: '/app/Electron',
    git: { bin: '/g/bin/git', execPath: '/g/libexec', configSystem: '/g/etc/gitconfig', templateDir: '/g/share' },
    baseEnv: { HOME: '/Users/p' }, loginPath: async () => '/usr/bin:/bin',
    locate: async () => ({ path: '/Users/p/.local/bin/claude', version: '2.1.300', supported: true }),
    authStatus: async () => ({ loggedIn: true, method: 'claude.ai', plan: 'pro' }),
    spawn: (opts) => { const s = fakeSession(); s.opts = opts; spawned.push(s); return s; },
    markerTimeoutMs: 300, markerIntervalMs: 10, screenReaderMode: () => false,
    ...over,
  };
  return { ctl: createController(deps), deps, spawned, dataDir, bundled };
}

test('no project: nothing is checked or started', async () => {
  const { ctl, spawned } = setup();
  await ctl.refresh();
  assert.equal(ctl.state().phase, 'no-project');
  assert.equal(spawned.length, 0);
});

test('missing, outdated, signed out, ready', async () => {
  for (const [over, phase] of [
    [{ locate: async () => null }, 'missing'],
    [{ locate: async () => ({ path: '/c', version: '2.1.200', supported: false }) }, 'outdated'],
    [{ authStatus: async () => ({ loggedIn: false, method: null, plan: null }) }, 'signed-out'],
    [{}, 'ready'],
  ]) {
    const { ctl } = setup(over);
    await ctl.setProject('/papers/a');
    assert.equal(ctl.state().phase, phase);
  }
});

test('the plan label shows only for a claude.ai sign-in', async () => {
  const a = setup();
  await a.ctl.setProject('/papers/a');
  assert.equal(a.ctl.state().plan, 'Claude Pro');
  const b = setup({ authStatus: async () => ({ loggedIn: true, method: 'api-key', plan: 'pro' }) });
  await b.ctl.setProject('/papers/a');
  assert.equal(b.ctl.state().plan, null);
});

test('start: the spec argv in the project folder, a fresh marker path, the guard confirmed', async () => {
  const { ctl, spawned, bundled, dataDir } = setup();
  await ctl.setProject('/papers/a');
  await ctl.run('start');
  const s = spawned[0];
  assert.equal(s.opts.file, '/Users/p/.local/bin/claude');
  assert.deepEqual(s.opts.args.slice(0, 2), ['--plugin-dir', bundled]);
  assert.equal(s.opts.cwd, '/papers/a');
  assert.equal(s.opts.env.PATH, '/app/shims:/usr/bin:/bin');
  const marker = s.opts.env.RESEARCH_HARNESS_APP_MARKER;
  assert.ok(marker.startsWith(path.join(dataDir, 'agent')));
  fs.writeFileSync(marker, JSON.stringify({ pluginRoot: bundled, version: '0.5.0', pid: 9 }));
  await ctl.markerSettled();
  assert.equal(ctl.state().phase, 'running');
  assert.equal(ctl.state().guard.text, 'Guard on · research-harness 0.5.0');
  assert.equal(readAgentStore(dataDir).way, 'claude-code');
  assert.deepEqual(readAgentStore(dataDir).started, ['/papers/a']);
});

test('a marker from the previous session does not confirm the next one', async () => {
  const { ctl, spawned, bundled } = setup();
  await ctl.setProject('/papers/a');
  await ctl.run('start');
  const first = spawned[0].opts.env.RESEARCH_HARNESS_APP_MARKER;
  fs.writeFileSync(first, JSON.stringify({ pluginRoot: bundled, version: '0.5.0', pid: 9 }));
  await ctl.markerSettled();
  spawned[0].exit(0);
  await ctl.run('restart');
  const second = spawned[1].opts.env.RESEARCH_HARNESS_APP_MARKER;
  assert.notEqual(second, first);
  assert.equal(fs.existsSync(first), false, 'the old marker is removed');
  await ctl.markerSettled();
  assert.equal(ctl.state().guard.warn, true);
});

test('continue is offered only for a folder the app started a session in, and passes --continue', async () => {
  const { ctl, spawned } = setup();
  await ctl.setProject('/papers/a');
  assert.equal(ctl.state().canContinue, false);
  await ctl.run('start');
  spawned[0].exit(0);
  await ctl.setProject('/papers/a');
  assert.equal(ctl.state().canContinue, true);
  await ctl.run('continue');
  assert.ok(spawned[1].opts.args.includes('--continue'));
});

test('one session at a time: starting again ends the running one', async () => {
  const { ctl, spawned } = setup();
  await ctl.setProject('/papers/a');
  await ctl.run('start');
  await ctl.run('new');
  assert.equal(spawned[0].killed, true);
  assert.equal(spawned.length, 2);
});

test('install, sign-in and update run in the pty; a failed step keeps its output and says so', async () => {
  const { ctl, spawned } = setup({ locate: async () => null });
  await ctl.setProject('/papers/a');
  await ctl.run('install');
  assert.deepEqual([spawned[0].opts.file, ...spawned[0].opts.args], ['/bin/bash', '-c', 'curl -fsSL https://claude.ai/install.sh | bash']);
  assert.equal(ctl.state().phase, 'step-running');
  spawned[0].exit(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(ctl.state().phase, 'step-failed');
  assert.equal(ctl.state().exit.code, 1);

  const b = setup({ authStatus: async () => ({ loggedIn: false, method: null, plan: null }) });
  await b.ctl.setProject('/papers/a');
  await b.ctl.run('login');
  assert.deepEqual(b.spawned[0].opts.args, ['auth', 'login', '--claudeai']);
  const c = setup({ locate: async () => ({ path: '/c', version: '2.1.200', supported: false }) });
  await c.ctl.setProject('/papers/a');
  await c.ctl.run('update');
  assert.deepEqual([c.spawned[0].opts.file, ...c.spawned[0].opts.args], ['/c', 'update']);
});

test('claude exiting shows the code in plain words', async () => {
  const { ctl, spawned } = setup();
  await ctl.setProject('/papers/a');
  await ctl.run('start');
  spawned[0].exit(2);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ctl.state().exit, { code: 2, words: 'Claude Code stopped with exit code 2.' });
  assert.equal(ctl.state().phase, 'exited');
});

test('not now and the screen-reader setting are remembered; the store holds no secrets', async () => {
  const { ctl, dataDir } = setup();
  await ctl.setProject('/papers/a');
  await ctl.run('screen-reader-on');
  await ctl.run('start');
  await ctl.run('not-now');
  const stored = readAgentStore(dataDir);
  assert.equal(stored.notNow, true);
  assert.equal(stored.screenReader, true);
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, 'agent.json'), 'utf8'), /@|org|token/i);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd desktop && node --test test/agent-controller.test.js`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `desktop/agent/store.js`**

```js
'use strict';
// What the app remembers about the agent, in its own data folder. No email,
// organisation, token or credential ever goes here.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { way: null, notNow: false, screenReader: false, started: [] };

function file(dataDir) { return path.join(dataDir, 'agent.json'); }

function readAgentStore(dataDir) {
  try {
    const j = JSON.parse(fs.readFileSync(file(dataDir), 'utf8'));
    return {
      way: j.way === 'claude-code' ? j.way : null,
      notNow: j.notNow === true,
      screenReader: j.screenReader === true,
      started: Array.isArray(j.started) ? j.started.filter((s) => typeof s === 'string').slice(0, 50) : [],
    };
  } catch (_) {
    return { ...DEFAULTS, started: [] };
  }
}

function writeAgentStore(dataDir, patch) {
  const next = { ...readAgentStore(dataDir), ...patch };
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file(dataDir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file(dataDir));
  return next;
}

module.exports = { readAgentStore, writeAgentStore };
```

- [ ] **Step 4: Implement `desktop/agent/controller.js`**

```js
'use strict';
// The agent column's state. Finds Claude Code, offers install, sign-in and
// update, starts one session at a time in the current project and watches for
// the plugin's marker. Electron-free: index.js wires it to the window, and
// test/agent-controller.test.js drives it with fakes.
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { planLabel } = require('./auth');
const { claudeArgs, agentEnv } = require('./launch');
const { waitForMarker, classify, guardLine } = require('./marker');
const { readAgentStore, writeAgentStore } = require('./store');

const INSTALL = 'curl -fsSL https://claude.ai/install.sh | bash';

function exitWords(code) {
  return code === 0 ? 'Claude Code ended.' : `Claude Code stopped with exit code ${code}.`;
}

function createController(deps) {
  const events = new EventEmitter();
  const stored = readAgentStore(deps.dataDir);
  let state = {
    phase: 'no-project', version: null, plan: null, guard: null, exit: null, project: null, sessionProject: null,
    canContinue: false, screenReader: stored.screenReader, screenReaderMode: deps.screenReaderMode(), pluginVersion: deps.pluginVersion, step: null,
  };
  let found = null;
  let proc = null;
  let markerPath = null;
  let markerDone = Promise.resolve();
  let pathPromise = null;

  function set(patch) { state = { ...state, ...patch }; events.emit('state', state); }
  function loginPath() { if (!pathPromise) pathPromise = deps.loginPath(); return pathPromise; }

  async function refresh() {
    if (!state.project) return set({ phase: 'no-project' });
    if (proc && (state.phase === 'running' || state.phase === 'step-running')) return;
    set({ phase: 'checking' });
    found = await deps.locate();
    if (!found) return set({ phase: 'missing', version: null, plan: null });
    if (!found.supported) return set({ phase: 'outdated', version: found.version, plan: null });
    const auth = await deps.authStatus(found.path);
    if (!auth.loggedIn) return set({ phase: 'signed-out', version: found.version, plan: null });
    set({
      phase: 'ready', version: found.version, plan: auth.method === 'claude.ai' ? planLabel(auth.plan) : null,
      canContinue: readAgentStore(deps.dataDir).started.includes(state.project),
    });
  }

  function endProcess() {
    if (proc) { const p = proc; proc = null; p.kill(); }
  }

  async function spawn(file, args, { cwd, marker = null }) {
    endProcess();
    events.emit('clear');
    const env = agentEnv({ base: deps.baseEnv, loginPath: await loginPath(), shimsDir: deps.shimsDir, electronPath: deps.electronPath, git: deps.git, markerPath: marker || '' });
    if (!marker) delete env.RESEARCH_HARNESS_APP_MARKER;
    const p = deps.spawn({ file, args, cwd, env, cols: deps.cols || 80, rows: deps.rows || 24 });
    proc = p;
    p.onData((d) => { if (proc === p) events.emit('data', d); });
    return p;
  }

  async function runStep(step) {
    const p = step === 'install'
      ? await spawn('/bin/bash', ['-c', INSTALL], { cwd: deps.baseEnv.HOME || '/' })
      : await spawn(found.path, step === 'login' ? ['auth', 'login', '--claudeai'] : ['update'], { cwd: deps.baseEnv.HOME || '/' });
    set({ phase: 'step-running', step, exit: null });
    p.onExit((code) => {
      if (proc !== p) return;
      proc = null;
      if (code === 0) refresh();
      else set({ phase: 'step-failed', exit: { code, words: `The step did not finish (exit code ${code}). Its output stays above.` } });
    });
  }

  async function startSession(resume) {
    const dir = path.join(deps.dataDir, 'agent');
    fs.mkdirSync(dir, { recursive: true });
    if (markerPath) fs.rmSync(markerPath, { force: true });
    markerPath = path.join(dir, `marker-${crypto.randomUUID()}.json`);
    const thisMarker = markerPath;
    const folder = state.project;
    const p = await spawn(found.path, claudeArgs({ pluginRoot: deps.pluginRoot, resume, screenReader: state.screenReader }), { cwd: folder, marker: thisMarker });
    const started = readAgentStore(deps.dataDir).started.filter((s) => s !== folder);
    writeAgentStore(deps.dataDir, { way: 'claude-code', notNow: false, started: [folder, ...started] });
    let exited = false;
    set({ phase: 'running', sessionProject: folder, exit: null, guard: { text: 'Checking the guard…', detail: null, warn: false } });
    p.onExit((code) => {
      exited = true;
      if (proc !== p) return;
      proc = null;
      set({ phase: 'exited', exit: { code, words: exitWords(code) } });
    });
    markerDone = waitForMarker(thisMarker, { timeoutMs: deps.markerTimeoutMs || 15000, intervalMs: deps.markerIntervalMs || 250, exited: () => exited }).then((marker) => {
      if (markerPath !== thisMarker) return;
      set({ guard: guardLine(classify(marker, { bundledRoot: deps.pluginRoot }), { exited }) });
    });
  }

  async function run(step) {
    if (step === 'install' || step === 'login' || step === 'update') return runStep(step);
    if (step === 'start' || step === 'new' || step === 'restart') return startSession(false);
    if (step === 'continue') return startSession(true);
    if (step === 'not-now') { endProcess(); writeAgentStore(deps.dataDir, { notNow: true }); return set({ phase: state.project ? 'ready' : 'no-project' }); }
    if (step === 'screen-reader-on' || step === 'screen-reader-off') {
      const on = step === 'screen-reader-on';
      writeAgentStore(deps.dataDir, { screenReader: on });
      return set({ screenReader: on });
    }
    return undefined;
  }

  async function setProject(folder) {
    set({ project: folder });
    return refresh();
  }

  return {
    state: () => state,
    on: (event, cb) => events.on(event, cb),
    refresh, run, setProject,
    markerSettled: () => markerDone,
    sessionRunning: () => Boolean(proc) && state.phase === 'running',
    write: (data) => { if (proc) proc.write(data); },
    resize: (cols, rows) => { deps.cols = cols; deps.rows = rows; if (proc) proc.resize(cols, rows); },
    dispose: () => endProcess(),
  };
}

module.exports = { createController, exitWords };
```

- [ ] **Step 5: Run the controller test and see it pass**

Run: `cd desktop && node --test test/agent-controller.test.js`
Expected: PASS.

- [ ] **Step 6: Write the failing test for `columnBounds`**, appended to `desktop/test/agent-controller.test.js` (`index.js` requires `electron` only inside `setUpAgent`, so the pure function loads in plain Node):

```js
test('the column view follows the slot, scaled by the page zoom', () => {
  const { columnBounds } = require('../agent/index');
  assert.deepEqual(columnBounds({ x: 900, y: 0, width: 540, height: 900 }, 1), { x: 900, y: 0, width: 540, height: 900 });
  assert.deepEqual(columnBounds({ x: 900, y: 0, width: 540, height: 900 }, 1.25), { x: 1125, y: 0, width: 675, height: 1125 });
  assert.equal(columnBounds(null, 1), null);
});
```

- [ ] **Step 7: Implement `desktop/agent/index.js`**

```js
'use strict';
// Electron glue for the agent column: one WebContentsView over the slot the
// shell page reports, the controller behind it, the relay for statement
// numbers, Ctrl+` and Present.
const path = require('node:path');

function columnBounds(rect, zoom) {
  if (!rect) return null;
  const z = zoom || 1;
  return { x: Math.round(rect.x * z), y: Math.round(rect.y * z), width: Math.round(rect.width * z), height: Math.round(rect.height * z) };
}

function setUpAgent({ win, pluginRoot, pluginVersion, gitEnv, dataDir, shimsDir }) {
  const { app, dialog, ipcMain, Menu, WebContentsView, shell } = require('electron');
  const { run } = require('./run');
  const { locate, loginPath } = require('./locate');
  const { authStatus } = require('./auth');
  const { createSession } = require('./session');
  const { createController } = require('./controller');
  const { readAgentStore } = require('./store');

  const g = gitEnv();
  const controller = createController({
    dataDir, pluginRoot, pluginVersion, shimsDir, electronPath: process.execPath,
    git: { bin: g.RESEARCH_HARNESS_GIT, execPath: g.GIT_EXEC_PATH, configSystem: g.GIT_CONFIG_SYSTEM, templateDir: g.GIT_TEMPLATE_DIR },
    baseEnv: process.env,
    loginPath: () => loginPath({ shell: process.env.SHELL || '/bin/zsh', run }),
    locate: () => locate({ home: app.getPath('home'), shell: process.env.SHELL || '/bin/zsh', run }),
    authStatus: (claude) => authStatus(claude, { run }),
    spawn: createSession,
    screenReaderMode: () => app.accessibilitySupportEnabled,
  });

  const view = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'column', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  view.webContents.loadFile(path.join(__dirname, 'column', 'column.html'));

  let slot = null;
  let attached = false;
  let fullScreen = false;
  let shown = false;

  function place() {
    const want = shown && slot && !fullScreen;
    if (want && !attached) { win.contentView.addChildView(view); attached = true; }
    if (!want && attached) { win.contentView.removeChildView(view); attached = false; }
    if (want) view.setBounds(columnBounds(slot, win.webContents.getZoomFactor()));
  }
  function show(next) {
    shown = next;
    win.webContents.send('agent:shown', shown);
    place();
  }

  controller.on('state', (s) => view.webContents.send('column:state', { ...s, fontUrl: `file://${path.join(pluginRoot, 'dashboard', 'fonts')}/` }));
  controller.on('data', (d) => view.webContents.send('column:data', d));
  controller.on('clear', () => view.webContents.send('column:clear'));
  view.webContents.on('did-finish-load', () => view.webContents.send('column:state', { ...controller.state(), fontUrl: `file://${path.join(pluginRoot, 'dashboard', 'fonts')}/` }));

  ipcMain.on('agent:bounds', (e, rect) => {
    if (e.sender !== win.webContents) return;
    slot = rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ? rect : null;
    place();
  });
  ipcMain.on('agent:project', async (e, folder) => {
    if (e.sender !== win.webContents || typeof folder !== 'string' || !path.isAbsolute(folder)) return;
    if (controller.sessionRunning() && controller.state().sessionProject !== folder) {
      const old = path.basename(controller.state().sessionProject);
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['End the session', 'Keep it running'], defaultId: 0, cancelId: 1,
        message: `End the agent session in "${old}"?`,
        detail: 'If you keep it running, the agent keeps working in that folder, not in the project you just opened.',
      });
      if (response === 1) return;
      controller.dispose();
    }
    await controller.setProject(folder);
    if (!readAgentStore(dataDir).notNow) show(true);
  });
  ipcMain.on('agent:setup', (e) => { if (e.sender === win.webContents) { show(true); controller.refresh(); } });

  // Statement numbers: the column asks, the shell page answers from the session view.
  let lookupSeq = 0;
  const pending = new Map();
  ipcMain.handle('column:lookup', (e, num) => {
    if (e.sender !== view.webContents || typeof num !== 'string') return null;
    const id = ++lookupSeq;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      setTimeout(() => { if (pending.delete(id)) resolve(null); }, 2000);
      win.webContents.send('agent:lookup', { id, num });
    });
  });
  ipcMain.on('agent:lookup-result', (e, { id, words } = {}) => {
    if (e.sender !== win.webContents || !pending.has(id)) return;
    const resolve = pending.get(id);
    pending.delete(id);
    resolve(typeof words === 'string' ? words : null);
  });
  ipcMain.on('column:reveal', (e, num) => {
    if (e.sender !== view.webContents || typeof num !== 'string') return;
    win.webContents.send('agent:reveal', num);
    win.webContents.focus();
  });
  ipcMain.on('column:run', (e, step) => {
    if (e.sender !== view.webContents) return;
    if (step === 'not-now') show(false);
    controller.run(step);
  });
  ipcMain.on('column:write', (e, data) => { if (e.sender === view.webContents && typeof data === 'string') controller.write(data); });
  ipcMain.on('column:resize', (e, { cols, rows } = {}) => { if (e.sender === view.webContents && Number.isInteger(cols) && Number.isInteger(rows)) controller.resize(cols, rows); });

  // The menu accelerator and the terminal's own key handler may both fire for
  // one Ctrl+`; the second call within 150 ms is the same key press.
  let lastToggle = 0;
  function toggleFocus() {
    if (!attached || Date.now() - lastToggle < 150) return;
    lastToggle = Date.now();
    if (view.webContents.isFocused()) { win.webContents.focus(); win.webContents.send('agent:focus-view'); }
    else { view.webContents.focus(); view.webContents.send('column:focus'); }
  }
  ipcMain.on('column:focus-view', (e) => { if (e.sender === view.webContents) toggleFocus(); });

  // Present asks for fullscreen; the column must not sit over the projector view.
  win.webContents.on('enter-html-full-screen', () => { fullScreen = true; place(); });
  win.webContents.on('leave-html-full-screen', () => { fullScreen = false; place(); });
  win.webContents.on('zoom-changed', () => setTimeout(place, 0));
  app.on('accessibility-support-changed', () => controller.refresh());

  // The default menu's items, with the focus switch added to View (spec §6:
  // "Ctrl+` (shown in the app menu)").
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' }, { type: 'separator' },
      { label: 'Move Focus Between Session View and Agent', accelerator: 'Ctrl+`', click: toggleFocus },
    ] },
    { role: 'windowMenu' },
  ]));

  app.on('before-quit', () => controller.dispose());
  return controller;
}

module.exports = { setUpAgent, columnBounds };
```

- [ ] **Step 8: Wire it into `desktop/main.js`**

```js
const { setUpAgent } = require('./agent');
const shimsDir = app.isPackaged ? path.join(process.resourcesPath, 'shims') : path.join(__dirname, 'agent', 'shims');

function pluginVersion() {
  try { return JSON.parse(require('node:fs').readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version || null; } catch (_) { return null; }
}
```

In `app.whenReady()`, replace `window(url);` with:

```js
    const win = window(url);
    setUpAgent({ win, pluginRoot, pluginVersion: pluginVersion(), gitEnv, dataDir: app.getPath('userData'), shimsDir });
```

- [ ] **Step 9: Run the desktop tests, then start the app once by hand**

Run: `cd desktop && npm test`
Expected: PASS.
Run: `cd desktop && npm start`, open a project. Expected: the View menu shows "Move Focus Between Session View and Agent  ⌃`". The column page is blank until Task 10; the slot appears on the right. Quit with Cmd+Q; `pgrep -fl "claude --plugin-dir"` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add desktop/agent/controller.js desktop/agent/index.js desktop/agent/store.js desktop/main.js desktop/test/agent-controller.test.js
git commit -m "Desktop agent: controller, column view over the shell's slot, number relay, Ctrl+\`"
```

### Task 10: The column page

**Files:**
- Create: `desktop/agent/column/column.html`, `desktop/agent/column/column.css`, `desktop/agent/column/column.js`, `desktop/agent/column/preload.js`
- Create: `desktop/test/agent-column.test.js` (rendered, Playwright Chromium against `file://`, skipped without Playwright like `smoke.test.js`)

**Interfaces:**
- Consumes: the column IPC channels and the state object from Task 9; `window.statementLinks` from Task 6.
- Produces: `window.agentColumn` (preload): `onState(cb)`, `onData(cb)`, `onClear(cb)`, `onFocus(cb)`, `run(step)`, `write(data)`, `resize(cols, rows)`, `lookup(num) -> Promise<string|null>`, `reveal(num)`, `focusView()`. Nothing else.

- [ ] **Step 1: Write the failing rendered test**

`desktop/test/agent-column.test.js` loads `column.html` from disk with a fake `window.agentColumn` injected before the page's scripts (`page.addInitScript`), in light and dark:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium;
try { ({ chromium } = require('playwright')); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
const skip = chromium ? false : 'Playwright is not installed; run with NODE_PATH pointing at a node_modules that has it.';
const PAGE = pathToFileURL(path.join(__dirname, '..', 'agent', 'column', 'column.html')).href;

const BASE = { version: '2.1.300', plan: 'Claude Pro', guard: null, exit: null, project: '/papers/a', sessionProject: null, canContinue: false, screenReader: false, screenReaderMode: false, pluginVersion: '0.5.0', step: null, fontUrl: null };

async function open(t, colorScheme) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await (await browser.newContext({ colorScheme, viewport: { width: 560, height: 900 } })).newPage();
  await page.addInitScript(() => {
    const cbs = {};
    window.__calls = { run: [], write: [], reveal: [], lookups: [] };
    window.__words = { '1.2b': "Uptake may be a property of the meeting's …" };
    window.agentColumn = {
      onState: (cb) => { cbs.state = cb; }, onData: (cb) => { cbs.data = cb; }, onClear: (cb) => { cbs.clear = cb; }, onFocus: (cb) => { cbs.focus = cb; },
      run: (s) => window.__calls.run.push(s), write: (d) => window.__calls.write.push(d), resize: () => {},
      lookup: async (n) => { window.__calls.lookups.push(n); return window.__words[n] || null; },
      reveal: (n) => window.__calls.reveal.push(n), focusView: () => {},
    };
    window.__emit = (name, v) => cbs[name](v);
  });
  await page.goto(PAGE);
  return page;
}

for (const colorScheme of ['light', 'dark']) {
  test(`first run: the three steps, each saying what happens, in ${colorScheme}`, { skip, timeout: 60000 }, async (t) => {
    const page = await open(t, colorScheme);
    await page.evaluate((s) => window.__emit('state', s), { ...BASE, phase: 'missing', version: null, plan: null });
    await page.getByRole('heading', { name: 'Agent' }).waitFor();
    assert.match(await page.locator('body').textContent(), /Uses Claude Code with your Claude plan/);
    assert.match(await page.locator('body').textContent(), /Downloads Claude Code from claude\.ai into your home folder\. Anthropic's terms apply\./);
    assert.match(await page.locator('body').textContent(), /Opens your browser to sign in\. Works with Pro, Max and Team plans\./);
    assert.match(await page.locator('body').textContent(), /Bundled with the app.*0\.5\.0/);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Install Claude Code');
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.notEqual(ring, 'none', 'visible focus');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.__calls.run), ['install']);
    assert.equal(await page.locator('img, svg[aria-label*="Claude" i]').count(), 0, 'no Claude or Anthropic logo');
  });

  test(`running: guard line, plan, terminal; numbers become links with the statement's words in ${colorScheme}`, { skip, timeout: 60000 }, async (t) => {
    const page = await open(t, colorScheme);
    await page.evaluate((s) => window.__emit('state', s), { ...BASE, phase: 'running', sessionProject: '/papers/a', guard: { text: 'Guard on · research-harness 0.5.0', detail: null, warn: false } });
    await page.evaluate(() => window.__emit('data', 'Claude Code 2.1.300: I propose 1.2b and 2.2.\r\n'));
    await page.getByText('Guard on · research-harness 0.5.0').waitFor();
    assert.match(await page.locator('header').textContent(), /Claude Pro/);
    const rows = page.locator('.xterm-rows');
    await rows.getByText('I propose').waitFor();
    // Hover over "1.2b": find its cell from the rendered row and move there.
    const box = await rows.locator('div').first().boundingBox();
    const cell = box.width / (await page.evaluate(() => window.__term.cols));
    const col = 'Claude Code 2.1.300: I propose '.length;
    await page.mouse.move(box.x + cell * (col + 1.5), box.y + box.height / 2);
    await page.getByRole('tooltip').getByText("Uptake may be a property of the meeting's …").waitFor();
    await page.mouse.click(box.x + cell * (col + 1.5), box.y + box.height / 2);
    assert.deepEqual(await page.evaluate(() => window.__calls.reveal), ['1.2b']);
    assert.ok(!(await page.evaluate(() => window.__calls.lookups)).includes('2.1.300'), 'a version is never looked up');
  });

  test(`no marker: the warning uses ink, an icon and words, not red, in ${colorScheme}`, { skip, timeout: 60000 }, async (t) => {
    const page = await open(t, colorScheme);
    await page.evaluate((s) => window.__emit('state', s), { ...BASE, phase: 'running', guard: { text: "Guard not confirmed. The agent's writes may not be checked in this session.", detail: 'The session did not start.', warn: true } });
    const warn = page.locator('.guard.warn');
    await warn.waitFor();
    assert.equal(await warn.locator('svg').count(), 1);
    const color = await warn.evaluate((el) => getComputedStyle(el).color);
    assert.notEqual(color, colorScheme === 'light' ? 'rgb(210, 35, 42)' : 'rgb(255, 113, 118)');
  });
}

test('exited and failed steps say what happened and offer the next step', { skip, timeout: 60000 }, async (t) => {
  const page = await open(t, 'light');
  await page.evaluate((s) => window.__emit('state', s), { ...BASE, phase: 'exited', exit: { code: 2, words: 'Claude Code stopped with exit code 2.' } });
  await page.getByText('Claude Code stopped with exit code 2.').waitFor();
  await page.getByRole('button', { name: 'Start again' }).click();
  await page.evaluate((s) => window.__emit('state', s), { ...BASE, phase: 'outdated', version: '2.1.200' });
  await page.getByText('Claude Code needs an update for the guard to work').waitFor();
  await page.getByRole('button', { name: 'Update Claude Code' }).click();
  assert.deepEqual(await page.evaluate(() => window.__calls.run), ['restart', 'update']);
});

test('the page cannot reach the network', { skip, timeout: 60000 }, async (t) => {
  const page = await open(t, 'light');
  const blocked = await page.evaluate(() => fetch('http://127.0.0.1:9/api/state').then(() => false, () => true));
  assert.equal(blocked, true);
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd desktop && NODE_PATH=<…> node --test test/agent-column.test.js`
Expected: FAIL (page missing).

- [ ] **Step 3: Write `desktop/agent/column/preload.js`**

```js
'use strict';
// The column page's only bridge. It has no token, no route to the local API,
// and no way to run anything but the column's own steps.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentColumn', {
  onState: (cb) => ipcRenderer.on('column:state', (e, s) => cb(s)),
  onData: (cb) => ipcRenderer.on('column:data', (e, d) => cb(d)),
  onClear: (cb) => ipcRenderer.on('column:clear', () => cb()),
  onFocus: (cb) => ipcRenderer.on('column:focus', () => cb()),
  run: (step) => ipcRenderer.send('column:run', String(step)),
  write: (data) => ipcRenderer.send('column:write', String(data)),
  resize: (cols, rows) => ipcRenderer.send('column:resize', { cols, rows }),
  lookup: (num) => ipcRenderer.invoke('column:lookup', String(num)),
  reveal: (num) => ipcRenderer.send('column:reveal', String(num)),
  focusView: () => ipcRenderer.send('column:focus-view'),
});
```

- [ ] **Step 4: Write `column.html` and `column.css`**

`column.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src file:; style-src file: 'unsafe-inline'; font-src file:; img-src 'none'; connect-src 'none'">
<title>Agent</title>
<link rel="stylesheet" href="../../node_modules/@xterm/xterm/css/xterm.css">
<link rel="stylesheet" href="column.css">
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-guard" viewBox="0 0 16 16"><path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.9 5.5 7 3.2-1.1 5.5-3.8 5.5-7v-4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m5.5 8 1.8 1.8L10.8 6" fill="none" stroke="currentColor" stroke-width="1.4"/></symbol>
  <symbol id="i-warn" viewBox="0 0 16 16"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 6v4M8 11.5v1" stroke="currentColor" stroke-width="1.4"/></symbol>
  <symbol id="i-done" viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="currentColor"/><path d="m4.5 8 2.3 2.3 4.7-4.6" fill="none" stroke="var(--paper)" stroke-width="1.6"/></symbol>
</svg>
<header>
  <h1>Agent</h1>
  <p class="uses">Uses Claude Code with your Claude plan<span id="plan"></span></p>
  <p id="guard" class="guard" hidden></p>
</header>
<main id="panel" aria-live="polite"></main>
<div id="term-wrap" hidden><div id="term" aria-label="Claude Code terminal"></div></div>
<div id="tip" role="tooltip" hidden></div>
<script src="../statement-links.js"></script>
<script src="../../node_modules/@xterm/xterm/lib/xterm.js"></script>
<script src="../../node_modules/@xterm/addon-fit/lib/addon-fit.js"></script>
<script src="column.js"></script>
</body>
</html>
```

The two xterm scripts are loaded as plain scripts: `npm view @xterm/xterm@6.0.0 main` → `lib/xterm.js`, `npm view @xterm/addon-fit@0.11.0 main` → `lib/addon-fit.js`. **Assumed, not checked:** that they still define the globals `window.Terminal` and `window.FitAddon.FitAddon` as the 5.x builds do. Check with `grep -c "exports.Terminal\|self\[\"Terminal\"\]\|root\[\"Terminal\"\]" node_modules/@xterm/xterm/lib/xterm.js` before writing `column.js`. If version 6 dropped the global build, bundle the two files once into `agent/column/vendor.js` with a short `scripts/vendor-xterm.js` that wraps them, and load that instead.

`column.css` copies the light and dark tokens from `app.html` `:root` (the list under Global constraints, with the same values and the same `@media (prefers-color-scheme: dark)` block) and adds:

```css
html, body { height: 100%; margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); }
body { display: flex; flex-direction: column; }
header { padding: 0.9rem 1rem 0.6rem; border-bottom: 1px solid var(--line); }
h1 { margin: 0; font-size: var(--t-head); font-weight: 700; }
.uses { margin: 0.2rem 0 0; font-size: var(--t-label); color: var(--ink-2); }
.uses #plan:not(:empty)::before { content: " · "; }
.guard { display: flex; gap: 0.4rem; align-items: flex-start; margin: 0.4rem 0 0; font-size: var(--t-label); font-weight: 600; color: var(--ink); }
.guard .detail { display: block; font-weight: 400; color: var(--ink-2); }
.guard svg { flex: none; width: 1.1em; height: 1.1em; margin-top: 0.1em; }
#panel { padding: 1rem; font-size: var(--t-body); }
#panel:empty { display: none; }
.steps { list-style: none; margin: 0; padding: 0; }
.steps li { padding: 0.7rem 0; border-bottom: 1px solid var(--line); }
.steps h2 { margin: 0; font-size: var(--t-body); font-weight: 700; display: flex; gap: 0.4rem; align-items: center; }
.steps p { margin: 0.2rem 0 0.5rem; color: var(--ink-2); font-size: var(--t-label); max-width: 40ch; }
.steps svg { width: 1em; height: 1em; }
.btn { font: inherit; font-size: var(--t-label); padding: 0.45rem 0.9rem; border: 1px solid var(--ink); border-radius: 6px; background: var(--paper); color: var(--ink); cursor: pointer; }
.btn-primary { background: var(--ink); color: var(--paper); }
.btn:focus-visible, input:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.7rem; }
.setting { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.8rem; font-size: var(--t-label); }
#term-wrap { flex: 1; min-height: 0; padding: 0.4rem 0 0 0.6rem; }
#term { height: 100%; }
#tip { position: fixed; max-width: 22rem; padding: 0.35rem 0.55rem; border: 1px solid var(--ink); border-radius: 4px; background: var(--paper); color: var(--ink); font-family: var(--serif, Georgia, serif); font-size: var(--t-label); pointer-events: none; }
```

Focus colour: `--blue` passes 3:1 against `--paper` in both themes (`#0b5cad` on `#fff` is 6.5:1, `#74b6ff` on `#141416` is 8.6:1).

- [ ] **Step 5: Write `column.js`**

```js
'use strict';
// The agent column: Claude Code's own terminal, the frame around it in the
// galley-proof world, and the first-run steps. Statement numbers in the
// output become links once the session view confirms they exist.
(function () {
  var host = window.agentColumn;
  var links = window.statementLinks;
  var $ = function (id) { return document.getElementById(id); };
  var state = null;

  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    var s = getComputedStyle(document.documentElement);
    var v = function (n) { return s.getPropertyValue(n).trim(); };
    return { background: v('--paper'), foreground: v('--ink'), cursor: v('--ink'), selectionBackground: v('--line') };
  }

  var term = new window.Terminal({
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13, theme: theme(),
    screenReaderMode: false, allowProposedApi: false, macOptionIsMeta: true, scrollback: 5000,
  });
  var fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($('term'));
  window.__term = term;
  dark.addEventListener('change', function () { term.options.theme = theme(); });

  term.onData(function (d) { host.write(d); });
  term.onResize(function (size) { host.resize(size.cols, size.rows); });
  new ResizeObserver(function () { if (!$('term-wrap').hidden) fit.fit(); }).observe($('term-wrap'));
  // Tab stays the terminal's; Ctrl+` leaves it (the app menu has the same key).
  term.attachCustomKeyEventHandler(function (e) {
    if (e.type === 'keydown' && e.ctrlKey && e.key === '`') { host.focusView(); return false; }
    return true;
  });

  host.onData(function (d) { term.write(d); });
  host.onClear(function () { term.reset(); });
  host.onFocus(function () { if (!$('term-wrap').hidden) term.focus(); else { var b = document.querySelector('#panel .btn'); if (b) b.focus(); } });

  // -- Statement links ------------------------------------------------------
  var tip = $('tip');
  term.registerLinkProvider({
    provideLinks: function (y, callback) {
      var line = term.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      var cells = [];
      for (var x = 0; x < line.length; x++) {
        var c = line.getCell(x);
        cells.push({ chars: c ? c.getChars() : '', width: c ? c.getWidth() : 1 });
      }
      var mapped = links.mapToCells(cells);
      var tokens = links.findStatementTokens(mapped.text);
      if (!tokens.length) return callback(undefined);
      Promise.all(tokens.map(function (tok) { return host.lookup(tok.num).then(function (words) { return { tok: tok, words: words }; }); })).then(function (found) {
        var out = found.filter(function (f) { return f.words; }).map(function (f) {
          return {
            range: { start: { x: mapped.cellAt[f.tok.start] + 1, y: y }, end: { x: mapped.cellAt[f.tok.end - 1] + 1, y: y } },
            text: f.tok.num,
            decorations: { underline: true, pointerCursor: true },
            activate: function () { tip.hidden = true; host.reveal(f.tok.num); },
            hover: function (event) {
              tip.textContent = f.tok.num + ' · ' + f.words;
              tip.style.left = Math.min(event.clientX + 12, window.innerWidth - 300) + 'px';
              tip.style.top = (event.clientY + 16) + 'px';
              tip.hidden = false;
            },
            leave: function () { tip.hidden = true; },
          };
        });
        callback(out.length ? out : undefined);
      });
    },
  });

  // -- Frame and steps --------------------------------------------------------
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }
  function icon(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }
  function button(label, step, primary) {
    var b = el('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn' }, label);
    b.addEventListener('click', function () { host.run(step); });
    return b;
  }
  function step(title, sentence, done, action) {
    var li = el('li');
    var h = el('h2');
    if (done) h.appendChild(icon('i-done'));
    h.appendChild(document.createTextNode(title));
    li.appendChild(h);
    li.appendChild(el('p', {}, sentence));
    if (action) li.appendChild(action);
    return li;
  }
  function screenReaderSetting() {
    var label = el('label', { class: 'setting' });
    var box = el('input', { type: 'checkbox' });
    box.checked = state.screenReader;
    box.addEventListener('change', function () { host.run(box.checked ? 'screen-reader-on' : 'screen-reader-off'); });
    label.appendChild(box);
    label.appendChild(document.createTextNode('Plain output for screen readers (applies when the agent starts)'));
    return label;
  }

  function renderSteps(panel) {
    var installed = state.phase !== 'missing';
    var signedIn = state.phase === 'ready';
    var list = el('ol', { class: 'steps' });
    list.appendChild(step('Install Claude Code', "Downloads Claude Code from claude.ai into your home folder. Anthropic's terms apply.", installed,
      state.phase === 'missing' ? button('Install Claude Code', 'install', true) : null));
    list.appendChild(step('Sign in with Claude', 'Opens your browser to sign in. Works with Pro, Max and Team plans.', signedIn,
      state.phase === 'signed-out' ? button('Sign in with Claude', 'login', true) : null));
    list.appendChild(step('research-harness plugin', 'Bundled with the app, version ' + (state.pluginVersion || 'unknown') + '. Nothing to do.', true, null));
    panel.appendChild(list);
    var row = el('div', { class: 'row' });
    if (signedIn) {
      if (state.canContinue) {
        row.appendChild(button('Continue last conversation', 'continue', true));
        row.appendChild(button('New conversation', 'new', false));
      } else {
        row.appendChild(button('Start the agent', 'start', true));
      }
    }
    row.appendChild(button('Not now', 'not-now', false));
    panel.appendChild(row);
    if (signedIn) panel.appendChild(screenReaderSetting());
  }

  function render() {
    var panel = $('panel');
    panel.textContent = '';
    $('plan').textContent = state.plan || '';
    var g = $('guard');
    g.textContent = '';
    g.hidden = !state.guard || state.phase !== 'running' && state.phase !== 'exited';
    g.className = state.guard && state.guard.warn ? 'guard warn' : 'guard';
    if (state.guard) {
      g.appendChild(icon(state.guard.warn ? 'i-warn' : 'i-guard'));
      var words = el('span', {}, state.guard.text);
      if (state.guard.detail) words.appendChild(el('span', { class: 'detail' }, state.guard.detail));
      g.appendChild(words);
    }
    term.options.screenReaderMode = Boolean(state.screenReaderMode);

    var showTerm = ['step-running', 'step-failed', 'running', 'exited'].indexOf(state.phase) >= 0;
    $('term-wrap').hidden = !showTerm;
    if (showTerm) setTimeout(function () { fit.fit(); }, 0);

    if (state.phase === 'no-project') panel.appendChild(el('p', {}, 'Open a project to start the agent in its folder.'));
    if (state.phase === 'checking') panel.appendChild(el('p', {}, 'Looking for Claude Code…'));
    if (state.phase === 'missing' || state.phase === 'signed-out' || state.phase === 'ready') renderSteps(panel);
    if (state.phase === 'outdated') {
      panel.appendChild(el('p', {}, 'Claude Code needs an update for the guard to work. Installed: ' + state.version + ', needed: 2.1.295 or later.'));
      var r = el('div', { class: 'row' });
      r.appendChild(button('Update Claude Code', 'update', true));
      panel.appendChild(r);
    }
    if (state.phase === 'step-failed' || state.phase === 'exited') {
      panel.appendChild(el('p', {}, state.exit.words));
      var r2 = el('div', { class: 'row' });
      r2.appendChild(state.phase === 'exited' ? button('Start again', 'restart', true) : button('Try again', state.step, true));
      panel.appendChild(r2);
    }
  }

  host.onState(function (s) {
    var first = !state;
    state = s;
    if (first && s.fontUrl) {
      var face = new FontFace('Hanken Grotesk', 'url(' + s.fontUrl + 'hanken-grotesk-latin-wght-normal.woff2)', { weight: '100 900' });
      face.load().then(function (f) { document.fonts.add(f); }, function () {});
    }
    render();
  });
})();
```

If the plugin's font file has another name, take it from `canvas-serve.js`'s `FONTS` set.

- [ ] **Step 6: Run the rendered test and see it pass**

Run: `cd desktop && NODE_PATH=<…> node --test test/agent-column.test.js`
Expected: PASS in light and dark.

- [ ] **Step 7: Check the page against the direction contract**

Open the column in the running app (`npm start`, a fixture project) in light and dark, take screenshots of the first-run steps and of a running session. Check against `.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md`: white sheet and ink, hairlines, no cards, shadows or gradients, red absent from the column, Hanken Grotesk in the frame.

- [ ] **Step 8: Probe (d), Claude Code's colours on both sheets**

With the real Claude Code signed in, start the agent in the app on the light sheet, then switch macOS to dark and start again. Run `/theme` inside Claude Code and try its light and dark themes on each sheet. Take a screenshot of each of the four pairings. Judge whether body text, dim text and diffs are readable (body text at least 4.5:1, measured with a colour picker on the screenshot). Write the result into this plan's "Probe results" section as item (d): which pairings are readable, with the measured ratios. If Claude Code's default theme is unreadable on the light sheet, add one line to the column, shown once when a session starts on the light sheet: "If the text is hard to read, type /theme and choose a light theme." The app does not edit Claude Code's config.

- [ ] **Step 9: Commit**

```bash
git add desktop/agent/column desktop/test/agent-column.test.js docs/superpowers/plans/2026-10-15-desktop-app-claude-code.md
git commit -m "Desktop agent: the column page with Claude Code's terminal and statement links"
```

### Task 11: Electron smoke test with a fake `claude`, and packaging

**Files:**
- Create: `desktop/test/fixtures/fake-claude` (mode 755)
- Modify: `desktop/test/smoke.test.js` (second test)
- Modify: `desktop/electron-builder.yml`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the fake `claude`**

`desktop/test/fixtures/fake-claude`:

```sh
#!/bin/sh
# Stands in for Claude Code in the smoke test. It records its arguments and
# environment, runs the real SessionStart hook through whatever `node` is on
# PATH (the app's shim), and prints a line holding statement numbers.
case "$1" in
  --version) echo "2.1.300 (Claude Code)"; exit 0 ;;
  auth) echo '{"loggedIn":true,"authMethod":"claude.ai","email":"person@example.invalid","orgId":"org-fake","orgName":"Fake Org","subscriptionType":"pro"}'; exit 0 ;;
esac
rec="$HOME/fake-claude"
printf '%s\n' "$@" > "$rec.args"
env > "$rec.env"
command -v node > "$rec.node-path"
node -e 'process.stdout.write(String(process.versions.electron))' > "$rec.node"
plugin=""
prev=""
for a in "$@"; do [ "$prev" = "--plugin-dir" ] && plugin="$a"; prev="$a"; done
echo '{}' | CLAUDE_PLUGIN_ROOT="$plugin" CLAUDE_PROJECT_DIR="$PWD" node "$plugin/hooks/inject-state.js" > /dev/null
echo "Claude Code 2.1.300: I propose 1.2b and 2.2."
sleep 120
```

- [ ] **Step 2: Write the smoke test**

Append to `desktop/test/smoke.test.js`:

```js
test('the agent column starts claude with the bundled plugin, the shims and a confirmed guard', { skip, timeout: 180000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-desktop-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-home-'));
  fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'fake-claude'), path.join(home, '.local', 'bin', 'claude'));
  fs.chmodSync(path.join(home, '.local', 'bin', 'claude'), 0o755);
  const project = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-proj-')), 'voice-uptake');
  fs.cpSync(path.join(__dirname, '..', '..', 'plugins', 'research-harness', 'test', 'fixtures', 'voice-uptake'), project, { recursive: true });
  require(path.join(__dirname, '..', '..', 'plugins', 'research-harness', 'hooks', 'lib', 'app-store.js')).remember(userData, project);

  const app = await electron.launch({
    executablePath: require('electron'), args: [path.join(__dirname, '..')],
    env: { ...process.env, HOME: home, SHELL: '/bin/sh', PATH: '/usr/bin:/bin', RESEARCH_HARNESS_TEST_USER_DATA: userData },
  });
  try {
    const win = await app.firstWindow();
    await win.getByRole('button', { name: path.basename(project) }).click();
    const column = await findPage(app, (p) => p.url().endsWith('column.html'));
    await column.getByRole('button', { name: 'Start the agent' }).click();
    await column.getByText('Guard on · research-harness').waitFor({ timeout: 30000 });
    await column.locator('.xterm-rows').getByText('I propose').waitFor();

    const args = fs.readFileSync(path.join(home, 'fake-claude.args'), 'utf8').trim().split('\n');
    assert.equal(args[0], '--plugin-dir');
    assert.equal(args[2], '--settings');
    assert.equal(args[3], '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}');
    assert.match(fs.readFileSync(path.join(home, 'fake-claude.node-path'), 'utf8'), /agent\/shims\/node$/m);
    assert.match(fs.readFileSync(path.join(home, 'fake-claude.node'), 'utf8'), /^\d+\.\d+\.\d+$/);
    assert.doesNotMatch(fs.readFileSync(path.join(home, 'fake-claude.env'), 'utf8'), /^ELECTRON_RUN_AS_NODE=/m);

    // 1.2b becomes a link that reveals the statement in the session view.
    const rows = column.locator('.xterm-rows div').first();
    const box = await rows.boundingBox();
    const cell = box.width / (await column.evaluate(() => window.__term.cols));
    const col = 'Claude Code 2.1.300: I propose '.length;
    await column.mouse.move(box.x + cell * (col + 1.5), box.y + box.height / 2);
    await column.getByRole('tooltip').getByText(/Uptake may be a property/).waitFor();
    await column.mouse.click(box.x + cell * (col + 1.5), box.y + box.height / 2);
    await win.frameLocator('#session-frame').locator('[id="st-1.2b"]:focus').waitFor();

    // The column page has no route to the local API.
    assert.equal(await column.evaluate(() => typeof window.harnessHost), 'undefined');
    assert.equal(await column.evaluate(() => fetch(location.origin).then(() => 'reached', () => 'blocked')), 'blocked');

    for (const file of fs.readdirSync(userData, { recursive: true })) {
      const full = path.join(userData, String(file));
      if (fs.statSync(full).isFile()) assert.doesNotMatch(fs.readFileSync(full, 'latin1'), /example\.invalid|Fake Org|org-fake/, full);
    }
  } finally {
    await app.close();
  }
});

async function findPage(app, match) {
  for (let i = 0; i < 100; i++) {
    const page = app.windows().find(match);
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('column page not found among app.windows()');
}
```

The recent-project button's accessible name comes from TP1's start page (`#recent`); use whatever name it gives the folder. **Assumed, not checked:** that `app.windows()` lists the page of a `WebContentsView`. Step 3 checks it first.

- [ ] **Step 3: Run it; check that the column page is reachable**

Run: `cd desktop && NODE_PATH=<…> node --test --test-name-pattern "agent column" test/smoke.test.js`
If it fails with "column page not found among app.windows()", Playwright does not list `WebContentsView` pages. Then replace `findPage` with a CDP route: launch with `args: ['--remote-debugging-port=0', path.join(__dirname, '..')]`, read the port from `app.process()` stderr (`DevTools listening on ws://…`), `chromium.connectOverCDP` to it, and pick the page whose URL ends with `column.html` from `browser.contexts()[0].pages()`. Record which of the two worked in the test's comment.
Expected after that: PASS.

- [ ] **Step 4: Packaging for the unsigned build**

`desktop/electron-builder.yml`:

```yaml
appId: org.research-harness.desktop
productName: research-harness
directories: { output: dist }
files: [main.js, preload.js, server.js, git-path.js, package.json, "agent/**", "!agent/shims/**"]
extraResources:
  - { from: build/plugin, to: plugin }
  - { from: askpass.sh, to: askpass.sh }
  - { from: agent/shims, to: shims }
asarUnpack: ["node_modules/dugite/**", "node_modules/node-pty/**"]
mac: { target: dir, identity: null }
```

Run: `cd desktop && npm run dist && ls -l dist/mac-arm64/research-harness.app/Contents/Resources/shims/ dist/mac-arm64/research-harness.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/`
Expected: `node` and `git` with `-rwxr-xr-x`; `spawn-helper` with `-rwxr-xr-x`. If electron-builder drops the mode bits, add an `afterPack` hook in `desktop/scripts/after-pack.js` that runs `fs.chmodSync(…, 0o755)` on those three files, and list it as `afterPack: scripts/after-pack.js`. Signing and notarisation stay with sub-project 4.

Then start the built app from Finder (double-click `dist/mac-arm64/research-harness.app`), open a fixture project, and start the agent with the real Claude Code. Expected: the guard line confirms within 15 seconds. This is the test for "an app started from Finder gets launchd's short PATH" and for `ELECTRON_RUN_AS_NODE` inside a packaged app (spec §3, assumed until now).

- [ ] **Step 5: Run every suite**

Run: `cd desktop && NODE_PATH=<…> npm test` and `cd plugins/research-harness && NODE_PATH=<…> node --test test/*.test.js`
Expected: PASS, with the rendered tests run, not skipped.

- [ ] **Step 6: Commit**

```bash
git add desktop/test/fixtures/fake-claude desktop/test/smoke.test.js desktop/electron-builder.yml
git commit -m "Desktop agent: smoke test with a fake claude, packaging of shims and node-pty"
```

### Task 12: Owner check (Daniel, last)

Not a ticket. Spec §1, success items 1 to 4, once on a fresh macOS user account without developer tools and once on the owner's own account, where the plugin is installed at user scope:

1. Install Claude Code and sign in from the agent column, without opening Terminal.
2. Ask the agent to propose statements; they appear as margin queries. Ask it to accept one; the guard refuses.
3. A statement number in the agent's reply (for example 1.2b) is a link; its tooltip shows the statement's first words, and clicking it shows the statement in the session view.
4. On the owner's account the column says "Guard on · research-harness <bundled version>", not the installed version.

## Ticket order

Sidequest tickets, one per task, in worktrees. Sub-project 1 has landed (`acb2a28`, SQ-240 to SQ-249 done), so no ticket waits on a sub-project 1 ticket. Dependencies inside this plan:

| Task | Depends on | Touches |
|---|---|---|
| 1 numbers | — | plugin `hooks/lib/numbers.js`, `inject-state.js`, canvas skill |
| 2 marker hook | 1 (same file) | plugin `inject-state.js` |
| 3 view protocol | — | plugin `canvas.html`, `app-shell.test.js` |
| 4 locate, auth | — | `desktop/agent/` |
| 5 launch, shims | — | `desktop/agent/` |
| 6 marker, links | — | `desktop/agent/` |
| 7 session, packages | — | `desktop/package.json`, `desktop/agent/session.js` |
| 8 shell column | 3 (same test file) | plugin `app.html`, `desktop/preload.js` |
| 9 controller, wiring | 4, 5, 6, 7 | `desktop/agent/`, `desktop/main.js` |
| 10 column page | 6, 9 | `desktop/agent/column/` |
| 11 smoke, packaging | 2, 8, 9, 10 | `desktop/test/`, `electron-builder.yml` |
