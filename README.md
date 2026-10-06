# research-harness

A research harness for steering paper projects, built as a Claude Code plugin —
the way Toolshed and Sidequest are for software projects: procedures, records,
checks, and decision rights for AI-assisted research.

**Status:** stage 1 implemented — canvas, guard, session injection, CLI approval
path, sealed decision log, three skills, and verified in a live install. Stage 2
(clickable session view) not started.
See [the plugin README](plugins/research-harness/README.md) and
[the MVP design](docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md).

## Scope

Paper projects only, for now — journal articles, conference papers, book
chapters. Grant proposals, supervision, and reviewing are the next candidates,
but that gets decided on a real case, not in advance.

## A contract, not a path

The contract is **"a paper project repo."** Where that repo lives is
configuration.

The plugin must not hard-wire any root — least of all its author's local
convention. It ships through Toolshed to other researchers, and they do not have
that root. Toolshed stands in the same relationship to its own author's
directories.

A repository counts as a paper project when it contains `research/canvas.md`.
Nothing else. In any other repository the plugin stays silent, except that a
command or tool call naming the `research/` location is still judged there.

## What it does

The first shippable piece makes the state of a paper project durable and
inspectable:

- the nine elements of the AMJ Management Research Canvas as version-controlled
  project state in `research/canvas.md`, each statement carrying an authorization
  marker (who may write it) and, where it makes a factual claim, an evidence tag
  (what backs it — a locatable source, or `unverified`, never nothing)
- an append-only decision log in `research/decisions.md`, made tamper-evident by
  a seal chained over its entries under a per-project key that never enters the
  repository, so a forged acceptance is visible as an entry that does not verify
- a dependency check across the nine elements, reported by `review` and enforced
  where `accept` refuses an acceptance whose dependencies are not yet accepted —
  the canvas is a puzzle whose pieces must fit, not a sequence of stages
- a genre profile that owns the question emphasis and the dependency graph,
  because the canvas's own authors say both depend on the kind of research being
  done. One profile ships: `is-qualitative`. Further profiles are Markdown
  patches, and contributions are welcome.
- an enforced separation between what an agent proposed and what a human
  accepted, backed by a hook that denies the model the ability to declare a
  commitment, to alter what the researcher said, or to write the decision log
- a clickable session view for author-team meetings, which doubles as the
  approval path

## The construct glossary

A project may keep `research/glossary.md` beside the canvas: one entry per
construct, with its term, aliases, definition, a local origin, and the
distinctions from neighbouring constructs. A canvas statement cites an entry as
`src: glossary.md#felt-safety`; a manuscript links it as
`[felt safety](research/glossary.md#felt-safety)`. Agents propose entries and
never accept them. The researcher accepts one with
`/research-harness:glossary-accept <id> --explained "<their sentence>"`, and the
sealed decision log binds that entry's payload, so a later change to a
definition is reported as stale rather than silently inherited by what cites
it. `review` adds a `Glossary mechanics` group for entry structure and
provenance, declared canvas and manuscript coverage, a lexical cross-check, and
accepted-text stability. It cannot judge whether a definition is the right one
for the study, and says so.

## The literature note

A literature note is drafted from one local paper, and what it produces is a
proposal before it is anything else. A page map binds each printed page of the
PDF to the physical page it was read from, so a quotation's printed-page locator
can be checked at all. The drafting request goes through an already approved
local gateway route, and before any note is saved, every quotation is compared
against the page the note claims — wording only, as a contiguous sequence of
words, with typographic variants folded and word boundaries kept intact. A
passage from another page, one invented word, a reversed run, or a quotation
form the gate cannot read word for word refuses the note, and a note with no
quotations does not pass either.

```
This check covers only verbatim wording on the claimed printed page. It does not
verify paraphrase, numbers or attribution, and it does not accept a research
claim. Project relevance and transfer judgments remain [proposed] for human
review.
```

`/research-harness:literature-note` walks a researcher through the sequence, and
[the plugin reference](plugins/research-harness/references/literature-note.md)
documents the commands, the exit codes and a walkthrough on an invented paper.
No source PDF or extracted text ships with the plugin, and no note-acceptance
ledger exists: an idea the note raises becomes a canvas proposal through the
canvas skill, which the researcher then accepts or not.

## Try it on public data

