# Desktop app, sub-project 4: distribution, signing and updates

Status: approved by the owner, 2026-10-15. Corrected the same day from the live state of `desktop/`
(sub-project 1 landed with electron-builder 26.17.0 and dugite 3.2.3): signing details in 4.2, 4.3
and 6. The design did not change.
Decision record: vault `appdev/research-harness.md`, blocks of 2026-10-14 ("Desktop-App mit eigenem
Agenten") and 2026-10-15 ("Desktop-App: Proposal-Satz, Video, handoff-Skill; Apple-Konto
recherchiert"). Builds on sub-project 1: spec `2026-10-15-desktop-app-shell-design.md` (`990bbed`),
plan `2026-10-15-desktop-app-shell.md` (`47be2fa`), Task 8 (the Electron app and its unsigned
`--mac dir` build).

## 1. Goal

A researcher who is not a developer downloads the app from the project's GitHub page, opens it by
double-click, and gets later versions without visiting the page again.

The owner's success criterion is "a public download without a Gatekeeper warning". In this spec that
means: on a Mac where the file arrived through a web browser, the only dialog at first launch is
macOS's standard "…is an app downloaded from the Internet. Are you sure you want to open it?". Never
"Apple could not verify…" and never "…is damaged and can't be opened".

That takes a Developer ID certificate, and nobody has decided yet whose Apple account issues it. So
this sub-project builds two states and the switch between them:

- **No account (now).** Local builds, ad-hoc signed, for the owner's own tests. No app file goes to
  GitHub.
- **Account (later).** Every release carries a signed and notarized app, and installed copies update
  themselves.

Turning signing on is one committed file and two keychain entries on the release Mac. No code
changes that day.

## 2. Decided before this spec

From the vault, owner's words recorded there:

- Build unsigned for now. Whose Apple Developer account signs stays open; the owner decides when the
  app is to go to other people (2026-10-15). This spec reads that as: until then, no app file is
  published.
- Success for the desktop app includes a public download without a Gatekeeper warning (2026-10-14).
- Releases appear on GitHub with notes a user can read; `scripts/release.js` tags and creates the
  GitHub release from the `CHANGELOG.md` section (2026-10-01).
- macOS only; Windows gets the browser fallback (sub-project 5), no installer.

Checked for this spec on 2026-10-15, at the source:

| Fact | Source |
|---|---|
| macOS Sequoia opens an app from an unidentified developer only through System Settings → Privacy & Security → "Open Anyway"; the page does not mention Control-click → Open. | support.apple.com/102445 |
| electron-builder skips signing when no identity is found and does not ad-hoc sign by itself; `identity: "-"` ad-hoc signs and adds `allow-jit` and `disable-library-validation` itself. It signs nested frameworks and helpers. Notarization: `mac.notarize: true`, credentials from `APPLE_KEYCHAIN_PROFILE` + `APPLE_TEAM_ID` (or Apple ID or API key variables). A stock Electron app needs no entitlements file. | electron-builder `website/docs/features/code-signing/code-signing-mac.md`, `notarization.md` (master) |
| Current stable electron-builder is 26.15.3 (`npm view`, `latest`); `desktop/` pins 26.17.0 (tag `v26`). 27 is in alpha and moves the signing keys under `mac.sign`. In 26 the notarization options are API key, Apple ID, or `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`. | npm, `desktop/package.json`, `app-builder-lib/scheme.json` at `electron-builder@26.15.3` |
| "macOS application must be signed in order for auto updating to work"; the `zip` target is required, otherwise `latest-mac.yml` is not written. | electron-builder `features/auto-update.md` |
| electron-updater's GitHub provider, with prereleases off, reads `github.com/<owner>/<repo>/releases/latest`, the release marked Latest. | `electron-updater/src/providers/GitHubProvider.ts`, `getLatestTagName` |
| electron-updater's `isUpdaterActive()` returns true for any packaged app; it does not look at signing. | `electron-updater/src/AppUpdater.ts` |
| Only the Account Holder creates Developer ID certificates; up to five Developer ID Application certificates per account. | developer.apple.com/support/developer-id |
| dugite downloads the git for `npm_config_arch` when that is set, so an Intel build can be made on an Apple silicon Mac. | dugite `script/config.js` |
| `github.com/<owner>/<repo>/releases/latest/download/<asset>` links to a manually uploaded asset of the latest release. | docs.github.com, "Linking to releases" |
| The repository is public; plugin releases are tagged `v<version>`, and `release.js` marks each one Latest. | `gh repo view`, `gh release list`, `scripts/release.js` |

Assumed, not checked: that a build with no signature at all, once downloaded, shows "is damaged"
rather than offering "Open Anyway" on Apple silicon. The plan's first task tries it. The 99 USD
yearly price of a personal membership comes from the subagent research recorded in the vault and was
not reread.

## 3. Approaches considered

**Where the app is built and signed.**

1. *Locally, inside `scripts/release.js`, on the Mac that holds the certificate (chosen).* The
   private key and the notarization credentials stay in that Mac's keychain, matching the owner's
   rule that keys never sit on a command line or in a file. There is one release path, as today, and
   no secret on GitHub. It works whoever owns the account, as long as the certificate can be imported
   into the release Mac's keychain.
2. *GitHub Actions on a macOS runner, triggered by the tag.* Reproducible and independent of one Mac,
   but the certificate (`.p12` plus password) and the notarization key become repository secrets, and
   a second release path appears next to `release.js`. If the account turns out to be KIT's, the
   certificate may not be allowed to leave a KIT-managed machine at all.
3. *A separate release stream for the app* (tags `desktop-v*`, or a second repository). The plugin
   and the app could release independently. But electron-updater follows the release marked Latest,
   which the plugin releases hold, and two streams in one repository would fight over that mark.

**Version.** The app's version is the version of the plugin it bundles. One GitHub release per
version carries the plugin notes and, once signing is on, the app files. A fix only in the app ships
as a normal plugin patch release with a "Desktop app" line in its notes. This also gives sub-project 2
a simple comparison between the app's plugin and one installed in Claude Code.

**Processor types.** Two apps, one for Apple silicon (`arm64`) and one for Intel (`x64`), each with
the git built for it. A single universal app would mean one download button, but it doubles the
download for everyone and depends on merging two different git builds into one bundle, which nobody
has tried. electron-updater picks the right file per processor from one `latest-mac.yml`.

## 4. Design

```
desktop/distribution.json ──▶ desktop/scripts/dist.js ──▶ electron-builder (arm64, then x64)
   "none" | "developer-id"        refuses missing keys        ad-hoc  |  Developer ID + notarize
                                          │
                                          ▼
                                desktop/scripts/verify-app.js
                                          │
              scripts/release.js ◀────────┘  (developer-id only: attach to the GitHub release)
                                          │
                                          ▼
          installed app: desktop/updater.js ──▶ sidebar line in dashboard/app.html
```

### 4.1 The switch: `desktop/distribution.json`

Now:

```json
{ "signing": "none" }
```

The day an account exists:

```json
{
  "signing": "developer-id",
  "identity": "Developer ID Application: <name> (<TEAMID>)",
  "teamId": "<TEAMID>",
  "notaryProfile": "research-harness-notary"
}
```

The file holds nothing secret: a certificate's name, a team ID, and the name of a keychain entry. The
secrets live in the login keychain of the release Mac: the certificate's private key, and the
notarization credentials that `xcrun notarytool store-credentials research-harness-notary` saves (it
asks for the app-specific password itself, or takes an App Store Connect API key file). A reader of
`distribution.json` refuses any other field.

### 4.2 Building: `desktop/scripts/dist.js`

`npm run dist` runs this script instead of sub-project 1's `electron-builder --mac dir`. For
`arm64`, then `x64`:

1. Put that processor's git in place (dugite with `npm_config_arch`) and bundle the plugin (sub-project
   1, Task 8).
