# Desktop App Distribution, Signing and Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, tasks run as Sidequest tickets in worktrees, one ticket per task.

**Goal:** One committed switch (`desktop/distribution.json`) decides whether `npm run dist` makes local ad-hoc test builds (now) or Developer ID signed, notarized builds that `release.js` attaches to the GitHub release and that update themselves (once an Apple account exists).

**Architecture:** `desktop/lib/distribution.js` reads the switch and turns it into electron-builder settings; `desktop/scripts/dist.js` builds arm64 and x64 (each with its own git), keeps third-party Developer ID signatures, checks every build with `desktop/lib/verify.js`, and collects the release files. `scripts/release.js` builds and attaches the app only in `developer-id` mode. `desktop/updater.js` runs electron-updater only in `developer-id` builds and reports to a line in `dashboard/app.html`.

**Tech Stack:** Node (node:test), electron-builder 26.17.0 (pinned in `desktop/package.json`; v26 keys `mac.identity`, `mac.hardenedRuntime`, `mac.notarize`, not v27's `mac.sign`), electron-updater 6.8.10, dugite 3.2.3, macOS `codesign`, `spctl`, `xcrun notarytool`/`stapler`, `security`, `gh`.

**Spec:** `docs/superpowers/specs/2026-10-15-desktop-app-distribution-design.md` (approved `e6967d3`, corrected from the live `desktop/` state in `e72d774`).

## Global Constraints

- No app file is uploaded anywhere while `distribution.json` says `"signing": "none"`.
- Nothing secret in a file, a command line, a log or a commit: the private key and the notarization credentials live only in the release Mac's login keychain. `distribution.json` holds a certificate name, a team ID and a keychain profile name, nothing else.
- `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE` are set only inside `dist.js`'s own process, for the electron-builder call, and restored afterwards.
- electron-builder 26 keys only. The identity goes to electron-builder without the "Developer ID Application: " prefix (26 refuses it: `macCodeSign.ts`).
- Hardened runtime on in both modes. `none`: `entitlements.adhoc.plist` (allow-jit, disable-library-validation); `developer-id`: `entitlements.mac.plist` (allow-jit only).
- Mach-O files that arrive with a Developer ID signature, hardened runtime and a timestamp keep it (`mac.signIgnore`).
- npm versions exact, each the newest release older than 14 days (`npm view <pkg> time --json`): electron-updater 6.8.10 (published 2026-09-26).
- The plugin stays dependency-free. No shell: `spawnSync`/`execFile` with argument arrays.
- Never press "Open Anyway", never change Gatekeeper settings (`spctl --master-disable`, `--add`) on the owner's Mac.
- Code style: `desktop/` uses `'use strict'`, single quotes, arrow functions; `scripts/release.js` and its test use double quotes and `function`. English for code, UI, docs, commits.
- No release fragment in `.release/unreleased/`: nothing here reaches a user until signing is on.

Test commands:
- desktop: `cd desktop && npm test` (Playwright tests through `NODE_PATH=~/dh-appdev/dsi-pubs/node_modules`)
- plugin: `cd plugins/research-harness && NODE_PATH=~/dh-appdev/dsi-pubs/node_modules node --test --test-timeout=120000 "test/*.test.js"`
- release script: `node --test scripts/release.test.js`

## Review Focus

1. `npm run dist` fails after the release's version commit (notarization rejected, a check fails): nothing may be tagged or pushed, and the message must say which step failed. Pinned in Task 5 (failing `npm run dist` test).
2. `dist.js` stops halfway (Ctrl-C after the x64 git was fetched, or a failed build): the checkout must not be left with an Intel git, or `npm start` and the tests fail with "Bad CPU type". Pinned in Task 4 (`finally` restores the host git; Step 7 checks `file` afterwards).
3. Re-signing breaks the bundled Git Credential Manager (.NET, signed by Microsoft): cloning a private repository would then fail inside the signed app. Pinned in Task 3 (`verifyApp` starts `git credential-manager --version` in the built app) and Task 4 (`signIgnore`).
4. Somebody pastes a password or API key into `distribution.json`: refused as an unknown field, never passed on. Pinned in Task 2.
5. GitHub serves something other than what was uploaded (an interrupted upload): the release reports it and names `gh release upload --clobber`. Pinned in Task 5 (read-back mismatch test).

## File map

| File | Task | Responsibility |
|---|---|---|
| `desktop/entitlements.adhoc.plist`, `desktop/entitlements.mac.plist`, `docs/desktop-signing.md` | 1 | entitlements; what macOS shows for a test build |
| `desktop/distribution.json`, `desktop/lib/distribution.js` | 2 | the switch; electron-builder settings; keychain preflight |
| `desktop/lib/macho.js`, `desktop/lib/verify.js`, `desktop/scripts/verify-app.js` | 3 | Mach-O walk and signatures; checks on a built app |
| `desktop/lib/update-feed.js`, `desktop/scripts/dist.js`, `desktop/package.json`, `desktop/electron-builder.yml` (deleted) | 4 | the build for both processors |
| `scripts/release.js`, `scripts/release.test.js` | 5 | attach the app to a release, read it back |
| `desktop/updater.js`, `desktop/main.js`, `desktop/preload.js` | 6 | updates and their menu |
| `plugins/research-harness/dashboard/app.html`, `plugins/research-harness/test/app-shell.test.js` | 7 | the update line |
| `docs/desktop-signing.md`, spec §4.7 | 8 | runbook for the day an account exists |

**Sequencing.** Task 1, then 2. Tasks 3 and 7 can run in parallel after 2. Task 4 needs 2 and 3. Tasks 5 and 6 need 4 (both touch what 4 builds; 6 also edits `desktop/package.json` and `lib/distribution.js`). Task 8 closes. Tasks 1 and 4 open windows and dialogs: they run on the owner's Mac in a normal user session, not in a sandbox.

---

### Task 1: What macOS shows for a downloaded test build

Settles the assumption in spec §2: a build with no signature at all, once downloaded, says "is damaged" instead of offering "Open Anyway". Also shows what ad-hoc re-signing does to the Git Credential Manager.

**Files:**
- Create: `desktop/entitlements.adhoc.plist`, `desktop/entitlements.mac.plist`, `docs/desktop-signing.md`

**Interfaces:**
- Produces: the two entitlements files at these paths (Task 2 references them by name).

- [ ] **Step 1: Entitlements files**

`desktop/entitlements.adhoc.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

`desktop/entitlements.mac.plist`: the same without the `disable-library-validation` pair. Then `plutil -lint desktop/entitlements.adhoc.plist desktop/entitlements.mac.plist`, expect `OK` twice.

- [ ] **Step 2: Build A, no signature (today's build)**

```bash
cd desktop && npm run dist
rm -rf dist/probe && mkdir -p dist/probe/none
ditto dist/mac-arm64/research-harness.app dist/probe/none/research-harness.app
```

- [ ] **Step 3: Build B, ad-hoc with hardened runtime**

Write `desktop/dist/probe/adhoc.yml` (inside the ignored `dist/`):

```yaml
appId: org.research-harness.desktop
productName: research-harness
directories: { output: dist/probe/adhoc-build }
files: [main.js, preload.js, server.js, git-path.js, package.json]
extraResources:
  - { from: build/plugin, to: plugin }
  - { from: askpass.sh, to: askpass.sh }
asarUnpack: ["node_modules/dugite/**"]
mac: { target: dir, identity: "-", hardenedRuntime: true, entitlements: entitlements.adhoc.plist, entitlementsInherit: entitlements.adhoc.plist }
```

```bash
npx electron-builder --mac dir --config dist/probe/adhoc.yml
mkdir -p dist/probe/adhoc
ditto dist/probe/adhoc-build/mac-arm64/research-harness.app dist/probe/adhoc/research-harness.app
```

- [ ] **Step 4: Signatures, before any quarantine**

For `X` in `none` and `adhoc`:

```bash
APP=dist/probe/X/research-harness.app
codesign --verify --deep --strict --verbose=2 "$APP"; echo "exit $?"
codesign -dvvv "$APP" 2>&1 | grep -E '^(CodeDirectory|Signature|TeamIdentifier)'
G="$APP/Contents/Resources/app.asar.unpacked/node_modules/dugite/git"
codesign -dvv "$G/libexec/git-core/git-credential-manager" 2>&1 | grep -E '^(Authority|CodeDirectory)' | head -2
GIT_EXEC_PATH="$G/libexec/git-core" "$G/bin/git" credential-manager --version; echo "exit $?"
```

Record each output. Expected: build B re-signed the credential manager ad-hoc (no Microsoft `Authority` line); whether it still starts is the finding Task 4's `signIgnore` answers either way.

- [ ] **Step 5: Quarantined copies and the dialog**

```bash
PROBE="$TMPDIR/rh-probe"; rm -rf "$PROBE"; mkdir -p "$PROBE"
for X in none adhoc; do
  ditto "dist/probe/$X/research-harness.app" "$PROBE/$X/research-harness.app"
  xattr -w com.apple.quarantine "0083;$(printf %x "$(date +%s)");Safari;" "$PROBE/$X/research-harness.app"
  spctl --assess --type execute -vv "$PROBE/$X/research-harness.app"; echo "exit $?"
done
```

Then, one at a time: `open "$PROBE/none/research-harness.app"`, `screencapture -x -T 5 "$PROBE/none.png"`, read the PNG and write down the dialog's title line and its buttons. Dismiss with `osascript -e 'tell application "System Events" to click button "Done" of window 1 of process "CoreServicesUIAgent"'`; if that is refused (no accessibility permission), say so in the report and ask the owner to click "Done". Never click "Open Anyway" in System Settings. Repeat for `adhoc`. If an app window opens instead of a dialog, quit it with `osascript -e 'quit app "research-harness"'` and record that.

**Decision rule.** If `adhoc` shows "Apple could not verify…" (or any dialog that is not "is damaged"), the spec's choice stands. If `adhoc` also says "is damaged", stop after Step 6 and report to the orchestrator: `none` mode would then be useless for test copies, which is a design question for the owner.

- [ ] **Step 6: Record and clean up**

Create `docs/desktop-signing.md`:

````markdown
# Signing and distributing the desktop app

How the macOS app gets from `desktop/` to a download that opens without a Gatekeeper warning, and
what to do on the day an Apple Developer account exists. Design:
`docs/superpowers/specs/2026-10-15-desktop-app-distribution-design.md`.

## What macOS shows for a test build

Measured on 2026-10-DD with macOS VERSION on an Apple silicon Mac, with copies marked as downloaded
(`com.apple.quarantine`), never opened through "Open Anyway":

| Build | `codesign --verify --deep --strict` | `spctl --assess` | Dialog at first open |
|---|---|---|---|
| no signature (`identity: null`) | | | |
| ad-hoc, hardened runtime | | | |

Git Credential Manager in the ad-hoc build: (signature after the build; whether `git credential-manager --version` ran).
````

Fill the date (`date +%F`), the version (`sw_vers -productVersion`), every table cell and the last line with what Steps 4 and 5 printed and showed (exit codes, the first line of each output, the dialog's title). Then `rm -rf "$TMPDIR/rh-probe" desktop/dist/probe`.

- [ ] **Step 7: Commit**

```bash
git add desktop/entitlements.adhoc.plist desktop/entitlements.mac.plist docs/desktop-signing.md
git commit -m "Entitlements for the desktop builds; what macOS shows for a downloaded test build"
```

---

### Task 2: The switch and its electron-builder settings

**Files:**
- Create: `desktop/distribution.json`, `desktop/lib/distribution.js`, `desktop/test/distribution.test.js`

**Interfaces:**
- Consumes: Task 1's `desktop/entitlements.adhoc.plist`, `desktop/entitlements.mac.plist`.
- Produces (all from `desktop/lib/distribution.js`):
  - `readDistribution(file?: string): Dist`, where `Dist` is `{ signing: 'none' }` or `{ signing: 'developer-id', identity: string, teamId: string, notaryProfile: string }`; default file `DIST_FILE`; throws `DistributionError`.
  - `builderSettings(dist: Dist, { version: string, keep: string[], outDir: string, keychain?: string }): { config: object, env: object }`. `keep` holds paths relative to dugite's `git/` folder.
  - `preflight(dist: Dist, { run?, keychain? }?): string[]` — problems in plain words; empty means ready.
  - `runTool(cmd: string, args: string[], opts?): { status: number, stdout: string, stderr: string }` (spawnSync, no shell).
  - `DistributionError`, `DIST_FILE` (absolute path of `desktop/distribution.json`), `LOGIN_KEYCHAIN`, `BASE` (the settings `electron-builder.yml` holds today).

- [ ] **Step 1: The switch**

`desktop/distribution.json`:

```json
{ "signing": "none" }
```

- [ ] **Step 2: Write the failing tests** (`desktop/test/distribution.test.js`)

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readDistribution, builderSettings, preflight, DistributionError, DIST_FILE } = require('../lib/distribution');

const SIGNED = { signing: 'developer-id', identity: 'Developer ID Application: A. Researcher (AB12CD34EF)', teamId: 'AB12CD34EF', notaryProfile: 'research-harness-notary' };

function file(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-dist-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, 'distribution.json');
  fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
  return f;
}

test('the committed switch is "none"', () => {
  assert.deepEqual(readDistribution(DIST_FILE), { signing: 'none' });
});

test('a developer-id file with all four fields is read as it is', (t) => {
  assert.deepEqual(readDistribution(file(t, SIGNED)), SIGNED);
});

for (const [name, content, pattern] of [
  ['not JSON', '{ signing: none', /not readable JSON/],
  ['an array', [], /one JSON object/],
  ['an unknown mode', { signing: 'adhoc' }, /"none" or "developer-id"/],
  ['an extra field in none mode', { signing: 'none', identity: 'x' }, /unknown field "identity"/],
  ['a pasted password', { ...SIGNED, password: 'abcd-efgh-ijkl-mnop' }, /unknown field "password".*keychain/],
  ['a missing notary profile', { ...SIGNED, notaryProfile: '' }, /"notaryProfile" is missing/],
  ['a short team ID', { ...SIGNED, teamId: 'AB12', identity: 'Developer ID Application: A (AB12)' }, /10-character team ID/],
  ['an identity without the prefix', { ...SIGNED, identity: 'A. Researcher (AB12CD34EF)' }, /Developer ID Application: <name> \(AB12CD34EF\)/],
  ['an identity of another team', { ...SIGNED, identity: 'Developer ID Application: A. Researcher (ZZ99ZZ99ZZ)' }, /\(AB12CD34EF\)/],
  ['a profile name with a space', { ...SIGNED, notaryProfile: 'my profile' }, /letters, digits/],
]) {
  test(`refuses ${name}`, (t) => {
    assert.throws(() => readDistribution(file(t, content)), (err) => err instanceof DistributionError && pattern.test(err.message));
  });
}

test('none: ad-hoc with hardened runtime, no notarization, no publishing, no Apple variables', () => {
  const { config, env } = builderSettings({ signing: 'none' }, { version: '0.6.0', keep: [], outDir: '/tmp/out' });
  assert.equal(config.mac.identity, '-');
  assert.equal(config.mac.hardenedRuntime, true);
  assert.match(config.mac.entitlements, /entitlements\.adhoc\.plist$/);
  assert.match(config.mac.entitlementsInherit, /entitlements\.adhoc\.plist$/);
  assert.equal(config.mac.notarize, false);
  assert.equal(config.publish, null);
  assert.deepEqual(config.extraMetadata, { version: '0.6.0', harnessSigning: 'none' });
  assert.equal(config.directories.output, '/tmp/out');
  assert.equal(config.appId, 'org.research-harness.desktop');
  assert.deepEqual(Object.keys(env).filter((k) => k.startsWith('APPLE_')), []);
});

test('developer-id: identity without prefix, notarization, GitHub feed, keychain profile only in env', () => {
  const { config, env } = builderSettings(SIGNED, { version: '0.6.0', keep: [], outDir: '/tmp/out', keychain: '/k/login.keychain-db' });
  assert.equal(config.mac.identity, 'A. Researcher (AB12CD34EF)');
  assert.equal(config.mac.notarize, true);
  assert.equal(config.mac.hardenedRuntime, true);
  assert.match(config.mac.entitlements, /entitlements\.mac\.plist$/);
  assert.deepEqual(config.publish, [{ provider: 'github', owner: 'DanielHeinz7', repo: 'research-harness', releaseType: 'release' }]);
  assert.deepEqual(config.extraMetadata, { version: '0.6.0', harnessSigning: 'developer-id' });
  assert.deepEqual(env, { APPLE_KEYCHAIN: '/k/login.keychain-db', APPLE_KEYCHAIN_PROFILE: 'research-harness-notary' });
  assert.ok(!JSON.stringify(config).includes('research-harness-notary'), 'the profile name stays out of the config');
});

test('file names: DMG without version, zip with version, both with the processor', () => {
  const { config } = builderSettings({ signing: 'none' }, { version: '0.6.0', keep: [], outDir: '/o' });
  assert.equal(config.dmg.artifactName, 'research-harness-mac-${arch}.${ext}');
  assert.equal(config.mac.artifactName, 'research-harness-${version}-mac-${arch}.${ext}');
});

test('kept signatures become anchored, escaped signIgnore patterns', () => {
  const keep = ['libexec/git-core/git-credential-manager', 'libexec/git-core/libcoreclr.dylib'];
  const { config } = builderSettings({ signing: 'none' }, { version: '0.6.0', keep, outDir: '/o' });
  assert.deepEqual(config.mac.signIgnore, ['/node_modules/dugite/git/libexec/git-core/git-credential-manager$', '/node_modules/dugite/git/libexec/git-core/libcoreclr\\.dylib$']);
  const inApp = '/x/research-harness.app/Contents/Resources/app.asar.unpacked/node_modules/dugite/git/libexec/git-core/libcoreclr.dylib';
  assert.match(inApp, new RegExp(config.mac.signIgnore[1]));
  assert.doesNotMatch(inApp.replace('libcoreclr.dylib', 'libcoreclrXdylib'), new RegExp(config.mac.signIgnore[1]));
});

test('preflight: none asks nothing; developer-id names each missing piece', () => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    return cmd === 'security'
      ? { status: 0, stdout: '  1) ABC "Developer ID Application: Someone Else (ZZ99ZZ99ZZ)"\n', stderr: '' }
      : { status: 69, stdout: '', stderr: 'No Keychain password item found for profile' };
  };
  assert.deepEqual(preflight({ signing: 'none' }, { run }), []);
  assert.equal(calls.length, 0);
  const problems = preflight(SIGNED, { run, keychain: '/k' });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /"Developer ID Application: A\. Researcher \(AB12CD34EF\)" is not in this Mac's keychain/);
  assert.match(problems[1], /"research-harness-notary" does not work/);
  assert.deepEqual(calls, ['security find-identity -v -p codesigning', 'xcrun notarytool history --keychain-profile research-harness-notary --keychain /k']);
});

test('preflight passes when certificate and profile are there', () => {
  const run = (cmd) => (cmd === 'security'
    ? { status: 0, stdout: `  1) ABC "${SIGNED.identity}"\n     1 valid identities found\n`, stderr: '' }
    : { status: 0, stdout: 'No submission history.\n', stderr: '' });
  assert.deepEqual(preflight(SIGNED, { run }), []);
});
```

