# Desktop App Agent Panel on the Agent SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher who pays per use, or whose institution provides model access, connects the app's own agent in the right-hand column (Anthropic API key, institute gateway, Bedrock or Vertex), works with it under the research-harness guard, and never opens Terminal.

**Architecture:** The main process forks `agent/sdk/host.js` as a `utilityProcess` per conversation. The host calls the Agent SDK's `query()` with the bundled Claude Code binary, the bundled plugin loaded through `plugins`, no user settings and a separate config folder, and turns SDK messages into thread events for the panel page, which the main process loads into sub-project 2's column view. The guard has to be seen to start (plugin listed, SessionStart hook succeeded) before the person's first message goes out.

**Tech Stack:** Electron 44 (`desktop/`), `@anthropic-ai/claude-agent-sdk` (exact pin), node:test, Playwright through `NODE_PATH`, `/usr/bin/security` for the Keychain. The plugin is not changed.

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-app-agent-sdk-design.md` (approved, `5a0b7ea`). Also read: sub-project 2 spec `docs/superpowers/specs/2026-10-15-desktop-app-claude-code-design.md` §5 (column contract), the direction contract `.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md`, the mock `.impeccable/mocks/decision/sketches/model-pick.html`.

**Execution:** subagent-driven, one Sidequest ticket per task, chosen by the owner on 2026-10-15. Not started; it begins once sub-project 2 has landed on `main` (Task 0).

## Global Constraints

- Build only after sub-project 2 has landed on `main` (Task 0 checks). Do not change `plugins/research-harness/`. Sub-project 2's files change only where Tasks 0, 2 and 8 say.
- `@anthropic-ai/claude-agent-sdk` is pinned exactly (no `^`), the newest release older than 14 days (`npm view @anthropic-ai/claude-agent-sdk time --json`); its bundled binary must report Claude Code 2.1.295 or later.
- A secret (API key, gateway token, Bedrock key) never appears in an argument list, a file, a log, the utility process's environment or the panel after saving. It travels main process → host over the host's message port and lives in the agent binary's environment only.
- Query options never set `allowDangerouslySkipPermissions`, `permissionMode: 'bypassPermissions'`, a replaced system prompt, or `settings` that touch hooks. `settingSources` is always `[]`.
- Model output is never inserted as HTML. The panel's content security policy allows only its own scripts and styles.
- No Anthropic or Claude Code logo. A gateway model that is not Claude is not called Claude.
- English for code, UI, docs and commits. Errors in plain words with the next step, in the column, never as a toast.
- WCAG 2.2 AA, keyboard operation, visible focus in light and dark, reflow down to the column's minimum width, type that grows with the window.
- Checks and tests use the fake model in `desktop/test/support/fake-model.js`, not a real model. Only the owner check (Task 11) uses real accounts.
- Run tests from `desktop/`: `npm test` (all), or `node --test test/<file>`. Rendered and Electron tests need `NODE_PATH` pointing at a `node_modules` with Playwright, as `desktop/test/smoke.test.js` says.

## Review Focus

1. **The person types or presses Stop while a turn runs.** Expected: Send is disabled while Working; Stop interrupts the turn, the thread shows "Stopped", pending asks are denied, and the next message works. Pinned in Task 7 (`stop during a tool call`).
2. **An ask is open when the person switches project, switches way or quits.** Expected: the pending `canUseTool` resolves as a denial, the query closes, nothing hangs. Pinned in Task 7 (`close denies open asks`).
3. **A key with quotes, backslashes, spaces or non-ASCII letters; a key with a line break.** Expected: the first round-trips through the Keychain unchanged, the second is refused before anything runs. Pinned in Task 3.
4. **A statement number split across streamed fragments** ("see 3." then "4"). Expected: links are made from the finished text block only, so 3.4 still becomes one link. Pinned in Task 6 and Task 9.
5. **"Continue last conversation" when the stored session is gone** (config folder cleared, other machine). Expected: a plain line "The last conversation could not be found; started a new one." and a working new conversation. Pinned in Task 7 (`resume of a missing session`).

## File map

| File | Task | Responsibility |
|---|---|---|
| `desktop/agent/sdk/column.js` | 0 | the five contact points with sub-project 2's column code |
| `desktop/package.json`, `desktop/lib/distribution.js`, `desktop/agent/sdk/binary.js` | 1 | SDK dependency; binary outside the asar archive; where the binary is |
| `desktop/test/support/fake-model.js`, `desktop/test/support/logging-proxy.js` | 1 | Messages API stand-in; proxy that records which hosts the binary contacts |
| `desktop/scripts/check-agent-sdk.js` | 1 | the spec's "Assumed, not checked" list, run against the real binary |
| `desktop/agent/store.js` (sub-project 2's) | 2 | `agent.way` may be `"sdk"`; the `N.k` matcher stays sub-project 2's `statement-links.js` |
| `desktop/agent/sdk/keychain.js` | 3 | Keychain items through `security -i` |
| `desktop/agent/sdk/connection.js` | 4 | the four kinds; environment; model list; test connection; error words |
| `desktop/agent/sdk/options.js`, `desktop/agent/sdk/guard-check.js` | 5 | query options (pure); has the guard started |
| `desktop/agent/sdk/events.js` | 6 | SDK messages → thread events (pure) |
| `desktop/agent/sdk/session.js` | 7 | one conversation: input queue, asks, stop, resume |
| `desktop/agent/sdk/host.js`, `desktop/agent/sdk/settings.js`, `desktop/agent/sdk/controller.js`, `desktop/main.js` | 8 | utility process; stored connection and session IDs; IPC and lifecycle |
| `desktop/agent/panel/*` | 9 | the column page: first run, connect, thread, settings |
| `desktop/test/smoke-sdk.test.js` | 10 | Electron smoke test against the fake model |

---

### Task 0: Preconditions and the contact points with sub-project 2

The spec (5.1) keeps sub-project 2's column contract and uses its names. This task finds them and puts them behind one small module, so later tasks call fixed names.

**Files:**
- Create: `desktop/agent/sdk/column.js`

**Interfaces:**
- Produces: `column.js` exporting `showPage(file: string): void` (load a page into the column view and show it), `lookupStatement(number: string): Promise<string | null>` (first words of the statement, or null), `revealStatement(number: string): Promise<void>`, `hide(): void` (hide the column, as sub-project 2's "Not now" does), `currentProject(): string | null`, `onProjectChange(cb: (root: string | null) => void): void`, `shimEnv(): Record<string, string>` (the `RH_*` variables sub-project 2's shims read), `useGitEnv(fn: () => object): void` (main.js hands over its `gitEnv`).

- [ ] **Step 1: Check that sub-project 2 has landed**

Run from the repo root:
```bash
ls desktop/agent/shims/node desktop/agent/shims/git desktop/agent/column/column.html plugins/research-harness/hooks/lib/numbers.js
grep -rn "ipcMain.handle\|ipcMain.on" desktop/main.js desktop/agent | grep -v "host:" 
grep -rn "agent.way\|agent\.json\|'way'" desktop/agent desktop/main.js
```
Expected: all four files exist; the grep lists the column's channels. If any file is missing, stop: this plan is built after sub-project 2.

- [ ] **Step 2: Write down what sub-project 2 named**

Sub-project 2's plan (`docs/superpowers/plans/2026-10-15-desktop-app-claude-code.md`, `a9f778d`) names these; check each against the code as built: `desktop/agent/index.js` (`setUpAgent`) owns the column view and answers `column:lookup` (number → first words) and `column:reveal`; its controller learns the project through `setProject(folder)`; `agentEnv(...)` in `desktop/agent/launch.js` sets the shim variables `RH_ELECTRON`, `RH_GIT`, `RH_GIT_EXEC_PATH`, `RH_GIT_CONFIG_SYSTEM`, `RH_GIT_TEMPLATE_DIR`, with the git paths from `gitEnv()` in `main.js`; `desktop/agent/store.js` keeps `way` and `notNow` in `<userData>/agent.json`; `desktop/agent/statement-links.js` exports `findStatementTokens`. From the code, find: the main-process function that loads a page into the column view; the one that hides the column; the one that asks the shell page whether a statement number exists; the one that reveals a statement; how the column learns the current project and its changes; the environment its `launch.js` gives the shims; and where it stores `agent.way`. Add them as a comment block at the top of `desktop/agent/sdk/column.js`.

- [ ] **Step 3: Write `column.js`**

Each export is one line that calls sub-project 2's function. Shape (the right-hand sides are sub-project 2's names from Step 2):

```js
'use strict';
// The agent column belongs to sub-project 2 (its spec §5). This module is
// the only place the SDK way touches it, so both ways keep one contract.
// <comment block from Step 2>
const columnHost = require('../index');            // sub-project 2's main-process module, per Step 2
const { agentEnv } = require('../launch');

let gitEnv = null;                                 // set by main.js through useGitEnv

module.exports = {
  showPage: (file) => columnHost.load(file),
  hide: () => columnHost.hide(),
  lookupStatement: (number) => columnHost.lookupStatement(number),
  revealStatement: (number) => columnHost.revealStatement(number),
  currentProject: () => columnHost.currentProject(),
  onProjectChange: (cb) => columnHost.onProjectChange(cb),
  useGitEnv: (fn) => { gitEnv = fn; },
  // The shims' variables, taken from agentEnv so the names live in one place.
  shimEnv: () => {
    const g = gitEnv();
    const env = agentEnv({ base: {}, loginPath: '', shimsDir: '', electronPath: process.execPath, markerPath: '',
      git: { bin: g.RESEARCH_HARNESS_GIT, execPath: g.GIT_EXEC_PATH, configSystem: g.GIT_CONFIG_SYSTEM, templateDir: g.GIT_TEMPLATE_DIR } });
    return Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('RH_')));
  },
};
```

If sub-project 2 has no exported function for one of these (for example the lookup lives inline in an IPC handler), extract that code into an exported function in sub-project 2's module, unchanged in behaviour, and run `cd desktop && npm test` to show its tests still pass.

- [ ] **Step 4: Commit**

```bash
git add desktop/agent/sdk/column.js desktop/agent
git commit -m "Agent SDK way: one module for the contact points with the agent column"
```

---

### Task 1: SDK package, fake model, and the assumption checks

The spec lists six assumptions it could not check (§3) and says this task checks each with the real binary before anything is built on it. It also checks what later tasks need to know: the order of start-up messages, which tools ask, the shape of failures, resume of a missing session, and how usage is counted.

**Files:**
- Modify: `desktop/package.json`, `desktop/lib/distribution.js` (the electron-builder settings live there as `BASE`; there is no `electron-builder.yml`)
- Create: `desktop/agent/sdk/binary.js`, `desktop/test/support/fake-model.js`, `desktop/test/support/logging-proxy.js`, `desktop/test/support/shim-env.js`, `desktop/test/fake-model.test.js`, `desktop/scripts/check-agent-sdk.js`, `desktop/test/fixtures/sdk-messages/guard.jsonl`

**Interfaces:**
- Produces: `binaryPath({ arch? }): string`; `shimEnv(): Record<string, string>` from `test/support/shim-env.js` (the shims' variables for tests in plain Node); `startFakeModel({ script?, model?, models?, status?, missingModel? }): Promise<{ url, requests, close() }>`; `startLoggingProxy(): Promise<{ url, hosts: string[], close() }>`; the recorded messages file `test/fixtures/sdk-messages/guard.jsonl` (one SDK message per line, paths replaced by `/project`, `/plugin`, `/config`, `/home`).

- [ ] **Step 1: Add the SDK**

Find the version per Global Constraints, then in `desktop/`:
```bash
npm view @anthropic-ai/claude-agent-sdk time --json | tail -20
npm install --save-exact @anthropic-ai/claude-agent-sdk@<version>
ls node_modules/@anthropic-ai/
```
Expected: `claude-agent-sdk` and `claude-agent-sdk-darwin-arm64` (on an Apple silicon Mac). Add a script to `package.json`: `"check-agent-sdk": "node scripts/check-agent-sdk.js"`.

There is no `electron-builder.yml`: the builder settings are `BASE` in `desktop/lib/distribution.js`, and `agent/**` is already in its `files`. Add the binary to `asarUnpack` there:
```js
asarUnpack: ['node_modules/dugite/**', 'node_modules/node-pty/**', 'node_modules/@anthropic-ai/claude-agent-sdk-darwin-*/**'],
```

- [ ] **Step 2: Write `binary.js`**

```js
'use strict';
// The Claude Code binary that ships inside the SDK's per-platform package.
// In the built app it runs from the unpacked copy beside app.asar.
const path = require('node:path');

function binaryPath({ arch = process.arch } = {}) {
  const dir = path.dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-darwin-${arch}/package.json`));
  return path.join(dir, 'claude').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

module.exports = { binaryPath };
```

- [ ] **Step 3: Write the fake model and its test**

`desktop/test/support/fake-model.js`:

```js
'use strict';
// A local stand-in for the Anthropic Messages API, so the real agent binary
// can run against scripted turns without a network or a model. A request for
// the main model takes the next turn of the script; other models (the
// binary's small helper calls) and an empty script get the text "done".
const http = require('node:http');

function readBody(req) {
  return new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s)); });
}
function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
function error(res, code, type, message) { json(res, code, { type: 'error', error: { type, message } }); }

let ids = 0;
function stream(res, model, blocks) {
  const id = ++ids;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('message_start', { message: { id: `msg_${id}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      send('content_block_start', { index, content_block: { type: 'text', text: '' } });
      for (const part of b.parts || [b.text]) send('content_block_delta', { index, delta: { type: 'text_delta', text: part } });
    } else {
      send('content_block_start', { index, content_block: { type: 'tool_use', id: `toolu_${id}_${index}`, name: b.name, input: {} } });
      send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    send('content_block_stop', { index });
  });
  const stop = blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
  send('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } });
  send('message_stop', {});
  res.end();
}

function startFakeModel({ script = [], model = 'fake-model', models = [model], status = null, missingModel = null } = {}) {
  const turns = script.slice();
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (status) return error(res, status.code, status.type, status.message);
    if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
      return json(res, 200, { data: models.map((m) => ({ type: 'model', id: m, display_name: m })), has_more: false });
    }
    if (req.method === 'POST' && req.url.startsWith('/v1/messages/count_tokens')) return json(res, 200, { input_tokens: 1 });
    if (req.method === 'POST' && req.url.startsWith('/v1/messages')) {
      const msg = JSON.parse(body);
      if (msg.model === missingModel) return error(res, 404, 'not_found_error', `model: ${msg.model}`);
      const blocks = msg.model === model && turns.length ? turns.shift() : [{ type: 'text', text: 'done' }];
      return stream(res, msg.model, blocks);
    }
    error(res, 404, 'not_found_error', `${req.method} ${req.url}`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  })));
}

module.exports = { startFakeModel };
```

`desktop/test/fake-model.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeModel } = require('./support/fake-model');

test('the fake model streams scripted turns, then "done"', async () => {
  const fake = await startFakeModel({ script: [[{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]] });
  try {
    const call = () => fetch(`${fake.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'fake-model', stream: true, messages: [] }) }).then((r) => r.text());
    assert.match(await call(), /"name":"Bash"[\s\S]*"stop_reason":"tool_use"/);
    assert.match(await call(), /"text":"done"[\s\S]*"stop_reason":"end_turn"/);
    const models = await fetch(`${fake.url}/v1/models`).then((r) => r.json());
    assert.deepEqual(models.data.map((m) => m.id), ['fake-model']);
  } finally { await fake.close(); }
});

test('the fake model refuses a missing model and a scripted status', async () => {
  const fake = await startFakeModel({ missingModel: 'gone' });
  const r = await fetch(`${fake.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'gone', messages: [] }) });
  assert.equal(r.status, 404);
  await fake.close();
  const refused = await startFakeModel({ status: { code: 401, type: 'authentication_error', message: 'invalid x-api-key' } });
  assert.equal((await fetch(`${refused.url}/v1/models`)).status, 401);
  await refused.close();
});
```

Run: `cd desktop && node --test test/fake-model.test.js` → FAIL first (module missing), then PASS after the file exists.

- [ ] **Step 4: Write the logging proxy**

`desktop/test/support/logging-proxy.js`: an HTTP proxy that records the host of every `CONNECT` and plain request, and refuses them all (the check only needs to know who would have been contacted).

```js
'use strict';
// Records which hosts a program tries to reach through HTTPS_PROXY and
// refuses every request, so nothing leaves the machine during a check.
const http = require('node:http');

function startLoggingProxy() {
  const hosts = [];
  const server = http.createServer((req, res) => { hosts.push(new URL(req.url).host); res.writeHead(403); res.end(); });
  server.on('connect', (req, socket) => { hosts.push(req.url); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    hosts,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  })));
}

module.exports = { startLoggingProxy };
```

- [ ] **Step 4b: Shim variables for plain-Node tests**

`column.shimEnv()` runs in Electron's main process. Tests and the check script run in plain Node, so they take the same variables from `desktop/test/support/shim-env.js`. It builds them with sub-project 2's `agentEnv`, so the names stay in one place:

```js
'use strict';
// The variables sub-project 2's shims read, for tests in plain Node: the
// shim's "Electron" is this Node, and git is the bundled one.
const path = require('node:path');
const { gitPath } = require('../../git-path');
const { agentEnv } = require('../../agent/launch');

