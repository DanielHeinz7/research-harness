# research-harness

A research harness for paper projects. It keeps the framing of a study — the
nine elements of the AMJ Management Research Canvas — as version-controlled
state inside the paper's own repository, and it enforces one line: **an agent
may propose, but only the researcher accepts.**

## Install

From Claude Code:

    /plugin marketplace add DanielHeinz7/research-harness
    /plugin install research-harness@research-harness

Or from a local checkout: `/plugin marketplace add /path/to/research-harness`.

In any repository without `research/canvas.md` the plugin stays silent.

## Use

In a paper project's repository:

1. `/research-harness:canvas` — creates `research/canvas.md` and
   `research/decisions.md` if they do not exist, then works through the
   elements with you. Everything it writes is `[proposed]`, `[tentative]`, or
   a `[stated]` transcription of your words.
2. `/research-harness:accept 3.1` — you accept a statement. The CLI promotes
   it to `[accepted]`, appends a sealed decision-log entry carrying a hash of
   the text, and refuses if an element it depends on is not accepted yet.
3. `/research-harness:canvas-review` — argues against the canvas: gaps,
   contradictions between elements, unmet dependencies, claims without a
   source, acceptances whose text has since changed, and the state of the
   decision log's seal chain.

At every session start the plugin injects a short summary: which elements are
empty, which hold only proposals, which dependencies are violated, which
decisions you have not seen yet, and whether the decision log verifies.

### On a clone that is not the machine the project started on

The sealing key of the decision log lives outside the repository and is not
committed, so a fresh clone has none and the log reads as *unverifiable here*.
Run `research-harness init --project <slug> --mode <mode>` once in the clone. On
a project that already has a canvas it creates the missing key and changes
nothing else. Entries sealed elsewhere stay unverifiable on this machine; that
is the honest answer, and the review says so rather than reporting a problem.

## The five commands

The skills above are the normal way in. The CLI underneath them is
`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js"`:

| Command | What it does |
|---|---|
| `init --project <slug> --mode brainstorming\|seed\|import [--outlet <name>] [--profile <id>]` | creates the canvas, the log and the sealing key |
| `status` | the summary the session hook injects |
| `review` | the mechanical half of `canvas-review` |
| `accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]` | the researcher's act; the model may not run it |
| `log DISCOVERY\|CONSTRAINT <ref> --body <text> [--why <text>] [--supersedes <n>]` | appends a sealed entry — how the model records a finding |

## What it enforces

A hook denies any write by the model that would create an `[accepted]`
statement, alter or remove a `[stated]` or `[accepted]` statement, promote a
proposal, rewrite a heading or the frontmatter, or write the decision log at
all. A commitment is the statement together with what gives it meaning: its
element, that element's title, its question, the question's text, its marker,
its text, and its evidence tags. Moving an accepted statement to another
element changes no bytes of it and is refused.

Shell access to the two state files is read-only, judged by lexing the command
rather than by matching strings in it. The harness's own state directory, which
holds the sealing key, is closed to every tool including reads. When the hook
cannot judge a write, it denies it and says why.

The decision log is tamper-evident: each entry carries a seal chained over its
own content and the seal before it, under a per-project key created by `init`,
mode 0600, outside the repository. An acceptance counts as logged only if its
entry verifies, so an entry planted outside the harness covers nothing and the
review names it. Entries written before the seal existed are reported once as
unverifiable, never as broken.

What it does not enforce, because it cannot: whether a `[stated]` transcription
is faithful, and whether a cited source actually supports a claim. The review
lists both for you. And the model runs as the same user you do, so no purely
local secret is beyond its reach — what the seal buys is that forging an entry
is no longer writing a line of Markdown, and that an unforged forgery is
visible.

## Files in your project

    research/
      canvas.md       nine elements, numbered questions, statements with markers
      decisions.md    append-only log: DECISION | CONSTRAINT | DISCOVERY, each sealed

Both belong in Git. The canvas is a record of framing; it cites material with
`src:` tags and never quotes it. The sealing key does not belong in Git and is
not written inside the repository.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `RESEARCH_HARNESS_DIR` | state directory inside the project | `research` |
| `RESEARCH_HARNESS_LIBRARY` | local full-text copies of the cited editorials | unset |
| `RESEARCH_HARNESS_STATE_DIR` | session ledger and sealing key, outside the paper | `~/.claude/research-harness` |

The genre profile is named in the canvas frontmatter (`profile: is-qualitative`).
One profile ships. Others are a Markdown file each under
`references/profiles/` — contributions welcome.

## Where the questions come from

The question set is the plugin's own wording, modelled on the canvas by
Dorobantu, Gruber, Ravasi & Wellman (2024), read alongside the seven-part
*Publishing in AMJ* series and the MIS Quarterly editorial on phenomenon-focused
problematization. Full references in the repository's `REFERENCES.md`. None of
those texts ships with the plugin.

## Development

    cd plugins/research-harness
    node --test test/*.test.js

Plain Node, no dependencies, no build. Shared code is in `hooks/lib/`; both
hooks and the CLI require it by relative path.

When developing the plugin inside Claude Code, the guard deliberately refuses
`NAME=value` before a harness invocation. Run the command without the leading
assignment, or work from a shell outside Claude Code. This friction falls on
plugin contributors; researchers do not need the assignment because Claude Code
sets `CLAUDE_PLUGIN_ROOT`.
