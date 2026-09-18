---
title: The adversarial probes ship with the repository
bump: patch
plugins:
  - research-harness
---

The probe corpus that found the holes in the guard lived on one machine, with
three hardcoded paths that had gone stale, so it could not be run by anyone who
cloned the repository — including by the next person to change the guard.

It now sits in `verification/`, runs with `node verification/probes/<name>.js`
and no setup, derives the repository from its own location, and builds its
throwaway projects in a temporary directory. `verification/recorded/` keeps the
output of earlier runs as a baseline to diff against, and `verification/README.md`
explains how to read a row, why an `ALLOW` is usually not a finding, and why the
attacks are written down in public at all.

The reason they are worth publishing is the same reason they are worth running:
this harness makes a claim about who may commit what, and a claim nobody can
re-run is not evidence. The attacks themselves are Markdown edits and shell
techniques out of a manual page, not weapons.
