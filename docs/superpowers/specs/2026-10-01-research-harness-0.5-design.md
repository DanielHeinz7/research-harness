# research-harness 0.5: two people, one canvas

**Status:** 2026-10-01 · design approved section by section in brainstorming · spec awaiting review

## 1 · Purpose

0.5 exists for one event: the first real supervision session on a project's
canvas between two people (the researcher and a supervisor). The session has to
work in three settings:

- both people at one machine,
- two clones of the project repo synced over git,
- remote, each person at their own clone.

**Success criterion.** A session runs from either clone, both people's entries
end up in one sealed log that verifies on both machines, the agenda before and
the protocol after the session come out of the CLI, and the view shows who
wrote what.

**Builds on.** The seal chain of the MVP design
(`2026-09-15-research-harness-mvp-design.md` §4.4, §4.7) and the acceptance
path of US-3 (`2026-09-30-us3-orgsci-prototype.md`). US-3 listed "actor or
identity in the log" as a Stage 2 non-goal; 0.5 adds a name as a sealed
*statement*, not as an identity proof (§3).

### Decisions taken (Daniel, 2026-10-01)

- Each log entry carries a `By: <name>` field from local configuration, sealed,
  as a statement and not as proof.
- When two clones collide in the log, a command takes the other clone's entries
  unchanged and re-seals its own new ones after them. Both clones share the
  project key.
- Session protocol, agenda before the session, a guided clone setup for the
  second person, and names with a filter in the view are all in scope.
- Agenda = CLI export of the "To talk about" tab; session start = a log
  marker; old entries without `By` read as "unknown"; one key per project.

### Non-goals

- Public-key seals or verified identity.
- Merging `canvas.md` or any file other than `decisions.md`; git handles those.
- A git merge driver (could wrap §2 later).
- Sending the agenda, the protocol or the key anywhere; the tool writes files,
  people send them.
- A `session end` command.

## 2 · Log merge: `research-harness merge-log`

### Why it is needed

Every seal covers the entry's `seq` and the previous seal (`seal.js` `sealOf`).
Two clones that both append after #40 each produce a #41 on the same chain;
git leaves conflict markers at the end of `decisions.md`, and the ledger reads
as broken. Equal `seq` and equal seal means the same entry, because the seal
chains over everything before it, so the shared prefix can be found by comparing
seals, without git's merge base.

### Invocation

Run inside a `git pull` (merge, not rebase) that conflicted on `decisions.md`.
Ours is stage 2 (`git show :2:<path>`), theirs is stage 3 (MERGE_HEAD). No
argument. Refused:

- during a rebase (stages are swapped), with a hint to use `git pull --no-rebase`;
- when no merge is in progress.

### Algorithm

A pure function `mergeLogs(ours, theirs, key, { by, theirsCommit })` in
`hooks/lib/merge.js` returns the merged text or a refusal.

1. Verify both chains with `verifyChain`. Refuse if either is broken or the key
   is missing.
2. Shared prefix: the longest run of entries, from the start, with equal `seq`
   and equal seal in both texts. Refuse if there is none.
3. If one text is a prefix of the other, return the longer one unchanged; no
   re-seal, no MERGE entry.
4. Otherwise: theirs, unchanged, then our entries after the shared prefix,
   renumbered from `theirs.maxSeq + 1`. `Supersedes` and `Open at acceptance`
   references that point at our renumbered entries are rewritten through the
   same map; references into the shared prefix or into theirs stay. Date, kind,
   ref, text hash, `By` and the rest of the body stay. Each moved entry is
   re-sealed onto the new chain.
5. Append a sealed `MERGE` entry: taken up to #N from `<theirsCommit short>`,
   own #a–#b moved to #c–#d, with `By` of the person running the merge.
6. The command writes the result to the working file, re-runs `verifyChain`
   on it, and prints the next steps (`git add <path>`, `git commit`). It does not
   stage or commit.

### Refusal: checks the other side opened

`accept.js` treats a `<question> check` DISCOVERY as closed when a later
DECISION on that question exists. After a merge, checks the other clone opened
would sit before our renumbered acceptance and read as closed, though we never
saw them. So: if one of our moved DECISION entries accepts on a question for
which theirs has a `<question> check` entry after the shared prefix, nothing is
written. The message names the question and both entries and says to merge
without that acceptance and accept again afterwards.

