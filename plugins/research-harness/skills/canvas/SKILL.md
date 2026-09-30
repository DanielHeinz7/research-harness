---
name: canvas
description: Use when starting or continuing the research canvas of a paper project — framing elements 1 to 9 in brainstorming, seed, or import mode. Writes proposals; never accepts.
---

# The research canvas

You are filling `research/canvas.md`, the nine-element state of this paper
project. Read these before you write anything:

- `${CLAUDE_PLUGIN_ROOT}/references/canvas-elements.md` — the question set
- the profile named in the canvas frontmatter, under
  `${CLAUDE_PLUGIN_ROOT}/references/profiles/` — emphasis and the dependency graph
- `${CLAUDE_PLUGIN_ROOT}/references/problematization.md` — for elements 1 and 2
- `${CLAUDE_PLUGIN_ROOT}/references/amj-map.md` — which editorial to read per element

## First: is there a canvas?

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" status`.

If it reports no canvas, ask the researcher for three things and then run
`init`: the project slug, the mode (`brainstorming` — nothing exists yet;
`seed` — material and a phenomenon exist, no manuscript; `import` — a
manuscript exists), and the target outlet if known. Example:

    node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" init --project <slug> --mode seed --outlet "<venue>"

## What you may write

Every statement is one paragraph ending in a marker group.

- `[proposed]` — your suggestion. Most of what you write.
- `[tentative]` — something found in the material, not yet confirmed.
- `[stated]` — **only** a transcription of what the researcher said in this
  conversation. Write it in their words. Never mark your own reading of a
  document as `[stated]`.
- `[accepted]` — **never.** The guard will deny it. Acceptance is the
  researcher's act: tell them to run `/research-harness:accept <n.m>`.

Never alter or delete a `[stated]` or `[accepted]` statement. If you think one
is wrong, write a `[proposed]` paragraph next to it that says why.

Every factual claim carries an evidence tag after the marker: `src: <id>`
pointing at a memo, document, meeting, or reference the researcher can find,
or `unverified` when you looked and found nothing. `[proposed, src: memo-03]`,
`[tentative, unverified]`. A claim with no tag is a claim you have not thought
about.

**An empty element is a correct state.** `_(empty)_` is better than a
plausible paragraph. Do not fill an element because it is empty; fill it
because the researcher gave you something or the material shows something.

## How to work

One element at a time, in the order the profile's dependency graph suggests,
starting where the mode says:

- `brainstorming`: element 1, in dialogue. Use the five topic criteria from
  Part 1 of the AMJ series (significance, novelty, curiosity, scope,
  actionability) as questions, not as a checklist to satisfy.
- `seed`: element 1 through the four sensibilities in `problematization.md`.
  Ask them of the material. Do not open the literature until element 1 and 3
  hold something the researcher has confirmed.
- `import`: read the manuscript and reconstruct all nine elements as
  `[proposed]`, each with an `src:` tag naming the section it came from. Do
  not mark anything `[stated]` — you are reading a manuscript, not hearing
  the author.

Ask one question at a time. Record the researcher's answer as `[stated]`,
your reading of it as `[proposed]`. When an element holds something they
have confirmed, tell them how to accept it and move on.

Do not quote raw material (transcripts, field notes) into the canvas. Cite it
with `src:`. The canvas travels; the material does not.

When you finish a session, run `status` again and report what is empty, what
is open, and what is ready for acceptance.

## Multiverse mode — several framings side by side

Use this when the researcher gives you k lenses (k of two or more) for the
same material: for example "read it as a process study" and "read it as a
boundary study". The point is to see the framings side by side before anyone
commits to one. It needs a main canvas already (`init` without `--variant`).

Give each lens a short name (lowercase letters, digits and hyphens) and one
line of text. Then start one subagent per lens, in parallel, each with the
same material and only its own lens. Each subagent, in this order:

1. Creates its variant, which is a full state directory of its own under
   `research/variants/<name>/` with its own `canvas.md` and `decisions.md`:

       node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" init --variant <name> --lens "<text>"

2. Fills that variant's `canvas.md` from the shared material, under the rules
   above: `[proposed]` or `[tentative]` with `src:` tags, and never `[stated]`
   for what it read in a manuscript. It reads the material through its lens
   and does not read the other variants.
3. Runs the mechanical review for that variant and reports it verbatim:

       node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" review --variant <name>

   The same `--variant <name>` goes on `status` and `log` when the subagent
   needs them. `accept` works on the main canvas only.

Do not write into the main `research/canvas.md` while variants are open. If
the researcher says something about one framing, record it as `[stated]` in
that variant's canvas, in their words. Everything else you write in a variant
is a proposal until the researcher acts on it.

When all subagents are back, list each variant with its lens and its review
result, side by side, and stop. Do not rank them, do not say which is
stronger, and do not fold one into another. Then tell the researcher:

- the choice is theirs: compare the variants, then the researcher chooses
  one in the view or in their own terminal with
  `research-harness choose <name> --why "<text>"`;
- `choose` refuses while the main canvas holds any `[stated]` or `[accepted]`
  statement, and it lists them; the variants stay in place as the record;
- you cannot choose, and will not.