function shimEnv() {
  const bin = gitPath();
  const dir = path.resolve(bin, '..', '..');
  const env = agentEnv({ base: {}, loginPath: '', shimsDir: '', electronPath: process.execPath, markerPath: '',
    git: { bin, execPath: path.join(dir, 'libexec', 'git-core'), configSystem: path.join(dir, 'etc', 'gitconfig'), templateDir: path.join(dir, 'share', 'git-core', 'templates') } });
  return Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('RH_')));
}

module.exports = { shimEnv };
```

- [ ] **Step 5: Write `scripts/check-agent-sdk.js`**

The script copies `plugins/research-harness/test/fixtures/voice-uptake` and the plugin (`plugins/research-harness`) into a fresh folder under `os.tmpdir()`, starts the fake model, runs each check through `query()` from the installed SDK with `pathToClaudeCodeExecutable: binaryPath()`, and prints one line per check: `PASS|FAIL|INFO <id> <what was seen>`. Shared base for every query: `cwd` = the copied project, `plugins: [{ type: 'local', path: <copied plugin> }]`, `settingSources: []`, a fresh `CLAUDE_CONFIG_DIR` under the temp folder, `model: 'fake-model'`, `includeHookEvents: true`, `includePartialMessages: true`, `env` = `{ PATH: '<desktop>/agent/shims:/usr/bin:/bin:/usr/sbin:/sbin', HOME: os.homedir(), CLAUDE_CONFIG_DIR, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ANTHROPIC_BASE_URL: fake.url, ANTHROPIC_AUTH_TOKEN: secret, ANTHROPIC_SMALL_FAST_MODEL: 'fake-small', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'fake-small', ...require('../test/support/shim-env').shimEnv() }` with `secret = 'fake-secret-' + crypto.randomBytes(8).toString('hex')`, and the sandbox from spec 5.3 with a `deny` for `ANTHROPIC_AUTH_TOKEN`. The script collects every message of C3 into `test/fixtures/sdk-messages/guard.jsonl` after replacing the four paths with `/project`, `/plugin`, `/config`, `/home`.

| Id | Does | PASS when |
|---|---|---|
| C1 | `<binary> --version` | version ≥ 2.1.295 |
| C2 | streaming input, no message sent for 20 s | a `hook_response` for `SessionStart` with `outcome: 'success'` whose `additionalContext` starts with `research-harness`, then `init` listing `research-harness` from the copied plugin path, both before any user message (print the order) |
| C3 | script: Bash `research-harness accept 3.2 --explained "x"`; then Edit of the copied project's `research/canvas.md` (absolute path; the Edit tool takes no relative one) replacing `rather than of the proposal. [proposed]` with `… [accepted]` | both tool results start with `PreToolUse:Bash hook error:` and `PreToolUse:Edit hook error:`; canvas bytes unchanged |
| C4 | script: Bash `research-harness status` | tool result not an error, contains `voice-uptake` (sandbox, node shim and plugin `bin/` on `PATH` work together) |
| C5 | script: Bash `env`; then Bash `echo "[$ANTHROPIC_AUTH_TOKEN]"` | neither result contains the secret; the second prints `[]` |
| C6 | after C5 | no file under `CLAUDE_CONFIG_DIR` contains the secret |
| C7 | one plain turn with `HTTPS_PROXY`/`HTTP_PROXY` = logging proxy, `NO_PROXY=127.0.0.1,localhost` | `hosts` is empty (print it either way) |
| C8 | script: WebFetch `https://example.org`; Read `/etc/hosts`; Edit inside the project (a new line in `research/notes-check.md` via Write); Skill `research-harness:canvas`; Task with a one-line prompt | INFO: for each, whether `canUseTool` was called (print `toolName` and `blockedPath`) |
| C9 | script: Task; the subagent's first turn is Bash `research-harness accept 3.2 --explained "x"` | that tool result starts with `PreToolUse:Bash hook error:` |
| C10 | `keychain.saveSecret` with `service: 'research-harness-desktop-check'` and the secret `a b"c\d ü`, then `readSecret`, then `removeSecret` (needs Task 3; run C10 at the end of Task 3) | read equals written; after remove, read is `null` |
| C11 | `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION=eu-central-1`, `AWS_BEARER_TOKEN_BEDROCK=fake-bedrock-<hex>`, `ANTHROPIC_BEDROCK_BASE_URL=<fake url>`, no `ANTHROPIC_*` auth | a request reached the fake with `authorization: Bearer fake-bedrock-<hex>` (real Bedrock stays untested) |
| C12 | `resume: crypto.randomUUID()` | INFO: the messages and error the query ends with |
| C13 | test turn (`tools: []`, no plugin, `maxTurns: 1`, prompt "Reply with the word ready.") against: a fake with `status` 401 `authentication_error`; `ANTHROPIC_BASE_URL=http://127.0.0.1:9`; a fake with `missingModel: 'fake-model'` | INFO: for each, the assistant message's `error` field, the result `subtype` and the time until the query ended |
| C14 | two plain turns in one conversation | INFO: `usage` and `total_cost_usd` of both results: per turn or cumulative |
| C15 | send `/research-harness:canvas` as the message | INFO: whether the fake's last request contains text from `skills/canvas/SKILL.md` |
| C16 | after `npm run dist` (the app is `Placet.app`, in `dist/arm64/mac-arm64/`): run `dist/arm64/mac-arm64/Placet.app/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude --version`, then `codesign -dv` on it | runs and prints the version; INFO: the signing authority |

- [ ] **Step 6: Run the checks and record the results**

```bash
cd desktop && npm run check-agent-sdk 2>&1 | tee /tmp/check-agent-sdk.txt
npm run dist && npm run check-agent-sdk -- --only C16
```
Add a section `## Task 1 results` at the end of this plan with the printed lines verbatim, the date and the SDK version. Then:
- C1, C2, C3, C4, C5, C6 or C9 FAIL: stop and bring the lines to the owner; the spec's 5.3 and 5.6 rest on them.
- C7 lists hosts: write them into the plan's results and into spec §10 as a stated limit, and tell the owner.
- C8: the session's `canUseTool` (Task 7) allows `Skill` and `Task` without asking in any case; note whether WebFetch and the outside Read reached it.
- C12, C13, C14, C15: later tasks use these results where they say so.

- [ ] **Step 7: Commit**

```bash
git add desktop/package.json desktop/package-lock.json desktop/lib/distribution.js desktop/agent/sdk/binary.js desktop/test/support desktop/test/fake-model.test.js desktop/scripts/check-agent-sdk.js desktop/test/fixtures/sdk-messages docs/superpowers/plans/2026-10-15-desktop-app-agent-sdk.md
git commit -m "Agent SDK way: SDK package, fake model, and the checks the spec left open"
```

---

### Task 2: The SDK way in sub-project 2's way store

Sub-project 2's plan (`docs/superpowers/plans/2026-10-15-desktop-app-claude-code.md`, `a9f778d`) already puts the `N.k` matcher in `desktop/agent/statement-links.js` (`findStatementTokens`), so the move in spec 5.1 is done there, and it keeps `agent.way` in `desktop/agent/store.js`, which accepts only `"claude-code"`. This task lets the store hold `"sdk"` and pins what the SDK way relies on from both files.

**Files:**
- Modify: `desktop/agent/store.js` (the `way` line in `readAgentStore`)
- Create: `desktop/test/sdk-way.test.js`

**Interfaces:**
- Consumes: `readAgentStore(dataDir)`, `writeAgentStore(dataDir, patch)` (sub-project 2, file `<userData>/agent.json`); `findStatementTokens(text) -> Array<{ num, start, end }>` (sub-project 2; `end` exclusive; also `window.statementLinks` in a page).
- Produces: `readAgentStore(dataDir).way` is `'claude-code' | 'sdk' | null`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readAgentStore, writeAgentStore } = require('../agent/store');
const { findStatementTokens } = require('../agent/statement-links');

test('the store keeps the SDK way as well as Claude Code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-way-'));
  assert.equal(readAgentStore(dir).way, null);
  writeAgentStore(dir, { way: 'sdk' });
  assert.equal(readAgentStore(dir).way, 'sdk');
  writeAgentStore(dir, { way: 'claude-code' });
  assert.equal(readAgentStore(dir).way, 'claude-code');
  writeAgentStore(dir, { way: 'cloud' });
  assert.equal(readAgentStore(dir).way, null);
});

test('the matcher finds the numbers the SDK thread links', () => {
  assert.deepEqual(findStatementTokens('See 3.4.'), [{ num: '3.4', start: 4, end: 7 }]);
  assert.deepEqual(findStatementTokens('version 2.1.300 and 0.5.0'), []);
});
```

- [ ] **Step 2: Run, expect FAIL** on the first test (`'sdk'` reads as `null`): `cd desktop && node --test test/sdk-way.test.js`

- [ ] **Step 3: Implement**

In `readAgentStore`, change the `way` line to:

```js
      way: j.way === 'claude-code' || j.way === 'sdk' ? j.way : null,
```

Then find where sub-project 2 acts on `way` at start-up (its `desktop/agent/index.js` and `controller.js`): with `way === 'sdk'` it must not check, install or start Claude Code. Make it skip its own first run in that case and leave the column to Task 8's controller; add one case to sub-project 2's `desktop/test/agent-controller.test.js` that pins this (state stays idle, no `locate` call, with `way: 'sdk'`).

- [ ] **Step 4: Run all desktop tests, expect PASS**: `cd desktop && npm test`

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/store.js desktop/test/sdk-way.test.js desktop/agent desktop/test/agent-controller.test.js
git commit -m "Agent column: the way store holds the SDK way; Claude Code stays off when it is chosen"
```

---

### Task 3: Keychain

**Files:**
- Create: `desktop/agent/sdk/keychain.js`, `desktop/test/keychain.test.js`

**Interfaces:**
- Produces: `saveSecret(kind, secret, opts?): Promise<void>`, `readSecret(kind, opts?): Promise<string | null>`, `removeSecret(kind, opts?): Promise<void>`; `kind` is `'anthropic' | 'gateway' | 'bedrock'`; `opts = { security?: string, service?: string }`, defaults `/usr/bin/security` and `SERVICE = 'research-harness-desktop'`. Errors carry `code`: `'bad-secret'`, `'keychain-write'`, `'keychain-denied'`.

- [ ] **Step 1: Write the failing test**

The test uses a fake `security`: a Node script that appends its arguments and stdin to a log and keeps items in a JSON file. `-i` reads one command line from stdin and parses it with the same quoting `keychain.js` writes (double quotes, backslash escapes).

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveSecret, readSecret, removeSecret } = require('../agent/sdk/keychain');

function fakeSecurity() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-sec-'));
  const bin = path.join(dir, 'security');
  fs.writeFileSync(bin, `#!${process.execPath}
const fs = require('fs'); const dir = ${JSON.stringify(dir)};
const store = () => { try { return JSON.parse(fs.readFileSync(dir + '/items.json', 'utf8')); } catch { return {}; } };
const args = process.argv.slice(2); let input = '';
process.stdin.on('data', (c) => { input += c; }).on('end', () => {
  fs.appendFileSync(dir + '/log', JSON.stringify({ args }) + '\\n');
  const items = store();
  if (args[0] === '-i') {
    const words = []; const re = /"((?:[^"\\\\]|\\\\.)*)"|(\\S+)/g; let m;
    while ((m = re.exec(input))) words.push(m[1] !== undefined ? m[1].replace(/\\\\(.)/g, '$1') : m[2]);
    const at = (f) => words[words.indexOf(f) + 1];
    items[at('-s') + '/' + at('-a')] = at('-w');
    fs.writeFileSync(dir + '/items.json', JSON.stringify(items)); return;
  }
  const at = (f) => args[args.indexOf(f) + 1]; const key = at('-s') + '/' + at('-a');
  if (!(key in items)) { process.exitCode = 44; return; }
  if (args[0] === 'find-generic-password') process.stdout.write(items[key] + '\\n');
  if (args[0] === 'delete-generic-password') { delete items[key]; fs.writeFileSync(dir + '/items.json', JSON.stringify(items)); }
});
`, { mode: 0o755 });
  return { bin, log: () => fs.readFileSync(path.join(dir, 'log'), 'utf8') };
}

test('a secret round-trips and never appears in an argument list', async () => {
  const sec = fakeSecurity();
  const secret = 'sk-a b"c\\d ü';
  await saveSecret('anthropic', secret, { security: sec.bin });
  assert.equal(await readSecret('anthropic', { security: sec.bin }), secret);
  assert.ok(!sec.log().includes('sk-a'), sec.log());
  await removeSecret('anthropic', { security: sec.bin });
  assert.equal(await readSecret('anthropic', { security: sec.bin }), null);
});

test('a secret with a line break or control character is refused before security runs', async () => {
  const sec = fakeSecurity();
  await assert.rejects(saveSecret('gateway', 'abc\ndef', { security: sec.bin }), { code: 'bad-secret' });
  await assert.rejects(saveSecret('gateway', '', { security: sec.bin }), { code: 'bad-secret' });
  assert.throws(() => fs.readFileSync(path.join(path.dirname(sec.bin), 'log')), { code: 'ENOENT' });
});

test('an unknown kind is refused', async () => {
  await assert.rejects(saveSecret('vertex', 'x'), /Unknown connection kind/);
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/keychain.test.js`

- [ ] **Step 3: Implement**

```js
'use strict';
// One generic-password item per connection kind in the login Keychain. The
// secret never appears in an argument list, which every process on the Mac
// can read: writes go through `security -i` with the command on stdin, and
// reads print the secret to this process only.
const { execFile } = require('node:child_process');

const SERVICE = 'research-harness-desktop';
const KINDS = ['anthropic', 'gateway', 'bedrock'];
const NOT_FOUND = 44;

function checkKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown connection kind: ${kind}`);
}

function quote(secret) {
  if (typeof secret !== 'string' || !secret || /[\u0000-\u001f\u007f]/.test(secret)) {
    throw Object.assign(new Error('The key is empty or contains a line break.'), { code: 'bad-secret' });
  }
  return `"${secret.replace(/[\\"]/g, '\\$&')}"`;
}

function run(security, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = execFile(security, args, { encoding: 'utf8' }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    child.stdin.end(input);
  });
}

async function saveSecret(kind, secret, { security = '/usr/bin/security', service = SERVICE } = {}) {
  checkKind(kind);
  const line = `add-generic-password -U -s ${service} -a ${kind} -w ${quote(secret)}\n`;
  await run(security, ['-i'], line);
  // `security -i` can exit 0 when its command failed, so read back.
  if ((await readSecret(kind, { security, service })) !== secret) {
    throw Object.assign(new Error('The key could not be stored in the Keychain.'), { code: 'keychain-write' });
  }
}

async function readSecret(kind, { security = '/usr/bin/security', service = SERVICE } = {}) {
  checkKind(kind);
  try {
    const out = await run(security, ['find-generic-password', '-s', service, '-a', kind, '-w']);
    return out.replace(/\n$/, '');
  } catch (err) {
    if (err.code === NOT_FOUND) return null;
    throw Object.assign(new Error('The app was not allowed to read the key from the Keychain.'), { code: 'keychain-denied' });
  }
}

async function removeSecret(kind, { security = '/usr/bin/security', service = SERVICE } = {}) {
  checkKind(kind);
  try { await run(security, ['delete-generic-password', '-s', service, '-a', kind]); } catch (err) {
    if (err.code !== NOT_FOUND) throw err;
  }
}