- [ ] **Step 3: Run, expect FAIL** (`Cannot find module '../lib/distribution'`): `cd desktop && node --test test/distribution.test.js`

- [ ] **Step 4: Implement** `desktop/lib/distribution.js`

```js
'use strict';
// The switch between local ad-hoc builds and Developer ID builds (spec 4.1),
// and what it means for electron-builder. desktop/distribution.json holds
// nothing secret: a certificate's name, a team ID and the name of a notarytool
// keychain profile. The private key and the notarization password stay in the
// login keychain of the release Mac.
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST_FILE = path.join(ROOT, 'distribution.json');
const LOGIN_KEYCHAIN = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
const PREFIX = 'Developer ID Application: ';
const FIELDS = { none: ['signing'], 'developer-id': ['signing', 'identity', 'teamId', 'notaryProfile'] };
const RUNBOOK = 'docs/desktop-signing.md';

// What electron-builder.yml held before this sub-project (sub-project 1, Task 8).
const BASE = {
  appId: 'org.research-harness.desktop',
  productName: 'research-harness',
  files: ['main.js', 'preload.js', 'server.js', 'git-path.js', 'package.json'],
  extraResources: [{ from: 'build/plugin', to: 'plugin' }, { from: 'askpass.sh', to: 'askpass.sh' }],
  asarUnpack: ['node_modules/dugite/**'],
};

class DistributionError extends Error {}

function readDistribution(file = DIST_FILE) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new DistributionError(`${file} is not readable JSON: ${err.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DistributionError(`${file} must hold one JSON object.`);
  const allowed = FIELDS[raw.signing];
  if (!allowed) throw new DistributionError(`${file}: "signing" must be "none" or "developer-id".`);
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) throw new DistributionError(`${file}: unknown field "${key}" for signing "${raw.signing}". Secrets belong in the keychain, never in this file.`);
  }
  for (const key of allowed) {
    if (typeof raw[key] !== 'string' || raw[key].trim() === '') throw new DistributionError(`${file}: "${key}" is missing.`);
  }
  if (raw.signing === 'developer-id') {
    if (!/^[A-Z0-9]{10}$/.test(raw.teamId)) throw new DistributionError(`${file}: "teamId" must be the 10-character team ID.`);
    if (!raw.identity.startsWith(PREFIX) || !raw.identity.endsWith(` (${raw.teamId})`)) {
      throw new DistributionError(`${file}: "identity" must read "Developer ID Application: <name> (${raw.teamId})", as Keychain Access shows it.`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(raw.notaryProfile)) throw new DistributionError(`${file}: "notaryProfile" may hold letters, digits, dot, dash and underscore only.`);
  }
  return raw;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function builderSettings(dist, { version, keep, outDir, keychain = LOGIN_KEYCHAIN }) {
  const signed = dist.signing === 'developer-id';
  const entitlements = path.join(ROOT, signed ? 'entitlements.mac.plist' : 'entitlements.adhoc.plist');
  const config = {
    ...BASE,
    directories: { output: outDir },
    extraMetadata: { version, harnessSigning: dist.signing },
    mac: {
      // ${version}, ${arch} and ${ext} are electron-builder's macros, not template literals.
      artifactName: 'research-harness-${version}-mac-${arch}.${ext}',
      // electron-builder 26 refuses the "Developer ID Application: " prefix.
      identity: signed ? dist.identity.slice(PREFIX.length) : '-',
      hardenedRuntime: true,
      entitlements,
      entitlementsInherit: entitlements,
      signIgnore: keep.map((rel) => `${escapeRegex(`/node_modules/dugite/git/${rel}`)}$`),
      notarize: signed,
    },
    dmg: { artifactName: 'research-harness-mac-${arch}.${ext}' },
    publish: signed ? [{ provider: 'github', owner: 'DanielHeinz7', repo: 'research-harness', releaseType: 'release' }] : null,
  };
  // electron-builder 26 notarizes with a keychain profile when both are set.
  const env = signed
    ? { APPLE_KEYCHAIN: keychain, APPLE_KEYCHAIN_PROFILE: dist.notaryProfile }
    : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
  return { config, env };
}

function runTool(cmd, args, opts = {}) {
  const r = childProcess.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: (r.stderr || '') + (r.error ? r.error.message : '') };
}

