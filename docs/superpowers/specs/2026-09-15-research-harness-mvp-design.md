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
| Skills | `canvas`, `canvas-review` |
| State location | `<paper-repo>/research/` — **visible, in Git**, not a dot directory |
| Files | `research/canvas.md`, `research/decisions.md` |
| State override | `RESEARCH_HARNESS_DIR` |
| Library override | `RESEARCH_HARNESS_LIBRARY` |
| Marker vocabulary | `[proposed]` `[tentative]` `[stated]` `[accepted]` |

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
genre: qualitative / interpretive
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

`outlet` and `genre` are frontmatter, not a tenth element: the canvas has nine
elements by its source, but almost every question in the set is answered
differently for a qualitative MISQ paper than for an experimental one, and the
harness must know which before it asks.

**Rules:**

- Markers sit **at the end of a statement**, as in the author's own convention.
  A statement is a paragraph.
- A statement carries **one authorization marker** and, optionally, **one
  evidence tag** (§4.3). Both live in the same brackets, separated by a comma.
- **An empty element is a legal and explicitly desirable state.** It is better
  than plausible filler. This is the anti-fabrication rule at canvas level.

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

### 4.4 Element status, and why a proposal must not demote

An element's status is derived **only from its committed statements** — those
carrying `[stated]` or `[accepted]`. Statements carrying `[proposed]` or
`[tentative]` sit alongside as open annotations and never lower it.

This is not cosmetic. The first draft derived element status from the weakest
statement of any kind, while the guard's own refusal text tells the model to
"propose the change as `[proposed]` alongside it." Composed, those two rules
meant that every useful suggestion demoted an accepted element and cascaded
false inconsistencies through everything downstream — the harness would have
punished helpfulness. SQ-6 found this by reading the two rules against each
other.

**Acceptance is bound to the text it was given for.** When a statement is
promoted to `[accepted]`, the approval path appends a `DECISION` entry to
`decisions.md` carrying a short hash of the accepted text. `canvas-review`
recomputes it: if the statement has since been reworded, the acceptance no
longer covers it and is reported as stale. The guard already prevents the model
from doing that; the hash also catches a human edit, a merge, or a co-author.

The mechanism is not invented here. `ldx-design-mining/artifact/kernel.py` keys
recorded human reviews to a SHA-256 of the fragment text precisely so they
survive re-mining, and its `audit_r1()` check mechanically verified 75 of 75
fragments in the one logged run and caught a deliberately planted fake quote.
That run is the only empirical evidence in the author's corpus that a provenance
check of this kind works.

**An element carrying open proposals is reported, not flagged as broken:**
"element 3 is accepted and carries two open proposals" is information.

### 4.5 Dependencies instead of a stage gate

The canvas is **not a sequence.** Dorobantu et al. write that it is *"arranged as
a puzzle because each element must 'fit' with related elements,"* and explicitly
that their aim is *"not … to impose a universal template for doing research or
writing papers."* The MIS Quarterly editorial warns against *"script-following or
check-box behavior … that runs counter to the spirit of qualitative inquiry."*
Colquitt and George note that the topic decision is made *"years earlier"* than
submission — the order of writing is not the order of working. And the project's
own discussion paper says: *"It should not become a rigid research lifecycle."*

So: **no gate against skipping.** A graph instead:

```
1 Puzzle          ←  —
2 Prior Research  ←  1
3 Research Q.     ←  1, 2
4 Constructs      ←  3
5 Setting         ←  3, 4
6 Design          ←  4, 5
7 Findings        ←  6
8 Contributions   ←  2, 3, 7
9 Boundaries      ←  5, 6, 7
```

**The rule:** an element may not carry `[accepted]` while an element it depends
on does not. `canvas-review` reports every violation. It blocks nothing.

This does more than a gate would: setting element 1 back to `[tentative]` makes
3, 8 and everything downstream inconsistent, and therefore visible, at once. With
a stage gate, going back is an administrative act; here it immediately shows what
now rests on sand.

The graph is derived from the worksheet itself, which asks under Research
Question: *"How does answering your research question advance prior research and
our understanding of the puzzle?"* (→ 3 depends on 1 and 2).

**Two edges are disputed and not yet settled.** SQ-6 argues that `9 ← 5,6,7` runs
backwards for qualitative work, where the boundary condition drives the sampling
rather than following from it, and that `3 ← 2` runs backwards where prior theory
enters late and as data. Both claims cite the author's own MISQ writing guidance.
Neither has been adjudicated; see §11.

### 4.6 `research/decisions.md`

Append-only. History is never edited; a correction appends a new entry and names
the one it supersedes.

<!-- private: the example uses a real project name; any placeholder will do -->

```markdown
# Decision log — junior-gap

## [#12] 2026-09-15 · DECISION · 3.1 accepted · text a3f1c9
The question targets the transition, not the outcome. [accepted]
**Why:** ...
**Rejected:** ...

## [#13] 2026-09-16 · DISCOVERY · 2 Prior Research
Two studies contradict each other on ... [tentative, src: ref-11]
**Supersedes:** #7
```