[`examples/ai-assistants-interviews/`](examples/ai-assistants-interviews/README.md)
holds the pins and scripts for a demo on 13 openly licensed interviews about AI
assistants in software engineering (Zenodo, CC BY 4.0). The walkthrough in
[the plugin README](plugins/research-harness/README.md#walkthrough-the-three-capabilities-on-a-public-dataset)
runs a framing multiverse, a choice between framings, an accept with an
explanation despite an open check question, a read-only review of the record, and
a verification of the log on another machine. A test runs its commands and holds
them to the output the README shows.

The [technical appendix](docs/technical-appendix.md) describes the state and seal,
the measured promotion guard, off-machine verification, and their limits at a
named main revision.

## Two people, one canvas

A researcher and supervisor can work on one canvas at one machine or in two git
clones, including remotely. The log records both people's entries. Both clones
must run research-harness 0.5 and share the project's sealing key. A clone still
on a pre-seal version cannot merge its log with a sealing clone: `merge-log`
refuses an incoming log that does not verify under the shared key.

For two clones, the key holder first exports the existing project key from the
original project, in their own terminal:

```sh
research-harness key export --out /path/outside-repo/project.seal.key
```

The output file must end in `.seal.key`. It is created with mode `0600`; the
command never prints the key. Hand over the file separately, not as plain-text
mail, not through a command line or transcript, and not through the repository.

The second person installs the plugin as described in
[Install](plugins/research-harness/README.md#install), runs
`research-harness install-cli` once in Claude Code to make the terminal command
available, and clones the paper project. In their own terminal:

```sh
git clone <project-url> paper-project
cd paper-project
research-harness join --key-file /path/outside-repo/project.seal.key --name "B. Supervisor"
```

`join` checks the key against the log before copying it and sets the local name.
It runs `doctor` and tells you when the exported file can be deleted; it does
not delete it. Do not initialize a second key for a sealed log.

In each clone, make pulls use a merge rather than a rebase:

```sh
git config pull.rebase false
```

At one machine no key handover is needed. Before each person's writes, set
`research-harness name "A. Researcher"` or
`research-harness name "B. Supervisor"` as appropriate. The name setting is
user-wide, not per project; without it the CLI uses `git config user.name`.
`By` is a statement, not proof: whoever holds the key can write any name.

Before the session, export the agenda, which contains the view's "To talk about"
items. Then mark the start of the session:

```sh
research-harness agenda --out agenda.md
research-harness session start "Supervision on the study framing"
```

After the session, export its protocol:

```sh
research-harness session protocol --out protocol.md
```

This selects the latest session. To select an earlier one, put its SESSION entry
number after `protocol`, for example `research-harness session protocol 12`.
A session runs until the next SESSION marker or the end of the log; there is no
end command. People send the agenda and protocol themselves.

When a pull conflicts on `research/decisions.md`, run the following inside that
merge, not during a rebase:

```sh
research-harness merge-log
git add research/decisions.md
git commit
```

Resolve any other conflicts before committing. `merge-log` keeps the other
clone's log unchanged and moves your divergent entries after it, renumbered and
re-sealed. It records the moves in a MERGE entry. It handles only the log; git
handles `canvas.md` and other files. The text above the first entry and all
shared unsealed entries must match byte for byte.

A merge is refused if moving your acceptance after a check the other clone
opened would make that unseen check read as closed. Nothing is written. Follow
the refusal's entry number: abort with `git merge --abort`, pull again with
`git pull --no-rebase`, then run `research-harness merge-log --skip-decision <n>`.
For example, `research-harness merge-log --skip-decision 12` leaves out DECISION
12; do not put `#` before the number in a shell command. The omitted entry stays
in git history and the MERGE entry records it. Stage and commit as above.
The statement in `canvas.md` may still read `[accepted]`: reset its marker by
hand to its previous non-accepted marker after the merge, then accept it again
with `research-harness accept <n.m> --explained "<your sentence>"` after reading
the other person's check. The tool does not reset the canvas marker for you.

These setup and writing steps belong to people: the guard refuses model calls
to `name`, `key`, `join`, `session start` and `merge-log`, and reads or writes
naming a path ending in `.seal.key`. The model may run `agenda` and
`session protocol [<n>]` only without any flag. The `--out` exports above are
human steps too.

## Where the rules come from

The harness's question set is derived from published methodological and
craft literature — the AMJ Management Research Canvas, the seven-part
*Publishing in AMJ* series, the MIS Quarterly editorial on phenomenon-focused
problematization, and two JAIS pieces on writing. Full references in
[REFERENCES.md](REFERENCES.md).

The plugin does not ship these texts. It encodes its own question set, modelled
on them and citing them, and points at a local full-text collection through
`RESEARCH_HARNESS_LIBRARY`.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `RESEARCH_HARNESS_DIR` | state directory inside the paper repo | `research/` |
| `RESEARCH_HARNESS_LIBRARY` | local full-text collection of the cited works | unset |
| `RESEARCH_HARNESS_STATE_DIR` | session ledger and the decision log's sealing key, outside the paper repo | `~/.claude/research-harness` |

The genre profile is not an environment variable — it is named in the canvas
frontmatter (`profile: is-qualitative`) so it travels with the project.

## Releasing

    node scripts/release.js <version> "<summary>" [--dry-run] [--trailer "<line>"] [--accept-denies]

Run it from a clean `main`. It refuses unless the version is semver and greater
than the one in both manifests, runs the plugin tests, the perimeter probe and
the guard's false-positive replay (`verification/probes/probe-benign.js`) over
the newest harvest in `verification/local/`, and only then sets the version in
`.claude-plugin/marketplace.json` (twice) and
`plugins/research-harness/.claude-plugin/plugin.json`, commits
`Release <version>: <summary>`, pushes `main`, and updates the installed plugin.

The replay's DENY count is compared with the last release's, kept in the
gitignored `verification/local/release-baseline.json`; more DENYs stop the
release unless `--accept-denies` is given. Without a harvest the script refuses
and names the command to make one
(`node verification/probes/probe-benign.js --harvest`). `--dry-run` runs the
checks and prints the remaining commands without running them.