2. Run electron-builder with targets `dmg` and `zip`, the app version set from the plugin's
   `plugin.json`, the signing mode written into the app's `package.json` (`harnessSigning`, through
   `extraMetadata`), and fixed file names: `research-harness-mac-arm64.dmg` and
   `research-harness-mac-x64.dmg` (no version, so the download links in 4.6 never change), and
   `research-harness-<version>-mac-<arch>.zip` for updates.
   The app and its program are called `Placet` (`productName`); `research-harness`
   stays the CLI's name. The plugin's guard reads a program called `research-harness` as a CLI
   call and refuses non-reading commands in the same line (found in the lane "Desktop-App
   Design", replayed 2026-10-15 with `hooks/guard-promotion.js` in the repository and in an empty
   folder: deny for `research-harness`, allow for `myapp`; repeated for `Placet`, the name the owner
   chose on 2026-10-15: allow). The guard is not loosened for this.
3. Sign according to the switch:
   - `none`: ad-hoc (`identity: "-"`), hardened runtime on with an entitlements file that grants
     `allow-jit` and `disable-library-validation` (electron-builder 26 does not add the second one
     itself; its schema says so), no notarization, no publish settings.
   - `developer-id`: the identity from the file, without the "Developer ID Application: " prefix
     (electron-builder 26 refuses the prefix, `macCodeSign.ts`), hardened runtime on with `allow-jit`
     only, `notarize: true`, and publish settings for this repository with `--publish never`
     (uploading is `release.js`'s job). `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE` go only into
     electron-builder's environment (electron-builder 26's third notarization option).
   - Both modes: Mach-O files that arrive already signed with a Developer ID, hardened runtime and a
     timestamp keep that signature (`mac.signIgnore`, computed from `codesign` before the build).
     dugite's git has 55 Mach-O files: 30 ad-hoc, 24 signed by Microsoft (Git Credential Manager and
     its .NET runtime), 1 signed by GitHub (checked 2026-10-15 in `desktop/node_modules/dugite/git`).
     Re-signing the .NET files would replace Microsoft's entitlements with ours.
