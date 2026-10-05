---
name: glossary-accept
description: Accept one glossary entry as a settled commitment of the project (researcher only). Usage — /research-harness:glossary-accept <id> --explained "<one sentence>" [--why <text>] [--rejected <text>]
disable-model-invocation: true
---

Accepting a glossary entry:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" glossary accept $ARGUMENTS`

The output above is the result. If it says "Accepted", the entry now carries
`[accepted]` and the decision log has a new DECISION named by the entry id,
binding the payload hash of the entry — its term, aliases, definition, cited
origin and distinctions — and sealed under this machine's key. The id and the
hash are what the acceptance is bound to: change any of those fields
afterwards and the entry no longer answers to that entry, which `review`
reports as a stale acceptance. If it refused — no explanation, an incomplete
entry, an unknown id, an origin that cannot carry an acceptance, an unmet
element-4 dependency, no sealing key on this machine, a broken decision log —
it names what to do.

Every accept needs an explanation: one sentence, in the researcher's own
words, of what they accept and why it holds, passed as
`--explained "<sentence>"`. Without it nothing is accepted. Do not write the
explanation for the researcher or suggest wording to copy; the sentence is
theirs, and that is the point of it. If it was missing, tell them the accept
was refused and ask for their sentence.

If nothing was printed above, the arguments did not reach the command. Run it
yourself from the prompt with the `!` prefix, which executes a shell command
outside the model:

    ! node "<plugin root>/bin/research-harness.js" glossary accept <id> --explained "<your sentence>"

Report the result to the researcher. Do not run `glossary accept` through the
Bash tool; the guard denies it, because acceptance is the researcher's act,
not the model's.
