# research-harness

A research harness for steering paper projects, built as a Claude Code plugin —
the way Toolshed and Sidequest are for software projects: procedures, records,
checks, and decision rights for AI-assisted research.

**Status:** repository created, MVP designed, not yet implemented.
See [the MVP design](docs/superpowers/specs/2026-09-15-research-harness-mvp-design.md).

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
Nothing else. In any other repository the plugin stays silent.

## What it does

The first shippable piece makes the state of a paper project durable and
inspectable:

- the nine elements of the AMJ Management Research Canvas as version-controlled
  project state in `research/canvas.md`, each statement carrying an authorization
  marker (who may write it) and, where it makes a factual claim, an evidence tag
  (what backs it — a locatable source, or `unverified`, never nothing)
- an append-only decision log in `research/decisions.md`
- a dependency check across the nine elements, reported rather than enforced —
  the canvas is a puzzle whose pieces must fit, not a sequence of stages
- a genre profile that owns the question emphasis and the dependency graph,
  because the canvas's own authors say both depend on the kind of research being
  done. One profile ships: `is-qualitative`. Further profiles are Markdown
  patches, and contributions are welcome.
- an enforced separation between what an agent proposed and what a human
  accepted, backed by a hook that denies the model the ability to declare a
  commitment or to alter what the researcher said
- a clickable session view for author-team meetings, which doubles as the
  approval path

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

The genre profile is not an environment variable — it is named in the canvas
frontmatter (`profile: is-qualitative`) so it travels with the project.