module.exports = { saveSecret, readSecret, removeSecret, SERVICE, KINDS };
```

- [ ] **Step 4: Run, expect PASS**: `cd desktop && node --test test/keychain.test.js`

- [ ] **Step 5: Run check C10 against the real Keychain**: `cd desktop && npm run check-agent-sdk -- --only C10`. Add the line to "Task 1 results". If it fails because `security -i` parses quotes differently, change `quote()` to what `security` accepts, change the fake's parser in the test to match, and run both again.

- [ ] **Step 6: Commit**

```bash
git add desktop/agent/sdk/keychain.js desktop/test/keychain.test.js docs/superpowers/plans/2026-10-15-desktop-app-agent-sdk.md
git commit -m "Agent SDK way: Keychain items written through security -i, never in argv"
```

---

### Task 4: Connections

**Files:**
- Create: `desktop/agent/sdk/connection.js`, `desktop/test/connection.test.js`

**Interfaces:**
- Consumes: `startFakeModel` (Task 1, tests only).
- Produces: `KIND_NAMES` (`{ anthropic: 'Anthropic API key', gateway: 'Institute gateway', bedrock: 'Amazon Bedrock', vertex: 'Google Vertex' }`); `validate(draft): { ok: true, conn } | { ok: false, field, error }`; `needsSecret(conn): boolean`; `secretKind(conn): 'anthropic' | 'gateway' | 'bedrock'`; `envFor(conn, secret): { vars: Record<string,string>, secretNames: string[] }`; `hostOf(conn): string`; `listModels(conn, secret, fetchImpl = fetch): Promise<string[] | null>`; `describeFailure({ code, conn }): string`; `testConnection({ query, options, conn, timeoutMs = 20000 }): Promise<{ ok: true } | { ok: false, error: string }>`.

A connection (`conn`) is one of:
`{ kind: 'anthropic', model }`, `{ kind: 'gateway', url, model }`, `{ kind: 'bedrock', region, model, auth: 'profile', profile }`, `{ kind: 'bedrock', region, model, auth: 'key' }`, `{ kind: 'vertex', projectId, region, model }`. It never holds the secret.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../agent/sdk/connection');
const { startFakeModel } = require('./support/fake-model');

test('a gateway URL must be https, or http on this machine, without a password', () => {
  assert.deepEqual(c.validate({ kind: 'gateway', url: 'https://gw.example.edu/anthropic/', model: 'm' }), { ok: true, conn: { kind: 'gateway', url: 'https://gw.example.edu/anthropic', model: 'm' } });
  assert.equal(c.validate({ kind: 'gateway', url: 'http://127.0.0.1:18763', model: 'm' }).ok, true);
  assert.equal(c.validate({ kind: 'gateway', url: 'http://gw.example.edu', model: 'm' }).field, 'url');
  assert.equal(c.validate({ kind: 'gateway', url: 'https://u:p@gw.example.edu', model: 'm' }).field, 'url');
  assert.equal(c.validate({ kind: 'gateway', url: 'gw.example.edu', model: 'm' }).field, 'url');
});

test('each kind needs its fields', () => {
  assert.equal(c.validate({ kind: 'anthropic' }).field, 'model');
  assert.equal(c.validate({ kind: 'bedrock', region: 'Frankfurt', model: 'm', auth: 'key' }).field, 'region');
  assert.equal(c.validate({ kind: 'bedrock', region: 'eu-central-1', model: 'm', auth: 'profile', profile: 'a b' }).field, 'profile');
  assert.equal(c.validate({ kind: 'vertex', projectId: 'P', region: 'europe-west1', model: 'm' }).field, 'projectId');
  assert.equal(c.validate({ kind: 'other', model: 'm' }).field, 'kind');
});

test('the environment for each kind, and which variables are secret', () => {
  assert.deepEqual(c.envFor({ kind: 'anthropic', model: 'm' }, 'S'), { vars: { ANTHROPIC_API_KEY: 'S' }, secretNames: ['ANTHROPIC_API_KEY'] });
  assert.deepEqual(c.envFor({ kind: 'gateway', url: 'https://g', model: 'm' }, 'S'), { vars: { ANTHROPIC_BASE_URL: 'https://g', ANTHROPIC_AUTH_TOKEN: 'S' }, secretNames: ['ANTHROPIC_AUTH_TOKEN'] });
  assert.deepEqual(c.envFor({ kind: 'bedrock', region: 'eu-central-1', model: 'm', auth: 'key' }, 'S'), { vars: { CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: 'eu-central-1', AWS_BEARER_TOKEN_BEDROCK: 'S' }, secretNames: ['AWS_BEARER_TOKEN_BEDROCK'] });
  assert.deepEqual(c.envFor({ kind: 'bedrock', region: 'eu-central-1', model: 'm', auth: 'profile', profile: 'lab' }, null), { vars: { CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: 'eu-central-1', AWS_PROFILE: 'lab' }, secretNames: [] });
  assert.deepEqual(c.envFor({ kind: 'vertex', projectId: 'lab-123456', region: 'europe-west1', model: 'm' }, null), { vars: { CLAUDE_CODE_USE_VERTEX: '1', ANTHROPIC_VERTEX_PROJECT_ID: 'lab-123456', CLOUD_ML_REGION: 'europe-west1' }, secretNames: [] });
});

test('the model list comes from /v1/models; a gateway without it gets a text field', async () => {
  const fake = await startFakeModel({ models: ['m-1', 'm-2'] });
  try {
    assert.deepEqual(await c.listModels({ kind: 'gateway', url: fake.url, model: '' }, 'tok'), ['m-1', 'm-2']);
    assert.equal(fake.requests[0].headers.authorization, 'Bearer tok');
    assert.equal(await c.listModels({ kind: 'gateway', url: `${fake.url}/nothing-here`, model: '' }, 'tok'), null);
  } finally { await fake.close(); }
});

test('failures in plain words', () => {
  const gw = { kind: 'gateway', url: 'https://gw.example.edu', model: 'm-9' };
  assert.equal(c.describeFailure({ code: 'authentication_failed', conn: gw }), 'The token was refused.');
  assert.equal(c.describeFailure({ code: 'authentication_failed', conn: { kind: 'anthropic', model: 'm' } }), 'The key was refused.');
  assert.equal(c.describeFailure({ code: 'model_not_found', conn: gw }), 'gw.example.edu does not offer m-9.');
  assert.equal(c.describeFailure({ code: 'unreachable', conn: gw }), 'Could not reach gw.example.edu.');
  assert.match(c.describeFailure({ code: 'rate_limit', conn: gw }), /Try again/);
});

test('test connection: ready, refused, unknown model, unreachable', async () => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const { binaryPath } = require('../agent/sdk/binary');
  const { buildTestOptions } = require('../agent/sdk/options');
  const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path');
  const base = { binary: binaryPath(), configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-cfg-')), home: os.homedir(), appVersion: '0.0.0' };
  const run = (conn, secret) => c.testConnection({ query, conn, options: buildTestOptions({ ...base, conn, secret }) });

  const ready = await startFakeModel({ script: [[{ type: 'text', text: 'ready' }]] });
  assert.deepEqual(await run({ kind: 'gateway', url: ready.url, model: 'fake-model' }, 'tok'), { ok: true });
  await ready.close();

  const refused = await startFakeModel({ status: { code: 401, type: 'authentication_error', message: 'invalid token' } });
  assert.deepEqual(await run({ kind: 'gateway', url: refused.url, model: 'fake-model' }, 'tok'), { ok: false, error: 'The token was refused.' });
  await refused.close();

  const missing = await startFakeModel({ missingModel: 'fake-model' });
  assert.match((await run({ kind: 'gateway', url: missing.url, model: 'fake-model' }, 'tok')).error, /does not offer fake-model/);
  await missing.close();

  assert.match((await run({ kind: 'gateway', url: 'http://127.0.0.1:9', model: 'fake-model' }, 'tok')).error, /Could not reach 127\.0\.0\.1/);
});
```

The last test also needs `buildTestOptions` from Task 5; write Task 5 Step 3's `buildTestOptions` first if you run this before Task 5, or mark the test `{ todo: 'after Task 5' }` and remove the mark in Task 5.

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/connection.test.js`

- [ ] **Step 3: Implement**

```js
'use strict';
// The four ways to reach a model: what each needs, the environment the agent
// binary gets for it, and what a failure means in plain words.
const KIND_NAMES = { anthropic: 'Anthropic API key', gateway: 'Institute gateway', bedrock: 'Amazon Bedrock', vertex: 'Google Vertex' };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ANTHROPIC = 'https://api.anthropic.com';

const bad = (field, error) => ({ ok: false, field, error });
const text = (v) => (typeof v === 'string' ? v.trim() : '');

function validate(draft = {}) {
  const model = text(draft.model);
  if (!KIND_NAMES[draft.kind]) return bad('kind', 'Choose how the agent connects.');
  if (!model) return bad('model', 'Choose or type a model.');
  if (draft.kind === 'anthropic') return { ok: true, conn: { kind: 'anthropic', model } };
  if (draft.kind === 'gateway') {
    let u;
    try { u = new URL(text(draft.url)); } catch { return bad('url', 'Type the full address, starting with https://.'); }
    if (u.username || u.password) return bad('url', 'Leave the user name and password out of the address; the token goes in its own field.');
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)))) return bad('url', 'The address must start with https:// (http:// only for this computer).');
    return { ok: true, conn: { kind: 'gateway', url: `${u.origin}${u.pathname.replace(/\/+$/, '')}`, model } };
  }
  if (draft.kind === 'bedrock') {
    const region = text(draft.region);
    if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) return bad('region', 'Type an AWS region such as eu-central-1.');
    if (draft.auth === 'key') return { ok: true, conn: { kind: 'bedrock', region, model, auth: 'key' } };
    const profile = text(draft.profile);
    if (draft.auth !== 'profile' || !/^[\w.+-]+$/.test(profile)) return bad('profile', 'Type the name of an AWS profile on this Mac, or use a Bedrock API key.');
    return { ok: true, conn: { kind: 'bedrock', region, model, auth: 'profile', profile } };
  }
  const projectId = text(draft.projectId);
  const region = text(draft.region);
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) return bad('projectId', 'Type the Google Cloud project ID, such as my-lab-123456.');
  if (!/^([a-z]+-[a-z]+\d+|global)$/.test(region)) return bad('region', 'Type a Google Cloud region such as europe-west1, or global.');
  return { ok: true, conn: { kind: 'vertex', projectId, region, model } };
}

const needsSecret = (conn) => conn.kind === 'anthropic' || conn.kind === 'gateway' || (conn.kind === 'bedrock' && conn.auth === 'key');
const secretKind = (conn) => conn.kind;

function envFor(conn, secret) {
  switch (conn.kind) {
    case 'anthropic': return { vars: { ANTHROPIC_API_KEY: secret }, secretNames: ['ANTHROPIC_API_KEY'] };
    case 'gateway': return { vars: { ANTHROPIC_BASE_URL: conn.url, ANTHROPIC_AUTH_TOKEN: secret }, secretNames: ['ANTHROPIC_AUTH_TOKEN'] };
    case 'bedrock': return conn.auth === 'key'
      ? { vars: { CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: conn.region, AWS_BEARER_TOKEN_BEDROCK: secret }, secretNames: ['AWS_BEARER_TOKEN_BEDROCK'] }
      : { vars: { CLAUDE_CODE_USE_BEDROCK: '1', AWS_REGION: conn.region, AWS_PROFILE: conn.profile }, secretNames: [] };
    case 'vertex': return { vars: { CLAUDE_CODE_USE_VERTEX: '1', ANTHROPIC_VERTEX_PROJECT_ID: conn.projectId, CLOUD_ML_REGION: conn.region }, secretNames: [] };
    default: throw new Error(`Unknown connection kind: ${conn.kind}`);
  }
}

function hostOf(conn) {
  if (conn.kind === 'gateway') return new URL(conn.url).host;
  if (conn.kind === 'bedrock') return `Amazon Bedrock (${conn.region})`;
  if (conn.kind === 'vertex') return `Google Vertex (${conn.region})`;
  return 'api.anthropic.com';
}

async function listModels(conn, secret, fetchImpl = fetch) {
  if (conn.kind !== 'anthropic' && conn.kind !== 'gateway') return null;
  const base = conn.kind === 'gateway' ? conn.url : ANTHROPIC;
  const headers = { 'anthropic-version': '2023-06-01', ...(conn.kind === 'gateway' ? { authorization: `Bearer ${secret}` } : { 'x-api-key': secret }) };
  let res;
  try { res = await fetchImpl(`${base}/v1/models?limit=100`, { headers }); } catch { throw Object.assign(new Error(describeFailure({ code: 'unreachable', conn })), { code: 'unreachable' }); }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(describeFailure({ code: 'authentication_failed', conn })), { code: 'authentication_failed' });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body && Array.isArray(body.data) ? body.data.map((m) => m.id).filter((id) => typeof id === 'string') : null;
}

function describeFailure({ code, conn }) {
  const host = hostOf(conn);
  switch (code) {
    case 'authentication_failed': return conn.kind === 'gateway' ? 'The token was refused.' : 'The key was refused.';
    case 'model_not_found': return `${host} does not offer ${conn.model}.`;
    case 'unreachable': return `Could not reach ${host}.`;
    case 'rate_limit':
    case 'overloaded': return 'The model is busy or the usage limit is reached. Try again in a minute.';
    case 'billing_error': return 'The account behind the key has no credit left.';
    case 'cloud_credential_error': return conn.kind === 'vertex' ? 'No Google sign-in was found on this Mac. Sign in with Google Cloud’s own tools, then try again.' : 'The AWS profile could not be used.';
    default: return `The model did not answer as expected (${code}).`;
  }
}

// One turn without tools or plugin: checks key, address and model name
// together. Spends a few tokens. Error codes follow Task 1, check C13.
async function testConnection({ query, options, conn, timeoutMs = 20000 }) {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  let code = null;
  let answered = false;
  try {
    for await (const msg of query({ prompt: 'Reply with the word ready.', options: { ...options, abortController } })) {
      if (msg.type === 'assistant' && msg.error) code = code || msg.error;
      if (msg.type === 'assistant' && !msg.error) answered = true;
      if (msg.type === 'result' && msg.subtype !== 'success') code = code || 'unknown';
    }
  } catch (err) {
    code = code || (abortController.signal.aborted ? 'unreachable' : 'unknown');
  } finally { clearTimeout(timer); }
  if (!code && answered) return { ok: true };
  return { ok: false, error: describeFailure({ code: code || 'unreachable', conn }) };
}

module.exports = { KIND_NAMES, validate, needsSecret, secretKind, envFor, hostOf, listModels, describeFailure, testConnection };
```

Use C13's results from "Task 1 results" to check the mapping: the `error` field the binary reports for a 401, for an unreachable host and for a missing model must land on `authentication_failed`, `unreachable` and `model_not_found`. If C13 showed a different value for one of them (for example `unknown` plus a result text "Connection error"), map that value in `testConnection` before `describeFailure` and say why in a one-line comment citing C13.

- [ ] **Step 4: Run, expect PASS**: `cd desktop && node --test test/connection.test.js`

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/sdk/connection.js desktop/test/connection.test.js
git commit -m "Agent SDK way: the four connection kinds, model list, and test connection"
```

---

### Task 5: Query options and the guard check

**Files:**
- Create: `desktop/agent/sdk/options.js`, `desktop/agent/sdk/guard-check.js`, `desktop/test/options.test.js`, `desktop/test/guard-check.test.js`

**Interfaces:**
- Consumes: `envFor` (Task 4).
- Produces: `TOOLS: string[]`; `buildOptions({ conn, secret, cwd, pluginRoot, binary, shimsDir, shimEnv, configDir, home, appVersion, canUseTool, resume? }): Options`; `buildTestOptions({ conn, secret, binary, configDir, home, appVersion }): Options`; `createGuardCheck({ pluginRoot }): (msg) => null | { state: 'on', version } | { state: 'off', cause }`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/options.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOptions, buildTestOptions, TOOLS } = require('../agent/sdk/options');

const base = { cwd: '/p', pluginRoot: '/plugin', binary: '/bin/claude', shimsDir: '/shims', shimEnv: { RH_ELECTRON: '/e', PATH: '/evil' }, configDir: '/cfg', home: '/h', appVersion: '1.2.3', canUseTool: async () => ({ behavior: 'deny', message: 'x' }) };
const gw = { kind: 'gateway', url: 'https://g', model: 'm' };

test('the exact option set of spec 5.3', () => {
  const o = buildOptions({ ...base, conn: gw, secret: 'S' });
  assert.equal(o.pathToClaudeCodeExecutable, '/bin/claude');
  assert.deepEqual(o.plugins, [{ type: 'local', path: '/plugin' }]);
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.cwd, '/p');
  assert.deepEqual(o.tools, ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Skill', 'Task', 'WebFetch', 'WebSearch']);
  assert.equal(o.permissionMode, 'acceptEdits');
  assert.equal(o.canUseTool, base.canUseTool);
  assert.deepEqual(o.sandbox, { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, credentials: { envVars: [{ name: 'ANTHROPIC_AUTH_TOKEN', mode: 'deny' }] } });
  assert.equal(o.model, 'm');
  assert.equal(o.includePartialMessages, true);
  assert.equal(o.includeHookEvents, true);
  assert.equal('resume' in o, false);
  assert.equal(buildOptions({ ...base, conn: gw, secret: 'S', resume: 'abc' }).resume, 'abc');
});

test('env holds only the listed variables, and the shims cannot replace them', () => {
  const o = buildOptions({ ...base, conn: gw, secret: 'S' });
  assert.deepEqual(o.env, {
    RH_ELECTRON: '/e',
    PATH: '/shims:/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/h', CLAUDE_CONFIG_DIR: '/cfg',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_AGENT_SDK_CLIENT_APP: 'research-harness-desktop/1.2.3',
    ANTHROPIC_BASE_URL: 'https://g', ANTHROPIC_AUTH_TOKEN: 'S',
  });
});

test('never bypass, never a replaced prompt, never settings', () => {
  for (const conn of [gw, { kind: 'anthropic', model: 'm' }, { kind: 'vertex', projectId: 'lab-123456', region: 'global', model: 'm' }]) {
    const o = buildOptions({ ...base, conn, secret: 'S' });
    assert.equal(o.allowDangerouslySkipPermissions, undefined);
    assert.notEqual(o.permissionMode, 'bypassPermissions');
    assert.equal(o.systemPrompt, undefined);
    assert.equal(o.settings, undefined);
  }
});

test('every secret variable gets a sandbox deny', () => {
  const o = buildOptions({ ...base, conn: { kind: 'anthropic', model: 'm' }, secret: 'S' });
  assert.deepEqual(o.sandbox.credentials.envVars, [{ name: 'ANTHROPIC_API_KEY', mode: 'deny' }]);
  const v = buildOptions({ ...base, conn: { kind: 'vertex', projectId: 'lab-123456', region: 'global', model: 'm' }, secret: null });
  assert.deepEqual(v.sandbox.credentials.envVars, []);
});

