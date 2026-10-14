---
version: 1
slug: "plugins-research-harness-dashboard-canvas-html"
primary_target: "plugins/research-harness/dashboard/canvas.html"
related_targets: []
---

# Session view and app window: galley proof

## Scope and mode

Mode: Operate. Two surfaces, one world:

- **Session view** (`plugins/research-harness/dashboard/canvas.html`): real code with rendered
  accessibility tests. Rebuilt in code now. It must stand alone in a browser tab
  (`research-harness serve`, fixture mode) and sit as the centre of the app window.
- **App window shell** (project sidebar, agent panel): built in the same world, as a mock only,
  until the sub-project 1 spec fixes Electron and the local API. Reference:
  `.impeccable/mocks/decision/sketches/model-pick.html`.

Contents, functions and status words stay as PRODUCT.md lists them. Owner decision record:
vault `appdev/research-harness.md`, 2026-10-15 "Design-Overhaul".

## Audience, job, constraints

A researcher who does not use a terminal, alone at the desk next to the agent or in a meeting room
with the view on a projector. Job: see what the paper says, what the agent asks, and accept with one
sentence of their own. Constraints: WCAG 2.2 AA, projector legibility at 3 to 4 m, type that grows
with the window, reflow to 320 px, status never by colour alone, fonts bundled with the plugin (no
hosted font service), History shows only seal problems, controls stay native elements.

## Direction and memorable moment

Galley proof (round c6668888, Impeccable's pick, chosen by the owner over the assigned Zettelkasten).
Memorable moment: a red margin query, tied by a leader line to its slot, is accepted and its text
moves into the set column.

Binding additions from the owner: the nine fields carry their names (at least as tooltip and
accessible name); stable statement numbers (3.4) are used in the agent thread too and link to the
statement; a change mark ("New · B. Supervisor · just now") sits on the statement, no toasts; a
Present control for the projector; field chips whose width shows how full a field is.

## Unresolved

- Shell in code now or only as mock: this brief takes "mock until the sub-project 1 spec"; the owner
  may overrule.
- Build fixture: one state file holding every status once (Decided, Said by the authors, Draft,
  Suggestion), a change mark, an empty field and a field with two queries. Extend
  `docs/media/showcase-state.json` (SQ-223) or `view-state-chosen.json`, never describe a state in
  prose instead.
- How long a change mark stays: until the viewer has seen it, or until the session ends.

## Direction contract

THESIS: The paper is a galley proof. What the authors said or decided is set in one typeset column;
everything the agent proposes stays in the margin as a red query until a person accepts it. Refuses
the category default of a dashboard of cards with a chat panel bolted on.

OWN-WORLD: White sheet (#fff), ink #1a1a1a, hairline rules #dadadd. Red pencil #d2232a only on
queries and the one next decision; blue #0b5cad only on links. Column set in Source Serif 4, 18 px
at 1440 and growing; chrome, headings and numbers in Hanken Grotesk; paths in the system monospace.
Status by icon, word and setting: Decided roman with filled check square and a decision line (date ·
name — "sentence"); Said roman with speech bubble; Draft italic with half circle; Suggestion never in
the column, only as a margin query with diamond. No cards, shadows, gradients or cream.

STORY: The researcher understands at a glance which statements are theirs and which are the agent's
queries, believes that nothing enters the column without them, and accepts or comments on a query
with their own sentence.

FIRST VIEWPORT: Top: tabs Poster / To talk about (count) / History, Present at the right. Below:
nine field chips, number plus name, width by statement count, empty fields dashed. Centre: the set
column (max 64ch) with numbered statements and field headings. Right of it: the margin (about 320
px) holding the open queries, each tied by a leader line to its slot in the column. In the app
window, the project sidebar sits left and the agent panel right. Primary action: the red "Accept…"
of the first open query, at eye level in the margin.

FORM: Galley proof with margin queries and leader lines, position 1 on my ordered list (the roll
assigned position 7); seed: none (unavailable). Signature interaction: focusing or hovering a query
lights its leader line and its slot; accepting moves the query text into the column, the line
retracts, and the decision line appears under the statement.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
