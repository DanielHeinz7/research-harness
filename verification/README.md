# Adversarial verification

The unit suite under `plugins/research-harness/test/` checks that the harness
does what it is supposed to do. These probes check the other thing: whether the
guard can be talked out of it.

They are here rather than on one machine because they have twice caught a live
hole while the unit suite reported green, and because the plugin's README makes
a claim about enforcement. A claim nobody can re-run is not evidence.

## Running them

    node verification/probes/probe-structural.js
    node verification/probes/probe-diff.js
    node verification/probes/probe-reconfirm.js

No arguments, no setup, no dependencies. Each script builds throwaway projects
in a temporary directory from the fixture canvas, drives every case through the
real `PreToolUse` hook with a hook payload, applies each write the guard
**allowed**, and re-reads the file to record what that write actually did. The
repository is never written to.

Output is one row per probe:

    ID | class | ALLOW/DENY | what the allowed write did | description

Reading it: a `DENY` row is the guard holding. An `ALLOW` row is only a finding
if the effect column shows the write changed something it should not have —
`LOST-COMMITTED`, `NEW-COMMITTED`, a status flip, or a `review[...]` count that
moved. Most `ALLOW` rows are negative controls and are supposed to be there; a
guard that denies everything is a wall, not a guard.

## The corpus

| Script | Attacks |
|---|---|
| `probe-structural.js` | the document around a statement: moving it under another element, duplicating an element or question heading, rewriting a question's text or an element's title, the frontmatter |
| `probe-diff.js` | the statement itself and the decision log: rewording, downgrading, forging `[accepted]`, homoglyphs, invisible characters, marker-group variants, appending a forged `DECISION` entry |
| `probe-reconfirm.js` | a short regression pass over one case per family, for when only a quick check is wanted |

`recorded/` holds output from earlier runs, kept as a baseline to diff against:
the original pass that found the holes, the before-and-after pair from the
decision-log work, and the transcript of the live installation check.

## Why the attacks are written down

Publishing a list of attacks tells a reader which ones were tried, and so
indirectly where to look for the ones that were not. That was weighed against
two things and lost.

First, the probes are mundane. They are Markdown edits — move a heading,
duplicate a question id, push a no-break space into a sentence — and shell
techniques that any manual page describes. Nothing here is a weapon outside
this plugin.

Second, this harness exists to support a claim about who may commit what in a
research project. Claims of that kind are checked, not believed. Anyone who
wants to know whether the guard holds should be able to find out in one command
rather than take the README's word for it.

## Adding a probe

Write the attack, run it against the **unmodified** guard first, and record
that verdict before changing anything. Both regressions this corpus caught were
visible only as a verdict flip against a measured baseline — read off the
previous report rather than re-measured, they would have been missed. Then keep
the effect column honest: a probe that reports `ALLOW` without saying what the
allowed write did proves nothing.
