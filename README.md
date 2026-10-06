# research-harness

research-harness is a plugin for Claude Code that keeps the framing of a paper
in the paper's own repository, and keeps track of who decided what. The AI
assistant may draft and suggest. Only the researcher accepts a statement, in a
sentence of their own, and every acceptance lands in a decision log you can
check later.

It is meant for researchers who write papers with an AI assistant at their side
and want to be able to say, months later, which parts of the argument they
committed to and why.

## What you work on: the canvas

A paper project gets one file, `research/canvas.md`. It follows the nine
elements of the AMJ Management Research Canvas: the puzzle, the audience and
prior research, the research question, the theoretical constructs, the setting,
the design and analysis, the findings, the contributions, and the boundary
conditions. Each element holds short statements, and each statement carries a
marker saying where it stands:

```
- [proposed] Developers treat assistant output as a draft to verify, not as an answer.
- [stated] "We only interviewed people with five or more years of experience."
- [accepted] The study asks how senior developers decide when to trust an assistant.
```

`[proposed]` and `[tentative]` are the assistant's suggestions. `[stated]` is a
transcription of something you said. `[accepted]` means you read the statement
and committed to it. The file is plain Markdown under git, so you and your
co-authors can read it, diff it, and see how the framing changed.

The elements depend on each other. A contribution cannot be accepted before the
findings and constructs it rests on, and the tool tells you which pieces are still
missing. Treat it as a puzzle whose pieces have to fit, not as stages to get
through in order.

## Who decides: you

You accept a statement with one sentence of your own about why it holds:

```sh
research-harness accept 3.1 --explained "The interviews show trust is negotiated case by case, so the question has to be about deciding, not about attitudes."
```

Without that sentence nothing is accepted. The acceptance is appended to
`research/decisions.md`, a log that only grows. Each entry is sealed with a key
that stays outside the repository, so an entry someone typed into the file by
hand does not verify, and a review names it.

Before you accept, the assistant can raise check questions. They do not block
you: you may accept with questions still open, and the log records which ones
were open at that moment.

A Claude Code hook refuses the assistant's own attempts to accept, to choose a
framing, to change what you said, or to write the log, as far as it can see
those attempts in its tool calls. It is a guardrail against an assistant
overstepping, not a lock. A script the assistant writes can call the same code
you call, and the seal cannot tell the two apart afterwards. The
[technical appendix](docs/technical-appendix.md#3-the-promotion-guard-and-its-perimeter)
shows a measured case.

## What else it does

- **Compare framings.** The assistant writes the same study under several
  lenses side by side. You pick one; the others stay in the record together
  with your reason for setting them aside.
- **Review the record.** A read-only review lists open elements, stale
  acceptances (text changed after you accepted it), statements that carry
  neither a source nor an `unverified` tag, and log entries that do not verify. Someone you give the key to can run the
  same check on their own machine.
- **Keep a construct glossary.** `research/glossary.md` holds one definition
  per construct. Canvas statements and the manuscript cite entries, and when an
  accepted definition changes later, everything citing it is reported as stale.
- **Draft a literature note from a paper.** The assistant drafts a note from a
  local PDF, and the note is refused unless every quotation appears word for
  word on the printed page it cites. Paraphrase and numbers are not checked.
- **Work as two people.** A researcher and a supervisor can share one canvas,
  in one clone or two, prepare a meeting agenda from it, and export a protocol
  afterwards. The log records who wrote each entry, as a name, not as proof of
  identity.
- **Look at it in a browser.** `research-harness serve` opens a session view
  for meetings: the whole paper on one poster, what is still to discuss, and
  the history of decisions. You can comment and accept from there.

## What it does not do

It does not judge whether your research is good. It cannot tell whether a
`[stated]` line is a faithful transcription of what you said, or whether a
cited source supports the claim; the review lists both for you to look at. It
does not verify who someone is. The explanation you write is checked for being
there, not for showing understanding.

Scope is paper projects: journal articles, conference papers, book chapters.

## Try it

You need Claude Code. The repository is private for now, so your GitHub
account needs an invitation. Then, in Claude Code:

    /plugin marketplace add DanielHeinz7/research-harness
    /plugin install research-harness@research-harness

Run `research-harness doctor` to check the install, and
`research-harness install-cli` once so the command also works in your own
terminal. Open a paper project's repository and run `/research-harness:canvas`.

To see it on real material first, the
[walkthrough](plugins/research-harness/README.md#walkthrough-the-three-capabilities-on-a-public-dataset)
runs the whole sequence on 13 openly licensed interviews about AI assistants in
software engineering (Zenodo, CC BY 4.0): several framings, a choice between
them, an acceptance with an open question, a review, and a check of the log on
another machine. A test runs its commands and holds them to the output shown.

## Further reading

- [Plugin reference](plugins/research-harness/README.md): install details,
  every skill and command, the session view, and the walkthrough.
- [Technical appendix](docs/technical-appendix.md): how the log is sealed, what
  the guard measurably catches and misses, the two-person merge, the glossary
  and literature-note checks, configuration, and releasing.
- [REFERENCES.md](REFERENCES.md): the methodological literature the question
  set is built on (the AMJ Management Research Canvas, the *Publishing in AMJ*
  series, and editorials from MIS Quarterly and JAIS).
- [Literature note reference](plugins/research-harness/references/literature-note.md):
  commands, exit codes, and a walkthrough on an invented paper.