4. Check the result with `verify-app.js` (4.3).

The two runs each write a `latest-mac.yml`; the script merges them into one that lists both zips.

Ad-hoc rather than no signature in `none` mode: an ad-hoc seal makes `codesign --verify --deep
--strict` pass in both modes, so one verification path covers both. If the plan's first task shows
that an unsigned download says "is damaged", ad-hoc is also what keeps "Open Anyway" available for
the owner's test copies.

Before building in `developer-id` mode, the script refuses (exit 2) when `security find-identity -v
-p codesigning` does not list the identity, or when `xcrun notarytool history --keychain-profile
<profile>` fails. The message names the missing piece and the runbook section that fixes it.

### 4.3 Checking: `desktop/scripts/verify-app.js`

For each built app:

- `codesign --verify --deep --strict` passes.
- Every Mach-O file inside the bundle is signed, found by walking the bundle and asking `file`. This
  covers dugite's git and whatever binary another sub-project adds later. Each one has the
  hardened-runtime flag (`codesign -dvvv`). In `developer-id` mode each one also has a secure
  timestamp and either the team ID from `distribution.json` or a Developer ID signature it arrived
  with (kept, see 4.2); the script lists the kept ones by team.
- The bundled git and its credential manager still run inside the signed app (`git --version`,
  `git credential-manager --version`).
- The bundled git is built for the app's processor (`file` says `arm64` or `x86_64`), and
  `git --version` runs from inside the bundle.
- `developer-id` only: `xcrun stapler validate` passes for the app, and `spctl --assess --type execute
  -vv` reports `source=Notarized Developer ID`.
- `none` only: `spctl` rejects the app, and the script says in one line that this build is for local
  tests and cannot be published.

### 4.4 Releasing: `scripts/release.js`

With `"signing": "developer-id"`:

- In step 1 (refuse before anything runs), the same identity and profile check as `dist.js`, so a
  missing key stops the release before the test suite runs.
- After the version commit and before the tag: `npm ci` in `desktop/`, then `npm run dist`. If either
  fails, nothing is tagged or pushed; the commit stays local, as with any failing step today.
- `gh release create` uploads both DMGs, both zips, their blockmaps and `latest-mac.yml` with the
  release, so the release marked Latest always has the app.
- Afterwards it downloads `latest-mac.yml` and both DMGs back from the release and compares their
  SHA-512 with the local files.

With `"signing": "none"` there is no app step; the release prints one line: "desktop app: not
attached (signing is none)". `--dry-run` lists the app steps it would run.

### 4.5 Updating: `desktop/updater.js`

electron-updater with the GitHub provider, started only when the packaged app's `harnessSigning` is
`developer-id`. The check is ours: electron-updater's `isUpdaterActive()` only asks whether the app
is packaged (`AppUpdater.ts`), so a `none` build would otherwise try to update and fail.

- Checks at start and once a day while the app is open, and from the app menu item "Check for
  Updates…". A menu checkbox "Check for Updates Automatically", on by default, is stored with the
  app's settings (sub-project 1, §3.5).
- Downloads in the background; the update is installed when the app quits. Prereleases and downgrades
  are off.
- When an update is ready, the sidebar says "Version 0.7.0 is ready. It installs when you quit
  research-harness." with a "Restart now" button. Never a toast.
- A failed automatic check shows nothing (no network at a conference is not news); a failed manual
  check shows one line next to where the result would be, with the reason.
- The check contacts github.com and GitHub's download host; the README's download section says so.

The shell page learns about updates through two optional members of the host bridge
(`onUpdate(callback)`, `restartToUpdate()`), added to `preload.js`. `dashboard/app.html` shows the
line only when the bridge has them, so the browser fallback is unchanged.

### 4.6 The download

In the commit that turns signing on, the README gets a "Download the app" section: two links of the
form `…/releases/latest/download/research-harness-mac-arm64.dmg` (and `-x64.dmg`), how to tell which
Mac you have (Apple menu → About This Mac: "Chip" means Apple silicon, "Processor … Intel" means
Intel), what the first-launch dialog says, and that the app checks GitHub for updates. Until then the
README offers no download.

