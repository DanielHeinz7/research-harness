# US-3 — OrgSci Stage-1 Prototype

**Status:** 2026-09-30 · execution contract rev 1 · in progress

Copied from the Sidequest board (story US-3, contract rev 1, sha256
`f9e01b8ce3bfc1640e39bead77420f67d928ad741b3f08b8cf1b3016226468a5`) so that the
design survives without the board. If the board and this file disagree, the
board's newest revision wins and this file gets updated in the same commit that
notices it. Section 2 is the story's decision log, lightly edited. Board
references and local paths live in `private/2026-09-30-us3-orgsci-prototype.private.md`.

---

## 1 · Execution contract (rev 1)

### Outcome
Three capabilities run end to end on a public demo that someone else can reproduce in 10–15 minutes:
1. **Framing multiverse.** k lens-varied variant canvases are generated, compared side by side, and one is chosen by a human. The rejected framings are sealed in the main log.
2. **Accept with understanding.** Every accept carries a mandatory one-sentence explanation. Advisory model check questions are shown before the accept. Accepting despite open questions is allowed and recorded.
3. **Review the record.** A read-only reviewer skill answers only from the record, with citations, and the chain can be verified off the authors' machine with a released key plus a printed anchor.

The model proposes and checks; it never accepts and never chooses.

### Non-goals
- Ed25519 or public-key seals (Stage 2).
- Actor or identity in the log (Stage 2).
- Any model call from the server.
- Gating an accept on a model verdict.
- Timestamps beyond the existing day date.
- Editing statement text in the view.

### Authority and call flow (pinned)
One truth: files under the state dir, written only through `hooks/lib`.

**Log fields.** `parseDecisions` returns `why`, `rejected`, `supersedes`, `explained` and `openAtAccept` as fields, alongside `body` (additive). `formatEntry` writes `**Explained:** <text>` and `**Open at acceptance:** #a, #b` lines, in the order: text, Why, Explained, Rejected, Open at acceptance, Supersedes.

**acceptStatement({…, explained, rejected, why, expectedHash})**
- Refuses `code:'explanation-required'` when `explained` is empty or whitespace.
- Computes `openAtAccept` itself, from decisions.md: every DISCOVERY whose ref is `<n.m> check` and whose seq is greater than the last DECISION on `n.m`. Because the computation is deterministic, the CLI and view routes stay byte-identical.
- The CLI gains `--explained <text>`; `--rejected` is unchanged. POST /api/accept forwards `explained` and `rejected`.

**Check questions.** The model writes them as `log DISCOVERY "<n.m> check" --body "<question>"`. This is already allowed by the guard. No new entry kind.

**Variants.**
- `research/variants/<name>/` is a full state dir, with its own canvas.md (frontmatter `variant: <name>`, `lens: "<text>"`) and decisions.md. It shares the project's seal key, which is per root.
- `init --variant <name> --lens <text>` creates one.
- `status`, `review` and `log` take `--variant <name>`.
- `accept` works on the main canvas only.

**Choosing a framing.** `choose <name> --why <text> [--rejected <text>]` is human-only. The guard denies it to the model exactly like accept and serve (name rule extended to `choose`). It:
1. refuses if the main canvas has any `[accepted]` statement;
2. copies the chosen variant's statements into research/canvas.md as they are (proposed, tentative or stated);
3. appends to the MAIN log a sealed DECISION with ref `framing chosen: <name>`, carrying why, `**Rejected:**` (default: the list of the other variant names with their lens), and the variant's canvas text hash;
4. leaves the variants in place as the record.

`mechanicalReview` ignores `framing chosen` refs in its acceptance counts.

**Guard.** Every `canvas.md` and `decisions.md` below the state dir is state: the same Write/Edit judgement as the main canvas, and decisions.md writes are denied. Measured tests on variant paths are required. `choose` joins the name rule.

**Server.**
- `/api/state` adds `variants: [{name, lens, state}]` and, per question, `openChecks: [{seq, body}]`.
- New POST `/api/choose {name, why, rejected?}`, with the same token, Host, Origin and code checks as accept, calling the same lib function as the CLI.

**Off-machine verification.**
- `review` and `status` take `--key <file>`, which overrides `seal.keyPath`.
- `review` prints an `Anchor:` line: last seal, maxSeq, and the sha256 of decisions.md.
- The `init`-on-a-clone fix (a clone must not get a fresh key that turns an intact log into BROKEN) is a prerequisite.

**Skills.**
- `canvas` gains a multiverse mode: k lenses → k subagents, each `init --variant` plus import, then a per-variant review.
- New `check` skill (`/research-harness:check <n.m>`), advisory. It reads the statement, its tags and the named sources, and writes check DISCOVERY entries.
- New `record-review` skill: read-only; it answers only from canvas, log, `review` output and git read verbs, and cites `#seq` or `n.m`+hash; otherwise it says "not in the record".