How the user merges "without that acceptance" is not settled: the tool never
deletes a sealed entry. A proposal stands in §10, open point 1.

### Tests

- `mergeLogs` against fixture texts: prefix both ways, divergence, broken chain
  on either side, no shared prefix, reference rewriting, the check refusal.
- Integration: two real clones in a tmp directory, a conflicting `git pull`,
  `merge-log`, then `verifyChain` on both after the push/pull round trip.
- `verification/SQ-29/probe-perimeter.js` runs with the change.

## 3 · `By: <name>`

### Where the name comes from

The state dir is per clone path; a name belongs to a person. It lives in a file
`name` under `stateRoot()`, user-wide.

- `research-harness name "<name>"` sets it; without an argument it prints it.
- Unset: fall back to `git config user.name`.
- Neither: writing commands (`log`, `accept`, `session start`, `merge-log`) refuse
  and point to `research-harness name`. `doctor` reports a missing name.

### In the entry

A field line `**By:** <name>` in the body, added to `FIELD_RE`, `FIELDS` and
`formatEntry` next to `Why`. The body is already under seal, so `By` is sealed
without touching the canonical form in `sealOf`; every existing seal stays
valid. Every new entry gets the field, DECISION, SESSION and MERGE included.
`parseDecisions` returns `by` or `null`.

Valid names: one line, trimmed, at most 60 characters, no `#`. The existing
heading and label refusals (`headingRefusal`, `labelRefusal`) apply.

### What it means

A statement, not proof: whoever holds the key can write any name; the seal only
prevents changing it afterwards. README and `docs/technical-appendix.md` say so.

### Tests

Format/parse round trip; a seal over an entry with `By` recomputes; existing
fixtures without `By` still verify; the fallback chain (file, git, refusal);
name validation edge cases.

## 4 · Session marker

`research-harness session start "<occasion>"` appends a sealed entry of the new
kind `SESSION`, e.g.
`## [#52] 2026-10-08 · SESSION · Supervision with A. Supervisor · seal …`, with `By`.
A session runs until the next `SESSION` entry or the end of the log.

- `KINDS` becomes `DECISION, CONSTRAINT, DISCOVERY, SESSION, MERGE`.
- `log` stays limited to DISCOVERY and CONSTRAINT; SESSION and MERGE are
  written only by their own commands.
- `review` and `accept` ignore both new kinds: covers, open checks and stale
  acceptances still count DECISION and DISCOVERY only.
- `serve` never writes a marker; an open view is not a session.
- Two markers in a row are allowed; `doctor` notes them.
- `merge-log` moves SESSION entries like any other entry.

**Tests:** write and parse a marker; `log` refuses SESSION; `review` ignores the
new kinds; a chain containing SESSION and MERGE verifies.

## 5 · Session protocol

`research-harness session protocol [#seq]` prints Markdown for the latest
session, or the session whose marker is `#seq`; `--out <file>` writes it to a
file. Read-only.

**Source.** `decisions.md` between the marker and the next one (or the end). An
accepted statement's text is read from `canvas.md` while its text hash still
matches; otherwise the protocol says "text changed since" with the hash.

**Layout.**
1. Header: occasion, date, participants (every `By` in the section).
2. Accepted: each DECISION with element, statement, `Explained`, `By`,
   `Supersedes` where present.
3. Noted: DISCOVERY and CONSTRAINT entries with `Why` and `By`.
4. Open at the end: checks still open at the section's end, by the logic of
   `accept.js` `openChecks`.
5. Footer: seal status of the section and the `logAnchor` as of the section's
   last entry.

A broken chain still yields a protocol, headed "BROKEN at #n". No SESSION
marker: refuse and point to `session start`.

**Tests:** a fixture log with two sessions: section bounds, grouping, open at
the end, a text-hash mismatch, "unknown" for a missing `By`, the broken header.

## 6 · Agenda export