test('the test turn has no tools, no plugin and one turn', () => {
  const o = buildTestOptions({ conn: gw, secret: 'S', binary: '/bin/claude', configDir: '/cfg', home: '/h', appVersion: '1.2.3' });
  assert.deepEqual(o.tools, []);
  assert.deepEqual(o.plugins, []);
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.maxTurns, 1);
  assert.equal(o.env.ANTHROPIC_AUTH_TOKEN, 'S');
  assert.equal(o.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
});
```

`desktop/test/guard-check.test.js` (uses the recording from Task 1):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGuardCheck } = require('../agent/sdk/guard-check');

const recorded = fs.readFileSync(path.join(__dirname, 'fixtures', 'sdk-messages', 'guard.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const run = (msgs, pluginRoot = '/plugin') => { const feed = createGuardCheck({ pluginRoot }); let d = null; for (const m of msgs) d = feed(m) || d; return d; };

test('the recorded start shows the guard on, with the plugin version', () => {
  const d = run(recorded);
  assert.equal(d.state, 'on');
  assert.match(d.version, /^\d+\.\d+\.\d+$/);
});

test('plugin from another path: off', () => {
  assert.deepEqual(run(recorded, '/elsewhere'), { state: 'off', cause: 'The research-harness plugin did not load.' });
});

test('no SessionStart hook result (hooks turned off): off', () => {
  const d = run(recorded.filter((m) => !(m.subtype === 'hook_response' && m.hook_event === 'SessionStart')));
  assert.equal(d.state, 'off');
  assert.match(d.cause, /start hook did not run/);
});

test('a failed SessionStart hook: off', () => {
  const d = run(recorded.map((m) => (m.subtype === 'hook_response' && m.hook_event === 'SessionStart' ? { ...m, outcome: 'error' } : m)));
  assert.equal(d.state, 'off');
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/options.test.js test/guard-check.test.js`

- [ ] **Step 3: Implement**

`desktop/agent/sdk/options.js`:

```js
'use strict';
// The query options for the agent (spec 5.3) and for the one-turn
// connection test. Pure; the tests pin every field.
const { envFor } = require('./connection');

const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function baseEnv({ configDir, home, appVersion }) {
  return {
    HOME: home,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_AGENT_SDK_CLIENT_APP: `research-harness-desktop/${appVersion}`,
  };
}

function buildOptions({ conn, secret, cwd, pluginRoot, binary, shimsDir, shimEnv = {}, configDir, home, appVersion, canUseTool, resume }) {
  const { vars, secretNames } = envFor(conn, secret);
  const options = {
    pathToClaudeCodeExecutable: binary,
    plugins: [{ type: 'local', path: pluginRoot }],
    settingSources: [],
    cwd,
    env: { ...shimEnv, PATH: `${shimsDir}:${SYSTEM_PATH}`, ...baseEnv({ configDir, home, appVersion }), ...vars },
    tools: TOOLS,
    permissionMode: 'acceptEdits',
    canUseTool,
    sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, credentials: { envVars: secretNames.map((name) => ({ name, mode: 'deny' })) } },
    model: conn.model,
    includePartialMessages: true,
    includeHookEvents: true,
  };
  if (resume) options.resume = resume;
  return options;
}

function buildTestOptions({ conn, secret, binary, configDir, home, appVersion }) {
  return {
    pathToClaudeCodeExecutable: binary,
    plugins: [],
    settingSources: [],
    env: { PATH: SYSTEM_PATH, ...baseEnv({ configDir, home, appVersion }), ...envFor(conn, secret).vars },
    tools: [],
    maxTurns: 1,
    model: conn.model,
    canUseTool: async () => ({ behavior: 'deny', message: 'No tools in a connection test.' }),
  };
}

module.exports = { TOOLS, buildOptions, buildTestOptions };
```

The `shimEnv` keys `RH_ELECTRON` etc. come from Task 0's `column.shimEnv()`. If C4 in Task 1 showed that the network rules need an addition for the plugin's commands, add exactly that under `sandbox.network` here and in the first test.

`desktop/agent/sdk/guard-check.js`:

```js
'use strict';
// Has the guard been seen to start (spec 5.6)? Fed the SDK messages in
// order; decides at the init message, which follows the SessionStart hook
// result (Task 1, check C2).
const path = require('node:path');

function fromOurHook(output) {
  try { return /^research-harness\b/.test(JSON.parse(output).hookSpecificOutput.additionalContext); } catch { return false; }
}

function createGuardCheck({ pluginRoot }) {
  let hookRan = false;
  let decided = null;
  return function feed(msg) {
    if (decided || msg.type !== 'system') return decided;
    if (msg.subtype === 'hook_response' && msg.hook_event === 'SessionStart' && msg.outcome === 'success' && fromOurHook(msg.output)) hookRan = true;
    if (msg.subtype === 'init') {
      const ours = (msg.plugins || []).find((p) => p.name === 'research-harness' && path.resolve(p.path) === path.resolve(pluginRoot));
      if (!ours) decided = { state: 'off', cause: 'The research-harness plugin did not load.' };
      else if (!hookRan) decided = { state: 'off', cause: 'The guard’s start hook did not run. Settings installed on this Mac by your organisation may turn hooks off.' };
      else decided = { state: 'on', version: ours.version };
    }
    return decided;
  };
}

module.exports = { createGuardCheck };
```

- [ ] **Step 4: Run, expect PASS**: `cd desktop && node --test test/options.test.js test/guard-check.test.js test/connection.test.js`

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/sdk/options.js desktop/agent/sdk/guard-check.js desktop/test/options.test.js desktop/test/guard-check.test.js desktop/test/connection.test.js
git commit -m "Agent SDK way: pinned query options and the guard start check"
```

---

### Task 6: Thread events

**Files:**
- Create: `desktop/agent/sdk/events.js`, `desktop/test/events.test.js`

**Interfaces:**
- Consumes: `findStatementTokens` (sub-project 2, `desktop/agent/statement-links.js`).
- Produces: `createMapper({ cwd }): (msg) => Event[]` and `toolLine(name, input, cwd): string`. Events (all plain JSON):
  - `{ kind: 'session', sessionId, model }` from `init`
  - `{ kind: 'delta', text }` streamed text of the main agent (not of subagents)
  - `{ kind: 'text', text }` a finished text block of the main agent
  - `{ kind: 'tool', id, line }` one line per tool call
  - `{ kind: 'refusal', id, tool, reason, statement }` a guard refusal; `statement` is the first `N.k` in a Bash command, else null
  - `{ kind: 'usage', tokens, costUsd }` from a result
  - `{ kind: 'error', code }` an assistant message with `error`, or a result that is not `success`
  - `{ kind: 'turn-end' }` after each result

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMapper, toolLine } = require('../agent/sdk/events');

const recorded = fs.readFileSync(path.join(__dirname, 'fixtures', 'sdk-messages', 'guard.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const all = () => { const map = createMapper({ cwd: '/project' }); return recorded.flatMap(map); };

test('the recorded guard denials become refusal lines', () => {
  const refusals = all().filter((e) => e.kind === 'refusal');
  assert.equal(refusals.length, 2);
  assert.equal(refusals[0].tool, 'Bash');
  assert.equal(refusals[0].statement, '3.2');
  assert.match(refusals[0].reason, /^Accepting a statement is the researcher's act/);
  assert.equal(refusals[1].tool, 'Edit');
  assert.equal(refusals[1].statement, null);
  assert.match(refusals[1].reason, /cannot be promoted to \[accepted\]/);
});

test('session, tool lines, usage and turn end come out of the recording', () => {
  const ev = all();
  assert.equal(ev[0].kind, 'session');
  assert.ok(ev.some((e) => e.kind === 'tool' && e.line === 'Ran research-harness accept 3.2 --explained "x"'));
  assert.ok(ev.some((e) => e.kind === 'tool' && e.line === 'Edited research/canvas.md'));
  assert.ok(ev.some((e) => e.kind === 'usage' && e.tokens > 0));
  assert.equal(ev.at(-1).kind, 'turn-end');
});

test('tool lines in plain words', () => {
  assert.equal(toolLine('Read', { file_path: '/project/research/canvas.md' }, '/project'), 'Read research/canvas.md');
  assert.equal(toolLine('Read', { file_path: '/etc/hosts' }, '/project'), 'Read /etc/hosts');
  assert.equal(toolLine('Write', { file_path: '/project/a.md' }, '/project'), 'Wrote a.md');
  assert.equal(toolLine('Bash', { command: 'research-harness status\nmore' }, '/project'), 'Ran research-harness status');
  assert.equal(toolLine('WebSearch', { query: 'voice uptake' }, '/project'), 'Searched the web for “voice uptake”');
  assert.equal(toolLine('WebFetch', { url: 'https://example.org/x' }, '/project'), 'Fetched https://example.org/x');
  assert.equal(toolLine('Grep', { pattern: 'uptake' }, '/project'), 'Searched the project for “uptake”');
  assert.equal(toolLine('Skill', { skill: 'research-harness:canvas' }, '/project'), 'Used the skill research-harness:canvas');
  assert.equal(toolLine('Task', { description: 'Check sources' }, '/project'), 'Started a helper: Check sources');
  assert.equal(toolLine('Other', {}, '/project'), 'Used Other');
});

test('streamed fragments are deltas; the finished block carries the whole text', () => {
  const map = createMapper({ cwd: '/project' });
  const delta = (t) => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } } });
  assert.deepEqual([...map(delta('see 3.')), ...map(delta('4'))], [{ kind: 'delta', text: 'see 3.' }, { kind: 'delta', text: '4' }]);
  assert.deepEqual(map({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'see 3.4' }] } }), [{ kind: 'text', text: 'see 3.4' }]);
});

test('subagent text stays out of the thread; errors are named', () => {
  const map = createMapper({ cwd: '/project' });
  assert.deepEqual(map({ type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'text', text: 'inner' }] } }), []);
  assert.deepEqual(map({ type: 'assistant', parent_tool_use_id: null, error: 'rate_limit', message: { content: [] } }), [{ kind: 'error', code: 'rate_limit' }]);
});
```

If the recording from Task 1 used other script text, change only the expected `line` strings to the recording's commands.

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/events.test.js`

- [ ] **Step 3: Implement**

```js
'use strict';
// SDK messages → thread events for the panel. Pure apart from remembering
// each tool call's input until its result arrives.
const path = require('node:path');
const { findStatementTokens } = require('../statement-links');

const GUARD_REFUSAL = /^PreToolUse:(\w+) hook error: ([\s\S]*)$/;

function shown(file, cwd) {
  if (typeof file !== 'string') return '';
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}

function toolLine(name, input = {}, cwd) {
  switch (name) {
    case 'Read': return `Read ${shown(input.file_path, cwd)}`;
    case 'Edit': return `Edited ${shown(input.file_path, cwd)}`;
    case 'Write': return `Wrote ${shown(input.file_path, cwd)}`;
    case 'Bash': return `Ran ${String(input.command || '').split('\n')[0].slice(0, 120)}`;
    case 'Glob': return `Listed files matching “${input.pattern}”`;
    case 'Grep': return `Searched the project for “${input.pattern}”`;
    case 'WebFetch': return `Fetched ${input.url}`;
    case 'WebSearch': return `Searched the web for “${input.query}”`;
    case 'Skill': return `Used the skill ${input.skill}`;
    case 'Task': return `Started a helper: ${input.description}`;
    default: return `Used ${name}`;
  }
}

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  return (block.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function createMapper({ cwd }) {
  const inputs = new Map();
  return function map(msg) {
    const main = msg.parent_tool_use_id == null;
    if (msg.type === 'system' && msg.subtype === 'init') return [{ kind: 'session', sessionId: msg.session_id, model: msg.model }];
    if (msg.type === 'stream_event' && main && msg.event.type === 'content_block_delta' && msg.event.delta.type === 'text_delta') {
      return [{ kind: 'delta', text: msg.event.delta.text }];
    }
    if (msg.type === 'assistant') {
      if (msg.error && main) return [{ kind: 'error', code: msg.error }];
      const out = [];
      for (const b of msg.message.content || []) {
        if (b.type === 'tool_use') { inputs.set(b.id, { name: b.name, input: b.input }); out.push({ kind: 'tool', id: b.id, line: toolLine(b.name, b.input, cwd) }); }
        if (b.type === 'text' && main) out.push({ kind: 'text', text: b.text });
      }
      return out;
    }
    if (msg.type === 'user' && Array.isArray(msg.message && msg.message.content)) {
      const out = [];
      for (const b of msg.message.content) {
        if (b.type !== 'tool_result') continue;
        const m = GUARD_REFUSAL.exec(resultText(b));
        if (!m) continue;
        const call = inputs.get(b.tool_use_id) || { input: {} };
        const found = m[1] === 'Bash' ? findStatementTokens(call.input.command || '') : [];
        out.push({ kind: 'refusal', id: b.tool_use_id, tool: m[1], reason: m[2], statement: found.length ? found[0].num : null });
      }
      return out;
    }
    if (msg.type === 'result') {
      const u = msg.usage || {};
      const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      const out = [{ kind: 'usage', tokens, costUsd: msg.total_cost_usd || 0 }];
      if (msg.subtype !== 'success') out.push({ kind: 'error', code: msg.subtype });
      out.push({ kind: 'turn-end' });
      return out;
    }
    return [];
  };
}

module.exports = { createMapper, toolLine, GUARD_REFUSAL };
```

Usage: check C14 in "Task 1 results" says whether `usage` and `total_cost_usd` are per turn or cumulative. The panel (Task 9) adds per-turn figures, or keeps the last one if they are cumulative; write which in a one-line comment at the `usage` branch, citing C14.

- [ ] **Step 4: Run, expect PASS**: `cd desktop && node --test test/events.test.js`

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/sdk/events.js desktop/test/events.test.js
git commit -m "Agent SDK way: SDK messages become thread events, guard refusals their own line"
```

---

### Task 7: The conversation

**Files:**
- Create: `desktop/agent/sdk/session.js`, `desktop/test/session.test.js`

**Interfaces:**
- Consumes: `createGuardCheck` (Task 5), `createMapper` (Task 6).
- Produces: `createSession({ query, options: (canUseTool) => Options, pluginRoot, cwd, onEvent, startTimeoutMs = 30000 })` returning `{ start(): Promise<void>, send(text): boolean, interrupt(): Promise<void>, answer(id, allow): void, close(): void }`. Besides the events of Task 6, `onEvent` receives `{ kind: 'guard', state, version?, cause? }` (`cause: 'sandbox'` when the sandbox could not start), `{ kind: 'you', text }`, `{ kind: 'ask', id, line }`, `{ kind: 'stopped', reason }` and `{ kind: 'resume-failed' }`. `askLine(toolName, input, blockedPath): string` is exported for the tests.

- [ ] **Step 1: Write the failing tests**

Unit tests with a scripted `query` stand-in, then integration tests through the real SDK, the bundled binary, the plugin and the fake model.

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSession, askLine } = require('../agent/sdk/session');
const { startFakeModel } = require('./support/fake-model');

const repo = path.join(__dirname, '..', '..');
const pluginSrc = path.join(repo, 'plugins', 'research-harness');

// A query stand-in: yields the given messages, then waits for input.
function fakeQuery(messages) {
  const calls = { interrupted: 0, closed: 0, prompts: [] };
  const query = ({ prompt, options }) => {
    calls.options = options;
    const it = (async function* () {
      for (const m of messages) yield m;
      for await (const user of prompt) { calls.prompts.push(user.message.content); yield { type: 'result', subtype: 'success', usage: {}, total_cost_usd: 0 }; }
    })();
    return Object.assign(it, { interrupt: async () => { calls.interrupted += 1; }, close: () => { calls.closed += 1; it.return(); } });
  };
  return { query, calls };
}
const hook = { type: 'system', subtype: 'hook_response', hook_event: 'SessionStart', outcome: 'success', output: JSON.stringify({ hookSpecificOutput: { additionalContext: 'research-harness · paper project' } }) };
const init = (root) => ({ type: 'system', subtype: 'init', session_id: 's-1', model: 'm', plugins: [{ name: 'research-harness', path: root, version: '0.5.0' }] });

test('nothing is sent before the guard is on', async () => {
  const events = [];
  const { query } = fakeQuery([]);
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: (e) => events.push(e), startTimeoutMs: 50 });
  assert.equal(s.send('hello'), false);
  await s.start();
  assert.deepEqual(events.at(-1), { kind: 'guard', state: 'off', cause: 'The agent did not start within 30 seconds.' });
});

test('guard on, then a message goes out and Send is blocked until the turn ends', async () => {
  const events = [];
  const { query, calls } = fakeQuery([hook, init('/plugin')]);
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: (e) => events.push(e) });
  const running = s.start();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(events.find((e) => e.kind === 'guard'), { kind: 'guard', state: 'on', version: '0.5.0' });
  assert.equal(s.send('first'), true);
  assert.equal(s.send('second'), false);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls.prompts, ['first']);
  assert.equal(s.send('third'), true);
  s.close();
  await running;
});

test('a sandbox that cannot start keeps the agent off', async () => {
  const events = [];
  const query = () => Object.assign((async function* () { throw new Error('Sandbox is not available on this system'); })(), { interrupt: async () => {}, close: () => {} });
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: (e) => events.push(e) });
  await s.start();
  assert.deepEqual(events.filter((e) => e.kind === 'guard'), [{ kind: 'guard', state: 'off', cause: 'sandbox' }]);
});

