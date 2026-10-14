# Desktop app, sub-project 2: Claude Code in the agent column

Status: approved by the owner, 2026-10-15. Built only after sub-project 1 has landed.
Decision record: vault `appdev/research-harness.md`, blocks of 2026-10-14 ("Desktop-App mit eigenem
Agenten") and 2026-10-15. Builds on the approved shell spec
`docs/superpowers/specs/2026-10-15-desktop-app-shell-design.md` (`990bbed`) and the direction
contract `.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md` (`5d7f17d`). Old
mockup, still the reference for the first-run flow (not the look):
`docs/superpowers/specs/2026-10-14-desktop-app-mockup.html`, tab "Weg 2 · Claude Code".

## 1. Goal

A researcher who has Claude Code, or is willing to install it, works with the agent inside the app
window: the session view in the centre, Claude Code in the agent column on the right, signed in with
the person's own Claude plan (Pro included). The research-harness guard is active in that session,
and the app can show that it is.

Success for this sub-project, all four:

1. On a Mac user account without developer tools, the person installs Claude Code and signs in from
   the agent column without opening Terminal.
2. The agent proposes statements that appear as margin queries in the session view; asked to accept
   one, it is refused by the guard.
3. A statement number such as 3.4 in the agent's reply is a link that shows that statement in the
   session view.
4. The owner has done 1 to 3 once on a fresh macOS user account and once on his own account, where
   the plugin is also installed at user scope. Pro is not tested on its own: sign-in and usage are
   Claude Code's, and nothing the app does differs by plan.

## 2. Decided before this spec

From the vault, owner's words recorded there: the app gets its own agent; on first start the person
picks one of two ways and can switch later; way 1 is an agent panel on the Agent SDK with an API key,
an institute gateway or Bedrock/Vertex (sub-project 3); way 2 is Claude Code embedded with the
person's own plan, Pro included (this sub-project). The SDK docs forbid third parties to offer
claude.ai login unless approved; Pro includes no API usage. Order 1 → 2 → 3. The galley-proof world
applies to the whole window, including the binding addition that statement numbers are used in the
agent thread and link to the statement.

From the shell spec: the agent column is reserved and hidden in sub-project 1; the app bundles its
own copy of the plugin; a plugin installed in Claude Code may be another version, which this
sub-project settles (shell spec §7).

## 3. What the sources say (checked 2026-10-15)

**Checked by running it** on Claude Code 2.1.300 (`claude --help`, `claude auth --help`):
`--plugin-dir`, `--settings`, `--setting-sources`, `--append-system-prompt`, `--ax-screen-reader`,
`--continue` and `--bare` exist; `claude auth status --json` prints `loggedIn`, `authMethod` and
`subscriptionType` (along with email and organisation); `claude auth login --claudeai` and
`claude install` exist.

**Documented, not tried here:**

- code.claude.com/docs/en/legal-and-compliance: running Claude Code in a product requires that "The
  Claude Code binary must not be modified", that no built-in authentication method is removed, and
  that "Each end user must authenticate with their own ... Claude subscription plan credentials".
  Developers "may not collect, store, or intermediate Claude.ai credentials or session tokens —
  sign-in to a Claude account must complete through Anthropic's own flow". The policy "does not ...
  prevent an end user from signing in to the unmodified Claude Code binary with their own Claude
  subscription, including where a platform hosts Claude Code". The same page says preinstalling or
  running Claude Code in a product "requires agreeing to our Commercial Terms of Service", and that
  the Claude Code name may be used "in plain text" but not as part of a product or feature name or
  logo.
- code.claude.com/docs/en/plugins/loading, "Name conflicts": a `--plugin-dir` plugin "replaces a
  same-named installed marketplace plugin" silently, for that session only. Only a plugin locked in
  managed settings `enabledPlugins` wins over it. A settings entry `"<name>@inline": false` turns the
  session copy off.
- code.claude.com/docs/en/settings: `--settings` applies "above your user, project, and local files
  and below managed settings". `disableAllHooks: true` outside managed settings is resolved by that
  precedence; `allowManagedHooksOnly` in managed settings stops plugin hooks.
- code.claude.com/docs/en/hooks: a hook that cannot start is a non-blocking error, unless
  `onFailure: "block"` (Claude Code 2.1.295 or later), which the guard sets.
- code.claude.com/docs/en/plugins-reference: files in a plugin's `bin/` are on the Bash tool's
  `PATH` while the plugin is enabled.
- code.claude.com/docs/en/setup: the native installer is `curl -fsSL https://claude.ai/install.sh |
  bash`, puts the launcher at `~/.local/bin/claude` and updates itself in the background.

**Assumed, not checked:** that Electron's `ELECTRON_RUN_AS_NODE` and its `RunAsNode` fuse work as
Electron documents them inside a packaged app, and that an app started from Finder gets launchd's
short `PATH`. The Electron smoke test (8) checks both.

**Read in this repo:** the guard and the session hook run as `node "${CLAUDE_PLUGIN_ROOT}/hooks/…"`,
and `bin/research-harness` starts with `#!/usr/bin/env node`. A Mac without developer tools has no
`node`. In an embedded session without one, the guard cannot start and, with `onFailure: "block"`,
every tool call is blocked. Safe, but the agent is useless.

## 4. Approaches

**A. Claude Code's own interface in a terminal widget in the agent column (chosen).** The app
starts the person's installed, unmodified `claude` in a pseudo-terminal (`node-pty`) and shows it
with `xterm.js`. Install, sign-in, folder trust and permission prompts are Claude Code's own and
happen in the column. The app reads nothing secret and changes nothing in Claude Code.

**B. The app's own chat panel over `claude -p --output-format stream-json` (rejected).** It would
carry the galley-proof look into the thread, and sub-project 3 could share the panel. But that
stream is the mechanism the Agent SDK uses, and the legal page sends developers who build on
Claude's capabilities through the SDK to API keys. Driving it with a Pro or Max login from a
third-party app comes too close to what the page rules out ("route requests through Free, Pro, or
Max plan credentials on behalf of their users"). It would also need its own permission prompts.

**C. Open Claude Code outside the app, in Terminal or the Claude desktop app (rejected).** It needs
no embedding, but it breaks "no terminal" and loses the agent next to the session view. It cannot
hand over the bundled plugin either.

What A costs: the thread is Claude Code's terminal interface, not a galley-proof page. The column
frame follows the world (see 6); the text inside is Claude Code's. That is the price of using the
person's own plan within the terms, and it is the trade the owner made by choosing way 2.

## 5. Architecture

```
desktop/ (Electron, main process)
  agent/locate.js    find claude, read its version
  agent/auth.js      claude auth status --json → { loggedIn, method, plan }
  agent/launch.js    argv and environment for claude
  agent/session.js   one pty at a time (node-pty), cwd = current project
  agent/marker.js    waits for the plugin's session marker (5.4)
  agent/shims/       node, git: small scripts placed first on PATH
  agent/column/      column.html, column.js (xterm.js), preload: the agent column view
plugins/research-harness/
  hooks/inject-state.js     writes the session marker when the app asks for it
  hooks/lib/numbers.js      statement numbers, one function for view, hook and links
```

The agent column is its own Electron view (`WebContentsView`) owned by `desktop/`, placed by the
main process over the area the shell page reserves. The shell page tells the bridge the column's
bounds and whether it is shown; Present hides it. `xterm.js` and `node-pty` stay in `desktop/`, so
the plugin stays free of dependencies, and the browser fallback simply has no agent column. The
column view holds no write token and has no route to the local API; text typed into Claude Code
cannot reach the token through it.

### 5.1 Finding and checking Claude Code

An app started from Finder gets launchd's short `PATH`, without `~/.local/bin`. `locate.js` looks at
`~/.local/bin/claude` first, then asks the person's login shell once (`$SHELL -lc 'command -v
claude'`). It runs `claude --version` and requires 2.1.295 or later, the first version with
`onFailure`. It never reads Claude Code's config, credentials or Keychain item.

`auth.js` runs `claude auth status --json` and keeps only `loggedIn`, `authMethod` and
`subscriptionType`; email and organisation are dropped at parse time and never stored or shown.

### 5.2 Launching

`launch.js` builds one argument vector, passed to the pty without a shell:

```
claude --plugin-dir <bundled plugin> \
       --settings '{"disableAllHooks":false,"enabledPlugins":{"research-harness@inline":true}}'
```

plus `--continue` when the person picks "Continue last conversation", and `--ax-screen-reader` when
the screen-reader setting is on (6). It never passes `--bare`, `--safe-mode`,
`--dangerously-skip-permissions`, `--permission-mode` or a system prompt. The `--settings` keys sit
above the person's user, project and local files, so neither the person's settings nor an agent edit
to `~/.claude/settings.json` can switch the guard off for this session. Managed settings can; see 9.

This settles the version question from the shell spec: in the embedded session the bundled copy
replaces a user-scope install of the plugin (documented, 3), so hooks do not run twice and the guard
is the app's version. In the person's own terminal, their installed copy still applies.

### 5.3 Environment and the node shim

The pty gets the login shell's `PATH` (read once at app start) with `agent/shims/` in front:

- `shims/node` runs the app's own Electron binary as Node: `ELECTRON_RUN_AS_NODE=1 exec
  "$RH_ELECTRON" "$@"`. The variable is set inside the shim only, never in the pty's environment,
  so programs the agent starts are not turned into Node by accident. This needs Electron's
  `RunAsNode` fuse left on (9).
- `shims/git` runs the bundled `dugite` git from the shell spec (§3.4).

So the guard, the session hook and `research-harness` always run on the app's Node, on a Mac that
has none and on one that has another version.

### 5.4 Showing that the guard is on

The app sets `RESEARCH_HARNESS_APP_MARKER` to a fresh file path for each session. When that
variable is set, the plugin's SessionStart hook writes `{ pluginRoot, version, pid }` to it; without
the variable it does what it does today. The guard and the session hook come from the same plugin
and are switched off by the same settings, so a marker shows that the plugin's hooks are loaded and
not switched off in this session. It does not test the guard itself; the plan's probe (8, item c)
does that once. `marker.js` waits up to 15 seconds after start and compares `pluginRoot` with the bundled
copy:

- marker present, bundled copy: the column header says "Guard on · research-harness" and the
  bundled version;
- marker from another copy (managed settings locked another version): "Guard on · research-harness
  <version> from your Claude Code settings";
- no marker: "Guard not confirmed. The agent's writes may not be checked in this session", with
  the reason the app can name (hooks turned off by your organisation's settings, or the session
  did not start). The app cannot stop Claude Code; it says so instead.

### 5.5 Sessions

One Claude Code session at a time, started in the current project's folder. Switching project asks
whether to end the running session; opening a project again offers "Continue last conversation"
(`--continue`) or "New conversation". Quitting the app ends the pty; Claude Code keeps the
conversation on disk as it always does. If `claude` exits, the column shows the exit code in plain
words and "Start again".

### 5.6 Statement numbers in the thread

`hooks/lib/numbers.js` gives each statement the number `N.k`: element N, k-th statement of that
element in file order, as the canvas parser returns them. The session view, the SessionStart summary
and the link check all call this one function. If the session view already numbers statements when
this sub-project is built (SQ-239 or later), its scheme moves into `numbers.js` unchanged instead.
The canvas skills say in one line how statements are numbered, so the agent cites them that way.

`column.js` registers an `xterm.js` link provider for tokens `N.k` (N 1 to 9, k 1 to 999, not part
of a longer number such as 2.1.300 or 0.5.0). Before a token becomes a link, the column asks the
shell page through the main process whether that number exists; the shell page answers with the
statement's first words, shown as the link's tooltip. Clicking scrolls the session view to the
statement and lights it, as focusing a query does. A number that has gone stale shows the wrong
words in the tooltip instead of failing silently.

## 6. The agent column

Built in the galley-proof world. The frame: a header in Hanken Grotesk with "Agent", the plain-text
line "Uses Claude Code with your Claude plan", the plan from `subscriptionType` ("Claude Pro"), and
the guard line from 5.4. No Claude Code or Anthropic logo (3). The terminal uses the system
monospace on the white sheet with ink text in light mode and the world's dark tokens in dark mode;
red stays reserved for queries, so the guard warning uses ink, an icon and words. Claude Code picks
its own colours inside the terminal; the plan's first task checks their legibility on both sheets
and, if needed, tells the person once to choose a light theme with Claude Code's own `/theme`. The
app never edits Claude Code's config to do it.

First run, when Claude Code is missing or signed out, the column shows the old mockup's flow in the
new look, each step with one sentence on what happens before it happens:

1. **Install Claude Code.** "Downloads Claude Code from claude.ai into your home folder.
   Anthropic's terms apply." Runs the official installer in the column, visibly. The app does not
   ship or download the binary itself.
2. **Sign in with Claude.** "Opens your browser to sign in. Works with Pro, Max and Team plans."
   Runs `claude auth login --claudeai` in the column; the browser step is Claude Code's own.
3. **research-harness plugin** ✓ "Bundled with the app", with its version. Nothing to do.

Then "Start the agent". "Not now" keeps the column hidden; the sidebar keeps a "Set up the agent…"
entry. The chosen way is stored in the app's data folder as `agent.way = "claude-code"`;
sub-project 3 adds the choice between the two ways and the switch.

Accessibility: the frame meets the shell's bar (WCAG 2.2 AA, keyboard, visible focus, both themes).
`xterm.js` runs with its screen-reader mode when macOS reports assistive technology, and a setting
"Plain output for screen readers" starts Claude Code with `--ax-screen-reader`. Ctrl+` (shown in the
app menu) moves focus between the session view and the terminal, because the terminal keeps Tab for
itself. The terminal does not reflow to 320 px; below the shell's breakpoint the column folds into a
toggle (9).

## 7. Errors

All in plain words in the column, with the next step, never as a toast:

- Claude Code not found → step 1 of the first run;
- older than 2.1.295 → "Claude Code needs an update for the guard to work", runs `claude update` in
  the column;
- signed out → step 2;
- install or sign-in step exits non-zero → the step stays undone and the column keeps its output;
- no marker → the warning from 5.4, which stays until a new session confirms the guard;
- `claude` exits → exit code, "Start again".

## 8. Testing

- Unit tests (node:test) in `desktop/`: version comparison, the auth parse dropping email and
  organisation, the argument list (never `--bare`, `--safe-mode`, `--dangerously-skip-permissions`
  or `--permission-mode`), the `PATH` with shims first, the `N.k` matcher (matches 3.4, "see 3.4.";
  not 2.1.300, 0.5.0, 3.4.1), marker reading and the three outcomes of 5.4.
- Plugin tests: `numbers.js` against the fixture states; the SessionStart hook writes the marker
  only when the variable is set, and its output is unchanged otherwise.
- Electron smoke test with a fake `claude` on the test's `PATH`: a script that records its
  arguments and environment, writes a marker and prints a line holding "3.4". It checks the
  arguments, that `node` resolves to the shim and reports `process.versions.electron`, that 3.4
  becomes a link that reveals the statement, that the column view exposes no API call, and that no
  file under the app's data folder holds email or organisation.
- First plan task, with the real Claude Code, before anything is built on it: (a) start with
  `--plugin-dir` and `--debug` on an account with the plugin at user scope and find "overrides
  installed version" in the debug log; (b) with `PATH` lacking `node`, confirm every tool call is
  blocked; (c) with the shim, confirm the guard denies an accept; (d) legibility of Claude Code's
  colours on both sheets. Each result is quoted in the plan.
- Owner check, last: success items 1 to 4 of section 1.

## 9. Limits stated plainly

- **Commercial Terms.** The legal page ties running Claude Code in a product to the Commercial
  Terms. Whether a local, open-source app that starts the person's own install counts as "your
  products", and who would agree to those terms, is not settled here. It needs an answer before a
  public download (sub-project 4), possibly from Anthropic through the contact the page names.
- **Managed settings win.** An organisation that sets `allowManagedHooksOnly`, `disableAllHooks` or
  locks the plugin in managed settings overrides the app. The marker makes that visible; the app
  cannot prevent it.
- **Computer use.** If the person gives Claude Code control of the screen, the agent can click
  Accept in the app window as the person. The guard cannot see that (shell spec §7, row M27).
- **RunAsNode.** The node shim needs Electron's `RunAsNode` fuse on, so any local program can run
  the app binary as Node. For an unsigned app that adds no privilege; sub-project 4 decides whether
  a signed build ships a separate Node instead.
- **The thread is Claude Code's interface.** It does not reflow below the column's minimum width,
  and its colours are Claude Code's. Usage limits of the person's plan show up as Claude Code's own
  messages.
- **Numbers are positions.** `N.k` follows file order. Deleting a statement shifts the numbers after
  it; the tooltip makes that visible but does not prevent it.
- **Two copies.** Outside the app, the person's own installed plugin version writes to the same
  project. Keeping file formats readable across versions stays the plugin's job.

## 10. Out of scope

Way 1 and the choice between the ways (sub-project 3); a terminal in the browser fallback and
Windows (sub-project 5); signing, notarisation and packaging the native `node-pty` module
(sub-project 4); sending a selected statement into the agent's prompt; any MCP or IDE-style
connection between the app and Claude Code; more than one agent session at a time.
