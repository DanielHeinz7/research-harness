# Desktop app, sub-project 5: Windows through the browser

Status: approved by the owner, 2026-10-15.
Decision record: vault `appdev/research-harness.md`, block of 2026-10-14 ("Desktop-App mit eigenem
Agenten": "Nur macOS; Windows als Browser-Fallback mit derselben Web-Oberfläche (ungetestet, keine
CI)"). Sub-project 1 spec `docs/superpowers/specs/2026-10-15-desktop-app-shell-design.md` (`990bbed`),
§3.4 and §3.6; its plan `docs/superpowers/plans/2026-10-15-desktop-app-shell.md` (`47be2fa`), Tasks 5
and 7.

## 1. Goal

A researcher on Windows who has never opened a terminal installs research-harness, starts it by
double-click, and does the four steps of sub-project 1 §1 in a browser tab: create or open a project,
clone it and get and send updates, invite or join a co-author, run a meeting. The page is the same
shell page, `dashboard/app.html`, served by `research-harness serve --app`.

Success for this sub-project:

- a Windows zip is attached to every release, and its start file and the plugin code it reaches are
  covered by tests that run on macOS;
- a decision log or canvas with Windows line endings can no longer be read as empty (section 4).

Nobody runs it on Windows. The owner decided on 2026-10-14: untested, no CI.

## 2. Decided before this spec

From the vault: the app is macOS only; Windows gets a browser fallback with the same web UI, untested,
without CI; sub-project 5 comes last.

From sub-project 1: the shell page reaches the desktop only through `window.harnessHost`, and in a
browser it falls back to typed paths and plain links (§3.6). In browser mode the server uses `git`
from `PATH` (§3.4). When git is missing, the message names the program and nothing is installed (§5).

From the sibling specs: the browser fallback has no agent column (sub-project 2 spec §5, "the browser
fallback simply has no agent column"; sub-project 3 spec §11). Sub-project 4 attaches the
macOS release assets in `scripts/release.js` (its §4.4).

Confirmed by the owner in the design review (2026-10-15):

- Node and Git come from their official installers, and research-harness comes from a zip on the
  GitHub release with a start file. The rejected options were a self-contained zip carrying
  `node.exe` and MinGit, and starting through Claude on Windows.
- The line-ending fix (section 4) runs first, ahead of the rest.

## 3. Where things stand

Checked on `main` at `e6967d3`, 2026-10-15:

- Sub-project 1 Tasks 1 to 8 have landed: `hooks/lib/app-git.js`, `app-cli.js`, `app-store.js`,
  `app-api.js`, app mode in `bin/canvas-serve.js`, `serve --app`, `dashboard/app.html`, `desktop/`.
- `app-git.js` runs `RESEARCH_HARNESS_GIT` or else `git` from `PATH` through `execFile`, and answers
  `git-missing` on `ENOENT`. Node finds `git.exe` on `PATH` without a shell.
- `app-cli.js` runs the CLI as `process.execPath` plus the script path, so no shebang and no `.cmd`
  shim are involved.
- `canvas-serve.js` `openInBrowser` has a win32 branch (`cmd /c start "" <url>`). The code in the URL
  is 32 hex characters (`crypto.randomBytes(16).toString('hex')`), so nothing in it is special to
  `cmd`.
- Without a host, the dialogs in `app.html` show path fields. `val()` trims whitespace only, and
  `app-api.js` checks `path.isAbsolute`. A path pasted from File Explorer's "Copy as path" arrives as
  `"C:\Users\…\paper"`, quotes included, fails that check and gets "The chosen folder does not
  exist." This was read in the code, not run.
- `install-cli` writes a POSIX shell shim, which does nothing on Windows.
- `scripts/release.js` creates the GitHub release with notes and no assets.

## 4. Line endings (first, independent of the rest)

### 4.1 The finding

Git for Windows installs with `core.autocrlf=true`; the installer calls the option "Checkout
Windows-style, commit Unix-style line endings" and marks it recommended. That comes from install guides
found on 2026-10-15 and was not checked on a Windows machine. With that setting every text file in a
clone has CRLF line endings in the working copy.

The plugin splits files on `\n`, its heading patterns end in `$`, and JavaScript's `.` does not match
`\r`. A probe on 2026-10-15 built a sealed log in memory with the plugin's own `sealEntry`, then read
it and a canvas fixture as LF and as CRLF:

```
decision log, read by parseDecisions and verifyChain:
LF:   entries parsed 2, maxSeq 2, chain verified
CRLF: entries parsed 0, maxSeq 0, chain verified
canvas test/fixtures/constant-checking/research/canvas.md, read by parseCanvas:
LF:   elements 9, statements 30, markers {"proposed":4,"stated":26}
CRLF: elements 0, statements 0, markers {}
```

So a CRLF log reads as an empty log that verifies, and a CRLF canvas reads as a canvas with no
statements. This hits everyone whose git converts line endings, including Claude Code users on Windows
today, not only the browser fallback. The guard parses the canvas with the same functions. What it
allows on a canvas it reads as empty was not tried.

### 4.2 The fix, in three layers

1. **At the source.** `research-harness init` (also `init --variant`) writes
   `research/.gitattributes` with the single rule `* text eol=lf`. A `.gitattributes` inside
   `research/` covers every file below it and overrides `core.autocrlf`. It leaves a repository's own
   root `.gitattributes` untouched, which matters because import mode runs in existing repositories.
   An existing `research/.gitattributes` stays as it is.
2. **At clone.** `app-git.js` clones with `-c core.autocrlf=false`. Git writes that into the new
   clone's own config before it checks files out, so later pulls keep LF as well. This covers projects
   created before layer 1.
3. **Refuse what still gets through.** A research file that contains a CR directly before an LF is
   unreadable to the harness. `parseCanvas`, `parseDecisions` and the glossary parser report it as a
   structural problem, naming the file and the first such line. Every caller treats it like any other
   structural problem:
   - `review` and `status` print it;
   - `verifyChain` returns `broken` with why `line-endings`, so `sealedAppend` refuses to append;
   - the server's state shows it;
   - the guard denies every edit to that file, giving the same reason.

   The harness does not repair the file. It never rewrites a ledger (`seal.js`), and a canvas rewritten
   behind the person's back would be the same kind of act. A lone CR not followed by LF stays with the
   existing control-character checks.

Layers 1 and 2 were probed with plain git on macOS on 2026-10-15, with `core.autocrlf=true` in a
temporary global config (`GIT_CONFIG_GLOBAL`). A clone of a repository holding `research/.gitattributes`
checked out `research/log.md` and `research/sub/x.md` with LF and the root `root.md` with CRLF. A
repository without it checked out `research/log.md` with CRLF, and with LF when cloned with
`-c core.autocrlf=false`. Tests must set the value in a global config: `git -c core.autocrlf=true` on
the command line outranks the clone's own config and gives a false result.

The message says what happened and that nothing was changed, then points to a README section with the
repair for a hand-made clone: when `git status` shows no changes of the person's own, run
`git config core.autocrlf false`, `git rm -r -q --cached research` and `git checkout HEAD -- research`
in the project folder. A plain `git checkout -- research` is not enough: once the clone's index is
no longer racily clean, git skips files it considers unchanged and the CRLF stays (found at the
integration of SQ-289). The plan runs
this sequence in a test (section 9) before the README claims it. A clone made by the app never gets
there, because of layer 2.

### 4.3 Order

Wave 1 is this section. It does not depend on sub-project 1's shell, can start now, and ships as a
plugin release of its own, with a CHANGELOG line for Claude Code users on Windows. Wave 2 (sections 5
to 7) keeps the vault's order and comes last.

## 5. Getting research-harness onto a Windows machine

### 5.1 What the person installs

1. Git for Windows from git-scm.com, with the installer's defaults. It puts `git.exe` on `PATH` and
   brings Git Credential Manager, which signs in to GitHub and similar hosts in a window of its own.
   Its `core.autocrlf=true` default is handled by section 4.
2. Node.js LTS from nodejs.org, version 22 or newer.
3. `research-harness-windows.zip` from the latest GitHub release, unzipped wherever they like.

The Node installer may ask for administrator rights, and on a managed university machine that can
mean asking IT. This was not checked, and the README says so.

### 5.2 The zip

The asset name carries no version, so the README can link
`github.com/DanielHeinz7/research-harness/releases/latest/download/research-harness-windows.zip`. The
version is in the folder name inside:

```
research-harness-<version>-windows/
  Start research-harness.cmd
  README.txt
  research-harness/          the plugin directory without test/
```

`README.txt` covers, in plain words:

- the two installers to run first, with their links;
- how to start, and that the black window must stay open while working;
- how to stop;
- that a reload of the page needs a restart;
- how to update: download the new zip and replace the folder (projects and the recent-projects list
  live elsewhere and stay);
- that Windows may warn the first time.

### 5.3 The start file

`Start research-harness.cmd` is ASCII with CRLF line endings. cmd.exe misreads labels in batch files
with LF endings, so the build writes CRLF whatever the repository holds. It carries no more logic than
this:

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

Everything else lives in Node, where tests on macOS reach it. Before it starts the server,
`serve --app` does three things:

- On Node older than 22 it refuses with the same two sentences and exits 1, so the window pauses.
- It runs `git --version` through `gitBinary()`. When git is missing it prints one line naming Git for
  Windows and its download page, then starts anyway. Opening a project and running a meeting work
  without git; clone, update and send report the missing program at their buttons.
- After the URL it prints: "research-harness is running in your browser. Keep this window open while
  you work; close it to stop." The line appears in app mode on every platform, because the Electron
  app calls `canvas-serve.start` directly and never reaches `serve()`.

### 5.4 Build and release

`scripts/windows-zip.js <version> [--out <dir>]` builds the zip on the release Mac. It copies the
plugin directory without `test/`, writes the start file and `README.txt` with CRLF from their sources
in `windows/`, and zips with macOS's `/usr/bin/zip -r -X` through `execFile`.

`scripts/release.js` builds the zip after the version commit and attaches it in `gh release create`,
next to whatever sub-project 4 attaches. The Windows zip goes out with every release, whatever the
signing setting. Both sub-projects edit `release.js` and `release.test.js`; whichever lands second
rebases onto the other.

## 6. Browser mode: what changes on the page and the routes

These changes apply to browser mode on every platform. None of them changes what the Electron app
does, because there the host bridge supplies pickers and Finder.

- **Paths.** `app-api.js` normalises every path it receives before it validates it: trim, then strip
  one pair of surrounding double quotes. Doing this on the server puts it next to `path.isAbsolute`
  and makes it testable with node:test.
- **Platform and home.** `GET /api/app/projects` adds `host: { platform, home }`, from
  `process.platform` and `os.homedir()`. It needs the token like every app route.
- **Hints.** Each path field gets one line on how to copy a path. On Windows: "In File Explorer,
  right-click the folder (Shift+right-click on Windows 10) and choose Copy as path, then paste it
  here." On macOS: "In Finder, select it and press Option+Command+C, then paste it here."
- **Prefill.** Folder fields start with `home`, and file fields with `home` plus the suggested file
  name, joined with the platform's separator. The person types over them.
- **OneDrive.** On win32, `init` and `clone` refuse a target folder inside `%OneDrive%`,
  `%OneDriveCommercial%` or `%OneDriveConsumer%`, with code `onedrive` (section 8). Opening an existing
  project there works and adds one warning line in the sidebar. Many managed Windows machines redirect
  Documents and Desktop into OneDrive, which is why the prefill is the home folder and not Documents.
- **Reveal.** Without a host, the outcome line after Invite co-author and Export minutes shows the full
  path with a Copy path button (`navigator.clipboard.writeText`). This assumes a page on
  `http://127.0.0.1` counts as a secure context, which current browsers document; it was not tried in
  Edge.
- **Link already used.** When the code was redeemed before (a reload, a second tab), browser mode
  says, on Windows (`navigator.userAgent` contains "Windows"): "This page was opened before. Close
  the research-harness window and double-click Start research-harness again." Elsewhere it says: "This
  page was opened before. Stop research-harness serve --app with Ctrl+C and start it again." The
  Electron app keeps today's sentence.

## 7. The plugin on win32

- `install-cli` refuses with exit 2: "install-cli writes a shell command for macOS and Linux. On
  Windows, start research-harness with Start research-harness.cmd."
- `git-missing` on win32 adds: "Install Git for Windows from https://git-scm.com/download/win and
  start research-harness again."
- Credentials: browser mode sets no `GIT_ASKPASS`. Git Credential Manager opens its own sign-in window
  and stores the credential in Windows Credential Manager, according to its documentation.
  `GIT_TERMINAL_PROMPT=0` stays, on the assumption that the manager's window is not a terminal prompt.
  Not tried.
- ssh links are accepted as today, but setting up an ssh key needs a terminal, so the Clone dialog's
  hint on win32 recommends the https link.
- Key files: `mode 0o600` has no effect on Windows. The key sits in the user profile
  (`%USERPROFILE%\.claude\research-harness\…`), whose default access list admits that user and
  administrators. That is assumed, not checked, and it gets no code here, only a line in section 10.

## 8. Errors

Every route keeps the `{ ok, code, error }` shape, and the shell shows the message next to the control
that caused it.

- `line-endings`: "research/decisions.md has Windows line endings (CRLF), so research-harness cannot
  read it. Nothing was changed." Then a pointer to the README section of 4.2. The file named is the
  one found.
- `onedrive`: "This folder is synced by OneDrive. Git and OneDrive both change the files in .git and
  get in each other's way. Choose a folder outside OneDrive, for example C:\Users\<name>\research." The
  example uses the real home folder.
- git missing and Node too old: the sentences in 5.3 and 7.

## 9. Testing

Everything runs on macOS. Nothing runs on Windows.

- **Line endings (wave 1).** node:test with a bare remote and a temporary global git config
  (`GIT_CONFIG_GLOBAL`) that sets `core.autocrlf=true`:
  - a project made by the new `init` and cloned by hand stays LF and verifies;
  - a project without `research/.gitattributes`, cloned by hand, gets CRLF, and `review`, `status`,
    `verifyChain`, `sealedAppend` and the guard each refuse with `line-endings`; then the README's
    repair runs and the log verifies again;
  - the same project cloned through `app-git.clone` stays LF.

  Parser unit tests feed CRLF strings to the canvas, decision log and glossary parsers.
- **Zip.** Build into a temporary folder and unzip it. Check the layout, the start file's ASCII and
  CRLF, and that `test/` is absent. Then start `serve --app --no-open` from the unzipped copy with a
  fixture project, and check that the shell page and `/api/state` answer.
- **Start notes.** The checks before `serve --app` starts are a pure function of platform, Node
  version and whether git answered, with one test per case.
- **Paths and OneDrive.** Unit tests for the normalisation, and for the OneDrive check with injected
  platform and environment. Windows paths go through `path.win32`, because `path.isAbsolute('C:\\x')`
  is false on macOS.
- **Shell page, rendered**, as in `app-shell.test.js`, with no host:
  - a quoted path opens the fixture project;
  - the hint line appears;
  - Copy path appears after Export minutes;
  - with a Windows user agent set in Playwright, a used link shows the Windows sentence.
- **Not tested:** anything on a Windows machine. That covers the installers, the security prompt,
  Credential Manager, Edge, cmd.exe's reading of the start file, and file locking.

## 10. Limits stated plainly

- Untested on Windows, no CI (owner, 2026-10-14). The first Windows user is the first test.
- The first double-click on a downloaded `.cmd` can bring a Windows security prompt, either "The
  publisher could not be verified" or SmartScreen. The person clicks Run, or More info and then Run
  anyway. Which one appears was not checked.
- The black window is the server, and closing it stops research-harness. A reload or a second tab
  needs a restart, because the code in the address works once and the token lives only in the page's
  memory.
- Two double-clicks start two servers on two ports, and both can open the same project. Nothing
  prevents that.
- No automatic updates; a new version is a new zip.
- No agent in browser mode. Sub-projects 2 and 3 are for the macOS app.
- An agent or program that drives the browser acts as the person, the same limit sub-project 1 §7
  names for the app window.
- On Windows, a write can fail while another program (antivirus, an editor) holds the file. The person
  sees the error and tries again; there is no retry loop.
- The key file's protection on Windows rests on the user profile's access list (section 7).

## 11. Out of scope

A native Windows app or installer (MSI, MSIX), signing, winget, CI on Windows, a Linux package, the
agent on Windows, ssh key setup, and cloud folders on macOS (iCloud Drive, OneDrive for Mac).

## 12. Files this sub-project touches

Wave 1: `plugins/research-harness/hooks/lib/canvas.js`, `decisions.js`, `seal.js`, `glossary.js`,
`app-git.js`, `hooks/guard-promotion.js`, `bin/research-harness.js` (`init`), their tests, and the
README.

Wave 2: `plugins/research-harness/bin/research-harness.js` (`serve`, `install-cli`),
`hooks/lib/app-api.js`, `app-git.js` (message), `dashboard/app.html`, `scripts/windows-zip.js`,
`windows/Start research-harness.cmd`, `windows/README.txt`, `scripts/release.js`,
`scripts/release.test.js`, their tests, and the README.

Shared with sub-project 4: `dashboard/app.html`, `scripts/release.js`, `scripts/release.test.js`.