test('stop during a tool call denies the open ask and interrupts', async () => {
  const events = [];
  const { query, calls } = fakeQuery([hook, init('/plugin')]);
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: (e) => events.push(e) });
  const running = s.start();
  await new Promise((r) => setImmediate(r));
  const asked = calls.options.canUseTool('WebFetch', { url: 'https://example.org' }, { signal: new AbortController().signal });
  assert.equal(events.at(-1).kind, 'ask');
  await s.interrupt();
  assert.deepEqual(await asked, { behavior: 'deny', message: 'The researcher stopped the agent.' });
  assert.equal(calls.interrupted, 1);
  assert.deepEqual(events.at(-1), { kind: 'stopped', reason: 'by-person' });
  s.close();
  await running;
});

test('close denies open asks', async () => {
  const { query, calls } = fakeQuery([hook, init('/plugin')]);
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: () => {} });
  const running = s.start();
  await new Promise((r) => setImmediate(r));
  const asked = calls.options.canUseTool('WebSearch', { query: 'q' }, { signal: new AbortController().signal });
  s.close();
  assert.equal((await asked).behavior, 'deny');
  await running;
});

test('allow once passes the input through; Skill and Task do not ask', async () => {
  const events = [];
  const { query, calls } = fakeQuery([hook, init('/plugin')]);
  const s = createSession({ query, options: (canUseTool) => ({ canUseTool }), pluginRoot: '/plugin', cwd: '/p', onEvent: (e) => events.push(e) });
  const running = s.start();
  await new Promise((r) => setImmediate(r));
  const sig = { signal: new AbortController().signal };
  assert.equal((await calls.options.canUseTool('Skill', { skill: 'x' }, sig)).behavior, 'allow');
  const asked = calls.options.canUseTool('WebFetch', { url: 'https://example.org' }, sig);
  s.answer(events.at(-1).id, true);
  assert.deepEqual(await asked, { behavior: 'allow', updatedInput: { url: 'https://example.org' } });
  const denied = calls.options.canUseTool('WebFetch', { url: 'https://example.org' }, sig);
  s.answer(events.at(-1).id, false);
  assert.deepEqual(await denied, { behavior: 'deny', message: 'The researcher declined.' });
  s.close();
  await running;
});

test('ask lines in plain words', () => {
  assert.equal(askLine('WebFetch', { url: 'https://example.org/a' }), 'Fetch https://example.org/a');
  assert.equal(askLine('WebSearch', { query: 'uptake' }), 'Search the web for “uptake”');
  assert.equal(askLine('Read', { file_path: '/etc/hosts' }, '/etc/hosts'), 'Read /etc/hosts, outside the project');
  assert.equal(askLine('Edit', { file_path: '/tmp/x' }, '/tmp/x'), 'Edit /tmp/x, outside the project');
  assert.equal(askLine('Bash', { command: 'curl x' }), 'Run curl x');
});

// Integration: real SDK and binary, bundled plugin, fake model.
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-sdk-'));
  fs.cpSync(path.join(pluginSrc, 'test', 'fixtures', 'voice-uptake'), path.join(dir, 'project'), { recursive: true });
  fs.cpSync(pluginSrc, path.join(dir, 'plugin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'config'));
  return { dir, cwd: path.join(dir, 'project'), pluginRoot: path.join(dir, 'plugin'), configDir: path.join(dir, 'config') };
}

async function realSession(scriptFor, extra = {}) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const { buildOptions } = require('../agent/sdk/options');
  const { binaryPath } = require('../agent/sdk/binary');
  const { shimEnv } = require('./support/shim-env');
  const p = project();
  const fake = await startFakeModel({ script: scriptFor(p) });
  const secret = `fake-secret-${require('node:crypto').randomBytes(8).toString('hex')}`;
  const events = [];
  const conn = { kind: 'gateway', url: fake.url, model: 'fake-model' };
  const s = createSession({
    query, pluginRoot: p.pluginRoot, cwd: p.cwd, onEvent: (e) => events.push(e),
    options: (canUseTool) => buildOptions({ conn, secret, cwd: p.cwd, pluginRoot: p.pluginRoot, binary: binaryPath(), shimsDir: path.join(__dirname, '..', 'agent', 'shims'), shimEnv: shimEnv(), configDir: p.configDir, home: os.homedir(), appVersion: '0.0.0-test', canUseTool, ...extra }),
  });
  return { s, events, fake, p, secret };
}
const until = async (events, pred, ms = 60000) => { const end = Date.now() + ms; while (!events.some(pred)) { if (Date.now() > end) throw new Error(`timed out; events: ${JSON.stringify(events.map((e) => e.kind))}`); await new Promise((r) => setTimeout(r, 100)); } };

test('real binary: accept and promotion are refused, the canvas is unchanged', { timeout: 120000 }, async () => {
  const { s, events, fake, p } = await realSession((p) => [
    [{ type: 'tool_use', name: 'Bash', input: { command: 'research-harness accept 3.2 --explained "x"', description: 'accept' } }],
    [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(p.cwd, 'research', 'canvas.md'), old_string: 'rather than of the proposal. [proposed]', new_string: 'rather than of the proposal. [accepted]' } }],
    [{ type: 'text', text: 'Both were refused.' }],
  ]);
  const canvas = path.join(p.cwd, 'research', 'canvas.md');
  const before = fs.readFileSync(canvas);
  const running = s.start();
  await until(events, (e) => e.kind === 'guard');
  assert.equal(events.find((e) => e.kind === 'guard').state, 'on');
  assert.equal(s.send('Accept 3.2 and promote the chairing statement.'), true);
  await until(events, (e) => e.kind === 'turn-end');
  assert.deepEqual(events.filter((e) => e.kind === 'refusal').map((e) => e.tool), ['Bash', 'Edit']);
  assert.deepEqual(fs.readFileSync(canvas), before);
  s.close(); await running; await fake.close();
});

test('real binary: a sandboxed env shows no secret, and no file holds it', { timeout: 120000 }, async () => {
  const { s, events, fake, p, secret } = await realSession(() => [
    [{ type: 'tool_use', name: 'Bash', input: { command: 'env', description: 'env' } }],
    [{ type: 'text', text: 'done' }],
  ]);
  const running = s.start();
  await until(events, (e) => e.kind === 'guard');
  s.send('Show the environment.');
  await until(events, (e) => e.kind === 'turn-end');
  const toolResults = fake.requests.map((r) => r.body).join('\n');
  assert.match(toolResults, /HOME=/);
  assert.ok(!toolResults.includes(secret), 'the secret reached the model through env');
  s.close(); await running; await fake.close();
  for (const file of fs.readdirSync(p.configDir, { recursive: true })) {
    const full = path.join(p.configDir, String(file));
    if (fs.statSync(full).isFile()) assert.ok(!fs.readFileSync(full, 'latin1').includes(secret), full);
  }
});

test('resume of a missing session', { timeout: 120000 }, async () => {
  const { s, events, fake } = await realSession(() => [], { resume: '00000000-0000-4000-8000-000000000000' });
  await s.start();
  assert.ok(events.some((e) => e.kind === 'resume-failed'), JSON.stringify(events));
  await fake.close();
});
```

The `resume of a missing session` test follows C12: if C12 showed that the binary starts a fresh session for an unknown ID instead of failing, assert instead that the `session` event carries a different `sessionId` and send `{ kind: 'resume-failed' }` from that case in Step 3.

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/session.test.js`

- [ ] **Step 3: Implement**

```js
'use strict';
// One conversation in the current project. The person's messages go in
// through a queue; thread events come out. Nothing is sent before the guard
// is seen to start (spec 5.6). Every open ask is denied when the turn is
// stopped or the conversation ends, so nothing waits forever.
const { createGuardCheck } = require('./guard-check');
const { createMapper } = require('./events');

const NO_ASK = new Set(['Skill', 'Task']);

function askLine(toolName, input = {}, blockedPath) {
  const outside = blockedPath ? ', outside the project' : '';
  switch (toolName) {
    case 'WebFetch': return `Fetch ${input.url}`;
    case 'WebSearch': return `Search the web for “${input.query}”`;
    case 'Read': return `Read ${input.file_path}${outside}`;
    case 'Edit':
    case 'Write': return `${toolName} ${input.file_path}${outside}`;
    case 'Bash': return `Run ${String(input.command || '').split('\n')[0]}`;
    default: return `Use ${toolName}`;
  }
}

function createInbox() {
  const queue = [];
  let wake = null;
  let ended = false;
  return {
    push(item) { queue.push(item); if (wake) { wake(); wake = null; } },
    end() { ended = true; if (wake) { wake(); wake = null; } },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (queue.length) { yield queue.shift(); continue; }
        if (ended) return;
        await new Promise((r) => { wake = r; });
      }
    },
  };
}

function createSession({ query, options, pluginRoot, cwd, onEvent, startTimeoutMs = 30000 }) {
  const inbox = createInbox();
  const asks = new Map();
  let nextAsk = 1;
  let guard = null;
  let busy = false;
  let q = null;
  let sawInit = false;
  let closed = false;

  const denyAll = (message) => { for (const [id, a] of asks) { asks.delete(id); a.resolve({ behavior: 'deny', message }); } };

  const canUseTool = (toolName, input, { signal, blockedPath } = {}) => {
    if (NO_ASK.has(toolName)) return Promise.resolve({ behavior: 'allow', updatedInput: input });
    return new Promise((resolve) => {
      const id = String(nextAsk++);
      asks.set(id, { resolve, input });
      if (signal) signal.addEventListener('abort', () => { if (asks.delete(id)) resolve({ behavior: 'deny', message: 'The request was cancelled.' }); });
      onEvent({ kind: 'ask', id, line: askLine(toolName, input, blockedPath) });
    });
  };

  function decide(d) {
    if (guard) return;
    guard = d.state;
    onEvent({ kind: 'guard', ...d });
    if (d.state === 'off') close();
  }

  async function start() {
    const opts = options(canUseTool);
    q = query({ prompt: inbox, options: opts });
    const check = createGuardCheck({ pluginRoot });
    const map = createMapper({ cwd });
    const timer = setTimeout(() => decide({ state: 'off', cause: 'The agent did not start within 30 seconds.' }), startTimeoutMs);
    try {
      for await (const msg of q) {
        if (msg.type === 'system' && msg.subtype === 'init') sawInit = true;
        if (!guard) { const d = check(msg); if (d) { clearTimeout(timer); decide(d); } }
        for (const ev of map(msg)) {
          if (ev.kind === 'turn-end') busy = false;
          onEvent(ev);
        }
      }
    } catch (err) {
      const text = String((err && err.message) || 'exit');
      // With sandbox.failIfUnavailable at its default, a missing sandbox ends
      // the query before init; the panel words it (spec 8).
      if (!guard && /sandbox/i.test(text)) decide({ state: 'off', cause: 'sandbox' });
      else if (!closed) onEvent({ kind: 'stopped', reason: text });
    } finally {
      clearTimeout(timer);
      if (opts.resume && !sawInit) onEvent({ kind: 'resume-failed' });
      else if (!guard) decide({ state: 'off', cause: 'The agent stopped before it started.' });
      denyAll('The conversation ended.');
    }
  }

  function send(text) {
    if (guard !== 'on' || busy || closed || typeof text !== 'string' || !text.trim()) return false;
    busy = true;
    onEvent({ kind: 'you', text });
    inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    return true;
  }

  async function interrupt() {
    denyAll('The researcher stopped the agent.');
    if (q) await q.interrupt();
    busy = false;
    onEvent({ kind: 'stopped', reason: 'by-person' });
  }

  function answer(id, allow) {
    const a = asks.get(id);
    if (!a) return;
    asks.delete(id);
    a.resolve(allow ? { behavior: 'allow', updatedInput: a.input } : { behavior: 'deny', message: 'The researcher declined.' });
  }

  function close() {
    if (closed) return;
    closed = true;
    denyAll('The conversation ended.');
    inbox.end();
    if (q) q.close();
  }

  return { start, send, interrupt, answer, close };
}

module.exports = { createSession, askLine };
```

- [ ] **Step 4: Run, expect PASS**: `cd desktop && node --test test/session.test.js`

- [ ] **Step 5: Commit**

```bash
git add desktop/agent/sdk/session.js desktop/test/session.test.js
git commit -m "Agent SDK way: one conversation, guard first, asks that never hang"
```

---

### Task 8: Host process, stored settings, and the main-process controller

**Files:**
- Create: `desktop/agent/sdk/host.js`, `desktop/agent/sdk/settings.js`, `desktop/agent/sdk/controller.js`, `desktop/test/settings.test.js`, `desktop/test/host.test.js`
- Modify: `desktop/main.js`

**Interfaces:**
- Consumes: Tasks 0 to 7.
- Produces:
  - `readSettings(dataDir): { connection: Conn | null, sessions: Record<string, string> }`, `writeSettings(dataDir, patch): void` (file `<userData>/agent-sdk.json`; never a secret).
  - Host messages in: `{ type: 'test', conn, secret, base }`, `{ type: 'start', conn, secret, base, cwd, pluginRoot, shimsDir, shimEnv, resume }`, `{ type: 'send', text }`, `{ type: 'stop' }`, `{ type: 'answer', id, allow }`, `{ type: 'close' }`; out: `{ type: 'test-result', ok, error }`, `{ type: 'event', event }`. `base = { binary, configDir, home, appVersion }`.
  - `registerAgentSdk({ app, ipcMain, utilityProcess, column, dataDir, pluginRoot, keychainOpts? }): { panelPage: string, shutdown(): Promise<void> }`.
  - IPC channels (invoke): `sdk:state`, `sdk:choose-way`, `sdk:hide`, `sdk:list-models`, `sdk:connect`, `sdk:remove-connection`, `sdk:start`, `sdk:send`, `sdk:stop`, `sdk:answer`, `sdk:lookup`, `sdk:reveal`, `sdk:pick-file`, `sdk:open-external`; event to the panel: `sdk:event`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/settings.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSettings, writeSettings } = require('../agent/sdk/settings');

test('connection and session IDs are kept, a secret field is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-set-'));
  assert.deepEqual(readSettings(dir), { connection: null, sessions: {} });
  writeSettings(dir, { connection: { kind: 'gateway', url: 'https://g', model: 'm' } });
  writeSettings(dir, { sessions: { '/p': 's-1' } });
  assert.deepEqual(readSettings(dir), { connection: { kind: 'gateway', url: 'https://g', model: 'm' }, sessions: { '/p': 's-1' } });
  assert.throws(() => writeSettings(dir, { connection: { kind: 'anthropic', model: 'm', secret: 'x' } }), /secret/);
});
```

`desktop/test/host.test.js` runs `host.js` in a plain Node child with a stand-in `parentPort` (the host reads `process.parentPort` when Electron provides it, and `process` IPC otherwise):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { startFakeModel } = require('./support/fake-model');
const { binaryPath } = require('../agent/sdk/binary');

test('the host runs a connection test and reports it', { timeout: 60000 }, async () => {
  const fake = await startFakeModel({ script: [[{ type: 'text', text: 'ready' }]] });
  const child = fork(path.join(__dirname, '..', 'agent', 'sdk', 'host.js'), [], { env: { PATH: '/usr/bin:/bin' } });
  const base = { binary: binaryPath(), configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rh-cfg-')), home: os.homedir(), appVersion: '0.0.0-test' };
  child.send({ type: 'test', conn: { kind: 'gateway', url: fake.url, model: 'fake-model' }, secret: 'tok', base });
  const [reply] = await new Promise((r) => child.once('message', (m) => r([m])));
  assert.deepEqual(reply, { type: 'test-result', ok: true });
  child.kill();
  await fake.close();
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/settings.test.js test/host.test.js`

- [ ] **Step 3: Implement `settings.js`**

```js
'use strict';
// What the SDK way keeps in the app's data folder: the connection without
// its secret, and the last session ID per project.
const fs = require('node:fs');
const path = require('node:path');

const file = (dataDir) => path.join(dataDir, 'agent-sdk.json');

function readSettings(dataDir) {
  try {
    const s = JSON.parse(fs.readFileSync(file(dataDir), 'utf8'));
    return { connection: s.connection || null, sessions: s.sessions || {} };
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return { connection: null, sessions: {} };
    throw err;
  }
}

function writeSettings(dataDir, patch) {
  if (patch.connection && Object.keys(patch.connection).some((k) => /secret|key|token/i.test(k))) throw new Error('A secret does not belong in the settings file.');
  const next = { ...readSettings(dataDir), ...patch };
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file(dataDir)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file(dataDir));
}

module.exports = { readSettings, writeSettings };
```

- [ ] **Step 4: Implement `host.js`**

