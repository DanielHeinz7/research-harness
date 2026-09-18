---
name: canvas-review
description: Use when reviewing a paper project's research canvas for gaps, incoherence, unmet dependencies, missing evidence, and statements the manuscript no longer supports. Argues against the canvas; writes only proposals.
---

# Reviewing the canvas

This review argues against the canvas. It does not tidy it. A review that only
checks whether the pieces fit produces a coherent canvas around a bad study.

## 1. The mechanical part

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" review` and read the
report. It lists: empty elements; open elements (proposals only); dependency
violations; unmarked and untagged statements; conversational `[stated]`
statements; acceptances whose text hash no longer matches; accepted statements
with no log entry. Report all of it verbatim to the researcher first.

Then read the profile named in the canvas frontmatter under
`${CLAUDE_PLUGIN_ROOT}/references/profiles/` and
`${CLAUDE_PLUGIN_ROOT}/references/canvas-elements.md`.

## 2. Fit — where elements contradict each other

Check these pairs and write what you find:

- 8 against 3: do the contributions answer the research question, or a
  different one?
- 9 against 5 and 6: do the boundary conditions contradict the setting or the
  design (a claim about "organizations" from one team; a process claim from a
  cross-section)?
- 4 against 7: in a qualitative profile, does the framework claim more than
  the findings show?
- 2 against 1: does the prior-research account start from the phenomenon, or
  is it gap-spotting ("little research has examined …")?
- 3 against 1: is the question the one the puzzle poses, or a narrower one
  that was easier to answer?

## 3. Refutation — one element at a time

For every element that holds a committed statement, write one paragraph
answering: **what would have to be true for this element to be wrong, and
does the material or the literature say it?** Try to refute before you report
fit. If you cannot construct a refutation, say that too — it is information.

## 4. Manuscript support

If the researcher names a manuscript, read it and check every `[stated]` and
`[accepted]` statement against it. List those the manuscript no longer
supports, with the section that contradicts them.

## 5. Untagged statements

For each statement in the "untagged" list, decide whether it makes a factual
claim. If it does, propose the tag: `src: <where>` if you can locate it,
`unverified` if you cannot. Do not add the tag to a `[stated]` or `[accepted]`
statement yourself; propose it alongside.

## What you write

Only `[proposed]` paragraphs in the canvas, next to the statement they concern,
and `DISCOVERY` entries appended to `research/decisions.md` in this form:

    ## [#<next seq>] <YYYY-MM-DD> · DISCOVERY · <element or n.m>
    <one paragraph> [proposed]

Never edit an existing entry. Never change a marker. When you are done, list
the findings by element, most consequential first, and stop — the researcher
decides what to do with them.