Today the "To talk about" tab is computed in the browser only
(`dashboard/canvas.html`, `agendaFindings`, `gapQuestions`). A CLI export would
duplicate that logic, and two copies drift.

- Move it into `hooks/lib/agenda.js` as a pure `agendaOf(canvas, decisions)`:
  fields not yet accepted with their findings, and unanswered questions.
  `HUMAN_QUESTIONS` moves into the library with it.
- `serve` includes the result in the state it sends; the tab renders it.
- `research-harness agenda [--out <file>]` prints Markdown: header (paper title,
  date, seal status); per field with findings its human question and the
  findings with `By`; "Not answered yet" for questions without a statement.
  Read-only.

The agenda is the state before a session and needs no marker; the protocol is
what happened in one.

**Tests:** `agendaOf` on a fixture; the command's output equals `agendaOf`; the
tab renders from the delivered `agenda` (existing dashboard test, or a DOM test
on the same fixture); an accepted field leaves the agenda.

## 7 · Setting up the second clone

The key must not reach the repo, a command line or a transcript. A trap exists
today: a missing key makes the writing path say "run research-harness init"
(`seal.js` `sealedAppend`). In the second clone, that would create a **new**
key, and every later merge would be refused as broken.

**Key holder, once.** `research-harness key export --out <file>` writes the
project key to a file (mode 600) and never prints it. The guard refuses this
command from an agent; it is a human step. How the file travels is the key
holder's choice; the command says "not as plain-text mail, not into the repo".
Repository access on GitHub is granted by the key holder.

**Second person, once.** Install the plugin and `install-cli` as the README
describes, `git clone`, then in the clone
`research-harness join --key-file <file> --name "<name>"`. `join`:
1. checks the file with `readKeyFile` (64 hex characters);
2. checks with `verifyChain` that the key verifies the log; otherwise refuses
   and copies nothing;
3. copies the key to `keyPath` and sets the name (§3);
4. says the key file can now be deleted (it does not delete it);
5. runs `doctor`.

**Closing the trap.** `init` refuses to create a key when `decisions.md`
already has sealed entries and points to `join`. Writing commands with a
missing key on a sealed log give the same pointer.

**Guard.** The state dir, `seal.key` included, is already protected
(`hooks/guard-promotion.js` `harnessRoot`, read in code, not re-tested for this
spec). An exported key file lies outside it, so the guard additionally refuses
any path ending in `.seal.key`, and `key export` requires `--out` to end in
`.seal.key`.

**`doctor` adds:** name set; key verifies the log; a git remote exists;
`pull.rebase` is not `true` for this clone (it would make `merge-log` refuse;
the hint is `git config pull.rebase false`).

**Tests:** `join` with a matching key, a wrong key, a malformed file; `init` on a
sealed log refuses; the guard refuses `key export` and reads of `*.seal.key`
from an agent (perimeter probe); the new `doctor` checks.

## 8 · Names and filter in the view

**Names.** Every entry shows its name as a quiet line, like `Why` (SQ-117), in
History, in a field's findings and in "To talk about"; a missing `By` shows
"unknown". Writes from the view (accept, a note for the meeting) carry the name
of the person who started `serve`, from the same source as the CLI.

**Sessions.** A SESSION entry shows in History as a divider with occasion and
date; a MERGE entry as a quiet line ("merged from …"). Neither is a finding, so
neither shows in fields or the agenda.

**Filter.** Above History: "All", one button per name in the log, and "unknown"
when some entry has no name. Buttons carry `aria-pressed`; exactly one is
active. The filter applies to History and to the findings in field views. The
agenda stays unfiltered; it is the shared starting point. State lives in the
URL fragment (`#by=<name>`), not in browser storage.

The filter changes no count, badge or field status; it narrows which entries
are listed, so a filtered view never shows an accepted field as open.

**Tests:** a fixture with two names and one unnamed entry: buttons, filtering in
History and fields, unchanged badges, filter surviving a reload. Then one pass in
a real browser via `cmux browser` (screenshot, console free of errors) before it
is shown to Daniel.

## 9 · Profile `is-quantitative`

### Why it is in 0.5

