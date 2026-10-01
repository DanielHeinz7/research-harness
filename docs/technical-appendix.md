# Technical appendix: the research record

This appendix describes the implementation at main commit `4b382f3445fa127406cb30950b3b040138c5bcdb` (release 0.4.1), checked on 1 October 2026. Source line numbers below refer to that commit. The [public-data walkthrough](../plugins/research-harness/README.md#walkthrough-the-three-capabilities-on-a-public-dataset) demonstrates framing comparison, acceptance with an explanation, and review of the record. Its console commands are exercised by `demo.test.js`; a person's completion time has not been measured. The recorded run demonstrates the mechanism, not the quality of a live model's research judgment.[^demo]

## 1. State and write paths

The durable project record is Markdown: `canvas.md` holds statements and their authorization markers; `decisions.md` holds the log. Their directory defaults to `research/` and can be changed with `RESEARCH_HARNESS_DIR`. A variant has its own pair of files under `research/variants/<name>/`, or the corresponding configured state directory. Each variant log has a separate seal chain, but all variants use the project root's key.[^state]

Acceptance, framing choice and sealed log appends use shared functions in `hooks/lib`; the terminal CLI and the browser server call those same functions. This does **not** mean every canvas write goes through the library: the CLI writes initialization scaffolding and titles directly, and the model may use guarded Write/Edit calls to change proposals. The guard is the control on those model tool calls. These are ordinary files, not an immutable storage service.[^paths]

## 2. What the seal covers

Initialization creates a random 32-byte key, stored as 64 hexadecimal characters in `seal.key`, with creation mode `0600`. It does not replace an existing key. The containing directory is keyed by a digest of the project's real root path under `RESEARCH_HARNESS_STATE_DIR` (default `~/.claude/research-harness`), outside the paper repository in the default setup. A clone at a different root therefore does not acquire the original key automatically. Main and variant logs share this per-root key.[^key]

For each entry, the seal is the first 16 hexadecimal characters (64 bits) of HMAC-SHA256 over these fields, separated by U+001F:

```text
previous seal | sequence | date | kind | ref | text hash | normalized body
```

The vertical bars here denote separators; they are not literal bytes in the input. The body includes the explanation and other labelled fields. The first sealed entry chains onto a SHA256 digest of the entire preceding file prefix; subsequent entries chain onto the previous seal. Body normalization makes ordinary reflow and collapsed spaces insensitive to the seal. The chain is therefore not a byte-for-byte fingerprint of the whole file. The anchor described below supplies that fingerprint.[^seal]

`review` keeps these outcomes distinct:

- `verified`: the sealed entries recompute under the supplied or local key. A legacy prefix is reported separately; its individual entries do not become verified acceptances.
- `BROKEN at #…`: an entry fails verification, or an unsealed entry follows a sealed one. The report names the first failing entry and line. The append path refuses to extend a broken chain.
- `unverifiable here`: sealed entries exist but this machine has no key. An entirely unsealed legacy log is reported as `unverifiable`; an empty log as `empty`.

The mechanical review also compares accepted canvas text with recorded text hashes. It reports stale acceptances and accepted statements without verified log cover. Verification concerns the record, not whether a research claim is true.[^review]

## 3. The promotion guard and its perimeter

The plugin registers `guard-promotion.js` as a Claude Code `PreToolUse` hook without a tool matcher. For writes it can inspect, the model may add or change `[proposed]` and `[tentative]` statements, and transcribe a new `[stated]` statement. It may not relabel an existing proposal as stated, create an `[accepted]` statement, or change or remove an existing stated or accepted commitment. It may run initialization and mechanical status/review, and append findings through `log DISCOVERY` or `log CONSTRAINT`. The advisory `check` skill records questions using `log DISCOVERY "<n.m> check"`; it does not accept.[^guard]

Recognized model invocations of `accept`, `choose` and `serve` are denied. Direct writes to `decisions.md` are denied, including appends. The same file judgment applies to canvas and log files nested below the state directory. Tool payloads naming the harness key/state directory are denied even for reads. The perimeter probe measures key reads, symlink paths, shell wrappers and the human-only verbs. At the cited main revision it also denies the previously vulnerable `sed -n` write routes, including a write after a semicolon-terminated label.[^perimeter]

These are bounded controls on visible tool calls, **not a guarantee that a model cannot accept or choose**. In the measured probe, row M27 constructs a library path at runtime in `node -e`, calls the framing-choice function, and produces a sealed `framing chosen` entry that verifies. The guard does not see that invocation. A script written in one call and run in a later call is also opaque to it. A verified seal cannot retrospectively distinguish such a call from a researcher calling the same function.[^limits]

## 4. Accept with understanding

Both approval routes call `acceptStatement`. A missing, empty or whitespace-only explanation returns `explanation-required` before a write; a successful accept records `**Explained:**`. The requested explanation is one sentence in the researcher's own words. The implementation checks that text is nonempty, not that it is one sentence, personally written, or evidence of understanding.[^accept]

Immediately before accepting, the library computes `openAtAccept` from the log: every `DISCOVERY` with ref exactly `<n.m> check` whose sequence is greater than the last `DECISION` on that question. If any exist, their sequence numbers are written as `**Open at acceptance:** #a, #b`. Earlier checks are closed by a decision on the question; unrelated discoveries do not count. CLI/library byte-identity tests assert the exact explanation, field order and open-check numbers. The server uses the same function.[^checks]

Open checks do not block acceptance. The view lists them and offers “Accept anyway.” There is no required successful check and no model verdict in the acceptance function; the server calls no model for approval. Mechanical prerequisites still apply, including dependency status, a usable seal chain and an unambiguous target (with a stale-text check for browser requests). A mandatory model verdict would give model-authored questions authority the record cannot justify: entries have no actor field.[^advisory]

## 5. Framing alternatives and the chosen record

The canvas skill's multiverse procedure assigns the same material and a different lens to each variant worker, then reviews each variant. `init --variant <name> --lens <text>` records the variant and lens in frontmatter. `status`, `review` and `log` can address a variant; `accept` is restricted to the main canvas. The view compares variants by field; generation is a skill procedure, not a model call made by the server.[^variants]

`choose <name> --why <text> [--rejected <text>]` keeps the main frontmatter and copies the chosen variant's body into the main canvas. It appends a sealed main-log `DECISION` with ref `framing chosen: <name>`, a text hash of the variant canvas, the reason, and rejected alternatives. If no rejected text is supplied, the default lists the other variant names and their lenses. The variants remain in place; the entry does not embed complete snapshots of the rejected canvases or make them immutable. Choice is refused if the main canvas contains stated or accepted statements, or if the chosen variant contains a planted acceptance. Mechanical review treats framing decisions as decisions requiring verification, but not as statement acceptances.[^choose]

## 6. Verification on another machine

From the received paper project, with the CLI installed, a reviewer can run:

```sh
research-harness review --key /path/to/released-key-file
research-harness status --key /path/to/released-key-file
```

The authors must hand over the key file separately; the example does not ship a committed key. `--key` supplies a verification-only override. An unreadable file or one that is not a 32-byte hex key is refused without a verification report; a valid but wrong key yields a broken-chain verdict. A received sealed log does not get a replacement key merely by running `init`.[^external]

Every `review` prints `Anchor:` followed by the last seal, the maximum sequence number, and SHA256 of the received `decisions.md` bytes. This needs no key. Compare it with a copy retained independently at submission or an earlier publication, not merely an anchor delivered alongside the current log. A key holder can rewrite the log and recompute every seal consistently. An earlier external anchor exposes that rewrite as a different record; a newly printed anchor matches the rewritten log too. The released key gives its recipient the same ability to recompute seals. The anchor fingerprints `decisions.md`, not the entire project or dataset.[^anchor]

## 7. Honest limits

The entry format has no actor or identity field. A verified chain establishes consistency under the key held by the writing machine, not which person wrote it, which machine actually ran a call, or whether a human approved it. The runtime-path bypass above is an observed example. Dates are UTC calendar dates (`YYYY-MM-DD`), not event timestamps. In the proposal's terminology, Ed25519 public-key seals and actor identity are Stage-2 work; the current implementation supplies neither. Neither a seal nor an explanation assesses source quality or guarantees understanding.[^identity]

The model-assisted canvas, check and record-review skills require Claude Code. The record-review skill is instructed to answer only from the canvas, log, mechanical report and git reads, cite log entries by `#seq` and statements by number, marker and exact words (it never computes a hash of a current statement), and otherwise say “not in the record.” Tests check its permissions and instructions, not reliable compliance by every model. Mechanical verification with the Node CLI is available without a model session. The demo tests run the recorded CLI workflow, not a live end-to-end model review or a timed human session.[^access]

## 8. Reproducing the measurements

The following commands ran on 1 October 2026 in an isolated checkout whose HEAD and `refs/heads/main` both named `4b382f3445fa127406cb30950b3b040138c5bcdb`. They measure that main revision, not later changes to main.

```sh
# From the repository root:
node --test plugins/research-harness/test/*.test.js
node verification/SQ-29/probe-perimeter.js
```

The test runner reported **306 passed, 0 failed, 0 skipped**, exit 0. The perimeter command exited 0 and printed **41 rows: 38 DENY, 3 ALLOW** (M17, M27 and M28 allowed). This is an observational probe, not 41 successful security assertions: M27 is the known sealed-choice bypass, and M28 creates the link whose later writes M29 and M30 deny. These counts come from this run, not the older counts in design documents. Named assertions supporting the claims are cited below.

## Evidence references

Paths below are repository-relative; `P` means `plugins/research-harness/`. Test names refer to tests executed, with none skipped, in the measured suite above.

[^demo]: `P/test/demo.test.js:174-185`, test “every console block of the walkthrough runs in README order and prints what the README shows”; `:234-277`, tests “the three recorded framings are proposals and findings only, tagged with sources that exist” and “the reviewer's copy verifies only under the released key, and a changed byte is named”. The test uses the recorded workflow; no human timing was run for this appendix.

[^state]: `P/hooks/lib/project.js:19-54`; `P/hooks/lib/state.js:19-54` loads the key by root; `P/test/variants.test.js`, test “init --variant creates a full state directory with variant and lens in the frontmatter”.

[^paths]: `P/bin/research-harness.js:104-141,201-203,317-327,361-367,419`; `P/bin/canvas-serve.js:146-155`; `P/hooks/lib/accept.js:43-109`; `P/hooks/lib/choose.js:62-131`; `P/hooks/lib/log.js:49-72`. Tests: `P/test/lib-write.test.js`, “acceptStatement writes the same canvas and decisions.md bytes as research-harness accept”; `P/test/serve.test.js`, “POST /api/choose writes what the CLI choose writes, and takes the same checks as accept”.

[^key]: `P/hooks/lib/seal.js:22-76`; `P/hooks/lib/ledger.js:11-32`; `P/test/seal.test.js`, test “createKey writes 32 random bytes under the harness state root with mode 0600 and never overwrites”.

[^seal]: `P/hooks/lib/seal.js:79-109,153-180`; `P/hooks/lib/decisions.js:94-103`. Tests in `P/test/seal.test.js`: “sealOf is 16 hex of an HMAC over the previous seal and the canonical entry, reflow-insensitive in the body” and “sealedAppend chains the first sealed entry onto the hash of everything before it and every later one onto the previous seal”.

[^review]: `P/hooks/lib/seal.js:124-166`; `P/hooks/lib/review.js:18-99,130-143`. `P/test/cli.test.js`, test “review reports a verified, an unverifiable-here and a broken ledger, and names the cover an unlogged acceptance lacks”.

[^guard]: `P/hooks/hooks.json:15-27`; `P/hooks/guard-promotion.js:116-184,235-246,1822-1827`; `P/skills/check/SKILL.md`. `P/test/guard-promotion.test.js`, tests “editing, adding and removing proposals is allowed”, “transcribing a new [stated] statement is allowed; tagging a proposal is allowed”, and “creating an [accepted] statement is denied”; `P/test/skills.test.js`, “check: its only write instruction is log DISCOVERY "<n.m> check"”.

[^perimeter]: `P/hooks/guard-promotion.js:1728-1736,2117-2120,2240-2254,2361-2378`; command `node verification/SQ-29/probe-perimeter.js`, rows M1-M16, M19-M26, M29-M40 and M18. `P/test/guard-promotion.test.js`, test “SQ-145: a sed script that can write or run is refused however sed is told to run it”. Fixes are included in main: `9d840c6` (SQ-145/SQ-148 integration) and `4b382f3` (0.4.1 release).

[^limits]: Command `node verification/SQ-29/probe-perimeter.js`, M27 output: `ALLOW ... chain under the session key: verified | sealed framing chosen: alpha #1`. The later-call script boundary is documented in `docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md:832-844`; it was not separately re-probed for this appendix.

[^accept]: `P/hooks/lib/accept.js:43-57,95-109`; `P/hooks/lib/decisions.js:94-103`; `P/test/lib-write.test.js`, test “an accept without an explanation is refused as explanation-required, and nothing is written”.

[^checks]: `P/hooks/lib/accept.js:90-119`; `P/test/lib-write.test.js:168-213`, test “with open check questions, the CLI and the library write the same bytes and record exactly the open checks”. It asserts `[4, 5]`, then `[9]` after a decision closes the earlier checks, and absence of the labelled line when no checks remain.

[^advisory]: `P/hooks/lib/accept.js:58-93`; `P/bin/canvas-serve.js:146-155`; `P/skills/check/SKILL.md`; `P/hooks/lib/decisions.js:18-38`. `P/test/view.test.js`, test “Accept dialog: the explanation is required, open checks are listed with their #seq, and the button says Accept anyway”; the open-check byte-identity test above exercises successful acceptance despite checks.

[^variants]: `P/skills/canvas/SKILL.md:79-119`; `P/bin/research-harness.js:104-141`; `P/test/variants.test.js`, tests “status, review and log take --variant and read and write only that variant” and “accept works on the main canvas only”; `P/test/view.test.js`, “Framings: one column per variant, headed by name and lens, with differing fields marked and identical ones faded”.

[^choose]: `P/hooks/lib/choose.js:62-142`; `P/hooks/lib/hash.js:5-10`; `P/hooks/lib/review.js:58-71`. `P/test/variants.test.js:166-196`, “choose copies the variant's statements into the main canvas and seals a framing DECISION in the main log”; tests “choose refuses while the main canvas holds a [stated] statement, names it, and writes nothing” and “mechanicalReview does not count a framing-chosen DECISION as an acceptance”.

[^external]: `P/bin/research-harness.js:233-244`; `P/hooks/lib/seal.js:51-63`; `P/test/cli.test.js`, tests “a record received from elsewhere verifies with --key <file>, and a wrong key reads as broken”, “--key refuses a file it cannot read, one that is not 32 bytes, and a missing path”, and “init in a clone whose log is already sealed creates no key, and review then says unverifiable rather than broken”. Key handover is described in `P/README.md:82-107`.

[^anchor]: `P/hooks/lib/seal.js:83-109`; `P/bin/research-harness.js:301`; `P/test/cli.test.js`, test “the anchor line is stable for an unchanged record and moves when a byte moves”; `P/test/demo.test.js:257-277` asserts the same anchor across author, keyless reviewer and keyed reviewer, and a different anchor after tampering. Re-sealing by a key holder follows from the HMAC input and the absence of any external authority in verification; that scenario was not separately executed here.

[^identity]: `P/hooks/lib/decisions.js:9,18-38,94-103` (entry fields, no actor); `P/hooks/lib/seal.js:99-109` (symmetric HMAC, no Ed25519); `P/hooks/lib/log.js:9-11` (UTC day date); `P/hooks/lib/accept.js:50-53` (nonempty explanation check). Stage 2 names deferred work in the proposal, not a shipped identity mechanism.

[^access]: `P/skills/record-review/SKILL.md` and `P/skills/check/SKILL.md`; `P/test/skills.test.js`, tests “record-review grants no Write, Edit or NotebookEdit and no broad Bash” and “record-review is invoked by the researcher, cites, and says "not in the record"”; `P/bin/research-harness.js:1-20` (Node CLI imports); `P/test/demo.test.js:174-185,257-277` (recorded CLI verification). No live model-compliance trial was run for this appendix.