### 4.7 Runbook: `docs/desktop-signing.md`

What to do on the day an account exists, in order, with who does each step: the Account Holder
creates a Developer ID Application certificate; its private key goes into the release Mac's login
keychain; `xcrun notarytool store-credentials`; fill in `distribution.json`; `npm run dist`; test a
downloaded copy (see 6, owner check); release. It also says what happens when the certificate expires, quoting Apple's page.

## 5. Errors

- A missing identity, a missing or rejected notarization profile, or an invalid `distribution.json`:
  exit 2 before anything is built, with the missing piece named.
- Notarization rejected: the build fails, the script prints the submission ID and the command that
  shows Apple's log, and nothing is uploaded.
- A failed check in `verify-app.js`: nothing is uploaded; the message names the file and the check.
- Upload or read-back mismatch: the release exists with incomplete files. The message says so and
  names `gh release upload --clobber` for the missing file. The plugin part of the release is
  already done at that point, as today.
- Updater: a download whose signature does not match the running app is refused by Squirrel.Mac and
  never installed; the manual-check line reports it.

## 6. Testing

- Unit tests (node:test in `desktop/test/`): `distribution.json` validation (unknown field, missing
  field); the mapping from mode to electron-builder settings and environment (`none`: ad-hoc, no
  notarization, no publish settings; `developer-id`: identity, notarization, publish settings,
  credentials only in the child's environment; `harnessSigning` in both); `updater.js` not starting
  when `harnessSigning` is `none`; the `latest-mac.yml` merge; `verify-app.js`'s reading
  of recorded `codesign`, `spctl` and `file` output; `release.js` refusing `developer-id` without an
  identity (stubbed `security`) and attaching nothing in `none` mode (dry-run output).
- Local build, `none` mode, on the owner's Mac: both DMGs build and pass `verify-app.js`. A copy
  marked as downloaded (`com.apple.quarantine`, or a real browser download) is opened, and the dialog
  macOS shows is recorded for a build with no signature and for the ad-hoc build. This settles the
  assumption in §2.
- The Intel app is started under Rosetta on an Apple silicon Mac (`arch -x86_64`), and its git
  reports `x86_64`.
- Signing path without an account: every `none` build already runs with the hardened runtime, so the
  local build shows that the app, git and the credential manager start under it. A self-signed
  certificate cannot stand in for a Developer ID: electron-builder looks identities up with
  `security find-identity -v -p codesigning` (`macCodeSign.ts`), which lists only trusted ones, and
  trusting a certificate asks for the account password in a dialog. What a real identity adds (team
  ID, library validation, notarization) waits for the account.
- Not testable before an account exists: notarization, stapling, and a real update. The first signed
  release is that test, run by the owner: install version N from the download link on a second user
  account, release N+1, see the sidebar line, restart, check the version.
- Shell line: a rendered test of `app.html` with a fake host bridge that reports an update, in light
  and dark, keyboard path to "Restart now".

## 7. Limits stated plainly

- No account, no public app. Until the owner decides, the only app copies are the owner's own builds.
- Changing the signing account after the first public release costs a manual reinstall: Squirrel.Mac
  installs only an update whose signature satisfies the running app's designated requirement, which
  names the team. This follows from Squirrel.Mac's design and was not tested here. Choose the
  long-term account before the first public release.
- Sub-project 1 runs the plugin CLI as `ELECTRON_RUN_AS_NODE=1` with the app binary (its plan, Task
  3), so the `RunAsNode` fuse must stay on. A signed app with that fuse on can be used by any local
  program as a Node runtime that carries the app's signature. Turning it off means moving those CLI
  runs into a `utilityProcess`; that is left for a later hardening pass.
- The Intel app is tested under Rosetta, not on an Intel Mac.
- The update check tells GitHub that someone at this address runs the app.

## 8. Out of scope

Choosing the account; the Mac App Store; CI builds; Windows and Linux packages; Electron fuses;
staged rollouts; a universal app.

## 9. Files this sub-project touches

Created: `desktop/distribution.json`, two entitlements files, `desktop/scripts/dist.js`, `desktop/scripts/verify-app.js`,
`desktop/updater.js`, `desktop/test/*`, `docs/desktop-signing.md`. Changed: `desktop/package.json`
(`dist` script, electron-updater), `desktop/electron-builder.yml` (settings move into `dist.js`),
`desktop/main.js` and `preload.js` (updater, two bridge members), `plugins/research-harness/dashboard/app.html`
(the update line), `scripts/release.js` and `scripts/release.test.js`, and the README in the commit
that turns signing on.

All of `desktop/` comes from sub-project 1, Task 8, which landed on `main` on 2026-10-15 (`a3cba17`).
