# Signing and distributing the desktop app

How the macOS app gets from `desktop/` to a download that opens without a Gatekeeper warning, and
what to do on the day an Apple Developer account exists. Design:
`docs/superpowers/specs/2026-10-15-desktop-app-distribution-design.md`.

## What macOS shows for a test build

Measured on 2026-10-15 with macOS 26.5.2 on an Apple silicon Mac (German system language), with
copies marked as downloaded (`com.apple.quarantine`), never opened through "Open Anyway":

| Build | `codesign --verify --deep --strict` | `spctl --assess` | Dialog at first open |
|---|---|---|---|
| no signature (`identity: null`) | exit 1: `code has no resources but signature indicates they must be present` (the main binary carries only the linker's ad-hoc stub, nothing seals the resources) | exit 1: same message | "„research-harness" ist beschädigt und kann nicht geöffnet werden. Es empfiehlt sich, das Objekt in den Papierkorb zu bewegen." Buttons: "In den Papierkorb legen", "Abbrechen". This is the English "is damaged and can't be opened" dialog: no way to open it from the dialog or from System Settings. |
| ad-hoc, hardened runtime | exit 0: `valid on disk`, `satisfies its Designated Requirement` | exit 3: `rejected` | "„research-harness" nicht geöffnet. Apple konnte nicht überprüfen, ob „research-harness" frei von Schadsoftware ist, die deinen Mac beschädigen oder die Privatsphäre verletzen kann." Buttons: "In den Papierkorb legen", "Fertig". This is the English "Apple could not verify …" dialog; it is the kind that offers "Open Anyway" in System Settings, Privacy & Security (not pressed). |

Result: the spec's choice stands. A no-signature build is rejected as damaged, so test copies need at
least the ad-hoc signature that `mac.identity: "-"` produces. No app window opened in either case.
While the ad-hoc dialog was up, a `research-harness` process ran from a translocated path
(`/private/var/folders/…/AppTranslocation/…`); it was gone after the dialog was dismissed.

Screenshots (kept outside the repository):
`/Users/danielheinz/.claude/sidequest/projects/research-harness-3626877c/verification/SQ-269/none.png`
(damaged), `.../adhoc.png` (taken before the dialog had appeared, shows no dialog) and
`.../adhoc-2.png` (the "could not verify" dialog).

Git Credential Manager in the ad-hoc build: re-signed ad-hoc with the hardened runtime
(`CodeDirectory flags=0x10002(adhoc,runtime)`, no `Authority` line); in the unsigned build it keeps
its Microsoft signature (`Authority=Developer ID Application: Microsoft Corporation (UBF8T346G9)`,
`flags=0x10000(runtime)`). `codesign --verify --strict` on it passes in both. It does not start in
either build, for a reason that has nothing to do with signing: electron-builder leaves every `.dll`
and `.exe` out of `node_modules` on non-Windows platforms
(`app-builder-lib/out/util/appFileCopier.js`, `getNodeModuleExcludedExts`), and dugite's
`git-credential-manager` is a .NET apphost that needs `git-credential-manager.dll` beside it. The
built `libexec/git-core` has no `.dll` file, and `git credential-manager --version` exits 154 with
`The application to execute does not exist: …/git-credential-manager.dll`. The source tree
`desktop/node_modules/dugite` has them. Whatever Task 4 settles for `signIgnore`, the build also has
to bring those files in; not tried here.