**View.**
- A variant comparison: posters side by side, differences per field.
- A choose dialog with why and rejected.
- An accept dialog with a mandatory explanation, open check questions shown, and "accept anyway".
- History shows Explained, Rejected, Open at acceptance and framing-chosen entries.

### Waves (dependencies make them)
- **W1:**
  - A: log fields plus explanation plus openAtAccept;
  - B: variants plus choose plus guard;
  - C: off-machine verification;
  - D: open-dataset search.
- **W2:**
  - E: server API, after A and B;
  - F: skills (multiverse mode, check, record-review), after A and B;
- **W3:**
  - G: view, after E;
  - H: demo project and README walkthrough, after F and G;
  - I: technical appendix, after H;
  - J: security review of choose, explanation, guard and API, after E and G; required.

### Oracles
Per ticket: `cd plugins/research-harness && node --test test/*.test.js`, plus `node verification/SQ-29/probe-perimeter.js` from the repo root, plus the ticket's named new tests. Byte-identity tests (lib-write, serve) must be extended, never weakened.

### Review budget
A and B are highStakes, since they sit on the seal and the approval path. J is required: no oracle can play a model trying to choose or accept through the new routes. Everything else relies on its oracle.

### Reopen the design if
- openAtAccept cannot be computed identically on both routes;
- `choose` cannot be denied to the model by the name rule;
- a variant's decisions.md shares a chain with the main log;
- the demo cannot run without Claude Code for the reviewer part.

---

## 2 · Decisions behind the contract

Taken 2026-09-30 after three read-only recon passes (log fields and the
approval path, variant layout, off-machine verification).

**Explanation.** Mandatory: one sentence in the researcher's own words for every
accept. The model checks advisorily in Claude Code before the accept, and its
questions show next to "accept" in the view. Accepting despite an open question
is allowed and recorded.
- The explanation is a new `**Explained:**` field written only by the approval
  path, on both routes, so the CLI and the view stay byte-identical.
- Never gate on a model verdict: the model may write DISCOVERY entries, and
  entries carry no author.
- No model runs in the server. That would put a prompt-injection path next to
  the write token, against MVP spec §7.

**Demo material.**
- The proposal applied to itself, built from the authors' concept documents.
- Gerlach & Cenfetelli (2020) run internally as a known-answer test, reported
  but not shipped.
- An openly licensed qualitative dataset: Zenodo record 22893731 (CC-BY 4.0,
  13 Markdown interviews on AI assistants in professional software engineering,
  Hristova et al., PROFES 2026). Pin the version, since a newer one exists.
  Fallback: Zenodo record 6344804.

**Guard edits.** Executors may edit `hooks/guard-promotion.js`. The oracle stays
the full suite plus the perimeter probe.

**Variant layout.** `research/variants/<name>/`, each a full state directory with
its own canvas.md and decisions.md. The guard treats every canvas.md and
decisions.md under the state directory as state. Separate logs avoid the
unlocked `sealedAppend` race.

**Choosing a framing.** A human-only CLI subcommand and view action. It writes a
DECISION with ref `framing chosen` plus why and rejected into the main log.

**Verification off-machine.** `--key <file>` plus printing the head anchor (last
seal, maxSeq, file sha256); the key is released at submission. Ed25519 is
deferred to Stage 2, because the recon rated it large.

**Honest limit.** There is no actor field, so a seal proves a key-holding
machine, not a person. Identity comes in Stage 2.

---

## 3 · Recon findings (code as of 2026-09-30, before US-3)

Read-only passes; paths under `plugins/research-harness/`. Line numbers drift,
so treat them as pointers, not truth. "Code-derived" means read, not run.

### 3.1 Variants and the one-canvas assumption
- The canvas skill is prompt-only. `init` writes an empty template; all content
  comes from the model's Edit/Write calls. The modes differ only in prose.
- k lenses would need a lens/target parameter, `init` at a non-default path
  (today only `project.canvasPath`, project.js:24), and a lens frontmatter field
  set at creation, because the guard forbids new frontmatter keys later
  (guard :72-87, :158).
- One-canvas assumptions: project.js:19-30 (stateDir, canvasPath,
  decisionsPath); state.js:18,24; accept.js, stated.js, log.js, review.js; the
  CLI subcommands via `projectDir`; server `viewState` and `/api/state`; the view
  renders one canvas.
- The seal key is per project root (ledger.js:24-32), so all variants in one
  checkout share one key.