// Before a developer-id build: are the certificate and the notarization
// profile on this Mac? Both are looked up by name; neither secret is read.
function preflight(dist, { run = runTool, keychain = LOGIN_KEYCHAIN } = {}) {
  if (dist.signing !== 'developer-id') return [];
  const problems = [];
  const ids = run('security', ['find-identity', '-v', '-p', 'codesigning']);
  if (ids.status !== 0 || !ids.stdout.includes(`"${dist.identity}"`)) {
    problems.push(`The certificate "${dist.identity}" is not in this Mac's keychain (security find-identity -v -p codesigning). See ${RUNBOOK}, "Certificate".`);
  }
  const notary = run('xcrun', ['notarytool', 'history', '--keychain-profile', dist.notaryProfile, '--keychain', keychain]);
  if (notary.status !== 0) {
    problems.push(`The notarization profile "${dist.notaryProfile}" does not work (xcrun notarytool history). See ${RUNBOOK}, "Notarization".`);
  }
  return problems;
}

module.exports = { readDistribution, builderSettings, preflight, runTool, DistributionError, DIST_FILE, LOGIN_KEYCHAIN, BASE };
```

- [ ] **Step 5: Run, expect PASS**: `cd desktop && node --test test/distribution.test.js`, then `npm test`.

- [ ] **Step 6: Commit**

```bash
git add desktop/distribution.json desktop/lib/distribution.js desktop/test/distribution.test.js
git commit -m "Desktop distribution switch and its electron-builder settings"
```

---

### Task 3: Mach-O files, signatures and the checks on a built app

**Files:**
- Create: `desktop/lib/macho.js`, `desktop/lib/verify.js`, `desktop/scripts/verify-app.js`, `desktop/test/macho.test.js`, `desktop/test/verify.test.js`

**Interfaces:**
- Consumes: Task 2 `readDistribution`, `runTool`, `DistributionError`.
- Produces:
  - `macho.js`: `isMachO(file): boolean`; `machOFiles(dir): string[]` (absolute, sorted, symlinks skipped); `parseCodesign(text): Signature`; `signature(file, run?): Signature`; `keepList(dir, run?): string[]` (relative to `dir`). `Signature` is `{ signed: false }` or `{ signed: true, adhoc: boolean, runtime: boolean, timestamp: boolean, authority: string|null, team: string|null }`.
  - `verify.js`: `verifyApp(app: string, { dist, arch: 'arm64'|'x64', run?, rosetta?: boolean }): { problems: string[], notes: string[] }`; `gitDir(app): string`.
  - `scripts/verify-app.js <app> <arm64|x64>`: exit 0 passed, 1 problems, 2 wrong arguments.

- [ ] **Step 1: Write the failing tests** (`desktop/test/macho.test.js`)

The two signature texts are real `codesign -dvvv` output from `desktop/node_modules/dugite/git` (2026-10-15), shortened by the hash lines.

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isMachO, machOFiles, parseCodesign, keepList, signature } = require('../lib/macho');

const GCM = [
  'Executable=/x/libexec/git-core/git-credential-manager',
  'Identifier=git-credential-manager',
  'Format=Mach-O thin (arm64)',
  'CodeDirectory v=20500 size=1346 flags=0x10000(runtime) hashes=31+7 location=embedded',
  'Signature size=9012',
  'Authority=Developer ID Application: Microsoft Corporation (UBF8T346G9)',
  'Authority=Developer ID Certification Authority',
  'Authority=Apple Root CA',
  'Timestamp=19. Jun 2026 at 17:29:36',
  'Info.plist=not bound',
  'TeamIdentifier=UBF8T346G9',
  'Runtime Version=15.5.0',
].join('\n');
const GIT = [
  'Executable=/x/bin/git',
  'Identifier=git',
  'Format=Mach-O thin (arm64)',
  'CodeDirectory v=20400 size=26524 flags=0x20002(adhoc,linker-signed) hashes=826+0 location=embedded',
  'Signature=adhoc',
  'Info.plist=not bound',
  'TeamIdentifier=not set',
].join('\n');

function tree(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-macho-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), Buffer.from(bytes));
  }
  return dir;
}
const THIN = [0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 1];
const FAT = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2];
const JAVA = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x34];

test('Mach-O by magic number; a Java class file and text are not', (t) => {
  const dir = tree(t, { 'a/thin': THIN, 'a/fat': FAT, 'a/Main.class': JAVA, 'a/readme': [0x68, 0x69, 0x0a], 'tiny': [0xcf, 0xfa] });
  assert.deepEqual(machOFiles(dir).map((f) => path.relative(dir, f)), ['a/fat', 'a/thin']);
  assert.equal(isMachO(path.join(dir, 'tiny')), false);
  fs.symlinkSync(path.join(dir, 'a', 'thin'), path.join(dir, 'link'));
  assert.equal(machOFiles(dir).length, 2, 'symlinks are not counted twice');
});

test('codesign output: Developer ID with runtime and timestamp', () => {
  assert.deepEqual(parseCodesign(GCM), { signed: true, adhoc: false, runtime: true, timestamp: true, authority: 'Developer ID Application: Microsoft Corporation (UBF8T346G9)', team: 'UBF8T346G9' });
});

test('codesign output: ad-hoc, linker-signed, no runtime', () => {
  assert.deepEqual(parseCodesign(GIT), { signed: true, adhoc: true, runtime: false, timestamp: false, authority: null, team: null });
});

test('codesign output: not signed', () => {
  assert.deepEqual(parseCodesign('/etc/hosts: code object is not signed at all\n'), { signed: false });
});

test('keepList keeps Developer ID files with runtime and timestamp, nothing else', (t) => {
  const dir = tree(t, { 'bin/git': THIN, 'libexec/git-core/git-credential-manager': THIN, 'libexec/git-core/libcoreclr.dylib': THIN });
  const outputs = { git: GIT, 'git-credential-manager': GCM, 'libcoreclr.dylib': GCM.replace('flags=0x10000(runtime)', 'flags=0x0(none)') };
  const run = (cmd, args) => ({ status: 0, stdout: '', stderr: outputs[path.basename(args[args.length - 1])] });
  assert.deepEqual(keepList(dir, run), ['libexec/git-core/git-credential-manager']);
});

test('the real bundled git is found and read as ad-hoc', () => {
  const git = path.join(path.dirname(require.resolve('dugite/package.json')), 'git', 'bin', 'git');
  assert.equal(isMachO(git), true);
  const sig = signature(git);
  assert.equal(sig.signed, true);
  assert.equal(sig.adhoc, true);
});
```

`desktop/test/verify.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyApp } = require('../lib/verify');

const GITREL = 'Contents/Resources/app.asar.unpacked/node_modules/dugite/git';
const SIGNED = { signing: 'developer-id', identity: 'Developer ID Application: A. Researcher (AB12CD34EF)', teamId: 'AB12CD34EF', notaryProfile: 'p' };
const ADHOC_RT = 'CodeDirectory v=20500 flags=0x10002(adhoc,runtime)\nSignature=adhoc\nTeamIdentifier=not set\n';
const OURS = 'CodeDirectory v=20500 flags=0x10000(runtime)\nAuthority=Developer ID Application: A. Researcher (AB12CD34EF)\nTimestamp=1. Jan 2027 at 10:00:00\nTeamIdentifier=AB12CD34EF\n';
const MICROSOFT = 'CodeDirectory v=20500 flags=0x10000(runtime)\nAuthority=Developer ID Application: Microsoft Corporation (UBF8T346G9)\nTimestamp=19. Jun 2026 at 17:29:36\nTeamIdentifier=UBF8T346G9\n';

function fakeApp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-verify-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'research-harness.app');
  for (const rel of ['Contents/MacOS/research-harness', `${GITREL}/bin/git`, `${GITREL}/libexec/git-core/git-credential-manager`]) {
    fs.mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
    fs.writeFileSync(path.join(app, rel), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 1]));
  }
  return app;
}

// Answers by command and the last argument's base name; `over` replaces answers.
function fakeRun(over = {}) {
  const calls = [];
  const base = {
    'codesign --verify': { status: 0 },
    'codesign -dvvv research-harness': { stderr: ADHOC_RT },
    'codesign -dvvv git': { stderr: ADHOC_RT },
    'codesign -dvvv git-credential-manager': { stderr: MICROSOFT },
    'file -b': { stdout: 'Mach-O 64-bit executable arm64\n' },
    'git --version': { stdout: 'git version 2.47.1\n' },
    'git credential-manager': { stdout: '2.9.0\n' },
    'spctl --assess': { status: 3, stderr: 'rejected\n' },
    'xcrun stapler': { status: 0 },
    ...over,
  };
  const run = (cmd, args) => {
    const key = `${path.basename(cmd)} ${args[0]}`;
    const named = `${path.basename(cmd)} ${args[0]} ${path.basename(args[args.length - 1])}`;
    calls.push(named);
    const answer = base[named] || base[key] || {};
    return { status: 0, stdout: '', stderr: '', ...answer };
  };
  run.calls = calls;
  return run;
}

test('none: ad-hoc with runtime everywhere passes and says it cannot be published', (t) => {
  const { problems, notes } = verifyApp(fakeApp(t), { dist: { signing: 'none' }, arch: 'arm64', run: fakeRun() });
  assert.deepEqual(problems, []);
  assert.ok(notes.some((n) => /cannot be published/.test(n)));
});

test('a Mach-O file without hardened runtime is a problem', (t) => {
  const run = fakeRun({ 'codesign -dvvv git': { stderr: ADHOC_RT.replace('(adhoc,runtime)', '(adhoc,linker-signed)') } });
  const { problems } = verifyApp(fakeApp(t), { dist: { signing: 'none' }, arch: 'arm64', run });
  assert.ok(problems.some((p) => /bin\/git has no hardened runtime/.test(p)), problems.join('\n'));
});

test('developer-id: own team plus kept Microsoft signature passes; an ad-hoc file does not', (t) => {
  const accepted = { 'spctl --assess': { status: 0, stderr: 'accepted\nsource=Notarized Developer ID\n' } };
  const good = fakeRun({ ...accepted, 'codesign -dvvv research-harness': { stderr: OURS }, 'codesign -dvvv git': { stderr: OURS } });
  const app = fakeApp(t);
  const ok = verifyApp(app, { dist: SIGNED, arch: 'arm64', run: good });
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.notes.includes('kept 1 file(s) signed by team UBF8T346G9'));
  const bad = fakeRun({ ...accepted, 'codesign -dvvv research-harness': { stderr: OURS } });
  assert.ok(verifyApp(app, { dist: SIGNED, arch: 'arm64', run: bad }).problems.some((p) => /bin\/git is only ad-hoc signed/.test(p)));
});

test('developer-id: no ticket and no Gatekeeper acceptance are problems', (t) => {
  const run = fakeRun({ 'codesign -dvvv research-harness': { stderr: OURS }, 'codesign -dvvv git': { stderr: OURS }, 'xcrun stapler': { status: 65 } });
  const { problems } = verifyApp(fakeApp(t), { dist: SIGNED, arch: 'arm64', run });
  assert.ok(problems.some((p) => /stapler validate/.test(p)));
  assert.ok(problems.some((p) => /Gatekeeper does not accept/.test(p)));
});

test('git for the wrong processor and a broken credential manager are problems', (t) => {
  const run = fakeRun({ 'file -b': { stdout: 'Mach-O 64-bit executable x86_64\n' }, 'git credential-manager': { status: 134, stderr: 'Abort trap: 6\n' } });
  const { problems } = verifyApp(fakeApp(t), { dist: { signing: 'none' }, arch: 'arm64', run });
  assert.ok(problems.some((p) => /not built for arm64/.test(p)));
  assert.ok(problems.some((p) => /credential manager does not start: Abort trap: 6/.test(p)));
});

test('an Intel build on a Mac without Rosetta is checked but not started', (t) => {
  const run = fakeRun({ 'file -b': { stdout: 'Mach-O 64-bit executable x86_64\n' } });
  const { problems, notes } = verifyApp(fakeApp(t), { dist: { signing: 'none' }, arch: 'x64', run, rosetta: false });
  assert.deepEqual(problems, []);
  assert.ok(notes.some((n) => /not started/.test(n)));
  assert.ok(!run.calls.some((c) => c.startsWith('git ')));
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../lib/macho'`): `cd desktop && node --test test/macho.test.js test/verify.test.js`

