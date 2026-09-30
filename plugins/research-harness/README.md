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

Run `research-harness doctor` first: it checks that the plugin is enabled in
your settings and that the promotion guard is actually denying what it should,
and prints one line per problem it finds. It reads settings files rather than
Claude Code's own running state, so it cannot see whether a Claude Code
process you already have open actually loaded the plugin — restart the
session after installing or enabling it.

In any repository without `research/canvas.md` the plugin stays silent, with one
exception: a command or tool call that names the `research/` location is still
judged there, because creating or removing that directory is how the state
comes into being.

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

## Feedback

Report problems as GitHub Issues: *friction* when something took longer than it
should have or confused you, *bug* when a result is wrong or something crashes.
[Open an issue](https://github.com/DanielHeinz7/research-harness/issues/new/choose)
and the template asks for the command, what happened, and your plugin version.

Issues are public, so keep unpublished canvas and decision text out of them.

## The seven commands

The skills above are the normal way in. The CLI underneath them is
`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js"`:

| Command | What it does |
|---|---|
| `init --project <slug> --mode brainstorming\|seed\|import [--outlet <name>] [--profile <id>]` | creates the canvas, the log and the sealing key |
| `status` | the summary the session hook injects |
| `review` | the mechanical half of `canvas-review` |
| `accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]` | the researcher's act; the model may not run it |
| `log DISCOVERY\|CONSTRAINT <ref> --body <text> [--why <text>] [--supersedes <n>]` | appends a sealed entry — how the model records a finding |
| `serve [--no-open]` | opens the session view in your browser; the model may not run it |
| `doctor` | checks that the plugin is enabled and the guard denies what it should |

## Session view

    research-harness serve

Run this in your own terminal, not through Claude Code: the guard refuses both
the `serve` subcommand and a direct run of `bin/canvas-serve.js`, because
starting the server is the researcher's act. It refuses to start at all
without a `research/canvas.md` already in place.

The command binds to `127.0.0.1` on a random port, opens a browser tab whose
URL carries a single-use code, and prints that same URL to your terminal in
case the browser does not open on its own. On load the view trades the code
for the write token, once. The token lives only in the server's memory and
the open tab; stop the server with Ctrl-C and it is gone. The terminal
prints `session code redeemed` with the time when that happens. If the view
says the link was already used, stop `serve` and start it again.

The view opens on the poster and reads like the paper's argument, not a form:

- the poster shows the whole paper on one screen, nine fields in argument
  order. Each field is a plain question with the first statement under it,
  written the way the authors would say it. Where a field has findings, a
  quiet line at the foot of its card ("2 things to talk about") opens the
  "To talk about" tab at that field;
- "To talk about" is where a meeting starts: the fields with something to
  discuss, and the questions nobody has answered yet;
- "History" lists what has been said and decided, in order;
- the element view, reached with "More" on a card, shows one field with all its
  statements as prose. A suggestion made by the model appears as an "Idea"
  note, sources appear as page numbers, and an open question says "Not
  answered yet".

The markers, seals and `src:` paths stay in `canvas.md` and `decisions.md`;
the view just does not show them as codes.

From the view you can comment (it appears as a "To talk about" note and is
written as a DISCOVERY entry), set a statement to `[stated]`, and accept a
statement, through the same code the CLI calls, so the decision-log entry it
writes is byte-identical to a CLI accept. Statement text is not editable here
— that stays the CLI and `canvas-review`.

Print the page for a coauthor who wants a paper copy: the print stylesheet
puts the poster on its own A4 landscape page and hides the comment and accept
controls.

One limit worth stating plainly: a model given a browser-automation tool in
the same session could read the open tab and click through an accept itself.
Close the tab when you are done. And a model that reads your terminal or a
process listing in the second before the view loads, and redeems the code
first, takes the session; you then see the "already used" message instead of
a working view.

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
