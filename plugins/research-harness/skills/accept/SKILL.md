---
name: accept
description: Accept one statement of the research canvas as a commitment of the project (researcher only). Usage — /research-harness:accept <n.m> [--match <substring>] [--why <text>]
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Accepting a canvas statement:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/research-harness.js" accept $ARGUMENTS`

The output above is the result. If it says "Accepted", the statement now
carries `[accepted]` and the decision log has a new entry with the text hash.
If it refused — an unmet dependency, an ambiguous question, nothing to accept
— it names what to do.

If nothing was printed above, the arguments did not reach the command. Run it
yourself from the prompt with the `!` prefix, which executes a shell command
outside the model:

    ! node "<plugin root>/bin/research-harness.js" accept <n.m>

Report the result to the researcher. Do not run `accept` through the Bash tool;
the guard denies it, because acceptance is the researcher's act, not the
model's.
