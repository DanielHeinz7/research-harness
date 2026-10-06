# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (confirmed by the owner, 2026-10-06): the session view is today a single
file, `plugins/research-harness/dashboard/canvas.html`, served by
`plugins/research-harness/bin/canvas-serve.js` on `127.0.0.1`. That is not a
constraint. The owner allows the view to grow into a more complex tool than one
HTML file if the work needs it. Any new stack must still run locally, from the
plugin, without a hosted service.

## Users

Researchers who own a paper project, mostly in Information Systems and
management research, many of whom do not work in a terminal. Two situations
carry equal weight:

- **Alone at the desk:** reading what the agents proposed, checking it, and
  deciding what to accept.
- **In a meeting with co-authors or a supervisor:** the view is on a shared
  screen or a projector, the group works through "To talk about", and the
  owner accepts statements during the meeting.

Secondary audiences named in the README: Claude Code users who run the plugin,
and plugin developers.

## Product Purpose

The session view is the researcher's window onto the paper's research canvas
(`research/canvas.md`, the nine elements of the AMJ Management Research
Canvas) and its decision log (`research/decisions.md`). It shows the paper's
argument as a poster, what needs discussing, and the history of what was said
and decided. From the view the researcher can comment, mark a statement as
stated, and accept a statement.

Success: a researcher who has never seen the tool understands, without a
terminal and without the docs, what the canvas says, what is still open, and
what they are being asked to decide.

## Positioning

Agents propose; only the researcher accepts. Every acceptance carries one
sentence in the researcher's own words and lands in a sealed, append-only
decision log. The view is where that line is visible: it separates what the
authors said and decided from what a model suggested.

## Operating Context

- Started by the researcher in their own terminal with `research-harness serve`;
  the URL carries a single-use code traded for a write token held only in
  memory.
- Used next to a Claude Code session in which agents write framings, raise
  check questions, and draft literature notes.
- Printed for co-authors who want paper: the poster goes on one A4 landscape
  page.
- Public walkthrough data: interviews on AI assistants in software engineering
  (`examples/ai-assistants-interviews`, CC BY 4.0).

## Capabilities and Constraints

- Views: poster (nine fields in argument order), "To talk about", "History",
  element view (one field as prose).
- Actions from the view: comment, set a statement to stated, accept a statement
  with an explained sentence. Statement text is not editable in the view.
- Status vocabulary shown to people: Decided (accepted), Said by the authors
  (stated), Draft (tentative), Suggestion / Idea (proposed). Markers, seals and
  `src:` paths stay in the files and are not shown as codes.
- A fixture mode (`?fixture=<state>.json`) renders a canvas from a static state
  file without a server.
- Product rule, enforced outside the UI: an accept without the researcher's own
  sentence does not happen.

## Evidence on Hand

- Public dataset and recorded canvases: `examples/ai-assistants-interviews/`.
- Shared showcase state for screenshots and the demo video:
  `docs/media/showcase-state.json` (in progress, SQ-223).
- No user testimonials, usage numbers, or studies of the tool exist. Do not
  invent any.

## Product Principles

1. Readable without a terminal: the view explains itself to a first-time
   researcher.
2. The paper's argument first; tool mechanics stay out of sight.
3. Who said what is always visible: author decisions and model suggestions
   never look alike.
4. Works in both settings: a quiet desk and a room looking at a projector.

## Accessibility & Inclusion

WCAG 2.2 AA is required: contrast, full keyboard operation, screen reader
semantics, visible focus, reflow down to 320 px. In addition the view must be
readable on a projector from 3 to 4 metres, which means larger minimum text
and contrast above the AA minimum for body text. Status is never shown by
colour alone.
