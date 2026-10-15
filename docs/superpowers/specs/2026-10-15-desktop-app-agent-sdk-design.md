# Desktop app, sub-project 3: the agent panel on the Claude Agent SDK

Status: approved by the owner, 2026-10-15. Built after sub-projects 1 and 2.
Decision record: the owner's project notes, blocks of 2026-10-14 ("Desktop-App mit eigenem
Agenten") and 2026-10-15. Builds on the approved shell spec
`docs/superpowers/specs/2026-10-15-desktop-app-shell-design.md` (`990bbed`), the approved sub-project 2 spec
`docs/superpowers/specs/2026-10-15-desktop-app-claude-code-design.md` (`03d652b`), and the direction
contract `.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md` (`5d7f17d`). Mock
for the column: `.impeccable/mocks/decision/sketches/model-pick.html`. Old mockup, still the
reference for the "Connect a model" flow (not the look):
`docs/superpowers/specs/2026-10-14-desktop-app-mockup.html`, tab "Weg 1 · API".

## 1. Goal

A researcher who pays for model access per use, or whose institution provides it, works with the
agent inside the app window: the session view in the centre, the app's own agent thread in the
column on the right. The agent runs on the Claude Agent SDK, with the research-harness guard active,
and the person never opens Terminal.

Success, all five:

1. On a Mac user account without developer tools, the person connects the agent in the column with
   one of: an Anthropic API key, an institute gateway (a URL and a token), Amazon Bedrock or Google
   Vertex. A key or token ends up in the macOS Keychain and in no file.
2. The agent proposes statements that appear as margin queries in the session view; asked to accept
   one, it is refused by the guard, and the thread says that this step is the person's.
3. A statement number such as 3.4 in the agent's reply is a link that shows that statement.
4. On first start the person chooses between Claude Code (sub-project 2) and this way, and can
   switch later.
5. The owner has done 1 to 4 once with an Anthropic API key and once through the KIT gateway.
   Bedrock and Vertex are checked only if the owner has such an account; otherwise the spec says
   they are untested.

## 2. Decided before this spec

From the owner's project notes, in the words recorded there: the app gets its own agent; on first start the person
picks one of two ways and can switch later; way 1 (this sub-project) is an agent panel on the Agent
SDK with an API key, an institute gateway or Bedrock/Vertex, credentials in the macOS Keychain; way 2
is Claude Code with the person's own plan. The SDK docs forbid third parties to offer claude.ai login
unless approved; Pro includes no API usage, Max and Team include monthly API credits. v1 is macOS
only. Order 1 → 2 → 3. The galley-proof world applies to the whole window, including the binding
addition that statement numbers in the agent thread link to the statement.

From the shell spec: the column is reserved and hidden in sub-project 1; the app bundles its own copy
of the plugin; an agent that drives the window through macOS accessibility is invisible to the guard
(§7). From the sub-project 2 draft: the column is an Electron view owned by `desktop/`, placed by the
main process over the area the shell reserves, with no write token and no route to the local API;
`agent.way` lives in the app's data folder; statement numbers `N.k` come from
`hooks/lib/numbers.js`; `desktop/agent/shims/` puts the app's own Node and git first on `PATH`.
"Sub-project 3 adds the choice between the two ways and the switch" (its §6).

## 3. What the sources say (checked 2026-10-15)

**Checked by running it.** Package `@anthropic-ai/claude-agent-sdk` 0.3.300, installed in a scratch
folder; the plugin copied from `main` at `73bb23a` (version 0.5.0); the fixture project
`test/fixtures/voice-uptake`; the model `claude-kit-deepseek-v4-flash` through the local kit-gateway
sidecar (`ANTHROPIC_BASE_URL=http://127.0.0.1:18763`, `ANTHROPIC_AUTH_TOKEN`, a fresh
`CLAUDE_CONFIG_DIR`); options `plugins: [{ type: 'local', path }]`, `settingSources: []`,
`permissionMode: 'default'`, `includeHookEvents: true`.

- The package carries Claude Code as a native binary in a per-platform optional dependency;
  `@anthropic-ai/claude-agent-sdk-darwin-arm64` takes 240 MB on disk. No separate install of Claude
  Code is needed. `engines`: Node 18 or later.