- Race: `seal.sealedAppend` (seal.js:116-143) appends without a lock. Parallel
  `log` calls from k subagents into one decisions.md can duplicate a seq or
  chain onto a stale seal (code-derived). Hence one decisions.md per variant.
- Guard: `stateFiles` (:1944-1947) holds exactly two files, and Write/Edit is
  judged only on them. Code-derived: `research/variants/<n>/canvas.md` is open
  to Write/Edit including `[accepted]`, while shell and MCP writes are denied; a
  sibling dir outside `research/` is open to all tools; a branch or worktree per
  variant is fully guarded only in a session rooted there. Not measured:
  verdicts on variant paths, and the response to `git checkout`/`worktree add`.
  Ticket B measures both.
- A new entry kind needs changes to KINDS and ENTRY_RE, and older parsers would
  report the ledger as broken. Cheaper: keep kind DECISION with a new ref shape
  (`framing chosen`) through a new `sealedAppend` caller; review.js counts only
  `n.m accepted` refs.
- Layouts considered: (1) `research/variants/<n>/`, chosen; (2) a worktree or
  branch per variant: strongest guard, but a key per worktree and no live
  side-by-side view; (3) `variants/<n>/` outside `research/` with an index: a new
  guard rule plus its own accept, review and view code.

### 3.2 The accept path and the explanation
- All accept routes go through `acceptStatement` (accept.js:42), the single
  write site. CLI: match, why, rejected, no expectedHash. Skill:
  `disable-model-invocation` plus a `!` line. View: questionId, expectedHash,
  why; `rejected` is not forwarded (canvas-serve.js:121-124).
- `why` is a body line under the seal (decisions.js:42), shown only in the view.
- Capture options: (a) reuse `why`; (b) a new `**Explained:**` field written only
  by the approval path, byte-identical if both routes pass it, with ENTRY_LABEL
  extended (chosen); (c) a DISCOVERY before the accept, which is forgeable
  because the model may write DISCOVERY entries and entries have no author.
- Check placement: (a) afterwards, in canvas-review, as DISCOVERY entries,
  allowed today; (b) in Claude Code before the accept, advisory, bypassed by the
  view route (chosen, never gating); (c) from the server, which needs a
  credential, egress and a nested model inside the process that holds the write
  token, a prompt-injection path to the writer (rejected).
- Tags are free strings with no resolver; `RESEARCH_HARNESS_LIBRARY` is read by
  no .js file; the view hides tags.
- Calibration data recoverable from the log: seq, day date, ref, text hash,
  statement plus tags, why, rejected, DISCOVERY entries by ref. Missing: time of
  day, route, the prior marker, proposal-to-accept time. A timestamp field would
  break byte identity unless the clock is injected.

### 3.3 The record and verification off-machine
- why, rejected and supersedes were body lines, not parsed fields
  (decisions.js:38-46); only the view split them. Ticket A makes them fields.
- No actor field: a seal proves a key-holding machine wrote the entry, not who.
- `[stated]` flips and proposal deletions are unlogged; git is the only trace.
  Statements have no ids; they are identified by `n.m` plus text hash.
- `mechanicalReview` (review.js:18-97) already computes stale and unlogged
  acceptances, unverified decisions, dependency violations, untagged statements
  and the ledger verdict. `/api/state` carries all of it; the page rendered none.
  Not computed: "accepted claim without src:" (about 3 lines over
  allStatements), and "overruled a proposal", which has no event.
- The seal is an HMAC with a 32-byte key, truncated to 16 hex, stored at
  `<stateRoot>/<sha256(realpath)[:24]>/seal.key`. `verifyChain(text, key)` takes
  an explicit key.
- Measured: `init` on a clone created a new key (seal.js:46-56), and an intact
  log then read BROKEN at seq 1 (`why: anchor`); test/seal.test.js:187-189
  asserted it; the README said "unverifiable". Fixed separately before C.
- Options: publish the key (`--key`, about 0-15 lines); anchor the head (print
  last seal, maxSeq, file sha256, about 5 lines, or a git tag or deposit with no
  code); Ed25519 (large: seal regex, fixtures, tests and a migration). Anchor
  first, then publish the key: the authors can always re-seal consistently, so
  only an external anchor detects a rewrite.
- Reviewer mode: copy canvas-review/SKILL.md, embed `review`, answer only from
  canvas.md, decisions.md and git log/blame, cite `#seq` or `n.m`+hash. The guard
  lets reads through, denies writes to decisions.md and blocks any tool touching
  the key dir. The SessionStart RULES text is writer guidance and would need
  overriding. No export exists; building blocks are the `viewState` JSON, the
  view's `?fixture=` mode and the print CSS.
