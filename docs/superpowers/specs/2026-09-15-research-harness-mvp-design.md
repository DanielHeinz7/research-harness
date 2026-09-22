# Research Harness — MVP Design

**Status:** 2026-09-15 · Draft for approval · not yet implemented

This document defines the scope of the first shippable piece of the Claude Code
plugin `research-harness`. It is the basis for an implementation plan, not the
plan itself.

> **Before this repository is made public**, strip the passages marked
> `<!-- private: … -->`. They name the author's own unpublished studies and local
> directory layout, which carry no argumentative weight outside this draft. Each
> marker says what to put in its place; where a whole region is affected, it ends
> at `<!-- /private -->`. Find them with:
>
> ```
> grep -rn "private:\|/private" docs/
> ```

---

## 1 · Purpose

The harness is meant to run paper projects AI-first without the researcher
surrendering decision rights. The MVP delivers exactly one part of that: **it
makes the state of a paper project durable, inspectable, and marked with
evidential status** — and it enforces the distinction between what an agent
proposed and what a human accepted.

Everything else — writing, evidence machinery, board, stage gates — comes later
and attaches to this record.

### Why this cut

Three independent lines point at the same thing:

1. **How Toolshed actually grew.** Its first commit (`88007652`, 2026-06-13) was
   12 files / 1,148 lines, of which 8 files / 942 lines were the plugin proper —
   and of those, 802 lines were prose against 140 lines of machinery. One hook
   event, two skills, a `references/` directory. It stayed alone for eight days.
   Sidequest itself started with no MCP, no dispatch, no gates; the order was
   **capture and surface → hand off → verify and lock.**
2. **The author's own vault format.** <!-- private: replace the path with "the
   author's project notes" --> The area notes under `~/dh-hq/vault/areas/`
   already carry `## Status`, `## Kontext`, `## Entscheidungen` (with
   *decided / why / rejected / open*) and `## Offene Fragen` — plus the markers
   `[stated]` and `[tentative]`, documented in `CONVENTIONS.md:239-242`. That is
   the distinction between a proposal and an accepted claim, proven in daily use.
   The harness does not invent it; it moves it into the paper repo and forces the
   agent to write into it.
3. <!-- private: replace the study name with "the qualitative study used for
   validation below" -->
   **Where `junior-gap` came from.** A real problem, not a literature gap —
   phenomenon-focused problematization in the sense of the MIS Quarterly
   editorial. That is precisely the point where unharnessed AI reliably makes a
   paper mediocre: it produces an unlimited supply of plausible gaps and never a
   challenged assumption.

---

## 2 · What the MVP is — and is not

**It is:** the canvas of a paper project as durable, version-controlled project
state inside the paper repo, with an authorization axis and an evidence axis, a
dependency check, an
append-only decision log, context injection at session start, an enforced
approval channel, and a clickable session view.

**It is not:** no board, no tickets, no dispatch, no stage gates beyond the
dependency check. No writing (`/abstract`, `/significance-statement`,
paragraph-level review). No evidence machinery (quote-to-transcript verification,
enforced provenance, hashed prompt versions). No MCP server, no SQLite, no
multi-author model, no journal search.

### The contract

The plugin's contract is **"a paper project repo."** Where that repo lives is
configuration. <!-- private: drop the concrete root; the sentence works as "the
author's local convention must appear nowhere in the plugin" -->
`~/dh-research/` is the author's local convention and must appear
nowhere in the plugin. The only root a hook knows is `${CLAUDE_PLUGIN_ROOT}`; the
project directory comes from the chain
`process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd()`.

**Detecting a paper project:** the presence of `research/canvas.md`. No path
list, no frontmatter, no config file. In any other repo the plugin stays
completely silent. This answers the open question from the project notes —
"marker file, configuration list, or vault frontmatter?"

---

## 3 · Fixed up front, because it is expensive later

Toolshed's history shows what is **cheap to change**: storage format (JSON →
SQLite after eleven days), access path (CLI → MCP after six days), language
(JS → TS after seventeen days), plugin boundaries (nine of fifteen plugins were
renamed, split, absorbed, or withdrawn). None of those are decided here.

Expensive are only the identifiers that leave traces on users' machines, and the
authorization axis.

| Decision | Value |
|---|---|
| Marketplace repo | `research-harness` |
| Plugin | `research-harness` (slash prefix `/research-harness:`) |
| Skills | `canvas`, `canvas-review`, `accept` |
| State location | `<paper-repo>/research/` — **visible, in Git**, not a dot directory |
| Files | `research/canvas.md`, `research/decisions.md` |
| State override | `RESEARCH_HARNESS_DIR` |
| Library override | `RESEARCH_HARNESS_LIBRARY` |
| Harness state override | `RESEARCH_HARNESS_STATE_DIR` — the session ledger (§5.2) and the sealing key (§4.7); outside the repository, never part of the paper |
| Marker vocabulary | `[proposed]` `[tentative]` `[stated]` `[accepted]` |
| Evidence tags | `src:` `unverified` `mail` `cal` |
| Default profile id | `is-qualitative` |

**Why visible and in Git, against Toolshed's own practice:** Sidequest keeps
board state deliberately outside any repo, not in Git, without history — argued
from attention that moves across projects. For a paper that is backwards: the
trail of decisions is itself a result, it must be archivable, it must travel with
the repo, and it must be able to accompany a submission as supplementary
material. Toolshed already does it this way elsewhere — `.gitignore:17-20`
deliberately checks in `.claude/live-rules/**` and `.claude/.codebase-info/**`
through negation.

---

## 4 · Data model

### 4.1 The nine elements

From Dorobantu, Gruber, Ravasi & Wellman (2024), *AMJ* 67(5):1163–1174. Four
areas, nine elements, numbered — the numbers are the language in a meeting
("let's go to 2.3").

| No. | Element | Area |
|---|---|---|
| 1 | Puzzle | Framing |
| 2 | Audience and Prior Research | Framing |
| 3 | Research Question | Framing |
| 4 | Theoretical Constructs and Relationships | Theoretical framework |
| 5 | Research Setting | Empirical methodology |
| 6 | Research Design and Analysis | Empirical methodology |
| 7 | Findings | Conclusions |
| 8 | Contributions | Conclusions |
| 9 | Boundary Conditions and Limitations | Conclusions |

Each element holds numbered sub-questions (`1.1`, `1.2`, …) drawn from the
question set in `references/canvas-elements.md`.

### 4.2 `research/canvas.md`

<!-- private: the example uses a real project name; any placeholder will do -->

