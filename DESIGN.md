---
name: Research harness
description: A galley proof for a paper's argument. Set type in one column, the agent's proposals in the margin as red queries, the researcher's decisions in ink.
colors:
  paper: "#ffffff"
  panel: "#f5f5f7"
  ink: "#1a1a1a"
  ink-soft: "#474747"
  ink-quiet: "#4e4e55"
  hairline: "#dadadd"
  edge: "#85858c"
  red-pencil: "#d2232a"
  red-pencil-hover: "#b81d23"
  red-wash: "#fdf0f0"
  link-blue: "#0b5cad"
  link-wash: "#e7f0f9"
typography:
  title:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.625rem, 0.8rem + 1.6vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.25rem, 0.7rem + 0.9vw, 2rem)"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  column:
    fontFamily: "Source Serif 4, Iowan Old Style, Palatino Linotype, Georgia, serif"
    fontSize: "clamp(1.0625rem, 0.5rem + 0.7vw, 1.75rem)"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1rem, 0.45rem + 0.65vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(0.875rem, 0.35rem + 0.5vw, 1.25rem)"
    fontWeight: 600
    lineHeight: 1.1
  path:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.8em"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  hit: "44px"
  gap: "clamp(0.75rem, 0.4rem + 0.5vw, 1.25rem)"
  page: "clamp(1rem, 0.4rem + 2vw, 2.25rem)"
  sidebar: "clamp(16rem, 11rem + 9vw, 26rem)"
  margin: "clamp(18rem, 12rem + 5vw, 26rem)"
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "{spacing.hit}"
    padding: "0 0.9em"
  button-hover:
    backgroundColor: "{colors.panel}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "{spacing.hit}"
    padding: "0 0.9em"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  query-accept:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.red-pencil}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "{spacing.hit}"
    padding: "0 0.7em"
  query-accept-next:
    backgroundColor: "{colors.red-pencil}"
    textColor: "{colors.paper}"
  query:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.7rem 0.85rem 0.85rem"
  query-lit:
    backgroundColor: "{colors.red-wash}"
  field-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "2.75rem"
    padding: "0 0.3rem"
  field-chip-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  sidebar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    width: "{spacing.sidebar}"
    padding: "1rem 1rem 1.5rem"
  outcome-line:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.65rem"
  outcome-line-problem:
    backgroundColor: "{colors.red-wash}"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.4rem 1.6rem"
  count-badge:
    backgroundColor: "{colors.link-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 0.55em"
---

# Design System: Research harness

## Overview

**Creative North Star: "The Galley Proof"**

The paper is a galley proof. What the authors said or decided is set in one typeset column; everything the agent proposes stays in the margin as a red query until a person accepts it. One sheet, one ink, one pencil. The researcher should see at a glance which statements are theirs and which are the agent's questions, and believe that nothing enters the column without them.

The same world holds two surfaces: the session view (`canvas.html`) and the app window around it (`app.html`: project sidebar, start page, dialogs). The sidebar is set like an index beside the proof, not like a dashboard: a panel tint, hairline-ruled groups, plain controls. It never competes with the column. The mode is Operate: scanability, native controls and the real usage scene (a desk, or a projector three to four metres away) outrank expression. Brand lives in precise details: the stable statement numbers, the leader line from query to slot, the decision line under an accepted statement.

It refuses the category default of a dashboard of cards with a chat panel bolted on. There are no cards, shadows, gradients or cream in the system, and no toasts: an outcome is a line under the control that caused it and stays until the next action.

**Key Characteristics:**
- White sheet, near-black ink, hairline rules; red and blue are marks, not decoration.
- Serif for what the authors set, sans for everything the tool says.
- Status is always icon plus word plus typographic setting, never colour alone.
- Type grows with the window (18 px column at 1440 wide, larger on a projector); the floor for visible text is 14 px.
- Flat. Depth comes from rules, tint and a single outline on the focused query.
- Fonts ship with the plugin (SIL OFL 1.1); no hosted font service.

## Colors

A near-monochrome sheet with two single-purpose marks. Every neutral and both marks have a dark-mode counterpart that keeps the same roles; body text holds 7:1 or better on paper and panel, red and blue hold 4.5:1.

