---
name: glossary-accept
description: Accept one glossary entry as a settled commitment of the project (researcher only). Usage — /research-harness:glossary-accept <id> --hash <8hex> --explained "<one sentence>" [--why <text>] [--rejected <text>]
disable-model-invocation: true
---

Before accepting, display the entry's canonical payload and its eight-hex hash:

    ! node "<plugin root>/bin/research-harness.js" glossary show <id>

Read that payload. Then invoke this skill with the displayed hash, not a hash
recomputed automatically at acceptance time:

    /research-harness:glossary-accept <id> --hash <shown hash> --explained "<your sentence>"

Accepting a glossary entry:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" glossary accept $ARGUMENTS`

The output above is the result. If it says "Accepted", the entry now carries
`[accepted]` and the decision log has a new DECISION named by the entry id,
binding the payload hash of the entry — its term, aliases, definition, cited
origin and distinctions — and sealed under this machine's key. Changing any
of those fields makes the acceptance stale, which `review` reports. If the
proposal changed after display, acceptance refuses without changing either
file. Display it again and read the new payload before deciding; do not retry
with a new hash on the researcher's behalf.

A missing or malformed hash, missing explanation, incomplete entry, unknown
id, unresolved origin, unmet element-4 dependency, missing sealing key or
broken decision log refuses by name. An I/O failure restores the glossary
and removes any partial decision append; neither file is left half-done.

Every accept needs an explanation: one sentence, in the researcher's own
words, of what they accept and why it holds, passed as
`--explained "<sentence>"`. Without it nothing is accepted. Do not write the
explanation for the researcher or suggest wording to copy; the sentence is
theirs. If it was missing, report the refusal and ask for their sentence.

If nothing was printed above, the arguments did not reach the command. After
showing and reading the payload, run it from the prompt with the `!` prefix,
which executes a shell command outside the model:

    ! node "<plugin root>/bin/research-harness.js" glossary accept <id> --hash <shown hash> --explained "<your sentence>"

Report the result to the researcher. Do not run `glossary accept` through the
Bash tool; the guard denies it, because acceptance is the researcher's act,
not the model's.