Kinds: `DECISION` (a commitment), `CONSTRAINT` (a condition that rules options
out), `DISCOVERY` (a finding that changes the situation). Adopted from Sidequest's
story log — the one mechanism that genuinely transfers from Toolshed to paper
work. The sequence number drives the session ledger (§5.2); the `text <hash>`
field on an acceptance is what §4.4 recomputes.

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
    references/
      canvas-elements.md
      amj-map.md
      problematization.md
    skills/
      canvas/SKILL.md
      canvas-review/SKILL.md
      accept/SKILL.md                      ← human-only, disable-model-invocation
    bin/research-harness.js                ← the approval CLI
    bin/canvas-serve.js                    ← stage 2
    dashboard/canvas.html                  ← stage 2
    test/guard-promotion.test.js
    test/accept.test.js
    README.md
```

No `package.json`, no build step, no `lib/` — plain Node stdlib CommonJS, like
five of Toolshed's six plugins. Tests are found by convention
(`node --test "test/*.test.js"`).

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
this session has not yet seen; the mode (`brainstorming` / `seed` / `import`).

The session ledger lives under `~/.claude/research-harness/` — transient state
that does not belong to the paper — and remembers the highest sequence number
injected so far.

**Fails open:** if `research/canvas.md` is absent, unreadable, or malformed, the
hook injects nothing and exits 0. A hook must never stop a prompt.

### 5.3 `guard-promotion.js` — PreToolUse

Matcher on `Edit|Write|NotebookEdit|Bash`. Applies to writes against `canvas.md`
and `decisions.md` in the state directory (`research/`, or whatever
`RESEARCH_HARNESS_DIR` says) — and, from stage 2 on, to `Bash` invocations
against the canvas server's port (§7).

**Rule for `canvas.md`** — three prohibitions, everything else allowed:

1. Do not create a statement carrying `[accepted]`.
2. Do not alter or remove an existing statement carrying `[stated]` or
   `[accepted]` — including downgrading its marker.
3. Do not promote a `[proposed]`/`[tentative]` statement to `[stated]` or
   `[accepted]`.

Still allowed: creating, editing, and removing `[proposed]` and `[tentative]`
statements; and creating a **new** `[stated]` statement as transcription (§4.3).

Violation → `permissionDecision: "deny"` with a `permissionDecisionReason` naming
the next legal action: "propose the change as `[proposed]` alongside it, or let
the researcher make it through the canvas view."

**Rule for `decisions.md`:** append only. Any change to existing content is
refused.

**Fails closed — a deliberate departure from Toolshed's doctrine.** Toolshed
mandates fail-soft behaviour ("a malformed rule file degrades to 'skip that
rule'"), but that doctrine is about context injection. A permission guard that
lets writes through on error is a hole. If `guard-promotion.js` cannot judge a
diff confidently, it denies with a reason that says so.

Refusal texts are part of the product: each one names the next legal action,
otherwise the harness blocks itself.

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
text hash (§4.6), and refuses if a dependency is unmet, printing which one.

Stage 1 shipping without any approval path was a mistake in the first draft, and
the corpus contains the warning: the one logged run of the design-mining artifact
replaced its strictest human gate with an automatic policy so that the downstream
stages could run at all. A gate with no usable path is a gate that gets removed.

**`/research-harness:canvas-review`** reads the canvas and, if present, the
manuscript, and reports seven things:

1. empty elements,
2. violations of the dependency rule (§4.5),
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

**Left open by SQ-6, needing the author's judgment — these are the findings this
draft did not adjudicate:**

- **Two edges of the dependency graph may run backwards** (§4.5). SQ-6 argues
  from `positioning-method-saturation.md` that for qualitative work the boundary
  condition drives the sampling, so `9 ← 5,6,7` is inverted; and from
  `structure-and-framing.md` that prior theory enters late and as data, so
  `3 ← 2` is inverted. Both are claims about the author's own methodological
  commitments and cannot be settled from the plugin side.
- **The seam between the oracle gate and the acceptance axis.** The prototype's
  oracle gate accepts *work packages* and leaves conversation free; this design's
  axis gates *file writes* and is strictest in conversation. SQ-6 calls these two
  acceptance books without a seam, and notes that a verdict already recorded on
  the board cannot be transcribed into the canvas under the current rules. Whether
  the two should be joined, or the canvas should simply not know about the board,
  is undecided.
- **No discipline anchor.** The canvas is AMJ-shaped. `outlet` and `genre` in the
  frontmatter (§4.2) are a first answer, but SQ-6 argues the question set itself
  differs by discipline, not only by outlet.

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
- How a co-author sharing the repo uses the approval path. The MVP is explicitly
  single-seat.
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

---

## References

All in [`REFERENCES.md`](../../../REFERENCES.md). Full texts are held locally in
`_literature/` (not version-controlled); PDFs in the author's library.

Toolshed findings come from a study of the marketplace repository
(`~/.claude/plugins/marketplaces/eigenwise-toolshed`, 3,979 commits) carried out
on 2026-09-15; file and commit references are cited inline.