- The init message lists `research-harness@inline` 0.5.0 from the given path, and the plugin's
  skills as `research-harness:canvas`, `research-harness:canvas-review`,
  `research-harness:literature-note` and the others. The SessionStart hook ran and returned the
  canvas summary.
- Asked to run `research-harness accept 3.2 --explained "probe"`, the call was denied by
  `PreToolUse:Bash` with the guard's reason ("Accepting a statement is the researcher's act, …").
  Asked to edit a `[proposed]` statement to `[accepted]`, `PreToolUse:Edit` denied it ("A [proposed]
  statement cannot be promoted to [accepted] by the model (question 1.2); …"). The canvas was
  unchanged afterwards. `canUseTool` was not called for either call: the hook decided first.
- `total_cost_usd` reported 0.44 for a run on the KIT model. That figure prices the tokens at
  Anthropic's list prices; it is not what anyone pays for a gateway model.
- Besides research-harness, the init message lists three built-in plugins
  (`cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring`) and 24 tools,
  including `CronCreate`, `Workflow`, `SendMessage` and `EnterWorktree`, although
  `settingSources` was empty.
- The gateway's model list named `claude-kit-glm-5.3`, and a request to it answered "Model not
  found". A gateway's list and its upstream can disagree.

**Read in the package's type definitions (`sdk.d.ts` 0.3.300), not tried:** `env` replaces the
subprocess environment entirely; `settingSources` omitted loads user, project and local settings,
and `[]` loads none; `pathToClaudeCodeExecutable` overrides the bundled binary; `tools` sets the base
set of built-in tools; `permissionMode` omitted starts in `'auto'` where available, while
`'default'` keeps approvals through `canUseTool`; `sandbox.credentials.envVars` with `mode: 'deny'`
"unsets the variable for sandboxed commands"; with `sandbox.enabled`, `failIfUnavailable` defaults to
true, so a missing sandbox ends the query instead of running commands unsandboxed; `managedSettings`
is "intended for embedding applications (e.g. desktop apps)"; `resume`, `includePartialMessages`,
`stderr` and an `interrupt()` on the query exist.

**Assumed, not checked** (the plan's first task checks each and quotes the result): that the
sandbox lets `research-harness` and the guard run through the node shim; that a sandboxed `env`
shows no secret; that `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` stops the telemetry plugin's
traffic; that the bundled binary runs when unpacked from the asar archive of an unsigned app; that
`security -i` stores a Keychain item from a command read on stdin; that Bedrock accepts an API key in
`AWS_BEARER_TOKEN_BEDROCK` with the bundled binary.

## 4. Approaches

**A. The SDK in a utility process, the bundled plugin loaded through `plugins`, the app's own thread
in the column (chosen).** The same guard, session hook and skills as in Claude Code and in way 2,
loaded the documented way. The probe above shows the guard refusing both an accept and a promotion
in exactly this setup. The thread is the app's own page, so it can be set in the galley-proof world
and can link statement numbers natively.

**B. The guard as an SDK hook callback in the app's process (rejected).** The callback would call
`bashVerdict` and `canvasVerdict` directly, so hooks would need no Node. But the guard would then have
two entry points with different failure behaviour (`onFailure: "block"` for the command hook, a
callback's errors for the other), and the plugin's skills and SessionStart summary would still have
to be loaded. One guard, loaded one way, is easier to trust.

**C. Our own tool loop on the Messages API (rejected).** No Claude Code at all, so no 240 MB binary.
But it rebuilds Read, Edit, Bash, skills and permission handling, and the guard would have to be
wired into tools that do not exist yet.

## 5. Architecture

```
desktop/
  agent/way.js              agent.way: "claude-code" | "sdk"; the first-run choice and the switch
  agent/statement-links.js  the N.k matcher, shared by both ways
  agent/shims/              from sub-project 2: node, git
  agent/sdk/host.js         utilityProcess: one query() per conversation, streaming input
  agent/sdk/options.js      query options from a connection (pure)
  agent/sdk/connection.js   the four connection kinds; model list; test connection
  agent/sdk/keychain.js     /usr/bin/security; a secret never in an argument list
  agent/sdk/events.js       SDK messages → thread events (pure)
  agent/panel/              panel.html, panel.js, preload: the thread view
```

### 5.1 One column, two ways

The column contract comes from sub-project 2 and both ways keep it: the main process owns one column
view, loads the page of the active way into it, and places it over the bounds the shell reports;
Present hides it; Ctrl+` moves focus between session view and column; the column asks the main
process whether a statement number exists (answer: the statement's first words) and asks it to
reveal one. Neither column page holds the write token or can call the local API. Where sub-project 2
names these channels differently when it is built, this sub-project uses its names.

If sub-project 2 keeps the `N.k` matcher inside `column.js`, this sub-project moves it, unchanged, to
`agent/statement-links.js`, so both ways link the same tokens (3.4, not 2.1.300 or 0.5.0).

### 5.2 Process and data flow

The main process starts `host.js` as a `utilityProcess` when the column opens in way `"sdk"` with a
project open. It reads the connection's secret from the Keychain and hands it to the host over the
host's message port, never through an environment variable of the utility process, a file or a log.
The host builds the options, calls `query()` with a streaming input, and sends thread events to the
main process, which forwards them to the panel. Text the person types goes the same way back. The
SDK starts the bundled Claude Code binary as a child of the host. A crash of the host or the binary
ends the conversation and leaves the window running.

### 5.3 Query options

`options.js` returns exactly this, and its tests pin it. The SDK version is pinned exactly, the
newest release older than 14 days when the plan runs (the shell plan's rule), and its bundled binary
must be Claude Code 2.1.295 or later, the first with `onFailure`.

- `pathToClaudeCodeExecutable`: the bundled binary, unpacked outside the asar archive.
- `plugins: [{ type: 'local', path: <bundled plugin> }]`, `settingSources: []`, `cwd`: the current
  project.
- `env`, built from nothing: `PATH` with `agent/shims/` first, then `/usr/bin:/bin:/usr/sbin:/sbin`;
  `HOME`; `CLAUDE_CONFIG_DIR` = `<userData>/agent-sdk`; `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`;
  `CLAUDE_AGENT_SDK_CLIENT_APP=research-harness-desktop/<version>`; and the connection's variables
  (5.4). Nothing else from the app's environment.
- `tools`: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash`, `Skill`, `Task`, `WebFetch`,
  `WebSearch`. The canvas and literature-note skills use `Task`; the scheduling, worktree and
  messaging tools the probe listed have no use in a paper project.
- `permissionMode: 'acceptEdits'` and a `canUseTool` that asks in the thread (6.3).
- `sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false,
  credentials: { envVars: [{ name, mode: 'deny' }] } }`, one entry per secret variable of the
  connection. Network rules stay at the sandbox's defaults; the plan's first task records what the
  plugin's commands need and adds only that.
- `model`: the connection's model. `includePartialMessages: true`, `includeHookEvents: true`.

Never set: `allowDangerouslySkipPermissions`, `permissionMode: 'bypassPermissions'`, a replaced
system prompt, or `settings` that touch hooks.

`settingSources: []` and the separate `CLAUDE_CONFIG_DIR` keep the person's own Claude Code out of
this session: their hooks, plugins, permissions, `CLAUDE.md` and their claude.ai sign-in. So the
session cannot fall back to a subscription login, and an edit to `~/.claude/settings.json` cannot
switch the guard off. Managed settings that an organisation installs on the machine still apply; see
5.6 and 10.

### 5.4 Connections

| Kind | App data folder | Keychain | Variables |
|---|---|---|---|
| Anthropic API key | kind, model | the key | `ANTHROPIC_API_KEY` |
| Institute gateway | kind, URL, model | the token | `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` |
| Amazon Bedrock | kind, region, model, AWS profile name if used | a Bedrock API key if used | `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION`, `AWS_PROFILE` or `AWS_BEARER_TOKEN_BEDROCK` |
| Google Vertex | kind, project ID, region, model | nothing | `CLAUDE_CODE_USE_VERTEX=1`, `ANTHROPIC_VERTEX_PROJECT_ID`, `CLOUD_ML_REGION` |

"Institute gateway" means any endpoint that speaks the Anthropic Messages API, such as the
university gateway the owner's check uses. Vertex uses the Google sign-in
already present on the Mac; the app checks for it and says so if it is missing, because creating one
needs Google's own tools.

`keychain.js` keeps one generic-password item per connection kind under the service
`research-harness-desktop`. It writes with `security -i`, the command on stdin, because an argument
list is visible to every process on the Mac; it reads with `find-generic-password -w`, whose output
goes to the app only. Removing a connection deletes its item.

Models: for an API key or a gateway, the app reads `GET /v1/models` with the credential and offers
the list; a gateway without that route gets a text field. Bedrock and Vertex get a text field with
the provider's model ID.

Test connection runs one turn with `tools: []` and no plugin ("Reply with the word ready."). It costs
a few tokens and checks the whole chain, model name included (see the "Model not found" in 3). The
secret is saved only after the test passes.

### 5.5 Sessions

One conversation at a time, in the current project. The host keeps the session ID per project in the
app data folder; opening a project again offers "Continue last conversation" (`resume`) or "New
conversation". Switching project or way asks before ending the running conversation. Quitting the
app interrupts and closes the query. Conversations are stored by the binary under
`<userData>/agent-sdk`, never in the project or in `~/.claude`.

### 5.6 The guard must be seen to start

Before the person's first message is sent, the host waits for the init message and the SessionStart
hook result. It goes on only if the init message lists `research-harness` from the bundled path and
the hook reported success. Otherwise it ends the session and the column says "The guard did not
start, so the agent stays off", with the cause it can name (the organisation's settings turned hooks
off, or the plugin failed to load). Unlike way 2, the app starts this session itself, so it can
refuse to run it. The header then shows "Guard on · research-harness <version>".

## 6. The column

Built in the galley-proof world from the column in `model-pick.html`.

### 6.1 Header

"Agent", the model's name, the connection in words ("Anthropic API key", "Institute gateway",
"Amazon Bedrock", "Google Vertex"), the guard line from 5.6, and the state (Ready, Working, Stopped).
The model's name is the one the connection uses; a gateway model that is not Claude is not called
Claude. No Anthropic or Claude Code logo.

### 6.2 Thread

- "You" and the agent's turns. The agent's text is rendered from a small Markdown subset
  (paragraphs, lists, emphasis, inline code) into DOM nodes; model output is never inserted as HTML.
  The page's content security policy allows only its own scripts and styles.
- Statement numbers become links through `statement-links.js` and the lookup in 5.1, with the
  statement's first words as tooltip.
- Web addresses appear as text with an "Open" control that goes through the host bridge.
- Tool calls appear as one line each, in plain words, folded by default: "Read research/canvas.md",
  "Ran research-harness status", "Edited research/canvas.md", "Searched the web for …".
- A guard refusal is its own line, with icon and words, not red: "Refused by the guard: accepting
  is your step." When the call named a statement, the line offers "Open 3.2". The guard's full
  reason unfolds below it. The guard's text points to the plugin's slash commands; this line says what
  to do in the app.
- Under the thread, always: "The agent proposes. Accepting, choosing a framing, starting a session
  and handing over the project key stay with you."
- Quick actions: Continue canvas, Review canvas, Literature note… (asks for a file through the host
  bridge). They send `/research-harness:canvas`, `/research-harness:canvas-review` and
  `/research-harness:literature-note <file>` as the message. "Stop" interrupts the running turn.
- Usage: "This conversation: 41,200 tokens" (example figure), from the result messages. With an
  Anthropic API key the line adds an estimate such as "about $0.31 at Anthropic's list prices"; for the other kinds it shows tokens only,
  because the figure would not be their price (3).

### 6.3 Asking the person

What `canUseTool` receives (a web fetch, a search, an edit outside the project) appears as a block in
the thread: what the agent wants to do, in plain words, with its target, and "Allow once" and
"Deny". There is no "always allow". A denial reaches the agent as "The researcher declined." Sandboxed
commands and edits inside the project do not ask; the guard and the sandbox decide those.

### 6.4 Accessibility

The column meets the shell's bar: WCAG 2.2 AA, keyboard operation, visible focus in both themes,
reflow down to the column's minimum width, type that grows with the window. The thread is a log
region that announces finished turns and refusals, not each streamed fragment. Below the shell's
breakpoint the column folds into a toggle, as in way 2.

## 7. First run and the switch

With no `agent.way` in the app data folder, the column asks "How should the agent connect?":

- "Claude Code, with your Claude plan (Pro, Max or Team)": continues with sub-project 2's first run.
- "Pay per use: an Anthropic API key, your institution's gateway, or Amazon Bedrock / Google
  Vertex": continues with "Connect a model".
- "Not now" keeps the column hidden; the sidebar keeps "Set up the agent…".

"Connect a model" follows the old mockup: the four kinds as three choices (Bedrock and Vertex share
one), each with one sentence on what it needs; then the note "Stored in the macOS Keychain, never in
the project. Usage is billed per token to the account behind the key. A Claude Pro plan does not
cover it; Max and Team plans include monthly API credits."; then Test connection and Continue.
"Get a key" opens the Anthropic Console through the host bridge.

Settings → Agent: change the way, change or remove the connection. Changing the way ends the running
conversation after asking.

## 8. Errors

In plain words in the column, with the next step, never as a toast:

- test connection: a refused key or token ("The key was refused"), an unreachable host ("Could not
  reach <host>"), an unknown model ("<host> does not offer <model>"); nothing is saved;
- the Keychain item is missing or access is denied → back to "Connect a model";
- the guard did not start → 5.6;
- the sandbox cannot start → "The agent's sandbox could not start, so the agent stays off";
- rate limit or overload → the reason in plain words and "Try again";
- the binary exits → "The agent stopped (code n)" and "Start again".

## 9. Testing

- Unit tests (node:test) in `desktop/`: `options.js` (the exact option set of 5.3; never bypass;
  `settingSources` empty; `env` holds only the listed variables; every secret variable has a sandbox
  `deny`); `events.js` against recorded SDK messages, the probe's guard denials among them;
  `keychain.js` with a fake `security` that records its arguments, which never contain the secret;
  `connection.js` error mapping; `way.js`; the shared `N.k` matcher.
- Integration with a fake model: a local server that speaks the Messages API and returns scripted
  tool calls. Through the real SDK and the bundled binary, with the bundled plugin: the scripted
  accept and promotion are refused and the canvas is unchanged; a scripted sandboxed `env` shows no
  secret; nothing under `<userData>/agent-sdk` holds the secret. Runs without a network or a real
  model.
- Panel: rendered tests in light and dark (keyboard path, focus, reflow, the log region); agent text
  holding `<img src=x onerror=…>` renders as text.
- Electron smoke test against the fake model: the header shows "Guard on", 3.4 in a reply becomes a
  link that reveals the statement, the column page exposes no API call.
- The plan's first task, with the real binary, before anything is built on it: each item under
  "Assumed, not checked" in 3, with the result quoted in the plan.
- Owner check, last: success items 1 to 5 of section 1.

## 10. Limits stated plainly

- **Billing.** Usage is billed to the account behind the key, the gateway or the cloud account. The
  app shows tokens, not a bill; only for an Anthropic key does it add a list-price estimate.
- **Models that are not Claude.** Through a gateway, the guard and the skills work the same, but the
  quality of proposals depends on the model; the header names it.
- **Size.** The bundled binary adds about 240 MB per processor architecture. How builds are split is
  for sub-project 4.
- **Managed settings.** An organisation's managed settings on the Mac still reach this session. If
  they turn hooks off, the agent stays off (5.6).
- **Secrets inside the session.** The binary needs the key in its environment. Sandboxed commands
  do not see it; the plugin's own hooks run outside the sandbox and do. Bedrock's AWS profile and
  Vertex's Google sign-in live in the person's own files, which the agent's Read tool can reach.
- **Stored conversations.** The binary keeps conversations, canvas text included, under the app's
  data folder. A control to delete them is not in this sub-project.
- **Computer use.** As in the shell spec §7: an agent that drives the window as the person is
  invisible to the guard.
- **Terms.** Agent SDK use falls under Anthropic's Commercial Terms, or the cloud provider's, for the
  account behind the key. The app ships the binary unmodified, as the SDK package ships it.
- **Numbers are positions**, as in sub-project 2 §9.

## 11. Out of scope

Way 2 itself (sub-project 2); the browser fallback and Windows, which have no agent column
(sub-project 5); signing, notarisation and how builds carry the binary (sub-project 4); MCP servers;
more than one conversation at a time; deleting stored conversations; a spending cap; changing the
guard's wording in the plugin.