```markdown
---
project: junior-gap
outlet: MIS Quarterly
profile: is-qualitative
created: 2026-09-15
mode: import
canvas-schema: 2
---

# 1 · Puzzle

## 1.1 What broad management question does this project address?

How early-career professionals ... [accepted]

## 1.2 What are you trying to explain or understand better?

The break between onboarding and first delivery ... [stated]
Prior work treats this as a training problem ... [proposed, unverified]
Three interviews describe the same reversal ... [proposed, src: int-04 §2]

## 1.3 Why is this puzzle important?

_(empty)_
```

`outlet` and `profile` are frontmatter, not a tenth element: the canvas has nine
elements by its source, but almost every question in the set is answered
differently for a qualitative MISQ paper than for an experimental one, and the
harness must know which before it asks. `profile` selects the genre profile
(§4.5); `outlet` carries the target venue and its format constraints.

**Rules:**

- Markers sit **at the end of a statement**, as in the author's own convention.
  A statement ends at the line carrying its marker group, or at a blank line if
  it has none. Consecutive statements therefore sit on consecutive lines, as in
  the example above, and a statement may still span several lines.
- A statement carries **one authorization marker** and, optionally, **one
  evidence tag** (§4.3). Both live in the same brackets, separated by a comma.
- **An empty element is a legal and explicitly desirable state.** It is better
  than plausible filler. This is the anti-fabrication rule at canvas level.

**Three structural laws.** The grammar above says what a single heading looks
like. These say which headings may coexist, and they were added after SQ-21
showed that a canvas holding two of the same heading is not untidy — it is a
document with two readings, and every consumer silently picked one of them.

1. **Element numbers are unique.** Each of the nine numbers appears in at most
   one `# N · Title` heading.
2. **Question ids are unique.** Each `N.M` appears in at most one `## N.M …`
   heading.
3. **A question sits under the element it is numbered for.** `## 3.1` is legal
   only below `# 3 · …`.

**A document that breaks one of them is unjudgeable, not last-wins.** The parser
reports the breach as a problem and does not merge, prefer or overwrite either
reading. An element that appears twice has *no* status — not the status of
whichever heading came last, which is what the first implementation produced
(`map[el.number] = …` in a loop), and which let a second `# 1 · …` heading report
element 1 as `empty` while it still held the researcher's accepted statement.

Placing this in the parser rather than in the guard is deliberate: uniqueness is
a property of the document, and the guard, `inject-state`, `canvas-review` and
the stage-2 view have to read it the same way. The guard needs no rule of its
own — its fail-closed clause (§5.3) already refuses a write it cannot judge.

**What the researcher sees** when they genuinely have a duplicate, from a bad
merge, a paste, or two hands on the file: `inject-state` names both line numbers
at session start, so they hear it before the first denied write; `canvas-review`
reports it as a problem; and the guard's refusal says which heading is
duplicated and that the model may not resolve it. Merging two readings of a
question means deciding which committed statements survive, and that is the
researcher's act, not a repair the harness performs quietly.

