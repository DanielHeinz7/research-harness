# Desktop app, sub-project 1: app shell and human steps

Status: approved by the owner, 2026-10-15.
Decision record: vault `appdev/research-harness.md`, blocks of 2026-10-14 ("Desktop-App mit eigenem
Agenten") and 2026-10-15 ("Design-Overhaul", "Desktop-App vorerst unsigniert"). Visual direction:
`.impeccable/surfaces/plugins-research-harness-dashboard-canvas-html.md` (galley proof, commit
`5d7f17d`). Old mockup, still the reference for the human steps:
`docs/superpowers/specs/2026-10-14-desktop-app-mockup.html`.

## 1. Goal

A researcher who has never opened a terminal can, from a macOS app window:

1. create a paper project or open one on disk,
2. clone a shared project from a link and get the co-author's updates, and send their own,
3. invite a second person and join a project as that second person,
4. run a meeting: start a session, work through the agenda in the session view, export the minutes.

The session view (`canvas.html`) sits in the centre of the window. Everything an agent does is out
of scope here; sub-projects 2 and 3 add the agent panel.

Success for this sub-project: the four steps work end to end on a Mac without Xcode tools or
Homebrew, with the app started by double-click, and the owner has done each step once.

## 2. Decided before this spec

From the vault, owner's words recorded there:

- The app gets its own agent later (sub-projects 2 and 3); v1 needs no terminal; macOS only;
  Windows gets a browser fallback with the same web UI (sub-project 5, untested, no CI).
- Five sub-projects, order 1 → 2 → 3, 4 in parallel. Signing waits (unsigned for now).
- The galley-proof world for the shell and the session view.

Confirmed by the owner in the review of this spec (2026-10-15): Electron rather than Tauri; the app
lives in `desktop/` and bundles the plugin; the UI is a web page against a local API in the plugin;
the write token lives only in memory; "send" is part of v1 (3.4); on update, only a conflict in
`decisions.md` is merged automatically, any other conflict aborts with an explanation (3.4).

## 3. Architecture

```
desktop/ (Electron)                plugins/research-harness/ (bundled copy)
  main process                       bin/canvas-serve.js   app mode: app routes + project routes
    window, native dialogs,            hooks/lib/...       the same functions the CLI calls
    recent projects, app menu          dashboard/app.html  the shell page (new)
    starts the server  ───────────▶    dashboard/canvas.html  the session view (embedded)
  utilityProcess: the server
  bundled git (dugite)
```

### 3.1 Why Electron

The plugin is Node code with no dependencies. Electron runs it as it is, in a Node process the app
already has. Tauri would need a bundled Node binary as a sidecar plus a Rust shell around it, for a
smaller download and nothing the four steps need.

### 3.2 One server, two layers of routes

`canvas-serve.js` today serves one project, fixed at start, on `127.0.0.1` and a free port, with a
single-use code in the URL fragment traded once for a write token held in memory. That stays the
behaviour of `research-harness serve`.

App mode (started by the Electron app, or by `research-harness serve --app` for the browser
fallback) adds an app layer that works with no project open:

| Route | Does | Calls |
|---|---|---|
| `GET /api/app/projects` | recent projects, current project | app store (see 3.5) |
| `POST /api/app/open` | switch the current project to a folder | validates it is a harness project |
| `POST /api/app/init` | create a project in a chosen parent folder | the `init` code path |
| `POST /api/app/clone` | clone a link into a chosen parent folder | git (3.4) |
| `POST /api/app/update` | get updates for the current project | git pull + `merge-log` |
| `POST /api/app/send` | send own changes | git commit + push |
| `POST /api/app/invite` | write the project key to a chosen file | `key export` |
| `POST /api/app/join` | join with a received key file and a name | `join` |
| `POST /api/app/session` | `action: "start"` with an occasion, or `action: "minutes"` with a target file | `session start`, `session protocol` |

The existing project routes (`/api/state`, `/api/accept`, `/api/choose`, `/api/stated`,
`/api/comment`) keep their contract and act on the current project. Every route except
`/api/session` needs the token, as today. Route handlers call the library functions the CLI calls;
they run the plugin's own CLI entry with `execFile` and an argument array, never through a shell (see the plan, Task 3, for why).

The server runs in an Electron `utilityProcess`, so a long git call never freezes the window.

### 3.3 Token flow

One mechanism for Electron and browser: the server prints a URL with the single-use code; the shell
page redeems it once and keeps the token in memory. In Electron the URL never leaves the main
process (no terminal, no history file). The embedded session view receives the token from the shell
by `postMessage`, origin-checked; opened alone in a tab, it redeems its own code as today. The token
is never written to disk, a URL, a log or local storage.

### 3.4 Git

The app bundles git through `dugite`, so a Mac without Xcode command line tools works. The plugin
stays dependency-free: the app passes the bundled git's path in an environment variable to the
server; in browser mode the server uses `git` from `PATH`.

- Clone accepts `https:` and `ssh:` links only (`GIT_ALLOW_PROTOCOL=https:ssh`), so `ext::` and
  `file::` transports are refused. The target is a new folder inside a parent the person picked; an
  existing non-empty folder is refused.
- Credentials: git asks through `GIT_ASKPASS`, pointed at a small helper that opens an app dialog.
  Whether dugite's git stores them in the macOS Keychain is **not verified**; the plan's first task
  checks it.
- Get updates runs `git pull --no-rebase`. A conflict only in `research/decisions.md` runs the
  existing `merge-log` path and commits when the merged log verifies. Any other conflict aborts the
  merge and says in plain words which file both sides changed and that nothing was lost.
- Send runs commit and push of the project's research files. A rejected push gets updates first,
  then pushes once more. Send was added in review: without it the second person never sees the first
  person's work.

### 3.5 What the app stores

Recent projects and window state live in the app's own data folder (`app.getPath('userData')`),
never in a project. No token, key or credential there.

### 3.6 Host bridge

The shell page uses a small bridge for what only a desktop app can do: pick a folder or file, reveal
a file in Finder, open an external link. In Electron it comes from the preload script; in a browser
it falls back to typed paths and plain links. The shell page has no other Electron dependency, so
sub-project 5 reuses it unchanged.

## 4. The shell page

`dashboard/app.html` in the plugin, built in the galley-proof world per the direction contract. The
mock to build from is `.impeccable/mocks/decision/sketches/model-pick.html`: project sidebar on the
left, session view in the centre, agent column on the right.

- Sidebar, Project: name and folder, Open project…, Clone from link…, Get updates (with a count of
  new entries after an update), New project….
- Sidebar, Meeting: Start session / Session running with elapsed time, Agenda (switches the session
  view to "To talk about"), Export minutes….
- Sidebar, People: names from the project, Invite co-author…, and Join this project… when the
  project has no local key.
- Centre: the session view, embedded same-origin.
- Right: the agent column is reserved and hidden in sub-project 1. Sub-projects 2 and 3 fill it.
- First start with no recent project: a page that offers New project…, Open project… and Clone from
  link…, each with one sentence on what it does.

Each dialog says what will happen in plain words before it happens (folder, files written, what is
sent where), and reports the outcome in the sidebar, never as a toast. Invite co-author… says that
the key file goes to the co-author by the person's own route (mail, USB stick), and never through an
agent. New project… explains the three modes (brainstorming, seed, import) in one sentence each.

The shell meets the same bar as the session view: WCAG 2.2 AA, keyboard operation, visible focus in
light and dark, reflow, type that grows with the window.

## 5. Errors

Every route answers `{ ok, code, error }` as the project routes do today. The shell shows the error
next to the control that caused it, in plain words, with the next step. Specific cases:

- not a harness project → "This folder has no research canvas" and an offer to create one;
- git missing in browser mode → says which program is missing; no install attempt;
- network or authentication failure → the step stays undone, nothing half-written;
- a seal that does not verify after merge → the merge is aborted, the copy stays as it was.

## 6. Testing

- App routes: node:test against temporary git repositories (a bare remote, two clones): clone,
  update with and without a conflict in `decisions.md`, conflict elsewhere, send with a rejected
  push, refused transports, refused non-empty target, every route refused without the token.
- Shell page: rendered tests in light and dark, the same kind as the session view's (keyboard path,
  focus contrast, reflow, dialogs and return focus).
- Electron: one smoke test through Playwright's Electron launcher: the window opens, the first-start
  page shows, a fixture project opens, the session view renders, and the token appears in no file
  under the app's data folder.
- Owner check, last: the four steps of section 1 on a Mac user account without developer tools.

Playwright reaches the tests through `NODE_PATH` today; SQ-231 (Playwright as a dev dependency) is
open, and the plan settles it before adding Playwright a second way.

## 7. Limits stated plainly

- An agent that drives the app window through macOS accessibility (computer use) acts as the person
  and is invisible to the guard, the same class of limit as row M27 in
  `docs/technical-appendix.md` §3. The write token in the window's memory is reachable by anything
  that can drive the window.
- Unsigned until sub-project 4: macOS 15 opens the app only through System Settings → Privacy &
  Security → "Open Anyway".
- The bundled plugin is the app's own copy. A plugin installed in Claude Code may be a different
  version; sub-project 2 deals with that.

## 8. Out of scope

The agent and its panel (sub-projects 2 and 3), signing, notarisation and app updates
(sub-project 4), Windows (sub-project 5), any new action on the canvas, editing statement text.