The first real session runs on a study that tests hypotheses (an experiment
with confidence measures), but its canvas runs on `is-qualitative`, the only
profile shipped. That profile asks for the opposite order: constructs after
findings (`4 ← 7`), prior research late and as material (`2 ← 3`). The MVP
design (§4.5) planned for a second profile as a Markdown file; 0.5 ships it.

Scope: hypothetico-deductive IS work, experiments and surveys. Mixed methods is
a non-goal (the qualitative share of the study is small). A later candidate is
a profile for computationally intensive theory building (pattern recognition
over large data, then theory from the patterns); it is not part of 0.5.

### The profile file

`references/profiles/is-quantitative.md`, same structure as `is-qualitative.md`.

**Emphasis.**
- Element 2 (Prior Research) drives the question: the gap or conflict in prior
  findings is where the question comes from.
- Element 4 (Constructs) holds the hypotheses, each with its constructs and the
  theory behind it, firm before data exist. Read with Sparrowe & Mayer (2011).
- Element 6 (Design) holds manipulations, measures, the analysis plan and the
  power argument. Read with Bono & McNamara (2011).
- Element 5 (Setting) is the population and sample the theory applies to.
- Element 9 (Boundaries) is the scope of the generalization, judged against the
  sample and the findings.

**Graph** (the canvas's presentation order, which the `is-qualitative` file
already names as the hypothetico-deductive one):

```graph
1 <-
2 <- 1
3 <- 1, 2
4 <- 2, 3
5 <- 3, 4
6 <- 4, 5
7 <- 6
9 <- 5, 7
8 <- 2, 4, 7
```

Each edge is a claim about method and gets one line of reasons in the file, as
in `is-qualitative.md`. The content is a proposal by Claude; the researcher and
the supervisor confirm or change it before the session (open point 4).

**Module: hypotheses before data.** `references/preregistration.md`, attached
to elements 4 and 6. The sealed log already orders events, so the order of
acceptance is evidence: `canvas-review` reports, without blocking, when an
entry on element 7 precedes the acceptance of element 4 or 6 in the log. That
is the one code change the module needs (a check in the review over existing
`seq` order); it reports, it never gates.

### Code that assumes one profile

- `dashboard/canvas.html` holds a static copy of the `is-qualitative` graph.
  `serve` sends the active profile's graph with the state, and the view uses
  it; the static copy goes. A test fails if the view renders a graph that does
  not come from the profile file.
- `init --profile <id>` exists. For an existing canvas,
  `research-harness profile <id>` rewrites the frontmatter line and appends a
  sealed CONSTRAINT entry "profile changed from X to Y" with `By`. It refuses
  an unknown id. Accepted elements keep their markers; `canvas-review` then
  reports any that the new graph makes inconsistent.
- Defaults to `is-qualitative` elsewhere (`inject-state.js`, `state.js`,
  `bin/research-harness.js`) stay; they apply only without a frontmatter entry.

**Tests:** the profile loads and its graph parses; the view's graph equals the
profile's; `profile` switches, logs and refuses an unknown id; the review
reports a finding logged before the hypotheses were accepted, and stays silent
in the right order.

## 10 · Open points for the plan

1. **Recovering from the check refusal (§2).** The tool never deletes a sealed
   entry, so a refused merge needs a path that does not require one. Proposal
   for the plan: the refusal tells the user to `git merge --abort`, and
   `merge-log --skip-decision #n` merges while leaving that one DECISION out of
   the moved entries (it stays in git history on the abandoned commit, and the
   MERGE entry records "#n dropped, to be accepted again"). This needs Daniel's
   yes before the plan builds on it.
2. **Order of work.** §3 (`By`) and the new kinds of §4 come first, since §2,
   §5 and §8 read them. §2 is the riskiest and gets its own review ticket.
3. **`is-quantitative` (§9) is independent** of §2–§8 and can run in its own
   wave; its profile text needs the researcher's and supervisor's review.
4. **The profile's content** (emphasis and edges) is Claude's proposal until
   Daniel and the supervisor confirm it; switching the study's canvas is their
   step, not part of the implementation.
5. **Release.** One release 0.5.0 after all sections, with a CHANGELOG section
   written for users; the README gets a "Two people, one canvas" section.