This closes SQ-21's **S1** and **S6** (an accepted statement re-parented to a
duplicate `## 1.1` under another element, byte count unchanged, element 9
flipping to accepted while element 1 lost the commitment), **S5** and **S5b** (a
duplicate question heading shadowing the guard's matching — allowed when placed
before the original, denied when placed after), and **S15** (a second `# 1 · …`
heading shadowing element 1's status to `empty`). No `canvas-schema` bump: every
canvas that was well-formed under schema 2 stays well-formed, because the laws
refuse only documents no one meant to write.

### 4.3 Two axes, not one

The first draft of this design collapsed two different things into one
vocabulary and called the result "evidence markers." They are orthogonal and
have to stay apart. The survey of the existing rule collections (SQ-6) is what
surfaced this.

**Axis 1 — authorization: who may write this.** Enforced by the guard hook.

| Marker | Meaning | Model may create | Model may alter/remove |
|---|---|---|---|
| `[proposed]` | suggested by the agent, unchecked | yes | yes |
| `[tentative]` | found, not yet confirmed | yes | yes |
| `[stated]` | the researcher said or wrote it | yes — as transcription | **no** |
| `[accepted]` | a commitment of the project | **no** | **no** |

**Axis 2 — evidence: what backs this.** Reported by `canvas-review`, never
enforced, because whether a source *supports* a claim is a judgment.

| Tag | Meaning |
|---|---|
| `src: <id>` | resolves to a locatable place in the project's own material |
| `unverified` | no source was found — stated explicitly, not omitted |
| `mail YYYY-MM-DD` | from a sent message; counts as `stated` |
| `cal YYYY-MM-DD` | from the calendar; counts as `stated` |

**The rule the three existing rule collections already share**, and the reason
axis 2 exists at all: *every factual claim carries a source; if none can be
found, the claim is marked `unverified` — never invent a citation, DOI, author,
year, or quote.* It is rule number one in all three of the author's `AGENTS.md`
files, in nearly identical words. A vocabulary that cannot express it is not the
vocabulary those files were drifting from.

`canvas-review` reports every factual statement that carries neither an `src:`
nor `unverified`. Neither is a legal state.

**Relation to the author's existing convention.** The last two tags are taken
from it unchanged. One thing is *not* taken over: that convention promotes
`tentative` to `stated` automatically when a finding repeats. That is a rule for
reconstructing a record after the fact. In a live canvas, repetition is not
confirmation, and automatic promotion would be exactly the channel the guard
exists to close. The canvas adopts the vocabulary and drops the auto-promotion,
deliberately.

**Why `[stated]` may be created but `[accepted]` may not.** `[stated]` is a
*transcription*: the researcher says something and the agent records it. Where
the statement claims a source, `canvas-review` can resolve it; where it is pure
conversation, nothing can. Forbidding transcription outright would make dialogue
unusable — the agent could not write down what was just said. Two things are
both enforceable and meaningful, and that is where the gate sits:

- The model may **never alter or delete what the human said.**
- The model may **never declare a commitment.**

The residual surface is narrower than the first draft claimed, but real: a
purely conversational `[stated]` statement cannot be checked. `canvas-review`
therefore lists them for periodic review and the session view marks them. The
harness should report its own holes rather than conceal them.

#### 4.3.1 What the guard protects is a commitment, not a string

The first implementation identified a statement by question id and text — one
line, `` `${s.question}|${s.text}` `` — and then enforced the two rules above
against that identity. SQ-21 left the markers alone and attacked the identity.
Every direct assault on a statement held: rework, downgrade, creating
`[accepted]`, splitting, blockquote wrap, homoglyphs, both `replace_all`
promotions, fenced and comment forgery. What did not hold was everything
*around* the statement — the element it sits under, the title of that element,
the text of its own question, its evidence tags, the frontmatter that decides
which rules judge it. Each of those changes what the commitment means while
leaving the key identical. The prohibitions were sound; the object they were
protecting was the wrong object.

A **commitment** is a statement carrying `[stated]` or `[accepted]` together
with everything that gives it its meaning:

| Field | Why it belongs to the commitment | Probe |
|---|---|---|
| element number | the element is what the statement is a commitment *about* | S1, S6 |
| element title | `Puzzle` renamed to `Contributions` turns an accepted puzzle into an accepted contribution | S3 |
| question id | the address the decision log and the dependency graph refer to | — |
| question text | a statement answers a question; change the question and it answers a different one | S2 |
| marker | the authorization itself | D0b |
| statement text | what was said | D0a |
| evidence tags | what backs it, and what `canvas-review` says about it | D4a, D4b, D4c |

Element number and question id are not independent — §4.2's third law derives
one from the other — and the field is carried anyway, so that a canonical line
says what it is on its own, in a refusal text or in the stage-2 view, without
the reader reconstructing the grammar to find out which element it belongs to.

**Canonical form.** A commitment canonicalizes to one line: the fields in the
order of the table, separated by U+001F (`␟`, unit separator — a character the
researcher cannot have typed into Markdown), with the evidence tags sorted by
code point so that reordering them is not a change.

```
3␟Research Question␟3.1␟What is the question?␟stated␟Under what meeting conditions …␟src: memo-03
```

Every field is normalized first: NFC, then each run of space, tab, CR and LF
collapsed to one space, then trimmed. The collapse class is **exactly those four
characters**, and that is a correction rather than a restatement. JavaScript's
`\s` also matches U+00A0 and U+FEFF, which is why SQ-21's **D5b** and **D5c**
could push a no-break space and a byte-order mark into an accepted statement and
have the guard see no change at all. A reflow only ever introduces the four;
anything else a write puts inside a committed statement is a change to it.

Not NFKC. Compatibility folding would equate `½` with `1⁄2` and let a committed
statement be rewritten inside its own hash, which is the opposite of the point.

**Commitment hash:** the first 8 hex of SHA-256 over the canonical line. It is
how a commitment is named where it must be named compactly — `canvas-review`
output, the stage-2 view, a refusal text. It is *not* §4.4's `text <hash>`, and
the difference is deliberate: `text <hash>` covers the statement text alone, so
an acceptance survives the researcher retitling the element around it, while the
commitment hash changes, because for the model that retitle is a different
commitment and is refused.

**The committed set, and the single rule over it.** Write `C(x)` for the set of
canonical commitments in canvas text `x`. A model write that turns `before` into
`after` is permitted only when both of these hold:

1. **`C(before) ⊆ C(after)`** — nothing committed is lost, moved, retitled,
   re-questioned, re-tagged or downgraded.
2. **Every commitment in `C(after) \ C(before)` carries `[stated]`** — the model
   may transcribe what it just heard, and may never declare a commitment.

It is a set and not a sequence: reordering statements inside a question changes
nothing, because their order carries no meaning (**S11** stays allowed).
Statements carrying `[proposed]` or `[tentative]` are not members of `C` at all
and remain as free as §5.3 already makes them, fenced examples included
(**D1c**, **D1d**).

The two clauses subsume the *first two* of the first draft's three prohibitions,
and the structural holes fall out of them without a check each: **S2** (the
question rewritten under a committed statement), **S3** (element 1 retitled),
**D4a** (a committed statement's `src:` rewritten from `memo-03` to `memo-99`)
and **D4c** (its tag stripped) each delete a member of `C(before)` from
`C(after)`, which is clause 1. **D4b** — a fabricated `src: interview-07 §3`
attached to the researcher's accepted statement, which also dropped it from the
untagged report — breaks both clauses: the original commitment is gone, and the
retagged one is an `[accepted]` the model created. **S1** and **S6** break
clause 1 as well as the structural laws of §4.2.

**The third prohibition does not follow, and is kept as a rule of its own.**
Promoting a `[proposed]` statement to `[stated]` produces a commitment that is
*new* — clause 1 is silent, a proposal never having been a member of `C` — and
that carries `[stated]`, which clause 2 explicitly permits. A comparison of sets
cannot see a promotion, because it cannot see what a statement used to be. This
was not noticed by reading: an earlier draft of this section claimed the three
prohibitions "are what the two clauses say about one statement at a time", the
guard was built to that claim, and SQ-21's **D3b** — one `replace_all` of
`[proposed]` to `[stated]` — went from DENY to ALLOW, 3157 bytes to 3155, with
the whole test suite green, because every existing promotion test edited a single
statement and so tripped clause 1 for an unrelated reason. The probe re-run
caught it as a verdict flip. §5.3's rule for `canvas.md` therefore has five
clauses, not four, and the fifth is checked against the statements of `before` by
question id and normalized text. A document that summarises its own completeness
is asserting something testable.

**The frontmatter is protected state.** It is not decoration around the canvas.
`profile:` selects the dependency graph and the genre rules by which everything
else is judged (§4.5, §4.6); SQ-21's **S12b** pointed it at an id the plugin does
not ship, and dependency checking simply stopped — `inject-state` and
`canvas-review` reported nothing, rather than reporting that they could not
check. A rule that can be switched off by editing one word is not a rule.

The protected thing is the whole frontmatter mapping, not a list of keys: while
`canvas.md` exists, its set of key/value pairs must be identical before and
after a model write. Enumerating keys would leave the next key added
unprotected by default. `project:` and `outlet:` are therefore **protected, not
merely reported** (**S12**): `project` is the identity the decision log is headed
with, and a silent change to it splits the ledger from the canvas; `outlet`
carries the format constraints that decide what "finished" means. Both are the
researcher's, and the researcher changes them in their own editor or through the
canvas view, neither of which is a model tool call. The remaining three follow
the same reasoning: `created:` is a record, `mode:` says where `/canvas` began
(§6) and not where it stands now, and `canvas-schema:` names the grammar the
file is written in, so a migration is the harness's own act rather than a tool
call.

Protection is not correctness, so one check sits beside it: a `profile:` that
does not resolve to a shipped profile makes the canvas unjudgeable in the sense
of §5.3, exactly like a duplicate heading. It is reported, never ignored.

### 4.4 Element status, and why a proposal must not demote

An element's status is derived **only from its committed statements** — those
carrying `[stated]` or `[accepted]`. Statements carrying `[proposed]` or
`[tentative]` sit alongside as open annotations and never lower it. An element
declared by two headings has no status at all (§4.2); reading the last heading
and losing the statements under the first is how SQ-21's **S15** reported an
element as `empty` while it held an acceptance.

This is not cosmetic. The first draft derived element status from the weakest
statement of any kind, while the guard's own refusal text tells the model to
"propose the change as `[proposed]` alongside it." Composed, those two rules
meant that every useful suggestion demoted an accepted element and cascaded
false inconsistencies through everything downstream — the harness would have
punished helpfulness. SQ-6 found this by reading the two rules against each
other.

**Acceptance is bound to the text it was given for.** When a statement is
promoted to `[accepted]`, the approval path appends a `DECISION` entry to
`decisions.md` carrying an 8-hex SHA-256 prefix of the accepted text,
computed after whitespace normalization so a reflow does not invalidate an
acceptance while any wording change does. `canvas-review`
recomputes it: if the statement has since been reworded, the acceptance no
longer covers it and is reported as stale. The guard already prevents the model
from doing that; the hash also catches a human edit, a merge, or a co-author.

**An acceptance is logged only by an entry that verifies.** `canvas-review`
counts an `[accepted]` statement as unlogged unless some `DECISION` entry names
its question, carries its `text <hash>`, **and** verifies against the ledger seal
(§4.7). SQ-21's **D7b**, **D7c** and **D8** are why the third condition exists: a
forged `DECISION · 1.2 accepted · text d1b87d4e` appended to `decisions.md`
dropped the unlogged-acceptance count from 2 back to the baseline 1, so the one
mechanism meant to catch an acceptance the guard missed was silenced by a line of
text. An entry that does not verify gives no cover: the acceptance it claims to
account for is still reported as unlogged, and the entry itself is reported as a
broken ledger.

The mechanism is not invented here. `ldx-design-mining/artifact/kernel.py` keys
recorded human reviews to a SHA-256 of the fragment text precisely so they
survive re-mining, and its `audit_r1()` check mechanically verified 75 of 75
fragments in the one logged run and caught a deliberately planted fake quote.
That run is the only empirical evidence in the author's corpus that a provenance
check of this kind works.

**An element carrying open proposals is reported, not flagged as broken:**
"element 3 is accepted and carries two open proposals" is information.

### 4.5 Genre profiles

The canvas has nine elements for every project, but not the same nine. Its
authors say so three times over: the theoretical framework is *"either driving
the research (in quantitative studies) or emerging from it (in qualitative
ones)"*; *"different ontological and epistemological assumptions (and related
methodological preferences) will influence how different scholarly communities
approach the elements included in the canvas and, indeed, what elements are
considered relatively more important"*; and *"while we discuss the nine elements
of the canvas in sequential order, the process of thinking through a research
project does not always proceed in a linear fashion."*

So the genre-dependent parts live in a **profile**, named in the canvas
frontmatter and resolved from `references/profiles/<id>.md`. A profile owns
three things and nothing else:

1. which question set each element gets, and which elements carry weight,
2. the dependency graph (§4.6),
3. which additional modules attach to which element.

**The MVP ships exactly one profile: `is-qualitative`** — information systems,
qualitative and interpretive work. Others are patches, and the plugin is public,
so a method expert who disagrees changes a Markdown file and opens a pull
request rather than arguing with the tool. That is the intended route for
`is-quantitative`, `management-qualitative`, `design-science` and whatever else
people need.

A profile states its commitments in prose a researcher can dispute. It is not a
scoring rubric and produces no number.

### 4.6 The dependency graph — owned by the profile

**The rule, in every profile:** an element may not carry `[accepted]` while an
element it depends on does not. `canvas-review` reports every violation. It
blocks nothing.

**No gate against skipping**, in any profile. Dorobantu et al. call the canvas a
puzzle whose pieces must fit and explicitly aim *"not … to impose a universal
template."* The MIS Quarterly editorial warns against *"script-following or
check-box behavior … that runs counter to the spirit of qualitative inquiry."*
Colquitt and George note the topic decision is made *"years earlier"* than
submission. The project's own discussion paper says *"It should not become a
rigid research lifecycle."*

The graph does more than a gate would anyway: setting element 1 back to
`[tentative]` makes everything downstream inconsistent, and therefore visible,
at once. With a stage gate, going back is an administrative act; here it shows
immediately what now rests on sand.

**Profile `is-qualitative`:**

```
1 Puzzle          ←  —          phenomenon first, not a literature gap
3 Research Q.     ←  1          the question comes from the phenomenon
9 Boundaries      ←  1, 3       scope is declared before sampling, not after
5 Setting         ←  3, 9       sampling follows the scope of the claim
2 Prior Research  ←  1, 3       theory is engaged after framing, and as data
6 Design          ←  5
7 Findings        ←  6
4 Constructs      ←  2, 7       the framework emerges from the material
8 Contributions   ←  2, 4, 7
```

Three edges differ from the order in which the canvas presents its elements, and
each has a reason on the record. `9 → 5` because the boundary condition drives
the sampling in qualitative work rather than following from it. `2 ← 3` because
prior theory enters late and as material to be problematized, not as the gap that
produced the question — the stance of the MIS Quarterly editorial that supplies
this profile's problematization module. `4 ← 7` because the canvas's own authors
say the framework emerges from the research in qualitative studies.

**These three edges are a design proposal, not settled method.** They were
raised by the survey of the author's existing writing guidance (SQ-6), which
cites `positioning-method-saturation.md` for the first and `structure-and-framing.md`
for the second. A profile is exactly the cheap place to be wrong: changing an
edge is editing one line of Markdown, and the file is public.

A hypothetico-deductive profile would restore the canvas's presentation order —
`2 → 3`, `3 → 4 → 5`, `9` last. That profile is not built here.

### 4.7 `research/decisions.md`

Append-only. History is never edited; a correction appends a new entry and names
the one it supersedes.

<!-- private: the example uses a real project name; any placeholder will do -->

```markdown
# Decision log — junior-gap

## [#12] 2026-09-15 · DECISION · 3.1 accepted · text a3f1c9d2 · seal 5e8c11ab4f2d7c90
The question targets the transition, not the outcome. [accepted]
**Why:** ...
**Rejected:** ...

## [#13] 2026-09-16 · DISCOVERY · 2 Prior Research · seal 91d0f7a3b6c4e825
Two studies contradict each other on ... [tentative, src: ref-11]
**Supersedes:** #7
```

Kinds: `DECISION` (a commitment), `CONSTRAINT` (a condition that rules options
out), `DISCOVERY` (a finding that changes the situation). Adopted from Sidequest's
story log — the one mechanism that genuinely transfers from Toolshed to paper
work. The sequence number drives the session ledger (§5.2); the `text <hash>`
field on an acceptance is what §4.4 recomputes. A `DECISION`'s reference is a
question id, `N.M`, which under §4.2's third structural law names the element
too — an acceptance logged for `1.2` cannot silently come to mean an element 9
statement.

**The seal, and what it is for.** "Append-only" was faithful to the file and
blind to the act. SQ-21's **D7b** and **D7c** appended a `DECISION` entry
claiming an acceptance the researcher never made — once with `Edit`, once with a
whole-file `Write` — and the guard permitted both, correctly by its own rule,
because appending is permitted. Nothing bound an entry to an act by the
researcher. **D8** then showed the cost: with that entry in place, §4.4's
unlogged-acceptance backstop stopped reporting an acceptance planted through the
shell hole. The guard and the mechanism meant to catch what the guard misses
failed together.

`seal` is the first 16 hex of HMAC-SHA-256 over the entry's canonical content
and the seal before it:

```
seal(n) = HMAC(key, seal(n-1) ␟ seq ␟ date ␟ kind ␟ ref ␟ text-hash ␟ normalize(body))
```

Chaining makes the log tamper-evident backwards: entry #7 cannot be altered or
removed without invalidating every seal after it. The **key** is what makes an
*append* unforgeable, and a plain SHA-256 chain would not have been — anyone who
can read the log can compute the next digest, so a forger would simply have
sealed their own entry. The key is created by `research-harness init`, lives
under `~/.claude/research-harness/<project>/` with mode 0600, and never enters
the repository. Sixteen hex rather than the eight used for `text`, because this
one resists guessing rather than drift: a forger can run the verifier locally as
often as they like, and 32 bits does not survive that.

State the limit rather than overclaim it. The model runs as the same user as the
approval path, so no purely local secret is beyond its reach. What the seal buys
is that forging an entry is no longer writing a line of Markdown: it requires
reaching outside the project into the harness's own state directory, which is a
step the guard sees and denies, and which leaves the forgery visible as an
unverifiable entry if it is not taken.

**Only the harness writes this file.** The model never writes `decisions.md`
directly — §5.3 denies it — because a write it can perform is a write it can seal
wrongly or leave unsealed. It contributes `DISCOVERY` and `CONSTRAINT` entries
through the harness's own append path — `research-harness log DISCOVERY|CONSTRAINT
<ref> --body "<text>" [--why <text>] [--supersedes <n>]` — which seals what it
writes. `DECISION` entries come from the approval path alone, and the append path
refuses to seal one. §5.3's shell rule admits `log` only with a literal
`DISCOVERY` or `CONSTRAINT`: a kind the guard cannot read is judged as a
`DECISION`, because a word it cannot read is a word that may be one.

**Three verification outcomes**, kept apart by `canvas-review` because they mean
different things:

| Outcome | When | What is reported |
|---|---|---|
| verified | every seal recomputes | nothing |
| unverifiable here | no key on this machine | the log reads as intact, and cannot be confirmed here — the normal case for a fresh clone or a co-author's checkout |
| broken | key present, a seal does not recompute | a problem, naming the first entry that fails and whether its own content or the chain before it changed |

The harness never repairs a broken ledger. Repairing means choosing which
version is true, and that is the researcher's act; `canvas-review` names the
entry that broke and stops there. While a ledger is broken or unverifiable, §4.4
keeps reporting: an acceptance covered only by an entry that does not verify is
an unlogged acceptance.

**A ledger that predates the seal.** Entries carrying no `seal` field are
legacy. They are reported once, as unverifiable, not as broken — a canvas
started before this section existed is not a forgery. The first sealed entry
chains onto the SHA-256 of the entire file content preceding it, so the legacy
block cannot be quietly rewritten either. Once any entry is sealed, every later
entry must be sealed: an unsealed entry appended after a sealed one is the
obvious downgrade attack and is reported as broken.

---

## 5 · Components

```
research-harness/                          ← marketplace repo
  .claude-plugin/marketplace.json
  plugins/research-harness/
    .claude-plugin/plugin.json
    hooks/
      hooks.json
      inject-state.js                      ← SessionStart, fails open
      guard-promotion.js                   ← PreToolUse, fails closed
      lib/                                 ← shared by both hooks and bin/
        canvas.js  decisions.js  hash.js  seal.js
        ledger.js  output.js  profile.js  project.js  review.js
    references/
      canvas-elements.md
      amj-map.md
      problematization.md
      profiles/is-qualitative.md
    skills/
      canvas/SKILL.md
      canvas-review/SKILL.md
      accept/SKILL.md                      ← human-only, disable-model-invocation
    bin/research-harness.js                ← the approval CLI
    bin/canvas-serve.js                    ← stage 2
    dashboard/canvas.html                  ← stage 2
    test/*.test.js                         ← one per module, plus the fixture project
    README.md
```

No `package.json`, no build step — plain Node stdlib CommonJS, like five of
Toolshed's six plugins. Shared code lives in `hooks/lib/`, the layout
`codebase-mapper` uses, and `bin/` requires it by relative path. Tests are found
by convention (`node --test "test/*.test.js"`).

### 5.1 Manifests

`marketplace.json`: four top-level fields (`name`, `owner`, `description`,
`version`) and a `plugins[]` array with one entry. `plugin.json`: `name`,
`version`, `description`, `author`, `license`. `description` and `version` are
duplicated across the two; a short guard script compares them, because otherwise
they drift.

**No `commands/`.** Toolshed had one for four days and then removed every wrapper
(`a6c42e49`): `commands/x.md` and `skills/x/SKILL.md` both map to `/x`, the
harness loads the thin wrapper and afterwards treats the skill as "already
loaded" — the real steps are never injected.

### 5.2 `inject-state.js` — SessionStart

Injects through `hookSpecificOutput.additionalContext`, the only channel to the
model (the model does not read `systemMessage`). Budget **under 4 KiB**; on
overflow, truncate UTF-8-safely with a watermark and a pointer to how the rest can
be loaded.

Contents: which of the nine elements are empty; which carry only `[proposed]` or
`[tentative]`; violations of the dependency rule; the entries in `decisions.md`
this session has not yet seen; the mode (`brainstorming` / `seed` / `import`);
and, first, anything that makes the canvas unjudgeable — a duplicate element
number or question id with both line numbers, a question under the wrong
element, a `profile:` that does not resolve, a ledger whose seal chain is broken
(§4.2, §4.3.1, §4.7).

The session ledger lives under `~/.claude/research-harness/` — transient state
that does not belong to the paper — and remembers the highest sequence number
injected so far.

**Fails open:** if `research/canvas.md` is absent or cannot be read or parsed at
all, the hook injects nothing and exits 0. A hook must never stop a prompt.

A canvas that parses and *then* breaks a structural law is the other case, and
there silence would be the bug. Those problems are injected, and first, because
this is where the researcher hears about them — before the guard refuses their
next write, and long before `canvas-review` is next run.

### 5.3 `guard-promotion.js` — PreToolUse

**No matcher.** Every tool call reaches the guard, which is the one place that
decides which of them it can judge (SQ-24): a matcher naming the tools it knows
is a list of yesterday's holes, and the next write tool — an MCP filesystem
server, whatever the client ships next — would arrive unseen. The guard applies
to writes against `canvas.md` and `decisions.md` in the state directory
(`research/`, or whatever `RESEARCH_HARNESS_DIR` says), to the harness's own
state directory (§4.7), and, from stage 2 on, to `Bash` invocations against the
canvas server's port (§7).

**Rule for `canvas.md` — one rule, over the committed set.** The guard parses
the file as it is and as the write would leave it, and permits the write only
when all five hold:

1. `C(before) ⊆ C(after)` — see §4.3.1 for `C` and for the canonical form it is
   a set of.
2. Every commitment in `C(after) \ C(before)` carries `[stated]`.
3. Every element and question heading that was there is still there.
4. The frontmatter mapping is identical.
5. No statement that carried `[proposed]` or `[tentative]` in `before` carries
   `[stated]` or `[accepted]` in `after` — the promotion prohibition, which
   clauses 1 and 2 cannot express (§4.3.1).

Still allowed: creating, editing and removing `[proposed]` and `[tentative]`
statements; adding a question and a new `[stated]` statement under it as
transcription (§4.3); reordering statements inside a question.

The first draft listed three prohibitions — do not create `[accepted]`, do not
alter or downgrade a committed statement, do not promote a proposal. Clauses 1
and 2 say the first two of them over the whole document at once, and SQ-21
confirmed that they hold against every direct attack on a statement. They were
not wrong; they were too narrow, and the attacks went around them:

| SQ-21 probe | What it did | Now refused by |
|---|---|---|
| S1, S6 | re-parented a committed statement to a duplicate `## 1.1` under another element | §4.2 laws 2 and 3 — unjudgeable — and clause 1 |
| S5, S5b | duplicated a question heading, shadowing the guard's matching in file order | §4.2 law 2, order-independently |
| S15 | added a second `# 1 · …` heading, shadowing the element's status to `empty` | §4.2 law 1 |
| S2 | rewrote the question text above a committed statement | clause 1 |
| S3 | retitled element 1, `Puzzle` to `Contributions` | clause 1 |
| S12 | rewrote `project:` and `outlet:` | clause 4 |
| S12b | pointed `profile:` at an id the plugin does not ship | clause 4, and fail-closed below |
| D4a, D4c | rewrote and stripped the `src:` tag of a committed statement | clause 1 |
| D4b | fabricated an `src:` on the researcher's accepted statement | clauses 1 and 2 |
| D5b, D5c | pushed U+00A0 and U+FEFF into an accepted statement | the normalization class of §4.3.1 |

Rendering visibility — a committed statement indented into a code block (S8) or
wrapped in an HTML comment (S10), key and §4.4 hash unchanged — is a different
question and is decided on SQ-20, not here.

Violation → `permissionDecision: "deny"` with a `permissionDecisionReason` naming
the next legal action: "propose the change as `[proposed]` alongside it, or let
the researcher make it through the canvas view."

**Rule for `decisions.md`: the model does not write it.** Every model write is
refused, appends included. The refusal names the harness command that appends a
`DISCOVERY` or `CONSTRAINT` entry properly, and says that a `DECISION` is the
researcher's act. The first draft allowed appends and was faithful to
"append-only"; **D7b** and **D7c** appended a forged acceptance through that
door, and **D8** showed what it buys — §4.4's unlogged-acceptance backstop went
quiet. The seal (§4.7) is the other half of the answer: an entry planted outside
the guard does not verify, and an entry that does not verify logs nothing.

**The approval path is not a model tool call.** `accept` is the researcher's
act. The guard denies every invocation of the approval CLI it can see, by
whatever name or route it is reached (SQ-22). A CLI-named basename implies an
invocation only when it is a command directly, through a runner, or as
`xargs`' target command; an ordinary path operand does not imply one.

The inference reaches that command slot along two routes, and no other (SQ-52).
A **wrapper** — `env`, `command`, `exec`, `nice`, `time`, `nohup`, `sudo`,
`xargs`, `find -exec` — runs the command that follows it, so the words after it
are read as a command line of their own, however many wrappers are stacked. An
**opaque program** — `sh -c`, `bash -c`, `zsh -c`, `eval`, or a runner given
`-e`, `--eval`, `-p`, `--print` or `--input-type` — carries text in a language
the lexer cannot read, so it counts as an invocation when that text names the
CLI, as a path component or as a `require`/`import` target, or names `accept`;
`node -e 'console.log(1)'` names neither and stays outside the harness. Inside
such a program the guard cannot see which subcommand runs, so it judges the
whole of it as the researcher's act.

**The harness's own state is not the project's state.** The sealing key of §4.7
lives under `RESEARCH_HARNESS_STATE_DIR`, or `~/.claude/research-harness` by
default, and the guard refuses every tool call that reaches into that directory,
reads included — a key the model can read or replace seals nothing. For the same
reason the guard refuses a harness invocation that carries its own environment on
the command line (`RESEARCH_HARNESS_STATE_DIR=… research-harness log …`): the CLI
reads its configuration from the session, and a changed home or state directory
would seal the decision log with a key of the model's choosing, leaving the
researcher's log reading as broken at that entry (SQ-27).

The guard refuses every leading assignment because it cannot tell which variable
redirects the key; that cost falls on the plugin's contributors, not researchers.

**Fails closed — a deliberate departure from Toolshed's doctrine.** Toolshed
mandates fail-soft behaviour ("a malformed rule file degrades to 'skip that
rule'"), but that doctrine is about context injection. A permission guard that
lets writes through on error is a hole. If `guard-promotion.js` cannot judge a
diff confidently, it denies with a reason that says so.

**What "cannot judge" covers.** The clause is not a blank to be filled in by
whoever implements the next case. It is this list, so that the perimeter tickets
implement a stated rule instead of inventing one:

- the result does not parse: frontmatter not terminated, text outside any
  question, no elements at all (already honoured — S13, S16);
- the document breaks a structural law of §4.2: a duplicate element number, a
  duplicate question id, a question under the wrong element (S1, S5, S5b, S6,
  S15);
- `profile:` does not resolve to a shipped profile (S12b), or `canvas-schema:`
  names a schema this parser does not implement;
- the file the write starts from cannot be read, or its path cannot be resolved
  to a canonical identity — a case variant, a symlink, a hard link (SQ-23);
- the edit cannot be applied unambiguously: `old_string` is absent, not a
  string, or present more than once without `replace_all` (already honoured —
  D2b);
- the call arrives through a tool the guard cannot turn into a resulting file
  content, including tools that do not exist yet and MCP tools (SQ-24);
- the call points into the harness's own state directory (§4.7), by any tool and
  including a read: the sealing key is a secret only while the model cannot read
  it, and nothing in that directory is part of the paper (SQ-27);
- a `Bash` command the lexer cannot resolve to a set of words, or a resolvable
  word that can denote the state directory and is not a named read-only form
  (SQ-22).

Denial is the answer in every one of them. Refusal texts are part of the
product: each one names the next legal action, otherwise the harness blocks
itself. A guard that cannot judge and allows anyway is not a guard; a guard that
cannot judge, denies, and will not say why is a wall.

### 5.4 The skills

Minimal frontmatter (`name`, `description` phrased as a *"Use when …"* sentence),
like 15 of Toolshed's 17 skills. Anything longer lives in `references/` and the
skill text explicitly instructs the model to read it — otherwise every invocation
eats context.

**`/research-harness:canvas`** creates `research/canvas.md` and works through the
elements in dialogue. Writes only `[proposed]`, `[tentative]`, and transcribed
`[stated]`. Leaves elements empty when no answer exists.

**`/research-harness:accept <n.n>`** is the approval path, and it exists in
stage 1. Frontmatter carries `disable-model-invocation: true` and
`allowed-tools: Bash(node:*)`; the body is a single `!` line that runs
`bin/research-harness.js accept` and embeds its output. The model cannot invoke
it and does not perform the write — the CLI does, outside the model's tool
surface, which is why the guard does not deny it. This is exactly how Toolshed's
own `board` skill reaches its store.

It promotes one statement to `[accepted]`, appends the `DECISION` entry with the
text hash (§4.7), and refuses if a dependency is unmet, printing which one.

Stage 1 shipping without any approval path was a mistake in the first draft, and
the corpus contains the warning: the one logged run of the design-mining artifact
replaced its strictest human gate with an automatic policy so that the downstream
stages could run at all. A gate with no usable path is a gate that gets removed.

**`/research-harness:canvas-review`** reads the canvas and, if present, the
manuscript, and reports seven things:

1. empty elements,
2. violations of the dependency rule (§4.6),
3. elements that do not fit each other (contributions that do not answer the
   research question; boundary conditions that contradict the setting),
4. statements marked `[stated]`/`[accepted]` that the manuscript no longer
   supports,
5. factual statements carrying neither an `src:` tag nor `unverified` (§4.3),
6. acceptances whose recorded text hash no longer matches the statement (§4.4),
7. purely conversational `[stated]` statements, listed for periodic review.

**The review argues against the canvas, it does not tidy it.** For each element
it must attempt a refutation — what would have to be true for this element to be
wrong, and does the material say it — before reporting fit. A review that only
checks whether the pieces match produces a coherent canvas around a bad study,
and §10 names that as the outcome that would refute this whole design.

Writes only `[proposed]` notes and appends to `decisions.md`. This skill is
already most of the later audit tool (B).

### 5.5 `references/` — structure without other people's text

**The plugin ships none of the protected texts.** It encodes its own question set,
modelled on and citing the sources, names the full reference with DOI for every
element, and points at a local copy through `RESEARCH_HARNESS_LIBRARY` if one
exists. Full references in `REFERENCES.md`.

| Element | AMJ part | Additional module |
|---|---|---|
| 1 Puzzle | 1 · Topic Choice (Colquitt & George 2011) | five criteria: *significance, novelty, curiosity, scope, actionability* |
| 2 Prior Research | 3 · Setting the Hook (Grant & Pollock 2011) | **problematization** (Monteiro et al. 2022) |
| 3 Research Question | 3 · Setting the Hook | |
| 4 Constructs | 4 · Grounding Hypotheses (Sparrowe & Mayer 2011) | |
| 5 Setting | 2 · Research Design (Bono & McNamara 2011) | 7 · Qualitative (Bansal & Corley 2012) |
| 6 Design & Analysis | 2 · Research Design | 5 · Methods and Results (Zhang & Shaw 2012) |
| 7 Findings | 5 · Methods and Results | |
| 8 Contributions | 6 · Discussing the Implications (Geletkanycz & Tepper 2012) | |
| 9 Boundaries | 6 · Discussing the Implications | |

`problematization.md` carries the four sensibilities from Monteiro et al. — enter
a dialogue with the empirical setting; challenge assumptions; ask how we got here;
make the invisible visible — crossed with *what / when / where*. It attaches to
element 2 and answers the worksheet question the canvas raises but does not
operationalize: *"What assumptions do prior studies make about the phenomenon?
Are they accurate?"*

---

## 6 · The three modes

From the original feature list ("via brainstorming / braindump / import mode").
The mode is recorded in the frontmatter and determines where `canvas` starts.

| Mode | Starting point | Entry |
|---|---|---|
| `brainstorming` | nothing exists yet | element 1, dialogue, Colquitt's five criteria |
| `seed` | material and phenomenon exist, no manuscript, no literature commitment | element 1 through the problematization module, not through prior research |
| `import` | a manuscript exists | reconstruct backwards from the text |

**Hard rule for `import`:** everything the agent reads out of a manuscript is
`[proposed]`. Never `[stated]`, even when it appears verbatim in the text — the
agent is reading a manuscript, not hearing the author. Promotion is the human's
act. This makes import safe without a special case.

---

## 7 · The clickable canvas (stage 2)

The original canvas is designed as a *"ready-to-copy"* poster print. Its digital
equivalent is a session view for author-team meetings and solo reviews.

- **Zoom out:** the puzzle layout, nine fields, markers in colour, dependency
  violations highlighted.
- **Zoom in:** one element with its question set, content, markers, and source.
- **Numbering:** every field and every sub-question shows its number.
- **Edit and comment:** comments go to `decisions.md` as `DISCOVERY` entries.

**One truth.** The view is generated from `canvas.md` and writes back to it. It
does not live alongside it.

**It is the better approval path.** The command line already does the job from
stage 1; this is where it becomes usable in a meeting — a human sets `[stated]`
and `[accepted]` by clicking. `bin/canvas-serve.js` binds to `127.0.0.1` on a
random port and writes the promotion directly into the file. The deny hook
remains the counter-check on the model's side. Two separate routes into the same
file: one for the agent, one for the human.

**And an honest limit.** A local HTTP server is not a cryptographic barrier
against a model that has `Bash`. The guard therefore also refuses `Bash`
invocations against the server's port. The security property is nonetheless
**visibility and deliberateness, not impossibility**: a promotion requires a
conscious, visible act. That is strictly more than Sidequest has, but it is not
absolute, and the harness should be able to say so about itself.

**Not in the plugin:** publishing the canvas as a hosted artifact for remote
co-authors. That depends on an account; the plugin ships the local, account-free
variant so it works for other researchers.

---

## 8 · Building in two stages

| Stage | Contents | Size |
|---|---|---|
| **1 · Record and approval** | manifests, `inject-state.js`, `guard-promotion.js` + test, three skills, `bin/research-harness.js` + test, `references/` | ~1,200 lines, mostly prose |
| **2 · Session view** | `bin/canvas-serve.js`, `dashboard/canvas.html`, guard extended to the server port | ~800 lines |

After stage 1 there is a usable tool with a real approval path on the command
line; stage 2 makes that path clickable and adds the meeting view. Together
roughly 2,000 lines, below
Sidequest's first commit (2,828 lines, which already contained a store, a local
HTTP server, a CLI, and a self-contained dashboard HTML file).

---

<!-- private: this whole section names two unpublished projects. Before
publication, rename them to "the qualitative study" and "the conceptual paper",
and drop the `_raw/` path at the end. The argument survives the rename. -->

## 9 · Validation on `junior-gap`

The same study in two states. `research-harness-paper` is ruled out as a canvas
test case: the AMJ canvas is built for **empirical** management research, and a
conceptual design-science paper leaves half the elements unfilled or fills them
only metaphorically.

**Run A — import.** Reconstruct the canvas from the R2 manuscript. *Success
criterion:* `canvas-review` finds at least one **substantive** incoherence the
author recognizes as real — not merely formal gaps such as missing elements. The
dependency graph should be largely satisfied for a paper in revision; if it is
not, either the graph is wrong or the paper has a real problem.

**Run B — seed.** Material and phenomenon only, no manuscript, no literature
commitment, entering through the problematization module. *Success criterion:* a
framing that differs substantively from the current one. Better or worse — both
are informative.

**The comparison of the two runs is the finding**, and it is simultaneously the
artifact `research-harness-paper` needs for the *Organization Science* call ("a
prototype or equivalent research artifact"). A harness that ran on a live study
in two modes and compares the resulting framings is stronger evidence than one
applied to itself.

**Data:** local, under existing ethics approval. Run B sees the study's own raw
material; run A reads only the manuscript. None of it is shipped.

**The canvas never carries raw material verbatim.** Seed mode operates under the
data rules the study's own `AGENTS.md` already states; a canvas statement may
cite a source through an `src:` tag and must not quote from it. The canvas is a
record of framing, and it travels — to a co-author, into a supplement, onto a
meeting screen. Anything quotable belongs in the manuscript, where the study's
consent terms already govern it.

<!-- /private -->

---

## 10 · What would refute this design

Following the project charter pattern — "evidence that would make us narrow,
redesign, or abandon the approach."

- **The nine elements can only be filled for a qualitative study by distorting
  it.** → The canvas is the wrong instrument; a genre-specific profile is needed
  before anything gets built.
- **`canvas-review` finds only formal gaps, never substantive ones.** → It is a
  checklist, not a harness. Exactly what the MIS Quarterly editorial warns about.
- **Promotion through the view feels like friction and the author edits the file
  by hand instead.** → The approval path is theatre; the axis needs another form.
- **Seed mode produces nothing but gap-spotting.** → The problematization module
  does not work as a prompt and must be built differently.
- **The dependency graph reports constant violations on a paper in revision.** →
  The graph misrepresents research practice.

---

## 11 · Open questions

<!-- private: the two paragraphs below name internal paths of other
repositories. Before publication, cut them entirely — they are working notes for
the author's own board, not part of the design. -->

**For SQ-6 (survey of the three rule collections) — sharpened brief:** do not
survey openly; **test against this design.** Does the question set carry the rules
in `junior-gap/material/misq-research-note/`? Does the marker axis contradict the
oracle gate in `research-harness-paper/AGENTS.md`? Of the rules that appear twice
across the three drifting `AGENTS.md` files, which fall under this MVP, and which
only under the writing craft or the evidence machinery?

**For SQ-7 (fixture strategy) — unblocked:** the fixture for this MVP is a
synthetic canvas plus an invented manuscript. No personal data, no consent
question. The transcript question stays open and must be answered before the
evidence machinery is built, but it no longer holds up the MVP.

<!-- /private -->

**Raised by SQ-6 and now decided:**

- **The disputed edges, and the discipline anchor, are the same question** — and
  the answer is the genre profile (§4.5). The canvas's own authors say the
  direction of one element depends on the genre and that communities weight the
  elements differently, so a single universal graph was the error. The MVP ships
  `is-qualitative` with the corrected edges; anything else is a Markdown patch
  against a public repository.
- **The canvas does not know about the board.** The prototype's oracle gate
  accepts *work packages*; this design's axis accepts *claims*. They are
  different objects, and joining them would make the canvas mirror board state —
  a second truth, which §7 forbids for the same reason. A recorded verdict is
  *evidence* for a canvas statement and enters as an `src:` tag; accepting the
  statement remains a separate human act.

Full report: `sources/report-sq6-schreibanleitungen-gegentest-2026-09-15.md` in
the author's notes.

**Not yet decided:**

- How often an agent marks something `[stated]` that was not in fact said. With
  the evidence axis in place this is checkable wherever the statement claims a
  source, and unresolvable only for purely conversational ones (§4.3).
  To be observed on the real case: if it happens often, `[stated]` must also go
  through the approval path — at the cost of a click on every dialogue step.
- Whether `decisions.md` grows too large for injection over a long project and
  needs compaction.
- How a co-author sharing the repo uses the approval path, and what they do with
  the ledger seal key (§4.7), which by design never enters the repository: their
  checkout reports the log as unverifiable here, which is honest but not useful
  to them. The MVP is explicitly single-seat.
- Whether `research/` collides with journals that prescribe their own directory
  scheme for supplementary material.

---

## 12 · Where B and C attach

- **B (audit tool)** is `canvas-review` extended: reconstruction from other
  people's manuscripts, `/tell-me-why` for thesis students, devil's advocate
  against individual elements.
- **C (writing craft)** reads the canvas as context and uses the same
  `references/` mapping: `/abstract` from elements 1, 3, 7, 8;
  `/significance-statement` from 8 and 9; the paragraph-by-paragraph review mode
  ("but I like to write") with versioning in the decision log.

Neither requires a change to the data model.

**Profiles are where other people's work arrives.** A genre profile is one
Markdown file declaring a question emphasis, a dependency graph, and which
modules attach where — no code. That makes it the natural unit of contribution:
a method expert who thinks the qualitative graph is wrong, or who needs
`design-science` or `is-quantitative`, edits one file and opens a pull request.
The discussion paper asks for exactly this — profiles that *"declare their
commitments and checks in language a researcher can question"* and are *"owned by
method experts"* — and it warns against the alternative, a generic rigor score
that would *"conceal consequential disagreements behind a number."*

---

## References

All in [`REFERENCES.md`](../../../REFERENCES.md). Full texts are held locally in
`_literature/` (not version-controlled); PDFs in the author's library.

Toolshed findings come from a study of the marketplace repository
(`~/.claude/plugins/marketplaces/eigenwise-toolshed`, 3,979 commits) carried out
on 2026-09-15; file and commit references are cited inline.