### Primary
- **Red Pencil** (#d2232a; dark #ff7176): only on queries (the margin box, its status word, the leader line and slot, the Accept button) and on the one next decision, plus the border of a problem outcome or dialog error. Hover #b81d23 (dark #ff8e92). Text on a filled red button is white (dark #141416).

### Secondary
- **Link Blue** (#0b5cad; dark #74b6ff): only on links and on the 3 px focus ring, plus the count badge for new updates. Never a fill for primary actions.

### Neutral
- **Paper** (#ffffff; dark #141416): the sheet, controls, the dialog, the query box.
- **Panel** (#f5f5f7; dark #1d1d20): the sidebar, hover on controls, the disabled fill.
- **Ink** (#1a1a1a; dark #ececee): text, the primary button fill, the current chip, the rule above each sidebar group and under each field heading.
- **Soft Ink** (#474747; dark #c9c9ce) and **Quiet Ink** (#4e4e55; dark #b3b3ba): secondary and tertiary text, statement numbers, hints.
- **Hairline** (#dadadd; dark #36363c): dividers and the count pill fill.
- **Edge** (#85858c; dark #84848c): the border of controls and chips; strong enough for 3:1 against paper.
- **Red Wash** (#fdf0f0; dark #2b1b1d) and **Link Wash** (#e7f0f9; dark #1a2a3d): the lit query or slot and the linked-statement highlight.

### Named Rules
**The Red Pencil Rule.** Red marks what waits for a person: queries, the one next decision, a problem next to the control that caused it. It never decorates, never marks an accepted statement, and appears on one screen only as often as there are open queries.

**The One Link Rule.** Blue is for things you can follow or focus. If it is not a link or a focus ring, it is not blue.

## Typography

**Display and UI Font:** Hanken Grotesk (variable, 100 to 900, bundled; falls back to system-ui)
**Column Font:** Source Serif 4 (variable roman and italic, bundled; falls back to Iowan Old Style, Georgia)
**Path Font:** the system monospace (ui-monospace, SF Mono, Menlo)

**Character:** The sans speaks for the tool, the serif is the authors' hand. Chrome, headings, numbers and labels are sans; every statement that is theirs is serif. Italic marks a Draft.

### Hierarchy
- **Title** (700, clamp(1.625rem, 0.8rem + 1.6vw, 3rem), 1.2, -0.01em): the paper's title on the poster; the shell's start page heading.
- **Headline** (650, clamp(1.25rem, 0.7rem + 0.9vw, 2rem), 1.2): field headings with their number, the project name in the sidebar, dialog titles.
- **Column** (400, clamp(1.0625rem, 0.5rem + 0.7vw, 1.75rem), 1.45, max 64ch): statements in the set column and the start page's explanations.
- **Body** (400, clamp(1rem, 0.45rem + 0.65vw, 1.5rem), 1.5): tab names, query text, dialog explanations.
- **Label** (600, clamp(0.875rem, 0.35rem + 0.5vw, 1.25rem), 1.1): buttons, chips, status words, hints, the sidebar. 14 px is the floor at any width.
- **Path** (400, 0.8em): folder paths in the shell, one line, cut at the front, full path as the tooltip.

### Named Rules
**The Authors' Hand Rule.** Serif is for statements that were said or decided by the authors, and for the start page's plain explanations. A model's suggestion is never set in the column's serif outside its margin box.

**The Growing Type Rule.** Sizes are clamp() against the viewport. Do not pin a size in px; print sets its own smaller sizes in an explicit block.

## Layout

One set column (max 64ch plus a 3.25 rem number gutter) with the margin beside it (18 to 26 rem) where the viewport is 1100 px or wider; below that each query sits directly under its slot and the leader becomes a 2 px red rule. In the app window the project sidebar (16 to 26 rem) sits left of the session view, which is embedded as one frame; at 52 rem and below the sidebar stacks above it.

The top of the session view is the tabs (Poster, Framings, To talk about with its count, History) with Present at the right, then a row of nine field chips. A chip holds the field's number and, once it is about 4.5 rem wide inside, its name on up to two lines; width grows with the statement count, empty fields get a dashed border. At 65 rem and up every chip gets at least 6 rem so the names show.

Spacing is rem-based with a clamp() page gutter (1 to 2.25 rem) and a gap of 0.75 to 1.25 rem. Targets are 44 px high. Everything reflows down to 320 px with no horizontal scroll. Print is one A4 landscape page for the poster in three columns (about 8 pt type, slot lines dropped); a fuller canvas runs on to a second page instead of setting smaller.

## Elevation & Depth

Flat. No shadows anywhere. Depth is conveyed by a hairline rule, the panel tint of the sidebar, a dashed red slot and, for the focused or hovered query, a red outline plus red wash with its leader line thickened. A dialog is the native `<dialog>` over a dim backdrop (rgba(26,26,26,0.45); dark rgba(0,0,0,0.65)) with a 1 px ink border.

### Named Rules
**The Flat-By-Default Rule.** Nothing lifts. State is shown by outline, fill swap or line weight, never by a shadow.

## Shapes

Quiet geometry: 6 px corners on controls, chips, query boxes and outline lines; 8 px on the dialog; 4 px on the statement number badge; fully round only for the count pill, the change mark and the dots (the session-running dot, the slot anchor). Rules are 1 px hairlines, with a 3 px blue underline for the active tab and a 3 px inset ink line for the chip that carries the next decision. Status icons are a fixed family: filled check square (Decided), speech bubble (Said by the authors), half circle (Draft), diamond with a question mark (Suggestion), each with its word beside it.

## Components

### Buttons
- **Shape:** 6 px corners, 44 px minimum height, 1 px Edge border, Label type.
- **Default:** Paper fill, Ink text; hover Panel fill. Disabled: Quiet Ink text, Hairline border, Panel fill.
- **Primary:** Ink fill and border, Paper text; hover Soft Ink. The start page's New project… and every dialog's confirm button.
- **Query Accept:** the red "Accept…" is Paper fill, Red Pencil border and text; the first open query's is filled Red Pencil with white text, hover #b81d23. It opens a dialog that asks for the researcher's own sentence.
- **Row button:** the sidebar's Open, Clone and New are plain rows with a hairline underline, not boxes.
- **Focus:** a 3 px Link Blue ring with 2 px offset on every control, in light and dark.

### Field chips
- **Style:** Paper fill, 1 px Edge border, number then name; the field with the next decision carries a 3 px inset ink line at the bottom, and a diamond when it holds a query.
- **State:** current is Ink fill with Paper text; empty is dashed with Soft Ink text; names wrap to two lines and are cut after that, with the full name as tooltip and accessible name.

### Queries (signature)
- **Style:** a 6 px box with a 1 px Red Pencil border in the margin, status word and diamond in red, "for 6.1" in Quiet Ink, the agent's text in Body, then Accept…, Mark as said, Comment.
- **Behavior:** tied to its dashed slot in the column by a leader line; focusing or hovering either lights the box, the slot and the line. Accepting moves the text into the column, the line retracts and the decision line (date · name, and the sentence in quotes) appears under the statement; under reduced motion this is instant. A "Go to the first query" link in the margin head takes the viewer to the first open query when it is below the fold.

### Sidebar and outcome lines
- **Style:** Panel fill, a 1 px right hairline, groups (Project, Meeting, People) each opened by a 1 px Ink rule and a Soft Ink heading; the project name in Headline, its path in Path type, one line.
- **Outcome line:** under the control that caused it, a 1 px Edge box on Paper with an icon and a plain sentence; a problem swaps the border to Red Pencil and the fill to Red Wash. It stays until the next action. It is an `aria-live` region and never disappears on a timer.
- **Meeting state:** "Session running · 0:24" with a filled ink dot, not a colour.

### Dialogs
- **Style:** native `<dialog>`, up to 38 rem, 8 px corners, 1 px Ink border, 1.4 by 1.6 rem padding.
- **Content:** the title, one paragraph that says what will happen before it happens, labelled text fields (44 px, hint text under each label), a Choose… button beside path fields where the app can open a picker, and Cancel next to a primary button that repeats the act ("Send changes", "Create project").
- **Error:** a Red Wash box with a Red Pencil border and a plain sentence naming what is missing; the offending field takes focus and gets a red border.

### Navigation
- **Tabs:** Body type, 44 px high, Soft Ink; active is Ink and bold with a 3 px Link Blue underline; the To talk about count is a Hairline pill.
- **Mobile:** tabs wrap, Present drops under them, chips wrap onto rows and keep the number alone where the name has no room, always at 44 px height.

## Do's and Don'ts

### Do:
- **Do** keep what the authors set in the serif column and what the agent proposes in the margin box, with the status word, icon and typographic setting all present.
- **Do** write every outcome and error as a plain sentence with the next step, in a line under the control that caused it.
- **Do** keep every control a native element (button, input, dialog, link) with a visible 3 px blue focus ring and a 44 px target.
- **Do** size type with clamp() and keep visible text at 14 px or more; check at 1440 and 1920 wide.
- **Do** say in each dialog what will happen before it happens, and repeat the act on its confirm button.
- **Do** show names with every field number; a bare number is only the narrow-window fallback.

### Don't:
- **Don't** use cards, shadows, gradients, cream paper or a chat panel in the chrome; the world is a white proof.
- **Don't** colour anything red that is not a query, the one next decision or a problem; don't colour anything blue that is not a link or a focus ring.
- **Don't** show status by colour alone, and don't show model suggestions in the column.
- **Don't** use toasts, timers that dismiss messages, or modal alerts for outcomes.
- **Don't** load fonts from a hosted service or show raw markers, seals or `src:` paths as codes.
- **Don't** show a full temporary path across several lines in the sidebar; the path is one line, cut at the front.