- [ ] **Step 3: Implement `desktop/lib/macho.js`**

```js
'use strict';
// Finds the Mach-O files in a folder and reads their code signatures: before a
// build, to keep signatures that arrive with a Developer ID (spec 4.2), and
// after it, to check every binary in the app (spec 4.3).
const fs = require('node:fs');
const path = require('node:path');
const { runTool } = require('./distribution');

const THIN = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]);
const FAT = new Set([0xcafebabe, 0xcafebabf]);

function isMachO(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(8);
    if (fs.readSync(fd, head, 0, 8, 0) < 8) return false;
    const magic = head.readUInt32BE(0);
    if (THIN.has(magic)) return true;
    // A Java class file starts with 0xcafebabe too; its next word is a version, 45 or more.
    return FAT.has(magic) && head.readUInt32BE(4) < 45;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function machOFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (isMachO(file)) found.push(file);
  }
  return found.sort();
}

function parseCodesign(text) {
  if (/code object is not signed at all/.test(text)) return { signed: false };
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(text);
  const names = flags ? flags[1].split(',') : [];
  const authority = /^Authority=(.+)$/m.exec(text);
  const team = /^TeamIdentifier=(.+)$/m.exec(text);
  return {
    signed: true,
    adhoc: names.includes('adhoc') || /^Signature=adhoc$/m.test(text),
    runtime: names.includes('runtime'),
    timestamp: /^Timestamp=/m.test(text),
    authority: authority ? authority[1] : null,
    team: team && team[1] !== 'not set' ? team[1] : null,
  };
}

// codesign writes its description to stderr.
function signature(file, run = runTool) {
  const r = run('codesign', ['-dvvv', file]);
  return parseCodesign(r.stderr + r.stdout);
}

function keepList(dir, run = runTool) {
  return machOFiles(dir).filter((file) => {
    const sig = signature(file, run);
    return sig.signed && sig.runtime && sig.timestamp && Boolean(sig.authority) && sig.authority.startsWith('Developer ID Application: ');
  }).map((file) => path.relative(dir, file));
}

module.exports = { isMachO, machOFiles, parseCodesign, signature, keepList };
```

- [ ] **Step 4: Implement `desktop/lib/verify.js`**

```js
'use strict';
// Checks one built app before anything can be published (spec 4.3).
const path = require('node:path');
const { machOFiles, signature } = require('./macho');
const { runTool } = require('./distribution');

const FILE_ARCH = { arm64: 'arm64', x64: 'x86_64' };
const DEVELOPER_ID = 'Developer ID Application: ';

function gitDir(app) {
  return path.join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'dugite', 'git');
}

// The environment desktop/main.js gives the bundled git.
function gitEnv(dir) {
  return { ...process.env, GIT_EXEC_PATH: path.join(dir, 'libexec', 'git-core'), GIT_CONFIG_SYSTEM: path.join(dir, 'etc', 'gitconfig'), GIT_TEMPLATE_DIR: path.join(dir, 'share', 'git-core', 'templates') };
}

const firstLine = (text) => text.trim().split('\n')[0];

function verifyApp(app, { dist, arch, run = runTool, rosetta = true }) {
  const problems = [];
  const notes = [];
  const signed = dist.signing === 'developer-id';

  const seal = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  if (seal.status !== 0) problems.push(`codesign --verify failed: ${(seal.stderr || seal.stdout).trim().split('\n').pop()}`);

  const kept = {};
  for (const file of machOFiles(app)) {
    const rel = path.relative(app, file);
    const sig = signature(file, run);
    if (!sig.signed) { problems.push(`${rel} is not signed`); continue; }
    if (!sig.runtime) problems.push(`${rel} has no hardened runtime`);
    if (!signed) continue;
    if (sig.adhoc) { problems.push(`${rel} is only ad-hoc signed`); continue; }
    if (!sig.timestamp) problems.push(`${rel} has no secure timestamp`);
    if (sig.team === dist.teamId) continue;
    if (sig.authority && sig.authority.startsWith(DEVELOPER_ID)) kept[sig.team] = (kept[sig.team] || 0) + 1;
    else problems.push(`${rel} is signed by team ${sig.team || 'none'}, not ${dist.teamId}`);
  }
  for (const [team, n] of Object.entries(kept)) notes.push(`kept ${n} file(s) signed by team ${team}`);

  const git = path.join(gitDir(app), 'bin', 'git');
  const kind = run('file', ['-b', git]);
  if (!kind.stdout.includes(FILE_ARCH[arch])) problems.push(`the bundled git is not built for ${arch}: ${firstLine(kind.stdout)}`);
  if (rosetta) {
    const env = gitEnv(gitDir(app));
    const version = run(git, ['--version'], { env });
    if (version.status !== 0) problems.push(`the bundled git does not start: ${firstLine(version.stderr || version.stdout)}`);
    const gcm = run(git, ['credential-manager', '--version'], { env });
    if (gcm.status !== 0) problems.push(`the credential manager does not start: ${firstLine(gcm.stderr || gcm.stdout)}`);
  } else {
    notes.push(`git not started: ${arch} build on a Mac without Rosetta`);
  }

  const assess = run('spctl', ['--assess', '--type', 'execute', '-vv', app]);
  const said = `${assess.stdout}${assess.stderr}`.trim().split('\n').join(' ');
  if (signed) {
    if (run('xcrun', ['stapler', 'validate', app]).status !== 0) problems.push('no stapled notarization ticket (xcrun stapler validate)');
    if (!/source=Notarized Developer ID/.test(said)) problems.push(`Gatekeeper does not accept the app: ${said}`);
  } else {
    if (assess.status === 0) problems.push(`Gatekeeper accepts a build whose signing is none: ${said}`);
    notes.push('signing is none: this build is for local tests and cannot be published');
  }
  return { problems, notes };
}

module.exports = { verifyApp, gitDir };
```

- [ ] **Step 5: Implement `desktop/scripts/verify-app.js`**

```js
#!/usr/bin/env node
'use strict';
// Checks a built app as desktop/distribution.json says it should be signed.
//
//   node scripts/verify-app.js <research-harness.app> <arm64|x64>
//
// Exit 0 every check passed, 1 a check failed, 2 wrong arguments or switch.
const fs = require('node:fs');
const { readDistribution, DistributionError } = require('../lib/distribution');
const { verifyApp } = require('../lib/verify');

const ROSETTA = '/Library/Apple/usr/share/rosetta/rosetta';
const [app, arch] = process.argv.slice(2);
if (!app || !['arm64', 'x64'].includes(arch) || !fs.existsSync(app)) {
  console.error('usage: node scripts/verify-app.js <research-harness.app> <arm64|x64>');
  process.exit(2);
}
let dist;
try {
  dist = readDistribution();
} catch (err) {
  if (!(err instanceof DistributionError)) throw err;
  console.error(err.message);
  process.exit(2);
}
const rosetta = process.arch === arch || fs.existsSync(ROSETTA);
const { problems, notes } = verifyApp(app, { dist, arch, rosetta });
for (const n of notes) console.log(`note: ${n}`);
for (const p of problems) console.error(`problem: ${p}`);
console.log(problems.length ? `${app}: ${problems.length} problem(s)` : `${app}: all checks passed`);
process.exit(problems.length ? 1 : 0);
```

- [ ] **Step 6: Run, expect PASS**: `cd desktop && node --test test/macho.test.js test/verify.test.js`, then `npm test`.

- [ ] **Step 7: Commit**

```bash
git add desktop/lib/macho.js desktop/lib/verify.js desktop/scripts/verify-app.js desktop/test/macho.test.js desktop/test/verify.test.js
git commit -m "Checks on a built desktop app: every Mach-O signed with hardened runtime, git and its credential manager start"
```

---

### Task 4: The build for Apple silicon and Intel

**Files:**
- Create: `desktop/lib/update-feed.js`, `desktop/scripts/dist.js`, `desktop/test/update-feed.test.js`, `desktop/test/dist.test.js`
- Modify: `desktop/package.json` (scripts `dist`, `verify-app`)
- Delete: `desktop/electron-builder.yml` (its settings are `BASE` in `lib/distribution.js`)

**Interfaces:**
- Consumes: Task 2 `readDistribution`, `builderSettings`, `preflight`, `runTool`; Task 3 `keepList`, `verifyApp`.
- Produces: `npm run dist` (`node scripts/dist.js [--arch arm64|x64]`, exit 0/1/2); `appIn(dir)`, `notaryHint(message, dist)` exported for tests. Output: `desktop/dist/<arch>/` per build; `desktop/dist/release/` with `research-harness-mac-arm64.dmg`, `research-harness-mac-x64.dmg`, `research-harness-<version>-mac-<arch>.zip`, their `.blockmap` files, and in `developer-id` mode one merged `latest-mac.yml`. Test seam: `RESEARCH_HARNESS_TEST_DISTRIBUTION` names another switch file.
- `update-feed.js`: `parseFeed(text): Feed`, `mergeFeeds(texts: string[]): string`.

- [ ] **Step 1: Write the failing tests**

`desktop/test/update-feed.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed, mergeFeeds } = require('../lib/update-feed');

const feed = (arch, date) => [
  'version: 0.6.0',
  'files:',
  `  - url: research-harness-0.6.0-mac-${arch}.zip`,
  `    sha512: ${arch}Zx/AbC+12==`,
  '    size: 104857600',
  '    blockMapSize: 110000',
  `  - url: research-harness-mac-${arch}.dmg`,
  `    sha512: ${arch}Qq/xyz+34==`,
  '    size: 109051904',
  `path: research-harness-0.6.0-mac-${arch}.zip`,
  `sha512: ${arch}Zx/AbC+12==`,
  `releaseDate: '${date}'`,
  '',
].join('\n');

test('reads electron-builder\'s feed shape', () => {
  const f = parseFeed(feed('arm64', '2026-10-20T09:00:00.000Z'));
  assert.equal(f.version, '0.6.0');
  assert.equal(f.files.length, 2);
  assert.deepEqual(f.files[0], { url: 'research-harness-0.6.0-mac-arm64.zip', sha512: 'arm64Zx/AbC+12==', size: 104857600, blockMapSize: 110000 });
  assert.equal(f.releaseDate, '2026-10-20T09:00:00.000Z');
});

test('merging lists both processors once and keeps the newer date', () => {
  const merged = parseFeed(mergeFeeds([feed('arm64', '2026-10-20T09:00:00.000Z'), feed('x64', '2026-10-20T09:05:00.000Z')]));
  assert.deepEqual(merged.files.map((f) => f.url), ['research-harness-0.6.0-mac-arm64.zip', 'research-harness-mac-arm64.dmg', 'research-harness-0.6.0-mac-x64.zip', 'research-harness-mac-x64.dmg']);
  assert.equal(merged.path, 'research-harness-0.6.0-mac-arm64.zip');
  assert.equal(merged.releaseDate, '2026-10-20T09:05:00.000Z');
});

test('feeds of two versions are refused', () => {
  assert.throws(() => mergeFeeds([feed('arm64', 'x'), feed('x64', 'x').replace('version: 0.6.0', 'version: 0.6.1')]), /disagree on the version/);
});

test('an unexpected line is refused, not skipped', () => {
  assert.throws(() => parseFeed('version: 0.6.0\nfiles:\n\t- url: x\n'), /unexpected line/);
});

test('electron-updater\'s YAML reader reads the merged feed the same way', (t) => {
  let yaml;
  try { yaml = require('js-yaml'); } catch { t.skip('js-yaml is not installed'); return; }
  const text = mergeFeeds([feed('arm64', '2026-10-20T09:00:00.000Z'), feed('x64', '2026-10-20T09:05:00.000Z')]);
  const viaYaml = yaml.load(text);
  assert.equal(viaYaml.files.length, 4);
  assert.equal(viaYaml.files[2].sha512, 'x64Zx/AbC+12==');
  assert.equal(viaYaml.releaseDate, '2026-10-20T09:05:00.000Z');
});
```