```js
'use strict';
// Runs in an Electron utilityProcess: one agent conversation, or one
// connection test. The secret arrives in the first message and lives only
// here and in the agent binary's environment; it is never logged.
const { createSession } = require('./session');
const { buildOptions, buildTestOptions } = require('./options');
const { testConnection } = require('./connection');

const port = process.parentPort || { on: (ev, cb) => process.on('message', (data) => cb({ data })), postMessage: (m) => process.send(m) };
const post = (m) => port.postMessage(m);
let session = null;

port.on('message', async ({ data }) => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  switch (data.type) {
    case 'test': {
      const r = await testConnection({ query, conn: data.conn, options: buildTestOptions({ ...data.base, conn: data.conn, secret: data.secret }) });
      post({ type: 'test-result', ...r });
      break;
    }
    case 'start': {
      session = createSession({
        query, pluginRoot: data.pluginRoot, cwd: data.cwd, onEvent: (event) => post({ type: 'event', event }),
        options: (canUseTool) => buildOptions({ ...data.base, conn: data.conn, secret: data.secret, cwd: data.cwd, pluginRoot: data.pluginRoot, shimsDir: data.shimsDir, shimEnv: data.shimEnv, canUseTool, resume: data.resume }),
      });
      session.start().then(() => post({ type: 'event', event: { kind: 'ended' } }));
      break;
    }
    case 'send': if (session && !session.send(data.text)) post({ type: 'event', event: { kind: 'not-sent' } }); break;
    case 'stop': if (session) await session.interrupt(); break;
    case 'answer': if (session) session.answer(data.id, data.allow); break;
    case 'close': if (session) session.close(); break;
    default: break;
  }
});
```

- [ ] **Step 5: Implement `controller.js` and wire it into `main.js`**

```js
'use strict';
// Main-process side of the SDK way: loads the panel into the agent column,
// keeps the connection, reads the secret from the Keychain and hands it to
// the host over its message port, and forwards events to the panel.
const os = require('node:os');
const path = require('node:path');
const { BrowserWindow, dialog, shell } = require('electron');
const { readAgentStore, writeAgentStore } = require('../store');
const { findStatementTokens } = require('../statement-links');
const { readSettings, writeSettings } = require('./settings');
const keychain = require('./keychain');
const connection = require('./connection');
const { binaryPath } = require('./binary');

function registerAgentSdk({ app, ipcMain, utilityProcess, column, dataDir, pluginRoot, keychainOpts = {} }) {
  const panelPage = path.join(__dirname, '..', 'panel', 'panel.html');
  const base = { binary: binaryPath(), configDir: path.join(dataDir, 'agent-sdk'), home: os.homedir(), appVersion: app.getVersion() };
  let host = null;
  let panel = null;

  const toPanel = (event) => { if (panel && !panel.isDestroyed()) panel.send('sdk:event', event); };

  function forkHost() {
    const child = utilityProcess.fork(path.join(__dirname, 'host.js'), [], { env: { PATH: '/usr/bin:/bin' }, serviceName: 'research-harness agent' });
    child.on('exit', (code) => { if (host === child) { host = null; toPanel({ kind: 'stopped', reason: `code ${code}` }); } });
    return child;
  }

  function endConversation() {
    if (!host) return;
    const h = host;
    host = null;
    h.postMessage({ type: 'close' });
    setTimeout(() => h.kill(), 3000);
  }

  async function secretFor(conn) {
    return connection.needsSecret(conn) ? keychain.readSecret(connection.secretKind(conn), keychainOpts) : null;
  }

  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => { panel = e.sender; return fn(...args); });

  handle('sdk:state', () => {
    const { connection: conn } = readSettings(dataDir);
    const project = column.currentProject();
    return { way: readAgentStore(dataDir).way, connection: conn, kindName: conn ? connection.KIND_NAMES[conn.kind] : null, project, canResume: Boolean(project && readSettings(dataDir).sessions[project]) };
  });

  handle('sdk:choose-way', (way) => {
    if (way !== 'claude-code' && way !== 'sdk') return { ok: false };
    writeAgentStore(dataDir, { way });
    if (way === 'claude-code') { endConversation(); column.showPage(path.join(__dirname, '..', 'column', 'column.html')); }  // sub-project 2's page, per Task 0
    return { ok: true };
  });

  handle('sdk:hide', () => column.hide());

  handle('sdk:list-models', async (draft, secret) => {
    const v = connection.validate({ ...draft, model: draft.model || '-' });
    if (!v.ok) return { ok: false, field: v.field, error: v.error };
    try { return { ok: true, models: await connection.listModels(v.conn, secret) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  handle('sdk:connect', async (draft, secret) => {
    const v = connection.validate(draft);
    if (!v.ok) return v;
    if (connection.needsSecret(v.conn) && !secret) return { ok: false, field: 'secret', error: 'Paste the key or token.' };
    const tester = forkHost();
    tester.postMessage({ type: 'test', conn: v.conn, secret, base });
    const result = await new Promise((resolve) => tester.once('message', resolve));
    tester.kill();
    if (!result.ok) return { ok: false, error: result.error };
    try { if (connection.needsSecret(v.conn)) await keychain.saveSecret(connection.secretKind(v.conn), secret, keychainOpts); } catch (err) { return { ok: false, error: err.message }; }
    writeSettings(dataDir, { connection: v.conn });
    return { ok: true };
  });

  handle('sdk:remove-connection', async () => {
    endConversation();
    const { connection: conn } = readSettings(dataDir);
    if (conn && connection.needsSecret(conn)) await keychain.removeSecret(connection.secretKind(conn), keychainOpts);
    writeSettings(dataDir, { connection: null });
    return { ok: true };
  });

  handle('sdk:start', async ({ resume }) => {
    endConversation();
    const { connection: conn, sessions } = readSettings(dataDir);
    const cwd = column.currentProject();
    if (!conn) return { ok: false, error: 'connect' };
    if (!cwd) return { ok: false, error: 'Open a project first.' };
    let secret;
    try { secret = await secretFor(conn); } catch (err) { return { ok: false, error: err.message, next: 'connect' }; }
    if (connection.needsSecret(conn) && !secret) return { ok: false, error: 'The key is no longer in the Keychain.', next: 'connect' };
    host = forkHost();
    const mine = host;
    host.on('message', (m) => {
      if (m.type !== 'event' || host !== mine) return;
      if (m.event.kind === 'session') writeSettings(dataDir, { sessions: { ...readSettings(dataDir).sessions, [cwd]: m.event.sessionId } });
      toPanel({ ...m.event, connKind: conn.kind });
    });
    host.postMessage({ type: 'start', conn, secret, base, cwd, pluginRoot, shimsDir: path.join(__dirname, '..', 'shims'), shimEnv: column.shimEnv(), resume: resume ? sessions[cwd] : undefined });
    return { ok: true, model: conn.model, kindName: connection.KIND_NAMES[conn.kind] };
  });

  handle('sdk:send', (text) => { if (host) host.postMessage({ type: 'send', text: String(text) }); });
  handle('sdk:stop', () => { if (host) host.postMessage({ type: 'stop' }); });
  handle('sdk:answer', (id, allow) => { if (host) host.postMessage({ type: 'answer', id: String(id), allow: allow === true }); });
  const isNumber = (n) => { const t = findStatementTokens(String(n)); return t.length === 1 && t[0].num === n; };
  handle('sdk:lookup', (number) => (isNumber(number) ? column.lookupStatement(number) : null));
  handle('sdk:reveal', (number) => (isNumber(number) ? column.revealStatement(number) : undefined));
  handle('sdk:pick-file', async () => {
    const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), { properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('sdk:open-external', (url) => { if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url); });

  column.onProjectChange(() => { endConversation(); toPanel({ kind: 'project-changed' }); });

  return {
    panelPage,
    shutdown: async () => { endConversation(); },
  };
}

module.exports = { registerAgentSdk };
```

Asking before a project or way switch ends a running conversation (spec 5.5) happens in the panel (Task 9) for switches started there, and in the shell for project switches: if sub-project 2 already asks before a project switch ends its pty, extend that question to the SDK conversation through `column.js`; otherwise the panel shows "The conversation ended because another project was opened." on `project-changed`.

In `desktop/main.js`, after the window is created and sub-project 2's column is set up:

```js
const column = require('./agent/sdk/column');
const { registerAgentSdk } = require('./agent/sdk/controller');
const { readAgentStore } = require('./agent/store');
// …inside app.whenReady, after the column exists:
column.useGitEnv(gitEnv);
const agentSdk = registerAgentSdk({ app, ipcMain, utilityProcess, column, dataDir: app.getPath('userData'), pluginRoot });
if (readAgentStore(app.getPath('userData')).way !== 'claude-code') column.showPage(agentSdk.panelPage);
app.on('before-quit', () => { agentSdk.shutdown(); });
```

The panel page gets its own preload (`agent/panel/preload.js`, Task 9). If sub-project 2's `column.showPage` takes a preload per page, pass `path.join(__dirname, 'agent', 'panel', 'preload.js')` for the panel; if the column view has one fixed preload, give it one more `contextBridge` key `agentPanel` that only exposes the `sdk:*` channels.

Add an app menu item "Agent Settings…" that calls `column.showPage(agentSdk.panelPage + '#settings')`, and make sub-project 2's "Set up the agent…" sidebar entry show the panel when no way is chosen.

- [ ] **Step 6: Run, expect PASS**: `cd desktop && npm test`

- [ ] **Step 7: Commit**

```bash
git add desktop/agent/sdk/host.js desktop/agent/sdk/settings.js desktop/agent/sdk/controller.js desktop/test/settings.test.js desktop/test/host.test.js desktop/main.js
git commit -m "Agent SDK way: host process, stored connection, main-process controller"
```

---

### Task 9: The panel page

The column page for the SDK way: the first-run choice, "Connect a model", the thread, and Settings → Agent. Built in the galley-proof world from the column in `.impeccable/mocks/decision/sketches/model-pick.html`; tokens, type and focus styles come from `plugins/research-harness/dashboard/app.html`, copied as values, never by copying the direction contract.

**Files:**
- Create: `desktop/agent/panel/panel.html`, `desktop/agent/panel/panel.css`, `desktop/agent/panel/panel.js`, `desktop/agent/panel/render.js`, `desktop/agent/panel/preload.js`, `desktop/test/render.test.js`, `desktop/test/panel.rendered.test.js`

**Interfaces:**
- Consumes: `findStatementTokens` (sub-project 2, as `window.statementLinks`), the `sdk:*` channels (Task 8).
- Produces: `window.agentPanel` from the preload: `state()`, `chooseWay(way)`, `hide()`, `listModels(draft, secret)`, `connect(draft, secret)`, `removeConnection()`, `start({ resume })`, `send(text)`, `stop()`, `answer(id, allow)`, `lookup(number)`, `reveal(number)`, `pickFile()`, `openExternal(url)`, `onEvent(cb)`. `render.js`: `renderBlocks(markdown): Block[]` where `Block = { tag: 'p' | 'ul' | 'ol', items: Inline[][] }` (`p` has one item) and `Inline = { type: 'text' | 'strong' | 'em' | 'code' | 'number' | 'url', value: string }`.

- [ ] **Step 1: Write the failing render test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.statementLinks = require('../agent/statement-links');
const { renderBlocks } = require('../agent/panel/render');

test('paragraphs, lists, emphasis and code', () => {
  assert.deepEqual(renderBlocks('One **two** *three* `four`\n\n- a\n- b\n\n1. c'), [
    { tag: 'p', items: [[{ type: 'text', value: 'One ' }, { type: 'strong', value: 'two' }, { type: 'text', value: ' ' }, { type: 'em', value: 'three' }, { type: 'text', value: ' ' }, { type: 'code', value: 'four' }]] },
    { tag: 'ul', items: [[{ type: 'text', value: 'a' }], [{ type: 'text', value: 'b' }]] },
    { tag: 'ol', items: [[{ type: 'text', value: 'c' }]] },
  ]);
});

test('statement numbers and web addresses become their own pieces', () => {
  assert.deepEqual(renderBlocks('See 3.4 and https://example.org/a.'), [{ tag: 'p', items: [[
    { type: 'text', value: 'See ' }, { type: 'number', value: '3.4' }, { type: 'text', value: ' and ' }, { type: 'url', value: 'https://example.org/a' }, { type: 'text', value: '.' },
  ]] }]);
  assert.deepEqual(renderBlocks('`3.4` stays code'), [{ tag: 'p', items: [[{ type: 'code', value: '3.4' }, { type: 'text', value: ' stays code' }]] }]);
});

test('HTML in model output is text', () => {
  const blocks = renderBlocks('<img src=x onerror=alert(1)> <script>x</script>');
  assert.deepEqual(blocks, [{ tag: 'p', items: [[{ type: 'text', value: '<img src=x onerror=alert(1)> <script>x</script>' }]] }]);
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/render.test.js`

- [ ] **Step 3: Implement `render.js`**

```js
// A small Markdown subset for agent text: paragraphs, lists, **strong**,
// *em*, `code`, statement numbers and web addresses. Returns plain data; the
// page builds DOM nodes from it with textContent, never innerHTML.
(function (root) {
  'use strict';
  const tokens = (t) => (root.statementLinks || require('../statement-links')).findStatementTokens(t);
  const URL_RE = /https:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;

  function plain(text) {
    const out = [];
    const marks = [];
    for (const m of text.matchAll(URL_RE)) marks.push({ type: 'url', index: m.index, length: m[0].length, value: m[0] });
    for (const n of tokens(text)) if (!marks.some((u) => n.start >= u.index && n.start < u.index + u.length)) marks.push({ type: 'number', index: n.start, length: n.end - n.start, value: n.num });
    marks.sort((a, b) => a.index - b.index);
    let at = 0;
    for (const m of marks) {
      if (m.index > at) out.push({ type: 'text', value: text.slice(at, m.index) });
      out.push({ type: m.type, value: m.value });
      at = m.index + m.length;
    }
    if (at < text.length) out.push({ type: 'text', value: text.slice(at) });
    return out;
  }

  function inline(text) {
    const out = [];
    const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
    let at = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > at) out.push(...plain(text.slice(at, m.index)));
      if (m[1] !== undefined) out.push({ type: 'code', value: m[1] });
      else if (m[2] !== undefined) out.push({ type: 'strong', value: m[2] });
      else out.push({ type: 'em', value: m[3] !== undefined ? m[3] : m[4] });
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push(...plain(text.slice(at)));
    return out;
  }

  function renderBlocks(markdown) {
    const blocks = [];
    for (const chunk of String(markdown).split(/\n{2,}/)) {
      const lines = chunk.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      if (lines.every((l) => /^\s*[-*] /.test(l))) blocks.push({ tag: 'ul', items: lines.map((l) => inline(l.replace(/^\s*[-*] /, ''))) });
      else if (lines.every((l) => /^\s*\d+\. /.test(l))) blocks.push({ tag: 'ol', items: lines.map((l) => inline(l.replace(/^\s*\d+\. /, ''))) });
      else blocks.push({ tag: 'p', items: [inline(lines.join(' '))] });
    }
    return blocks;
  }

  const api = { renderBlocks };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.agentRender = api;
})(typeof self !== 'undefined' ? self : this);
```

Run: `cd desktop && node --test test/render.test.js` → PASS.

- [ ] **Step 4: Write the preload**

```js
'use strict';
// The panel's only door to the app: the sdk:* channels. No write token, no
// route to the local API.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentPanel', {
  state: () => ipcRenderer.invoke('sdk:state'),
  chooseWay: (way) => ipcRenderer.invoke('sdk:choose-way', way),
  hide: () => ipcRenderer.invoke('sdk:hide'),
  listModels: (draft, secret) => ipcRenderer.invoke('sdk:list-models', draft, secret),
  connect: (draft, secret) => ipcRenderer.invoke('sdk:connect', draft, secret),
  removeConnection: () => ipcRenderer.invoke('sdk:remove-connection'),
  start: (opts) => ipcRenderer.invoke('sdk:start', opts),
  send: (text) => ipcRenderer.invoke('sdk:send', text),
  stop: () => ipcRenderer.invoke('sdk:stop'),
  answer: (id, allow) => ipcRenderer.invoke('sdk:answer', id, allow),
  lookup: (number) => ipcRenderer.invoke('sdk:lookup', number),
  reveal: (number) => ipcRenderer.invoke('sdk:reveal', number),
  pickFile: () => ipcRenderer.invoke('sdk:pick-file'),
  openExternal: (url) => ipcRenderer.invoke('sdk:open-external', url),
  onEvent: (cb) => ipcRenderer.on('sdk:event', (e, ev) => cb(ev)),
});
```

- [ ] **Step 5: Write `panel.html`**

Four views, one shown at a time (`hidden` on the others). Text exactly as below (spec 6 and 7).

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent</title>
<link rel="stylesheet" href="panel.css">
</head>
<body>
<header class="head">
  <h1>Agent</h1>
  <p id="h-model" class="meta"></p>
  <p id="h-guard" class="meta"></p>
  <p id="h-state" class="meta" aria-live="polite"></p>
</header>

<section id="v-choose" hidden aria-labelledby="choose-h">
  <h2 id="choose-h">How should the agent connect?</h2>
  <button id="way-cc" class="choice"><strong>Claude Code, with your Claude plan</strong><span>Pro, Max or Team. Uses Claude Code on this Mac.</span></button>
  <button id="way-sdk" class="choice"><strong>Pay per use</strong><span>An Anthropic API key, your institution’s gateway, or Amazon Bedrock / Google Vertex.</span></button>
  <button id="way-later" class="quiet">Not now</button>
</section>

<section id="v-connect" hidden aria-labelledby="connect-h">
  <h2 id="connect-h">Connect a model</h2>
  <fieldset>
    <legend>Connection</legend>
    <label><input type="radio" name="kind" value="anthropic" checked> Anthropic API key <span class="hint">A key from the Anthropic Console. Billed per token to that account.</span></label>
    <label><input type="radio" name="kind" value="gateway"> Institute gateway <span class="hint">An address and a token from your institution.</span></label>
    <label><input type="radio" name="kind" value="cloud"> Amazon Bedrock or Google Vertex <span class="hint">Your organisation’s cloud account.</span></label>
  </fieldset>
  <div id="f-cloud" hidden>
    <label><input type="radio" name="cloud" value="bedrock" checked> Amazon Bedrock</label>
    <label><input type="radio" name="cloud" value="vertex"> Google Vertex</label>
  </div>
  <label id="l-url" hidden>Gateway address <input id="f-url" type="url" autocomplete="off" spellcheck="false"></label>
  <label id="l-region" hidden>Region <input id="f-region" autocomplete="off" spellcheck="false"></label>
  <div id="f-bedrock-auth" hidden>
    <label><input type="radio" name="bauth" value="profile" checked> AWS profile on this Mac <input id="f-profile" autocomplete="off" spellcheck="false" aria-label="AWS profile name"></label>
    <label><input type="radio" name="bauth" value="key"> Bedrock API key</label>
  </div>
  <label id="l-project" hidden>Google Cloud project ID <input id="f-project" autocomplete="off" spellcheck="false"></label>
  <label id="l-secret">Key or token <input id="f-secret" type="password" autocomplete="off" spellcheck="false"></label>
  <p><button id="get-key" class="quiet">Get a key</button></p>
  <label>Model <input id="f-model" list="models" autocomplete="off" spellcheck="false"><datalist id="models"></datalist></label>
  <p class="note">Stored in the macOS Keychain, never in the project. Usage is billed per token to the account behind the key. A Claude Pro plan does not cover it; Max and Team plans include monthly API credits.</p>
  <p id="connect-error" class="problem" role="alert" hidden></p>
  <button id="connect-go">Test connection and continue</button>
</section>

<section id="v-thread" hidden>
  <div id="resume" hidden><button id="resume-go">Continue last conversation</button> <button id="new-go" class="quiet">New conversation</button></div>
  <ol id="thread" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with the agent"></ol>
  <p id="pending" class="pending" aria-hidden="true"></p>
  <p class="rule">The agent proposes. Accepting, choosing a framing, starting a session and handing over the project key stay with you.</p>
  <div class="quick">
    <button data-cmd="/research-harness:canvas">Continue canvas</button>
    <button data-cmd="/research-harness:canvas-review">Review canvas</button>
    <button id="q-note">Literature note…</button>
  </div>
  <form id="compose">
    <label for="msg" class="sr">Message to the agent</label>
    <textarea id="msg" rows="3"></textarea>
    <button id="send" type="submit">Send</button>
    <button id="stop" type="button" hidden>Stop</button>
  </form>
  <p id="usage" class="meta"></p>
</section>

<section id="v-settings" hidden aria-labelledby="settings-h">
  <h2 id="settings-h">Agent settings</h2>
  <p id="s-current"></p>
  <button id="s-change">Change connection…</button>
  <button id="s-remove">Remove connection</button>
  <button id="s-way">Use Claude Code instead…</button>
  <button id="s-back" class="quiet">Back</button>
</section>

<script src="../statement-links.js"></script>
<script src="render.js"></script>
<script src="panel.js"></script>
</body>
</html>
```