`desktop/test/dist.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appIn, notaryHint } = require('../scripts/dist');

const DIST = path.join(__dirname, '..', 'scripts', 'dist.js');

function stubs(t, scripts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-diststub-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(scripts)) fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return dir;
}

test('wrong arguments: exit 2 before anything is built', () => {
  const r = childProcess.spawnSync(process.execPath, [DIST, '--arch', 'ppc'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node scripts\/dist\.js \[--arch arm64\|x64\]/);
});

test('developer-id without certificate and profile: exit 2, both named, nothing built', (t) => {
  const bin = stubs(t, { security: 'echo "     0 valid identities found"', xcrun: 'echo "No Keychain password item found" >&2; exit 69' });
  const switchFile = path.join(bin, 'distribution.json');
  fs.writeFileSync(switchFile, JSON.stringify({ signing: 'developer-id', identity: 'Developer ID Application: A. Researcher (AB12CD34EF)', teamId: 'AB12CD34EF', notaryProfile: 'research-harness-notary' }));
  const before = fs.existsSync(path.join(__dirname, '..', 'dist', 'arm64')) ? fs.statSync(path.join(__dirname, '..', 'dist', 'arm64')).mtimeMs : null;
  const r = childProcess.spawnSync(process.execPath, [DIST], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RESEARCH_HARNESS_TEST_DISTRIBUTION: switchFile } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is not in this Mac's keychain/);
  assert.match(r.stderr, /"research-harness-notary" does not work/);
  const after = fs.existsSync(path.join(__dirname, '..', 'dist', 'arm64')) ? fs.statSync(path.join(__dirname, '..', 'dist', 'arm64')).mtimeMs : null;
  assert.equal(after, before);
});

test('a rejected notarization names the command that shows Apple\'s log', () => {
  const signed = { signing: 'developer-id', notaryProfile: 'research-harness-notary' };
  const msg = 'Failed to notarize via notarytool\n\nid: 2efe2717-52ef-43a5-96dc-0797e4ca1041\nstatus: Invalid';
  assert.match(notaryHint(msg, signed), /xcrun notarytool log 2efe2717-52ef-43a5-96dc-0797e4ca1041 --keychain-profile research-harness-notary$/);
  assert.equal(notaryHint(msg, { signing: 'none' }), msg);
  assert.equal(notaryHint('ENOSPC: no space left on device', signed), 'ENOSPC: no space left on device');
});

test('appIn finds the app in mac-arm64/ and in mac/', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-appin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'arm64', 'mac-arm64', 'research-harness.app'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'x64', 'mac', 'research-harness.app'), { recursive: true });
  assert.equal(appIn(path.join(dir, 'arm64')), path.join(dir, 'arm64', 'mac-arm64', 'research-harness.app'));
  assert.equal(appIn(path.join(dir, 'x64')), path.join(dir, 'x64', 'mac', 'research-harness.app'));
  assert.throws(() => appIn(dir), /no research-harness\.app/);
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd desktop && node --test test/update-feed.test.js test/dist.test.js`

- [ ] **Step 3: Implement `desktop/lib/update-feed.js`**

```js
'use strict';
// Merges the latest-mac.yml of the arm64 build and of the x64 build into one
// feed, so electron-updater on either kind of Mac finds its own zip (spec
// 4.2). electron-builder writes these files in one fixed shape; this reads
// that shape and refuses anything else.

function scalar(raw) {
  const v = raw.trim();
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

function parseFeed(text) {
  const feed = { files: [] };
  let item = null;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let m = /^ {2}- (\w+): (.*)$/.exec(line);
    if (m) { item = { [m[1]]: scalar(m[2]) }; feed.files.push(item); continue; }
    m = /^ {4}(\w+): (.*)$/.exec(line);
    if (m && item) { item[m[1]] = scalar(m[2]); continue; }
    m = /^(\w+):(?: (.*))?$/.exec(line);
    if (m) { item = null; if (m[1] !== 'files') feed[m[1]] = scalar(m[2] || ''); continue; }
    throw new Error(`unexpected line in the update feed: ${JSON.stringify(line)}`);
  }
  return feed;
}

function formatFeed(feed) {
  const lines = [`version: ${feed.version}`, 'files:'];
  for (const file of feed.files) {
    const [first, ...rest] = Object.keys(file);
    lines.push(`  - ${first}: ${file[first]}`);
    for (const key of rest) lines.push(`    ${key}: ${file[key]}`);
  }
  for (const key of Object.keys(feed)) {
    if (!['version', 'files', 'releaseDate'].includes(key)) lines.push(`${key}: ${feed[key]}`);
  }
  if (feed.releaseDate) lines.push(`releaseDate: '${feed.releaseDate}'`);
  return `${lines.join('\n')}\n`;
}

function mergeFeeds(texts) {
  const feeds = texts.map(parseFeed);
  const versions = feeds.map((f) => f.version);
  if (new Set(versions).size !== 1) throw new Error(`the update feeds disagree on the version (${versions.join(', ')})`);
  const merged = { ...feeds[0], files: [] };
  const seen = new Set();
  for (const f of feeds) {
    for (const file of f.files) {
      if (!seen.has(file.url)) { seen.add(file.url); merged.files.push(file); }
    }
  }
  merged.releaseDate = feeds.map((f) => f.releaseDate).filter(Boolean).sort().pop();
  return formatFeed(merged);
}

module.exports = { parseFeed, mergeFeeds };
```

- [ ] **Step 4: Implement `desktop/scripts/dist.js`**

```js
#!/usr/bin/env node
'use strict';
// Builds the app for Apple silicon and Intel, signed as desktop/distribution.json
// says, checks each build, and collects what a release uploads in
// dist/release/ (spec 4.2).
//
//   node scripts/dist.js [--arch arm64|x64]
//
// Exit 0 done, 1 a build or a check failed, 2 refused before building.
const fs = require('node:fs');
const path = require('node:path');
const { readDistribution, builderSettings, preflight, runTool, DistributionError } = require('../lib/distribution');
const { keepList } = require('../lib/macho');
const { verifyApp } = require('../lib/verify');
const { mergeFeeds } = require('../lib/update-feed');

const ROOT = path.join(__dirname, '..');
const DUGITE = path.dirname(require.resolve('dugite/package.json'));
const PLUGIN_JSON = path.join(ROOT, '..', 'plugins', 'research-harness', '.claude-plugin', 'plugin.json');
const RELEASE = path.join(ROOT, 'dist', 'release');
const ROSETTA = '/Library/Apple/usr/share/rosetta/rosetta';
const USAGE = 'usage: node scripts/dist.js [--arch arm64|x64]';

function refuse(msg) {
  console.error(`dist: refused: ${msg}`);
  process.exit(2);
}

// dugite keeps one git, for one processor, in its own folder. With no arch it
// fetches the git for this Mac again.
function fetchGit(arch) {
  const env = { ...process.env };
  if (arch) env.npm_config_arch = arch;
  else delete env.npm_config_arch;
  const r = runTool(process.execPath, [path.join(DUGITE, 'script', 'download-git.js')], { env, cwd: DUGITE });
  if (r.status !== 0) throw new Error(`fetching git${arch ? ` for ${arch}` : ''} failed: ${(r.stderr || r.stdout).trim()}`);
}

// A rejected notarization names its submission; Apple's log says why.
function notaryHint(message, dist) {
  const id = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/.exec(message);
  if (dist.signing !== 'developer-id' || !id) return message;
  return `${message}\nApple's log for submission ${id[0]}: xcrun notarytool log ${id[0]} --keychain-profile ${dist.notaryProfile}`;
}

function appIn(dir) {
  for (const sub of fs.readdirSync(dir)) {
    const app = path.join(dir, sub, 'research-harness.app');
    if (sub.startsWith('mac') && fs.existsSync(app)) return app;
  }
  throw new Error(`no research-harness.app under ${dir}`);
}

async function buildOne(dist, arch, version) {
  const builder = require('electron-builder');
  fetchGit(arch);
  const outDir = path.join(ROOT, 'dist', arch);
  fs.rmSync(outDir, { recursive: true, force: true });
  const { config, env } = builderSettings(dist, { version, keep: keepList(path.join(DUGITE, 'git')), outDir });
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  try {
    await builder.build({ projectDir: ROOT, targets: builder.Platform.MAC.createTarget(['dmg', 'zip'], builder.Arch[arch]), config, publish: 'never' });
  } catch (err) {
    err.message = notaryHint(err.message, dist);
    throw err;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return outDir;
}

function collect(dist, outDirs) {
  fs.rmSync(RELEASE, { recursive: true, force: true });
  fs.mkdirSync(RELEASE, { recursive: true });
  const feeds = [];
  for (const dir of Object.values(outDirs)) {
    for (const name of fs.readdirSync(dir)) {
      if (/\.(dmg|zip|blockmap)$/.test(name)) fs.copyFileSync(path.join(dir, name), path.join(RELEASE, name));
      if (name === 'latest-mac.yml') feeds.push(fs.readFileSync(path.join(dir, name), 'utf8'));
    }
  }
  if (dist.signing === 'developer-id') {
    if (feeds.length !== Object.keys(outDirs).length) throw new Error(`expected one latest-mac.yml per processor, found ${feeds.length}`);
    fs.writeFileSync(path.join(RELEASE, 'latest-mac.yml'), mergeFeeds(feeds));
  }
  console.log(`dist: ${fs.readdirSync(RELEASE).length} files in ${RELEASE}`);
}

async function main(argv) {
  const only = argv[0] === '--arch' ? argv[1] : null;
  if (argv.length && !(argv.length === 2 && ['arm64', 'x64'].includes(only))) refuse(USAGE);
  let dist;
  try {
    dist = readDistribution(process.env.RESEARCH_HARNESS_TEST_DISTRIBUTION || undefined);
  } catch (err) {
    if (err instanceof DistributionError) refuse(err.message);
    throw err;
  }
  const missing = preflight(dist);
  if (missing.length) refuse(missing.join(' '));
  if (dist.signing === 'developer-id' && only) refuse('a developer-id build makes both processors, so that the update feed lists both');

  const version = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version;
  const bundle = runTool(process.execPath, [path.join(ROOT, 'scripts', 'bundle-plugin.js')]);
  if (bundle.status !== 0) throw new Error(`bundling the plugin failed: ${bundle.stderr.trim()}`);

  const outDirs = {};
  let failed = 0;
  try {
    for (const arch of only ? [only] : ['arm64', 'x64']) {
      outDirs[arch] = await buildOne(dist, arch, version);
      const rosetta = process.arch === arch || fs.existsSync(ROSETTA);
      const { problems, notes } = verifyApp(appIn(outDirs[arch]), { dist, arch, rosetta });
      for (const n of notes) console.log(`${arch}: note: ${n}`);
      for (const p of problems) console.error(`${arch}: problem: ${p}`);
      failed += problems.length;
    }
  } finally {
    fetchGit(null); // leave this Mac's own git for npm start and the tests
  }
  if (failed) {
    console.error(`dist: ${failed} problem(s); nothing was collected in dist/release`);
    return 1;
  }
  collect(dist, outDirs);
  return 0;
}

module.exports = { appIn, notaryHint };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(`dist: ${err.message}`); process.exitCode = 1; },
  );
}
```

- [ ] **Step 5: Package scripts; retire `electron-builder.yml`**

In `desktop/package.json`, replace the `dist` script and add one:

```json
    "dist": "node scripts/dist.js",
    "verify-app": "node scripts/verify-app.js"
```

Then `git rm desktop/electron-builder.yml` and `grep -rn "electron-builder.yml\|--mac dir" desktop docs/superpowers/plans/2026-10-15-desktop-app-shell.md README.md`; change no plan file, but fix any remaining reference in `desktop/` or `README.md` to `npm run dist`.

- [ ] **Step 6: Run the unit tests, expect PASS**: `cd desktop && node --test test/update-feed.test.js test/dist.test.js`, then `npm test`.

- [ ] **Step 7: The real build, `none` mode, on the owner's Mac**

```bash
cd desktop && npm run dist; echo "exit $?"
ls -1 dist/release
file node_modules/dugite/git/bin/git
```

Expected: exit 0; for each processor a note "signing is none: this build is for local tests and cannot be published", no `problem:` line; in `dist/release` the two DMGs, two zips and their blockmaps and no `latest-mac.yml`; `file` reports this Mac's processor (Review Focus 2). Record in the report which files `signIgnore` kept (count by team, from the electron-builder log or `keepList`).

Then:
- `hdiutil attach -nobrowse -readonly dist/release/research-harness-mac-arm64.dmg`, check that `research-harness.app` and an `Applications` link are in the mounted volume, `hdiutil detach` it.
- `open dist/x64/mac/research-harness.app` (runs under Rosetta on Apple silicon), `screencapture -x -T 8 "$TMPDIR/rh-x64.png"`, read the PNG: the first-start page shows "Start with a paper project". Quit with `osascript -e 'quit app "research-harness"'`. If Rosetta is not installed, say so and skip; do not install it.
- `npm test` once more, expect PASS (the host git is back).

If electron-builder writes no DMG or zip under those names, or `verifyApp` reports a problem, stop and report the exact output; do not loosen a check.

- [ ] **Step 8: Commit**

```bash
git add desktop/lib/update-feed.js desktop/scripts/dist.js desktop/test/update-feed.test.js desktop/test/dist.test.js desktop/package.json
git commit -m "Desktop build for Apple silicon and Intel, signed as the switch says, checked before collecting"
```

---

### Task 5: Releases attach the app once signing is on

**Files:**
- Modify: `scripts/release.js`, `scripts/release.test.js`

**Interfaces:**
- Consumes: Task 2 `readDistribution`, `preflight` (required from `desktop/lib/distribution.js`); Task 4's output folder `desktop/dist/release/`.
- Produces: in `developer-id` mode, `release.js` refuses without certificate or profile (exit 2), runs `npm ci` and `npm run dist` in `desktop/` between the version commit and the tag, uploads every file in `desktop/dist/release/` with `gh release create`, and afterwards reads `latest-mac.yml` and the DMGs back. In `none` mode it prints `desktop app: not attached (signing is none)`.

- [ ] **Step 1: Extend the fixture** in `scripts/release.test.js`

Replace the `gh` stub line in `fixture()` so the stub also answers `gh release download` from the folder `FAKE_GH_SERVED`:

```js
  fs.writeFileSync(path.join(bin, "gh"), '#!/bin/sh\n[ -n "$FAKE_GH_FAIL" ] && { echo "gh broke" >&2; exit 1; }\necho "$@" >> "' + ghLog + '"\n'
    + 'if [ "$1 $2" = "release download" ]; then prev=""; for a in "$@"; do [ "$prev" = "--dir" ] && dir="$a"; prev="$a"; done; cp "$FAKE_GH_SERVED"/* "$dir"/; echo "gh ok"; exit 0; fi\n'
    + 'prev=""; for a in "$@"; do [ "$prev" = "--notes-file" ] && cp "$a" "' + ghNotes + '"; prev="$a"; done\necho "gh ok"\n', { mode: 0o755 });
```

Add below `fixture()`:

```js
const SIGNED = { signing: "developer-id", identity: "Developer ID Application: A. Researcher (AB12CD34EF)", teamId: "AB12CD34EF", notaryProfile: "research-harness-notary" };

// Adds desktop/ with the switch and the stubs a desktop release calls:
// security and xcrun answer the preflight, npm "builds" four release files.
function withDesktop(fx, dist) {
  const lib = path.join(fx.repo, "desktop", "lib");
  fs.mkdirSync(lib, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "..", "desktop", "lib", "distribution.js"), path.join(lib, "distribution.js"));
  fs.writeFileSync(path.join(fx.repo, "desktop", "distribution.json"), JSON.stringify(dist) + "\n");
  fs.appendFileSync(path.join(fx.repo, ".gitignore"), "desktop/dist/\n");
  fx.npmLog = path.join(fx.dir, "npm.log");
  fs.writeFileSync(path.join(fx.bin, "security"), '#!/bin/sh\n[ -n "$FAKE_NO_IDENTITY" ] && { echo "     0 valid identities found"; exit 0; }\necho \'  1) 0123ABCD "' + SIGNED.identity + '"\'\necho "     1 valid identities found"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(fx.bin, "xcrun"), '#!/bin/sh\n[ -n "$FAKE_NO_PROFILE" ] && { echo "No Keychain password item found" >&2; exit 69; }\necho "No submission history."\n', { mode: 0o755 });
  fs.writeFileSync(path.join(fx.bin, "npm"), '#!/bin/sh\necho "$@" >> "' + fx.npmLog + '"\n[ "$1" = "ci" ] && exit 0\n[ -n "$FAKE_NPM_FAIL" ] && { echo "notarization rejected" >&2; exit 1; }\nmkdir -p dist/release\n'
    + 'for n in research-harness-mac-arm64.dmg research-harness-mac-x64.dmg research-harness-0.3.7-mac-arm64.zip latest-mac.yml; do echo "$n" > "dist/release/$n"; done\n', { mode: 0o755 });
  sh(fx.repo, "git", ["add", "-A"]);
  sh(fx.repo, "git", ["commit", "-m", "desktop switch"]);
  sh(fx.repo, "git", ["push", "origin", "main"]);
  fx.served = path.join(fx.repo, "desktop", "dist", "release");
}
```

- [ ] **Step 2: Write the failing tests** (append to `scripts/release.test.js`)

```js
test("an unsigned desktop app is not attached, and the release says so", function (t) {
  const fx = fixture(t);
  withDesktop(fx, { signing: "none" });
  const r = release(fx, ["0.3.7", "s"]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /desktop app: not attached \(signing is none\)/);
  assert.ok(!fs.existsSync(fx.npmLog), "npm did not run");
  assert.doesNotMatch(fs.readFileSync(fx.ghLog, "utf8"), /\.dmg/);
});