`panel.css`: the world's tokens for light and dark (`prefers-color-scheme`), the shell's focus ring, type in `clamp()` like the shell; red stays for queries, so the refusal line uses ink, the `i-problem` icon shape and words. The thread has a reading measure; tool lines are small caps-free secondary text, folded (`<details>`). The `.sr` class hides labels visually only. Below the shell's breakpoint the column is folded by sub-project 2's toggle; the page itself reflows down to 280 px without horizontal scrolling.

- [ ] **Step 6: Write `panel.js`**

```js
'use strict';
// The SDK way's column page. Every piece of model text goes through
// agentRender and textContent; nothing is inserted as HTML.
(function () {
  const api = window.agentPanel;
  const $ = (id) => document.getElementById(id);
  const views = ['v-choose', 'v-connect', 'v-thread', 'v-settings'];
  const show = (id) => views.forEach((v) => { $(v).hidden = v !== id; });
  let connKind = null;
  let tokens = 0;
  let costUsd = 0;
  let pendingText = '';

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

  async function inlineNode(piece) {
    if (piece.type === 'strong' || piece.type === 'em' || piece.type === 'code') return el(piece.type, null, piece.value);
    if (piece.type === 'url') {
      const span = el('span', 'url', piece.value);
      const open = el('button', 'quiet', 'Open');
      open.setAttribute('aria-label', `Open ${piece.value}`);
      open.addEventListener('click', () => api.openExternal(piece.value));
      const wrap = el('span'); wrap.append(span, ' ', open); return wrap;
    }
    if (piece.type === 'number') {
      const words = await api.lookup(piece.value);
      if (!words) return document.createTextNode(piece.value);
      const a = el('a', 'stmt', piece.value);
      a.href = '#'; a.title = words;
      a.addEventListener('click', (e) => { e.preventDefault(); api.reveal(piece.value); });
      return a;
    }
    return document.createTextNode(piece.value);
  }

  async function agentText(text) {
    const li = el('li', 'agent');
    li.append(el('span', 'who', 'Agent'));
    for (const block of agentRender.renderBlocks(text)) {
      const node = el(block.tag);
      for (const item of block.items) {
        const holder = block.tag === 'p' ? node : node.appendChild(el('li'));
        for (const piece of item) holder.append(await inlineNode(piece));
      }
      li.append(node);
    }
    return li;
  }

  function add(node) { $('thread').append(node); node.scrollIntoView({ block: 'end' }); }

  function setWorking(on) {
    $('send').disabled = on; $('stop').hidden = !on; $('msg').readOnly = on;
    $('h-state').textContent = on ? 'Working' : 'Ready';
  }

  function usageLine() {
    let line = `This conversation: ${tokens.toLocaleString('en')} tokens`;
    if (connKind === 'anthropic' && costUsd > 0) line += `, about $${costUsd.toFixed(2)} at Anthropic’s list prices`;
    $('usage').textContent = line;
  }

  async function onEvent(ev) {
    switch (ev.kind) {
      case 'guard':
        if (ev.state === 'on') { $('h-guard').textContent = `Guard on · research-harness ${ev.version}`; setWorking(false); }
        else {
          $('h-guard').textContent = 'Guard off'; $('h-state').textContent = 'Stopped';
          add(el('li', 'problem', ev.cause === 'sandbox' ? 'The agent’s sandbox could not start, so the agent stays off.' : `The guard did not start, so the agent stays off. ${ev.cause}`));
          setWorking(false); $('send').disabled = true;
        }
        break;
      case 'you': { const li = el('li', 'you'); li.append(el('span', 'who', 'You'), el('p', null, ev.text)); add(li); break; }
      case 'delta': pendingText += ev.text; $('pending').textContent = pendingText; break;
      case 'text': pendingText = ''; $('pending').textContent = ''; add(await agentText(ev.text)); break;
      case 'tool': { const d = el('details', 'tool'); d.append(el('summary', null, ev.line)); add(el('li', 'tool-line')).append(d); break; }
      case 'refusal': {
        const li = el('li', 'refusal');
        li.append(el('p', null, ev.tool === 'Bash' && /accept/.test(ev.reason) ? 'Refused by the guard: accepting is your step.' : 'Refused by the guard: this step is yours.'));
        if (ev.statement) { const b = el('button', 'quiet', `Open ${ev.statement}`); b.addEventListener('click', () => api.reveal(ev.statement)); li.append(b); }
        const d = el('details'); d.append(el('summary', null, 'The guard’s reason'), el('p', null, ev.reason)); li.append(d);
        add(li); break;
      }
      case 'ask': {
        const li = el('li', 'ask');
        li.append(el('p', null, `The agent wants to: ${ev.line}`));
        const yes = el('button', null, 'Allow once'); const no = el('button', 'quiet', 'Deny');
        const done = (allow) => { api.answer(ev.id, allow); yes.disabled = true; no.disabled = true; li.append(el('p', 'meta', allow ? 'Allowed once.' : 'Denied.')); };
        yes.addEventListener('click', () => done(true)); no.addEventListener('click', () => done(false));
        li.append(yes, ' ', no); add(li); yes.focus(); break;
      }
      case 'usage': tokens += ev.tokens; costUsd += ev.costUsd; connKind = ev.connKind || connKind; usageLine(); break;
      case 'error': add(el('li', 'problem', errorWords(ev.code))); break;
      case 'turn-end':
      case 'not-sent': setWorking(false); break;
      case 'stopped':
        setWorking(false); $('h-state').textContent = 'Stopped';
        add(el('li', 'meta', ev.reason === 'by-person' ? 'Stopped.' : `The agent stopped (${ev.reason}).`));
        if (ev.reason !== 'by-person') { const again = el('button', null, 'Start again'); again.addEventListener('click', () => begin(false)); add(el('li')).append(again); }
        break;
      case 'resume-failed': add(el('li', 'meta', 'The last conversation could not be found; started a new one.')); begin(false); break;
      case 'project-changed': add(el('li', 'meta', 'The conversation ended because another project was opened.')); enterThread(); break;
      default: break;
    }
  }

  function errorWords(code) {
    if (code === 'rate_limit' || code === 'overloaded') return 'The model is busy or the usage limit is reached. Try again in a minute.';
    if (code === 'authentication_failed') return 'The key was refused. Change it in Agent settings.';
    if (code === 'billing_error') return 'The account behind the key has no credit left.';
    return `The model did not answer as expected (${code}).`;
  }

  async function begin(resume) {
    $('resume').hidden = true;
    $('h-state').textContent = 'Starting';
    const r = await api.start({ resume });
    if (!r.ok) { if (r.next === 'connect' || r.error === 'connect') return enterConnect(r.error === 'connect' ? '' : r.error); add(el('li', 'problem', r.error)); return; }
    $('h-model').textContent = `${r.model} · ${r.kindName}`;
    $('send').disabled = true;
  }

  async function enterThread() {
    show('v-thread');
    const s = await api.state();
    $('h-model').textContent = s.connection ? `${s.connection.model} · ${s.kindName}` : '';
    connKind = s.connection && s.connection.kind;
    if (s.canResume) { $('resume').hidden = false; $('resume-go').focus(); } else begin(false);
  }

  function draft() {
    const kind = document.querySelector('input[name=kind]:checked').value;
    const cloud = document.querySelector('input[name=cloud]:checked').value;
    const k = kind === 'cloud' ? cloud : kind;
    return { kind: k, model: $('f-model').value, url: $('f-url').value, region: $('f-region').value, projectId: $('f-project').value, profile: $('f-profile').value, auth: document.querySelector('input[name=bauth]:checked').value };
  }

  function layoutConnect() {
    const d = draft();
    $('f-cloud').hidden = !(d.kind === 'bedrock' || d.kind === 'vertex');
    $('l-url').hidden = d.kind !== 'gateway';
    $('l-region').hidden = !(d.kind === 'bedrock' || d.kind === 'vertex');
    $('f-bedrock-auth').hidden = d.kind !== 'bedrock';
    $('l-project').hidden = d.kind !== 'vertex';
    $('l-secret').hidden = !(d.kind === 'anthropic' || d.kind === 'gateway' || (d.kind === 'bedrock' && d.auth === 'key'));
    $('get-key').hidden = d.kind !== 'anthropic';
  }

  function enterConnect(message) {
    show('v-connect'); layoutConnect();
    $('connect-error').hidden = !message; $('connect-error').textContent = message || '';
    document.querySelector('input[name=kind]:checked').focus();
  }

  async function refreshModels() {
    const d = draft();
    if (!(d.kind === 'anthropic' || d.kind === 'gateway') || !$('f-secret').value) return;
    const r = await api.listModels(d, $('f-secret').value);
    const list = $('models'); list.replaceChildren();
    if (r.ok && r.models) for (const m of r.models) { const o = document.createElement('option'); o.value = m; list.append(o); }
  }

  $('way-cc').addEventListener('click', () => api.chooseWay('claude-code'));
  $('way-sdk').addEventListener('click', async () => { await api.chooseWay('sdk'); enterConnect(); });
  $('way-later').addEventListener('click', () => api.hide());
  document.querySelectorAll('#v-connect input[type=radio]').forEach((r) => r.addEventListener('change', layoutConnect));
  $('f-secret').addEventListener('change', refreshModels);
  $('f-url').addEventListener('change', refreshModels);
  $('get-key').addEventListener('click', () => api.openExternal('https://console.anthropic.com/settings/keys'));
  $('connect-go').addEventListener('click', async () => {
    $('connect-go').disabled = true; $('connect-error').hidden = true; $('h-state').textContent = 'Testing the connection';
    const r = await api.connect(draft(), $('f-secret').value);
    $('connect-go').disabled = false; $('h-state').textContent = '';
    if (!r.ok) { $('connect-error').textContent = r.error; $('connect-error').hidden = false; return; }
    $('f-secret').value = '';
    enterThread();
  });
  $('resume-go').addEventListener('click', () => begin(true));
  $('new-go').addEventListener('click', () => begin(false));
  $('compose').addEventListener('submit', (e) => { e.preventDefault(); const t = $('msg').value; if (!t.trim()) return; setWorking(true); api.send(t); $('msg').value = ''; });
  $('msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('compose').requestSubmit(); });
  $('stop').addEventListener('click', () => api.stop());
  document.querySelectorAll('.quick [data-cmd]').forEach((b) => b.addEventListener('click', () => { setWorking(true); api.send(b.dataset.cmd); }));
  $('q-note').addEventListener('click', async () => { const f = await api.pickFile(); if (f) { setWorking(true); api.send(`/research-harness:literature-note ${f}`); } });
  $('s-change').addEventListener('click', () => { if (confirmEnd()) enterConnect(); });
  $('s-remove').addEventListener('click', async () => { if (!confirmEnd()) return; await api.removeConnection(); enterConnect(); });
  $('s-way').addEventListener('click', () => { if (confirmEnd()) api.chooseWay('claude-code'); });
  $('s-back').addEventListener('click', enterThread);

  // Ending a running conversation is asked first (spec 5.5, 7). A small
  // in-page question, not a browser dialog, keeps focus in the column.
  function confirmEnd() {
    if ($('stop').hidden && !$('thread').children.length) return true;
    return window.confirm('This ends the current conversation. Continue?');
  }

  api.onEvent(onEvent);
  (async () => {
    const s = await api.state();
    if (location.hash === '#settings' && s.connection) { show('v-settings'); $('s-current').textContent = `${s.kindName}, model ${s.connection.model}.`; $('s-change').focus(); return; }
    if (!s.way) { show('v-choose'); $('way-cc').focus(); return; }
    if (!s.connection) return enterConnect();
    enterThread();
  })();
})();
```

Replace `window.confirm` with an in-page question built like the shell's dialogs (`.dlg` in `dashboard/app.html`: what will happen in plain words, "End conversation" and "Cancel", focus returns to the control that opened it). The shell spec's rule is that each dialog says what will happen before it happens; `window.confirm` cannot be styled or tested in the rendered test.

- [ ] **Step 7: Write the rendered test**

`desktop/test/panel.rendered.test.js` loads `panel.html` from disk in Chromium (Playwright through `NODE_PATH`, skipped without it, as `desktop/test/smoke.test.js` does) with a stand-in `agentPanel` injected through `addInitScript`; the stand-in records calls and lets the test push events. Use `focusContrastRatios` and `documentWidths` from `plugins/research-harness/test/helpers/a11y.js`.

Cases, each in light and dark (`colorScheme`):
- first start: "How should the agent connect?" with three buttons; Tab order way-cc → way-sdk → Not now; focus ring contrast ≥ 3:1 on each.
- connect: choosing "Institute gateway" shows the address field and hides "Get a key"; a stand-in `connect` returning `{ ok: false, error: 'The token was refused.' }` shows that text next to the button, and the secret field keeps its value.
- thread: push `guard on`, then `you`, `delta('see 3.')`, `delta('4')`, `text('see 3.4 and 9.99')` with `lookup('3.4')` → `'Uptake may be a property'` and `lookup('9.99')` → `null`: exactly one link `3.4` with that title; clicking it calls `reveal('3.4')`; the pending line is empty afterwards.
- refusal: push a `refusal` for Bash with statement `3.2`: the line reads "Refused by the guard: accepting is your step.", has "Open 3.2", and uses no red (`color` of the line equals the ink token).
- ask: push an `ask`; focus moves to "Allow once"; clicking "Deny" calls `answer(id, false)` and disables both buttons.
- XSS: push `text('<img src=x onerror="window.pwned=1">')`: `window.pwned` stays undefined and no `img` element exists in `#thread`.
- usage: with `connKind: 'gateway'` the line has no `$`; with `connKind: 'anthropic'` it has "at Anthropic’s list prices".
- log region: `#thread` has `role="log"`; the streamed `#pending` line is `aria-hidden`.
- reflow: at 280 px width, `documentWidths` shows no horizontal overflow.
- keyboard: from the message field, Cmd+Enter sends; Send is disabled and Stop visible while Working; Escape does not clear the field.