refusal("a developer-id switch without its certificate", function (fx) { withDesktop(fx, SIGNED); }, null, /is not in this Mac's keychain/, { FAKE_NO_IDENTITY: "1" });
refusal("a developer-id switch without its notarization profile", function (fx) { withDesktop(fx, SIGNED); }, null, /"research-harness-notary" does not work/, { FAKE_NO_PROFILE: "1" });

test("a signed desktop app is built after the version commit, uploaded with the release and read back", function (t) {
  const fx = fixture(t);
  withDesktop(fx, SIGNED);
  const r = release(fx, ["0.3.7", "s"], { FAKE_GH_SERVED: fx.served });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(fs.readFileSync(fx.npmLog, "utf8").trim().split("\n"), ["ci", "run dist"]);
  const gh = fs.readFileSync(fx.ghLog, "utf8");
  const create = gh.split("\n").find(function (l) { return l.startsWith("release create v0.3.7"); });
  for (const n of ["research-harness-mac-arm64.dmg", "research-harness-mac-x64.dmg", "research-harness-0.3.7-mac-arm64.zip", "latest-mac.yml"]) {
    assert.ok(create.includes(path.join("desktop", "dist", "release", n)), n + " is uploaded");
  }
  assert.match(gh, /release download v0\.3\.7 --pattern latest-mac\.yml --pattern \*\.dmg --dir /);
  assert.match(r.stdout, /3 files match/);
});

test("a failed desktop build stops before the tag and the push", function (t) {
  const fx = fixture(t);
  withDesktop(fx, SIGNED);
  const remoteBefore = sh(fx.repo, "git", ["--git-dir", fx.remote, "rev-parse", "main"]);
  const r = release(fx, ["0.3.7", "s"], { FAKE_NPM_FAIL: "1" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /`npm run dist[^`]*` failed/);
  assert.strictEqual(sh(fx.repo, "git", ["tag"]), "");
  assert.strictEqual(sh(fx.repo, "git", ["--git-dir", fx.remote, "rev-parse", "main"]), remoteBefore);
  assert.ok(!fs.existsSync(fx.ghLog), "gh did not run");
});

test("a file GitHub serves differently is reported with the command that fixes it", function (t) {
  const fx = fixture(t);
  withDesktop(fx, SIGNED);
  const served = path.join(fx.dir, "served");
  fs.mkdirSync(served);
  for (const n of ["research-harness-mac-arm64.dmg", "research-harness-mac-x64.dmg", "latest-mac.yml"]) fs.writeFileSync(path.join(served, n), n + "\n");
  fs.writeFileSync(path.join(served, "research-harness-mac-x64.dmg"), "cut off");
  const r = release(fx, ["0.3.7", "s"], { FAKE_GH_SERVED: served });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /research-harness-mac-x64\.dmg on GitHub differs/);
  assert.match(r.stderr, /gh release upload v0\.3\.7 desktop\/dist\/release\/research-harness-mac-x64\.dmg --clobber/);
  assert.ok(fs.existsSync(fx.claudeLog), "the plugin update ran before the read-back");
  assert.ok(fs.existsSync(path.join(fx.repo, "verification", "local", "release-baseline.json")), "the baseline was recorded");
});
```

The two new `refusal` cases pass environment flags, so `refusal()` gets a fifth parameter: change `function refusal(name, setup, args, pattern)` to `function refusal(name, setup, args, pattern, env)` and its call `release(fx, args || ["0.3.7", "s"])` to `release(fx, args || ["0.3.7", "s"], env)`. Its assertions stay as they are; the existing calls pass no fifth argument.

- [ ] **Step 3: Run, expect FAIL**: `node --test scripts/release.test.js` (the new tests fail; the old ones still pass).

- [ ] **Step 4: Implement** in `scripts/release.js`

Near the other constants:

```js
const crypto = require("node:crypto");
const DESKTOP = path.join(REPO, "desktop");
const DIST_JSON = path.join(DESKTOP, "distribution.json");
const APP_FILES = path.join(DESKTOP, "dist", "release");
```

Two helpers above `main`:

```js
function appFiles() {
  return fs.readdirSync(APP_FILES).sort().map(function (n) { return path.join(APP_FILES, n); });
}

function sha512(file) {
  return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64");
}

// Downloads what GitHub now serves for the release and compares it with what
// was uploaded: the update feed and the two DMGs people download.
function readBack(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-release-readback-"));
  try {
    const r = run("gh", ["release", "download", tag, "--pattern", "latest-mac.yml", "--pattern", "*.dmg", "--dir", dir]);
    if (r.status !== 0) return r;
    const names = fs.readdirSync(APP_FILES).filter(function (n) { return n === "latest-mac.yml" || /\.dmg$/.test(n); });
    for (const n of names) {
      const there = path.join(dir, n);
      if (!fs.existsSync(there) || sha512(there) !== sha512(path.join(APP_FILES, n))) {
        return { status: 1, stdout: "", stderr: n + " on GitHub differs from desktop/dist/release/" + n + "; upload it again with gh release upload " + tag + " desktop/dist/release/" + n + " --clobber" };
      }
    }
    return { status: 0, stdout: names.length + " files match", stderr: "" };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

In `main`, after the `tag ... already exists` refusal and before the corpus lookup:

```js
  // The desktop app rides along once signing is on (spec 4.4).
  let app = false;
  let appNote = null;
  if (fs.existsSync(DIST_JSON)) {
    const distribution = require(path.join(DESKTOP, "lib", "distribution.js"));
    let dist = null;
    try { dist = distribution.readDistribution(DIST_JSON); } catch (e) { refuse(e.message); }
    if (dist.signing === "developer-id") {
      const problems = distribution.preflight(dist);
      if (problems.length) refuse(problems.join(" "));
      app = true;
    } else {
      appNote = "desktop app: not attached (signing is " + dist.signing + ")";
    }
  }
```

In the task list, after the `git commit` task and before `git tag`, when `app` is true:

```js
    { label: "npm ci (in desktop/)", do: function () { return run("npm", ["ci"], { cwd: DESKTOP }); } },
    { label: "npm run dist (in desktop/: build, sign, notarize, check)", do: function () { return run("npm", ["run", "dist"], { cwd: DESKTOP }); } },
```

Build the list with `.concat(app ? [ ...those two... ] : [])` the way the fragment move is spliced in today. In the `gh release create` task, pass the files when `app` is true:

```js
        return run("gh", ["release", "create", tag].concat(app ? appFiles() : [], ["--verify-tag", "--title", opt.version, "--notes-file", notesFile, "--latest"]));
```

and add ` <desktop/dist/release/*>` to its label when `app` is true. Print `appNote` (when set) once before the task loop and once in the `--dry-run` listing. After the baseline is written and `released ...` is printed:

```js
  if (app) {
    const back = step("gh release download " + tag + " and compare with desktop/dist/release", function () { return readBack(tag); });
    const said = (back.stdout + back.stderr).trim();
    if (said) process.stdout.write(said + "\n");
    if (back.status !== 0) {
      process.stderr.write("release: the read-back failed; " + (back.stderr || "see above").trim() + "\n");
      return 1;
    }
  }
```

Update the header comment's first lines: "Releases the plugin, and the desktop app once desktop/distribution.json says developer-id: checks first, ...".

- [ ] **Step 5: Run, expect PASS**: `node --test scripts/release.test.js`. Then `node scripts/release.js 9.9.9 "x" --dry-run` in the real repo: expect the `desktop app: not attached (signing is none)` line in the listing (it may refuse earlier for a missing CHANGELOG section; then check the line with a test fixture instead and say so).

- [ ] **Step 6: Commit**

```bash
git add scripts/release.js scripts/release.test.js
git commit -m "release.js builds, uploads and reads back the desktop app once signing is on"
```

---

### Task 6: Updates in signed builds

**Files:**
- Create: `desktop/updater.js`, `desktop/test/updater.test.js`
- Modify: `desktop/main.js`, `desktop/preload.js`, `desktop/package.json` (dependency `electron-updater`), `desktop/lib/distribution.js` (`BASE.files` gains `updater.js`), `desktop/test/smoke.test.js`

**Interfaces:**
- Consumes: `harnessSigning` in the packaged `package.json` (Task 2 writes it through `extraMetadata`).
- Produces: `createUpdater({ signing, autoUpdater, settings, send, every? }): Updater | null` with `start()`, `checkNow()`, `restart()`, `last()`; `fileSettings(dir): { get(): boolean, set(boolean) }`; `plainError(err): string`; `DAY`. Messages sent to the page: `{ state: 'downloading'|'ready', version }`, `{ state: 'current', version }`, `{ state: 'error', message }`. IPC: `host:update` (main → page), `host:update-state` and `host:restart-to-update` (page → main). Bridge members `harnessHost.onUpdate(callback)` and `harnessHost.restartToUpdate()` (Task 7 uses them).

- [ ] **Step 1: Dependency**

`cd desktop && npm view electron-updater time --json | grep '"6.8.10"'` (expect `2026-09-26`), then `npm install --save-exact electron-updater@6.8.10`. Confirm the arch filter the merged feed relies on: `grep -n "arm64" node_modules/electron-updater/out/MacUpdater.js` must show the update file chosen by `arm64` in its URL. If it does not, stop and report: the merged feed of Task 4 would then hand Intel files to Apple silicon Macs.

- [ ] **Step 2: Write the failing tests** (`desktop/test/updater.test.js`)

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdater, fileSettings, plainError, DAY } = require('../updater');

function fakeUpdater() {
  const u = new EventEmitter();
  u.checks = 0;
  u.installs = 0;
  u.offer = null;
  u.fail = null;
  u.checkForUpdates = async () => {
    u.checks += 1;
    if (u.fail) { const err = new Error(u.fail); u.emit('error', err); throw err; }
    if (u.offer) { u.emit('update-available', { version: u.offer }); u.emit('update-downloaded', { version: u.offer }); }
    else u.emit('update-not-available', { version: '0.6.0' });
    return null;
  };
  u.quitAndInstall = () => { u.installs += 1; };
  return u;
}
const memory = (value = true) => ({ value, get() { return this.value; }, set(v) { this.value = v; } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(over = {}) {
  const autoUpdater = fakeUpdater();
  const sent = [];
  const timers = [];
  const updater = createUpdater({ signing: 'developer-id', autoUpdater, settings: memory(), send: (m) => sent.push(m), every: (fn, ms) => timers.push({ fn, ms }), ...over });
  return { autoUpdater, sent, timers, updater };
}

test('a build whose signing is none gets no updater and never checks', () => {
  const autoUpdater = fakeUpdater();
  assert.equal(createUpdater({ signing: 'none', autoUpdater, settings: memory(), send: () => {} }), null);
  assert.equal(createUpdater({ signing: undefined, autoUpdater, settings: memory(), send: () => {} }), null);
  assert.equal(autoUpdater.checks, 0);
});

test('downloads in the background, installs on quit, no prereleases, no downgrades', () => {
  const { autoUpdater } = setup();
  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(autoUpdater.allowPrerelease, false);
  assert.equal(autoUpdater.allowDowngrade, false);
});

test('checks at start and once a day while the setting is on', async () => {
  const { autoUpdater, timers, updater } = setup();
  updater.start();
  await tick();
  assert.equal(autoUpdater.checks, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, DAY);
  timers[0].fn();
  await tick();
  assert.equal(autoUpdater.checks, 2);
});

test('with the setting off it checks neither at start nor daily', async () => {
  const settings = memory(false);
  const { autoUpdater, timers, updater } = setup({ settings });
  updater.start();
  timers[0].fn();
  await tick();
  assert.equal(autoUpdater.checks, 0);
});

test('automatic checks are quiet unless an update is ready', async () => {
  const { autoUpdater, sent, updater } = setup();
  autoUpdater.fail = 'net::ERR_INTERNET_DISCONNECTED';
  updater.start();
  await tick();
  autoUpdater.fail = null;
  updater.start();
  await tick();
  assert.deepEqual(sent, []);
  autoUpdater.offer = '0.7.0';
  updater.start();
  await tick();
  assert.deepEqual(sent, [{ state: 'ready', version: '0.7.0' }]);
});

test('a check by hand always answers', async () => {
  const { autoUpdater, sent, updater } = setup();
  await updater.checkNow();
  autoUpdater.fail = 'getaddrinfo ENOTFOUND github.com';
  await updater.checkNow();
  autoUpdater.fail = null;
  autoUpdater.offer = '0.7.0';
  await updater.checkNow();
  assert.deepEqual(sent, [
    { state: 'current', version: '0.6.0' },
    { state: 'error', message: 'No connection to GitHub. Check again when you are online.' },
    { state: 'downloading', version: '0.7.0' },
    { state: 'ready', version: '0.7.0' },
  ]);
  assert.deepEqual(updater.last(), { state: 'ready', version: '0.7.0' });
  updater.restart();
  assert.equal(autoUpdater.installs, 1);
});

test('other errors are cut to their first line', () => {
  assert.equal(plainError(new Error(`Cannot find latest-mac.yml\n${'x'.repeat(500)}`)), 'The update check did not work: Cannot find latest-mac.yml');
  assert.ok(plainError(new Error('y'.repeat(500))).length <= 'The update check did not work: '.length + 200);
});

test('the setting lives in the app data folder and defaults to on', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-upd-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = fileSettings(dir);
  assert.equal(s.get(), true);
  s.set(false);
  assert.equal(fileSettings(dir).get(), false);
  fs.writeFileSync(path.join(dir, 'updates.json'), '{ broken');
  assert.equal(fileSettings(dir).get(), true);
});
```

- [ ] **Step 3: Run, expect FAIL** (`Cannot find module '../updater'`): `cd desktop && node --test test/updater.test.js`

- [ ] **Step 4: Implement `desktop/updater.js`**

```js
'use strict';
// App updates for builds signed with a Developer ID (spec 4.5). The signing
// mode comes from package.json, where dist.js writes it: electron-updater's
// own isUpdaterActive() only asks whether the app is packaged, and an ad-hoc
// build could not install an update anyway (Squirrel.Mac checks the signature).
const fs = require('node:fs');
const path = require('node:path');

const DAY = 24 * 60 * 60 * 1000;
const OFFLINE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::ERR_/;

function plainError(err) {
  const text = String((err && err.message) || err);
  if (OFFLINE.test(text)) return 'No connection to GitHub. Check again when you are online.';
  return `The update check did not work: ${text.split('\n')[0].slice(0, 200)}`;
}

// The one setting, "check automatically". It lives beside the app's other
// data (sub-project 1, spec 3.5), never in a project.
function fileSettings(dir) {
  const file = path.join(dir, 'updates.json');
  return {
    get() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).automatic !== false;
      } catch {
        return true;
      }
    },
    set(automatic) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ automatic: Boolean(automatic) })}\n`);
    },
  };
}

function createUpdater({ signing, autoUpdater, settings, send, every = setInterval }) {
  if (signing !== 'developer-id') return null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  let last = null;
  let byHand = false;
  const tell = (msg) => { last = msg; send(msg); };
  // An automatic check speaks only when an update is ready; one by hand always answers.
  autoUpdater.on('update-available', (info) => { if (byHand) tell({ state: 'downloading', version: info.version }); byHand = false; });
  autoUpdater.on('update-not-available', (info) => { if (byHand) tell({ state: 'current', version: info && info.version }); byHand = false; });
  autoUpdater.on('update-downloaded', (info) => tell({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => { if (byHand) tell({ state: 'error', message: plainError(err) }); byHand = false; });

  const check = (manual) => {
    byHand = manual;
    // The 'error' event carries the message; the rejection adds nothing.
    return Promise.resolve().then(() => autoUpdater.checkForUpdates()).catch(() => {});
  };
  return {
    start() {
      if (settings.get()) check(false);
      every(() => { if (settings.get()) check(false); }, DAY);
    },
    checkNow: () => check(true),
    restart: () => autoUpdater.quitAndInstall(),
    last: () => last,
  };
}

module.exports = { createUpdater, fileSettings, plainError, DAY };
```

- [ ] **Step 5: Wire it into `main.js` and `preload.js`; package it**

In `desktop/lib/distribution.js`, `BASE.files` becomes `['main.js', 'preload.js', 'server.js', 'git-path.js', 'updater.js', 'package.json']`.

`desktop/main.js`: add `Menu` to the electron import, and below the `askpass` line:

```js
const { createUpdater, fileSettings } = require('./updater');

// dist.js writes the signing mode into the packaged package.json; a checkout has none.
const signing = require('./package.json').harnessSigning || 'none';
let updater = null;

function appMenu(settings) {
  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => updater.checkNow() },
        { label: 'Check for Updates Automatically', type: 'checkbox', checked: settings.get(), click: (item) => settings.set(item.checked) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]);
}
```

Next to the other `ipcMain.handle` calls:

```js
ipcMain.handle('host:update-state', () => (updater ? updater.last() : null));
ipcMain.handle('host:restart-to-update', () => { if (updater) updater.restart(); });
```

In `app.whenReady()`, replace `window(url);` with:

```js
    const win = window(url);
    if (signing === 'developer-id') {
      const { autoUpdater } = require('electron-updater');
      const settings = fileSettings(app.getPath('userData'));
      updater = createUpdater({ signing, autoUpdater, settings, send: (msg) => { if (!win.isDestroyed()) win.webContents.send('host:update', msg); } });
      Menu.setApplicationMenu(appMenu(settings));
      updater.start();
    }
```

`desktop/preload.js`, two members after `openExternal`:

```js
  // Updates exist only in Developer ID builds; elsewhere nothing is ever sent.
  onUpdate: (callback) => {
    ipcRenderer.on('host:update', (_event, msg) => callback(msg));
    ipcRenderer.invoke('host:update-state').then((msg) => { if (msg) callback(msg); });
  },
  restartToUpdate: () => ipcRenderer.invoke('host:restart-to-update'),
```

In `desktop/test/smoke.test.js`, after the first-start page is visible, add:

```js
    assert.equal(await win.evaluate(() => typeof window.harnessHost.onUpdate), 'function');
    assert.equal(await win.evaluate(() => window.harnessHost.restartToUpdate().then(() => 'ok')), 'ok'); // a checkout has no updater; the call is a no-op
```

- [ ] **Step 6: Run, expect PASS**: `cd desktop && node --test test/updater.test.js`, then `NODE_PATH=~/dh-appdev/dsi-pubs/node_modules npm test` (the smoke test runs with Playwright).

- [ ] **Step 7: Commit**

```bash
git add desktop/updater.js desktop/test/updater.test.js desktop/main.js desktop/preload.js desktop/package.json desktop/package-lock.json desktop/lib/distribution.js desktop/test/smoke.test.js
git commit -m "Updates for Developer ID builds: daily check, download in the background, install on quit"
```

---

### Task 7: The update line in the shell page

**Files:**
- Modify: `plugins/research-harness/dashboard/app.html`, `plugins/research-harness/test/app-shell.test.js`

**Interfaces:**
- Consumes: `harnessHost.onUpdate(callback)` and `harnessHost.restartToUpdate()` (Task 6's contract; this task tests against a fake host and does not need Task 6 to have landed). Messages as in Task 6.
- Produces: `#app-group` (sidebar section "This app", hidden until a message), `#out-app`, `#btn-restart`; on the start page `#out-app-start`, `#start-restart`.

- [ ] **Step 1: Write the failing tests**

In `test/app-shell.test.js`, extend the fake host inside `openPage` with two members:

```js
        onUpdate: (callback) => { window.__sendUpdate = callback; },
        restartToUpdate: async () => { window.__restarted = (window.__restarted || 0) + 1; },
```

Append:

```js
for (const colorScheme of ['light', 'dark']) {
  test(`a ready update shows on the start page with a Restart now button (${colorScheme})`, { skip, timeout: 120000 }, async (t) => {
    const srv = await startApp(t);
    const page = await openPage(t, srv, { host: true, colorScheme });
    await page.getByRole('button', { name: 'New project…' }).first().waitFor();
    assert.equal(await page.locator('#out-app-start').textContent(), '');
    assert.equal(await page.locator('#start-restart').isVisible(), false);
    await page.evaluate(() => window.__sendUpdate({ state: 'ready', version: '9.9.9' }));
    await page.locator('#out-app-start', { hasText: 'Version 9.9.9 is ready. It installs when you quit research-harness.' }).waitFor();
    const ratios = await focusContrastRatios(page);
    const restart = ratios.find((item) => /Restart now/.test(item.label));
    assert.ok(restart && restart.ratio >= 3, `Restart now: focus contrast >= 3:1 (${restart && restart.ratio.toFixed(2)})`);
    await page.locator('#start-restart').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__restarted), 1);
  });
}

test('in the sidebar: a failed check by hand says why and offers no restart', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t, { open: await makeProject() });
  const page = await openPage(t, srv, { host: true });
  await page.locator('#proj-name').waitFor();
  assert.equal(await page.locator('#app-group').isVisible(), false);
  await page.evaluate(() => window.__sendUpdate({ state: 'error', message: 'No connection to GitHub. Check again when you are online.' }));
  await page.locator('#out-app', { hasText: 'No connection to GitHub.' }).waitFor();
  assert.equal(await page.locator('#app-group').isVisible(), true);
  assert.equal(await page.locator('#btn-restart').isVisible(), false);
  assert.equal(await page.locator('#out-app').getAttribute('data-kind'), 'problem');
});

test('in a browser tab there is no update line at all', { skip, timeout: 120000 }, async (t) => {
  const srv = await startApp(t);
  const page = await openPage(t, srv);
  await page.getByRole('button', { name: 'New project…' }).first().waitFor();
  assert.equal(await page.evaluate(() => typeof window.__sendUpdate), 'undefined');
  assert.equal(await page.locator('#app-group').isVisible(), false);
  assert.equal(await page.locator('#out-app-start').textContent(), '');
});
```

`focusContrastRatios` (`test/helpers/a11y.js`) labels each control with its trimmed `textContent`, so the button's entry reads "Restart now".

- [ ] **Step 2: Run, expect FAIL**: `cd plugins/research-harness && NODE_PATH=~/dh-appdev/dsi-pubs/node_modules node --test --test-timeout=120000 test/app-shell.test.js`

- [ ] **Step 3: Implement** in `dashboard/app.html`

After the People section, as the last child of `<aside id="sidebar">`:

```html
    <section class="group" id="app-group" aria-labelledby="h-app" hidden>
      <h2 id="h-app">This app</h2>
      <p class="outcome" id="out-app" aria-live="polite"></p>
      <button type="button" class="btn side-btn" id="btn-restart" hidden>Restart now</button>
    </section>
```

On the start page, after `<p class="outcome" id="out-start" …>`:

```html
      <p class="outcome" id="out-app-start" aria-live="polite"></p>
      <button type="button" class="btn" id="start-restart" hidden>Restart now</button>
```

In the script, after the `say` function:

```js
  // -- App updates ----------------------------------------------------------
  // Only the desktop app signed with a Developer ID sends these (sub-project
  // 4). A browser tab has no host and never shows the line.
  var UPDATE_TEXT = {
    downloading: function (m) { return 'Version ' + m.version + ' is downloading. It installs when you quit research-harness.'; },
    ready: function (m) { return 'Version ' + m.version + ' is ready. It installs when you quit research-harness.'; },
    current: function () { return 'You have the newest version.'; },
    error: function (m) { return m.message; },
  };
  function showAppUpdate(msg) {
    var text = msg && UPDATE_TEXT[msg.state] ? UPDATE_TEXT[msg.state](msg) : null;
    if (!text) return;
    var kind = msg.state === 'error' ? 'problem' : 'ok';
    $('app-group').hidden = false;
    say('out-app', kind, text);
    say('out-app-start', kind, text);
    $('btn-restart').hidden = $('start-restart').hidden = msg.state !== 'ready';
  }
  if (host && typeof host.onUpdate === 'function') {
    host.onUpdate(showAppUpdate);
    ['btn-restart', 'start-restart'].forEach(function (id) {
      $(id).addEventListener('click', function () { host.restartToUpdate(); });
    });
  }
```

Do not add `out-app` or `out-app-start` to the list `clearSay` empties on a project switch: the line is about the app, not the project.

- [ ] **Step 4: Run, expect PASS**: the `app-shell.test.js` command from Step 2, then the full plugin test command. The existing keyboard-path test must still pass unchanged (the new section is hidden until a message arrives).

- [ ] **Step 5: Commit**

```bash
git add plugins/research-harness/dashboard/app.html plugins/research-harness/test/app-shell.test.js
git commit -m "Shell page shows the desktop app's update line and a Restart now button"
```

---

### Task 8: Runbook for the day an account exists; final check

**Files:**
- Modify: `docs/desktop-signing.md` (after Task 1's section), `docs/superpowers/specs/2026-10-15-desktop-app-distribution-design.md` (§4.7, one sentence)

- [ ] **Step 1: Append the runbook to `docs/desktop-signing.md`**

````markdown
## Turning signing on

Nothing in the code changes. Do these steps in order on the Mac that makes releases.

### Certificate

The Account Holder of the Apple Developer account creates the certificate; nobody else can
(developer.apple.com/support/developer-id). The private key is made on the release Mac and never
leaves it:

1. On the release Mac: Keychain Access → Certificate Assistant → Request a Certificate From a
   Certificate Authority, "Saved to disk". This creates the private key in the login keychain.
2. The Account Holder uploads that request at developer.apple.com → Certificates → "+" →
   "Developer ID Application" and sends back the `.cer` file.
3. Double-click the `.cer` on the release Mac. `security find-identity -v -p codesigning` now lists
   `"Developer ID Application: <name> (<TEAMID>)"`.

### Notarization

Make an app-specific password (account.apple.com → Sign-In and Security → App-Specific Passwords) or
an App Store Connect API key. Then, in a terminal, so that the password is typed at the prompt and
never appears in a command line:

```bash
xcrun notarytool store-credentials research-harness-notary --apple-id <apple-id> --team-id <TEAMID>
```

`xcrun notarytool history --keychain-profile research-harness-notary` must then answer without an
error.

### Switch and first build

1. Fill in `desktop/distribution.json`:

   ```json
   {
     "signing": "developer-id",
     "identity": "Developer ID Application: <name> (<TEAMID>)",
     "teamId": "<TEAMID>",
     "notaryProfile": "research-harness-notary"
   }
   ```

2. `cd desktop && npm ci && npm run dist`. Both builds go to Apple for notarization (minutes each).
   Expect no `problem:` line, a note "kept … file(s) signed by team UBF8T346G9" (Microsoft's Git
   Credential Manager), and `dist/release/latest-mac.yml`.
3. Test a downloaded copy. Upload one DMG to a draft release (`gh release create signing-test --draft
   desktop/dist/release/research-harness-mac-arm64.dmg`), download it in Safari from the draft's page,
   open it on a second user account, drag the app to Applications and open it. The only dialog may
   be "…is an app downloaded from the Internet. Are you sure you want to open it?". Then
   `gh release delete signing-test --yes`.
4. Add the section below to `README.md`, commit it together with `distribution.json`
   ("Turn on Developer ID signing for the desktop app"), and make the next release with
   `node scripts/release.js <version> "<summary>"`. Its `CHANGELOG.md` section says that the macOS app
   can now be downloaded.

### README section

```markdown
## Download the app (macOS)

- Apple silicon (M1 and later): [research-harness-mac-arm64.dmg](https://github.com/DanielHeinz7/research-harness/releases/latest/download/research-harness-mac-arm64.dmg)
- Intel: [research-harness-mac-x64.dmg](https://github.com/DanielHeinz7/research-harness/releases/latest/download/research-harness-mac-x64.dmg)

Not sure which Mac you have? Apple menu → About This Mac. "Chip: Apple M…" means Apple silicon;
"Processor: … Intel" means Intel.

Open the downloaded file and drag research-harness into Applications. The first time you open it,
macOS asks whether you want to open an app downloaded from the Internet; choose Open.

The app looks for a new version on GitHub when it starts and once a day, downloads it, and installs
it when you quit. Turn this off under research-harness → Check for Updates Automatically. GitHub sees
the request, as with any visit to its pages.
```

### First update (owner check)

After the release that turned signing on, install that version from the README link on a second user
account. Make the next release. Open the app there: within a minute the sidebar (or the start page)
says "Version … is ready". Choose Restart now; research-harness → About research-harness shows the
new version.

### Later

- Keep the same team for every release. An installed app takes only an update signed like itself, so
  a new team means everyone reinstalls once by hand.
- When the certificate expires, already published versions keep opening; new versions need a new
  certificate ("once your Developer ID certificate expires, you must be an Apple Developer Program
  member to get new Developer ID certificates to sign updates and new applications",
  developer.apple.com/support/developer-id). Repeat "Certificate" and update `identity` only if the
  name changed.
````

- [ ] **Step 2: Spec §4.7**

In the spec, replace "It also says that a Developer ID certificate lasts five years and that apps signed with a timestamp keep opening after it expires." with "It also says what happens when the certificate expires, quoting Apple's page." (the five-year figure was not checked at a source).

- [ ] **Step 3: Full check**

```bash
cd desktop && NODE_PATH=~/dh-appdev/dsi-pubs/node_modules npm test
cd ../plugins/research-harness && NODE_PATH=~/dh-appdev/dsi-pubs/node_modules node --test --test-timeout=120000 "test/*.test.js"
cd ../.. && node --test scripts/release.test.js
```

Expect PASS everywhere; report the counts. Confirm `git grep -n "APPLE_APP_SPECIFIC_PASSWORD\|BEGIN PRIVATE KEY\|\.p12"` finds nothing outside this plan and the runbook's prose.

- [ ] **Step 4: Commit**

```bash
git add docs/desktop-signing.md docs/superpowers/specs/2026-10-15-desktop-app-distribution-design.md
git commit -m "Runbook for turning on Developer ID signing of the desktop app"
```