- [ ] **Step 8: Run, expect PASS**: `cd desktop && NODE_PATH=<node_modules with playwright> node --test test/render.test.js test/panel.rendered.test.js`

- [ ] **Step 9: Commit**

```bash
git add desktop/agent/panel desktop/test/render.test.js desktop/test/panel.rendered.test.js
git commit -m "Agent SDK way: the column page, first run, connect, thread and settings"
```

---

### Task 10: Electron smoke test

**Files:**
- Create: `desktop/test/smoke-sdk.test.js`
- Modify: `desktop/agent/sdk/controller.js` (test-only Keychain path)

**Interfaces:**
- Consumes: everything above; `startFakeModel` (Task 1).

- [ ] **Step 1: Test-only Keychain**

In `main.js`, pass `keychainOpts: process.env.RESEARCH_HARNESS_TEST_USER_DATA && process.env.RESEARCH_HARNESS_TEST_SECURITY ? { security: process.env.RESEARCH_HARNESS_TEST_SECURITY } : {}` to `registerAgentSdk`. The override only applies together with the test data folder, so a normal start always uses `/usr/bin/security`.

- [ ] **Step 2: Write the test**

Same frame as `desktop/test/smoke.test.js` (Playwright's Electron launcher, `RESEARCH_HARNESS_TEST_USER_DATA` in a temp folder, skipped without Playwright), plus:

1. Start the fake model with the script `[[{ type: 'text', text: 'Statement 1.1 holds; 9.999 does not exist.' }]]`.
2. Write the fake `security` from `desktop/test/keychain.test.js` (move `fakeSecurity()` into `desktop/test/support/fake-security.js` and require it from both tests) and set `RESEARCH_HARNESS_TEST_SECURITY` to it.
3. Copy `plugins/research-harness/test/fixtures/voice-uptake` to a temp folder. Stub the folder dialog in the main process: `await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, fixture)`, then click "Open project…" in the shell.
4. In the column: "Pay per use", then "Institute gateway", the fake's URL, the token `fake-secret-<hex>`, the model `fake-model`, "Test connection and continue".
5. The header shows `Guard on · research-harness ` followed by the plugin's version.
6. Type "Hello" and send. The reply shows `1.1` as a link and `9.999` as text. Clicking `1.1` lights the statement in the session view (the same check sub-project 2's smoke test uses for its links).
7. In the column page: `typeof window.harnessHost`, `typeof window.fetch === 'function' && (await fetch('/api/state').catch(() => 'blocked'))`: the column page has no host bridge of the shell and no route to the local API (a `file:` page cannot reach `http://127.0.0.1`; the request fails).
8. No file under the user data folder contains the token (scan as the shell smoke test does, but for the token string).

- [ ] **Step 3: Run, expect PASS**: `cd desktop && NODE_PATH=<node_modules with playwright> node --test test/smoke-sdk.test.js`

- [ ] **Step 4: Build check**

```bash
cd desktop && npm run dist
ls dist/arm64/mac-arm64/Placet.app/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude
du -sh dist/arm64/mac-arm64/Placet.app
```
Write the app's size before and after this sub-project into "Task 1 results" (spec §10 expects about +240 MB).

- [ ] **Step 5: Commit**

```bash
git add desktop/test/smoke-sdk.test.js desktop/test/support/fake-security.js desktop/test/keychain.test.js desktop/main.js docs/superpowers/plans/2026-10-15-desktop-app-agent-sdk.md
git commit -m "Agent SDK way: Electron smoke test against the fake model"
```

---

### Task 11: Finish review and owner check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-desktop-app-agent-sdk-design.md` (only §3 "Assumed, not checked": each item becomes "Checked" with the Task 1 line, or stays a limit in §10)

- [ ] **Step 1: Whole suite**: `cd desktop && npm test` and the rendered and Electron tests with `NODE_PATH`; `cd plugins/research-harness && npm test` to show the plugin is unchanged.

- [ ] **Step 2: Finish review** with `impeccable:impeccable-finish-reviewer` against the direction contract and the column in `model-pick.html`: both themes, the refusal line, the ask block, the connect form. Fix what it lists.

- [ ] **Step 3: Update spec §3** from "Task 1 results"; commit: `git commit -am "Spec, sub-project 3: assumptions checked against the real binary"`.

- [ ] **Step 4: Owner check.** Ask the owner to do, on a Mac user account without developer tools, with the built app: success items 1 to 4 of spec §1 once with an Anthropic API key and once through the KIT gateway; Bedrock and Vertex only if they have such an account. Record in the vault block for research-harness what was done, with which connection, and what failed.

---

## Task 1 results

Run on 2026-10-16 on an Apple silicon Mac, Node 24.16, with the fake model only (no key, gateway or account). C10 was run at the end of Task 3; still to add: the app size from Task 10.

SDK 0.3.295 pinned on 2026-10-16 at 7 days old, an exception to the 14-day rule because 2.1.295 is the guard's floor (`onFailure`). It meets the rule from 2026-10-22; no release with sub-project 3 before then.

**Stop rule: C2 FAILS as written.** C1, C3, C4, C5, C6 and C9 pass. The owner decides what C2 means for spec 5.6 before Task 5 starts; see "What C2 shows" below.

SDK `@anthropic-ai/claude-agent-sdk` 0.3.295, bundled binary "2.1.295 (Claude Code)". The lines are the script's output, unchanged, except that the C16 lines come from a second run after `node scripts/dist.js --arch arm64` (C16 needs the built app; the first run's "no built app" line is left out), and the C10 line comes from `node scripts/check-agent-sdk.js --only C10` at the end of Task 3 (the first run's "not run" line is left out):

```text
INFO C0 SDK 0.3.295; node v24.16.0; darwin-arm64; 2026-10-15
PASS C1 binary says "2.1.295 (Claude Code)"; needs 2.1.295 or later; SDK 0.3.295
FAIL C2 no user message for 20 s; order of system messages: hook_started(SessionStart), hook_response(SessionStart:success); SessionStart outcome success, context starts "research-harness · paper project "voice-..."; init lists no research-harness plugin; model requests before a message: 0
INFO C2 asked with no message yet: initializationResult answered (plugins_applied undefined, hooks_applied undefined, 7 research-harness commands such as research-harness:accept, research-harness:canvas, 6 models); reloadPlugins listed research-harness 0.6.0 /plugin; cc-plugin-agents-md  builtin; cc-plugin-plugin-authoring  builtin
INFO C2 with a first message: message order system/hook_started, system/hook_response, system/init, system/status, assistant, result/success; SessionStart response at index 1, init at index 2; init arrived -58 ms before the first model request
PASS C3 Bash result "PreToolUse:Bash hook error: Accepting a statement is the researcher's act, so `research-ha..."; Edit result "PreToolUse:Edit hook error: A [proposed] statement cannot be promoted to [accepted] by the..."; canvas bytes unchanged; canUseTool called for: nothing
INFO C3 45 messages written to test/fixtures/sdk-messages/guard.jsonl
PASS C4 tool result is not an error: "research-harness · paper project "voice-uptake" · profile is-qualitative · mode seed Elements: 1 stated (+1 proposal) · 2 open (1 proposal) ..."
PASS C5 "env" printed 61 lines, secret absent; the echo printed "[]"; ANTHROPIC_AUTH_TOKEN in "env": not listed
PASS C6 3 files under the config folder, 0 contain the secret; 2 files in the project folder, 0 contain it
PASS C7 hosts the binary tried to reach through the proxy: none; the turn finished
INFO C8 WebFetch: canUseTool called (blockedPath none); the model was shown "denied by the check script"
INFO C8 Read: canUseTool called (blockedPath none); the model was shown "1 ## 2 # Host Database 3 # 4 # localhost is used to configure the loopback interface 5 # w..."
INFO C8 Write: canUseTool not called; the model was shown "File created successfully at: /project/research/notes-check.md (file state is current in y..."
INFO C8 Skill: canUseTool not called; the model was shown "Launching skill: research-harness:canvas"
INFO C8 Task: canUseTool not called; the model was shown "Async agent launched successfully. (This tool result is internal metadata — never quote or..."
INFO C8 canUseTool saw, in order: WebFetch,Read; tool calls the model made: WebFetch, Read, Write, Skill, Agent; result success, 7 turns
PASS C9 the subagent's Bash result: "PreToolUse:Bash hook error: Accepting a statement is the researcher's act, so `research-harness accept` cannot..." (subagent tool "Task")
PASS C10 read equals what was written; after remove, read is null
PASS C11 16 requests reached the fake; 16 carried "authorization: Bearer fake-bedrock-..."; paths: /inference-profiles, /model/<id>/invoke, /model/<id>/invoke-with-response-stream; real Bedrock stays untested; query ended with: Claude Code returned an error result: There's an issue with the selected model (fake-model). It may not exist or you may not have access to it.
INFO C12 resume of a session that does not exist: messages result/error_during_execution (error); result error_during_execution errors=["No conversation found with session ID: 347fe209-70cd-40d6-9201-80ed5031a110"]; the query threw "Claude Code returned an error result: No conversation found with session ID: 347fe209-70cd-40d6-9201-80ed5031a110"; stderr "No conversation found with session ID: 347fe209-70cd-40d6-9201-80ed5031a110"; 929 ms
INFO C13 401 authentication_error: assistant error "none"; result subtype "none"; api retry messages 9 (first: attempt 1 of 10, status 401, error authentication_failed, wait 545 ms); ended after 122007 ms (cut off by the script, still running)
INFO C13 connection refused (127.0.0.1:9): assistant error "none"; result subtype "none"; api retry messages 10 (first: attempt 1 of 10, status null, error unknown, wait 547 ms); ended after 152120 ms (cut off by the script, still running)
INFO C13 404 model not found: assistant error "model_not_found"; result subtype "success, is_error"; api retry messages 0; ended after 2114 ms; threw "Claude Code returned an error result: There's an issue with the selected model (fake-model). It may not exist or you may not have access to it."
INFO C13 401 authentication_error with CLAUDE_CODE_MAX_RETRIES=1: assistant error "authentication_failed"; result subtype "success, is_error"; api retry messages 1 (first: attempt 1 of 1, status 401, error authentication_failed, wait 587 ms); ended after 1107 ms; threw "Claude Code returned an error result: Not logged in · Please run /login"
INFO C13 connection refused with CLAUDE_CODE_MAX_RETRIES=1: assistant error "server_error"; result subtype "success, is_error"; api retry messages 1 (first: attempt 1 of 1, status null, error unknown, wait 555 ms); ended after 1056 ms; threw "Claude Code returned an error result: API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)"
INFO C14 2 results; turn 1: usage in/out 10/5, total_cost_usd 0.000105, num_turns 1; turn 2: usage in/out 10/5, total_cost_usd 0.00021, num_turns 1; the fake reports 10/5 tokens per request, so usage is per turn for usage; total_cost_usd is cumulative
INFO C15 main-model requests 1; the last contains text from skills/canvas/SKILL.md ("You are filling"); any request contains it: true; init slash_commands include research-harness:canvas: true; result success
PASS C16 unpacked binary runs and prints "2.1.295 (Claude Code)"
INFO C16 codesign: Signature=adhoc; Identifier=claude-555549444c4c441055553144a1ff5d6d733a67f3
```

Information only: the same script on SDK 0.3.287 (the newest release that met the 14-day rule on the day, binary "2.1.287 (Claude Code)") gave the same status on every line except C1, which failed (2.1.287 is below the floor). Only timings and session IDs differed. That is why the pin moved to 0.3.295.

### What C2 shows

- The SessionStart hook runs when the binary starts, not when the first message arrives: its `hook_response` (outcome `success`, `additionalContext` starting `research-harness · paper project ...`) came with no message sent and no model request made.
- The `system/init` message does not come until the first message. With a message, the order is `hook_started`, `hook_response`, `init`, `status`, then the first assistant message. So the plan's wording "init listing `research-harness` before any user message" cannot hold; the person's first message is what releases `init`.
- What the host can ask before the first message: `query.initializationResult()` answers (7 `research-harness:*` commands, the model list) and `query.reloadPlugins()` lists `research-harness` 0.6.0 with the bundled plugin's path. The fields `plugins_applied` and `hooks_applied` of `initializationResult()` are absent on 2.1.295.
- Spec 5.6 ("the guard has to be seen to start before the person's first message goes out") can therefore be built from the SessionStart `hook_response` plus `reloadPlugins()`, not from `init`. Task 5 (`guard-check.js`) and Task 7 (start-up order) must use those two. The owner decides whether that meets 5.6.

### What the later tasks must know

- **Start-up order** (C2): `hook_started(SessionStart)`, `hook_response(SessionStart)` before any message; `init` only after the first message, a few tens of milliseconds before the first model request. The recorded messages of the guard run are in `desktop/test/fixtures/sdk-messages/guard.jsonl` (45 messages, paths replaced by `/project`, `/plugin`, `/config`, `/home`).
- **The guard decides before `canUseTool`** (C3, C9): a denied `research-harness accept` and a denied promotion to `[accepted]` come back as tool results starting `PreToolUse:Bash hook error:` and `PreToolUse:Edit hook error:`, and `canUseTool` is never called for them. A subagent's Bash call is guarded the same way. The sandbox, the node shim and the plugin's `bin/` work together (C4), and a sandboxed `env` shows no secret (C5, C6).
- **Which tools ask** (C8, `permissionMode: 'acceptEdits'`, the tool list of spec 5.3): `canUseTool` was called for `WebFetch` and for `Read` of a file outside the project (`blockedPath` was empty for both). It was not called for `Write` inside the project, `Skill` or the subagent tool. The binary lists the subagent tool as `Task` in `init.tools` but shows it to the model as `Agent`; Task 7 should treat both names as one.
- **Test connection must lower the retry count** (C13): by default the binary retries a 401 and a refused connection ten times and was still retrying after 122 s and 152 s. With `CLAUDE_CODE_MAX_RETRIES=1` a 401 ends in about one second (assistant `error: 'authentication_failed'`, text "Not logged in · Please run /login", which says nothing about keys, so Task 4 needs its own words) and a refused connection ends as `server_error` with "API Error: Connection refused ... (ECONNREFUSED)". A missing model ends at once as `model_not_found` ("There's an issue with the selected model (...)"), without any retry. In each case the query iterator throws after the result message.
- **Resume of a missing session** (C12): a result with subtype `error_during_execution` and `errors: ["No conversation found with session ID: <id>"]`, then the iterator throws the same text, in under a second. Task 7 can show "The last conversation could not be found; started a new one." on that text.
- **Usage** (C14): `usage` of a result is per turn; `total_cost_usd` is cumulative over the query, so a per-turn figure is the difference of two results.
- **Skill as the message** (C15): sending `/research-harness:canvas` puts the skill's text into the model's request.
- **Keychain** (C10, Task 3): C10 and the probes behind the points below used the real login Keychain under the service `research-harness-desktop-check`, with made-up values, and deleted every item again. `security -i` parses `quote()` as written: double quotes, backslashes, a single quote, `#`, spaces, non-ASCII letters and an attempt to close the quote and add options were all stored byte for byte. `keychain.js` differs from the code in Step 3 in two places. `find-generic-password -w` prints a key with a non-ASCII byte as bare hex (the C10 key comes back as `61206222635c6420c3bc`), which cannot be told from a key that is hex, so `readSecret` reads with `-g`, whose stderr line marks the hex form with `0x`. And `security -i` reads at most 4095 bytes of a line, newline included: the rest runs as a command of its own, whose error repeats it (`unknown command "..."`, exit 1), so a key that makes the line longer is refused as `bad-secret` (4024 bytes inside the quotes with the default service and `anthropic`). The errors of `saveSecret` and `readSecret` carry fixed text, never `security`'s output, so Task 8 can show `err.message`; `bad-secret` also covers C1 control characters and the Unicode line and paragraph separators. Spec 5.4 still says reads use `-w`.
- **Bedrock** (C11): `AWS_BEARER_TOKEN_BEDROCK` with `CLAUDE_CODE_USE_BEDROCK=1` is sent as `authorization: Bearer ...` to `ANTHROPIC_BEDROCK_BASE_URL`; the binary also asks `/inference-profiles`. Real Bedrock stays untested.
- **No traffic to other hosts** (C7): a plain turn with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and a refusing proxy reached no host other than the fake model, so nothing goes into spec 10 for C7.
- **Packaging** (C16): the builder configuration is `BASE` in `desktop/lib/distribution.js` (there is no `electron-builder.yml`), and `asarUnpack` there now names `node_modules/@anthropic-ai/claude-agent-sdk-darwin-*/**`. In the arm64 build the unpacked binary runs from `Placet.app/Contents/Resources/app.asar.unpacked/...` and was re-signed ad hoc by the builder. `npm run dist` builds both processors, but only the `darwin-arm64` package is installed, so an x64 build would carry the arm64 binary: the release build has to install the other processor's package first, as `dist.js` does for dugite's git. The unsigned arm64 app is 719 MB (dmg 288 MB); the SDK adds about 224 MB for its binary and 83 packages.
- **Run time**: `npm run check-agent-sdk` takes about six minutes; more than four of them are the two C13 cases that run into the script's cut-off. The arm64 build was made with `node scripts/dist.js --arch arm64` instead of `npm run dist`, to skip the x64 build.
