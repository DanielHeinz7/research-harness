# Changelog

Release notes for researchers using research-harness in Claude Code.

## 0.4.2 (2026-10-01)

- When the model's shell command hides which `research-harness` subcommand it would run, the refusal now asks for the subcommand to be spelled out. It no longer incorrectly says the command is trying to accept a statement.
- A technical appendix explains what the sealed research record proves, how to verify a received record, and the limits of the model's tool restrictions. A verified seal does not identify the person who wrote an entry or establish that a research claim is true.

## 0.4.1 (2026-10-01)

- Closed shell-write routes to the canvas and decision log through symbolic links and differently capitalized paths. Links that would put a variant's state outside the research directory are also refused.
- `sed -n` is no longer assumed to be read-only when its script can write a file or run a command, including a write after a label. `less` options that save input to a file are also refused over research state; ordinary reads still work.
- Fixed false refusals of text replacements in unrelated notes when the replacement contains the word `Research`.
- Added a second public-data walkthrough about big-data communication during COVID-19. It uses pinned interview PDFs and page-cited framing alternatives. Start a fresh demo project for this example; the first walkthrough's interview-specific claims and expected output do not transfer.

## 0.4.0 (2026-10-01)

### Added

- Compare alternative framings of the same study. Give `/research-harness:canvas` several lenses to create separate variant canvases, then compare them in the session view's Framings tab. Differences are marked by field, and you can expand each field beyond its lead sentence.
- Choose a framing in the browser or with `research-harness choose <name> --why "<reason>"`. The chosen statements become the main canvas; the alternatives remain available. The decision log records your reason and what you set aside. Acceptance still happens separately on the main canvas.
- `/research-harness:check <n.m>` asks questions about a statement and its sources and records them for discussion. Open check questions appear before acceptance. You may accept with questions still open; the log records which ones were open at that point.
- `/research-harness:record-review` is a read-only review mode instructed to answer from the recorded canvas and decision log, cite the entries or statements it uses, and say "not in the record" when the record does not answer.
- Verify a received record on another machine with `research-harness review --key <file>` or `research-harness status --key <file>`. Review prints an anchor to compare with one retained independently when the record was submitted or published. Someone holding the key can re-seal a rewritten log, so a newly printed anchor alone is not evidence against rewriting.
- A public-data walkthrough lets you try framing comparison, acceptance with an explanation, and record verification on interviews about AI coding assistants. It includes recorded example framings so you can follow the CLI workflow without generating them yourself.

### Changed

- Every acceptance now requires your explanation of what you accept and why it holds. On upgrade, add `--explained "<your sentence>"` to `research-harness accept` and `/research-harness:accept`; the browser asks for it in a dialog. An empty explanation is refused without writing anything. Existing sealed log entries still verify.
- Choosing a framing refuses to overwrite a main canvas containing stated or accepted statements. The refusal lists the stated statements so you can decide where they belong before choosing.

### Fixed

- History now shows whether each entry verifies and warns when the log is broken. Mechanical review reports unverified framing choices as well as unverified acceptances.
- Free text in log entries can no longer masquerade as an explanation, a superseded decision, or an open-check list. A framing lens containing line breaks is recorded as one line, so it cannot insert extra fields into the chosen-framing entry.
- The acceptance, check and record-review skills no longer pre-approve general Node commands that could bypass their intended permissions.

## 0.3.6 (2026-09-30)

- Running `init` on a clone with an already-sealed decision log no longer creates a different key and falsely reports that log as broken. It leaves the record unchanged and explains where the original key belongs.
- To append sealed entries from another checkout, copy the original sealing key from the machine where the project started. Without that key, the received log remains "unverifiable here" rather than broken.

## 0.3.5 (2026-09-30)

- `research-harness title "<text>"` sets or changes the title of an existing canvas without changing its statements or decision log. With no text, it prints the current title. If `init --title` encounters an existing canvas, it now points you to this command.
- The session view renders reasons, rejected alternatives and superseded decisions as readable lines instead of showing raw Markdown labels and authorization tags.

## 0.3.4 (2026-09-30)

- When Node.js is missing from your terminal's PATH, the installed command now says so instead of incorrectly reporting that the plugin is not installed.

## 0.3.3 (2026-09-30)

- Run `research-harness` from your own terminal after the one-time `research-harness install-cli` setup. The installed launcher finds the current plugin after updates, prints any PATH setup you need, and refuses to overwrite a command it did not create. It does not edit your shell configuration.
- `research-harness doctor` now checks whether the terminal command is installed and tells you how to set it up if it is missing.
- Installation instructions now explain the GitHub access and git credentials needed to install from a private repository.

## 0.3.2 (2026-09-30)

- `research-harness serve` now opens a poster of the study's nine canvas elements. Cards lead with the authors' own statements; suggestions appear as Idea notes. Expand a card to read the rest, or open To talk about and History. The poster also prints on one landscape A4 page.
- Cards with review findings link directly to the questions to discuss. `/research-harness:canvas-review` now phrases findings as open questions using the field's human-readable question, instead of presenting them as verdicts about numbered elements.
- Set a new project's paper title with `research-harness init --title "<text>"`. The session view uses it as the heading. This option does not change the title of an existing canvas.

## 0.3.1 (2026-09-29)

- The model can use `for`, `while` and `until` loops to read research state when every command in the loop is read-only and no redirect writes a file. Loops that write to state or run acceptance are still refused.

## 0.3.0 (2026-09-29)

### Added

- Start `research-harness serve` yourself to open a local browser view of the canvas and decision log. Read the nine-element overview, inspect a field, work through the discussion agenda, and print the canvas.
- From the session view, add comments, mark a proposal as your own stated position, or accept a statement. Browser acceptance records the same sealed decision as CLI acceptance and refuses if the statement has changed since you saw it.
- `research-harness doctor` checks plugin settings, exercises the restriction on model acceptance, and checks for this project's sealing key. Run it after installation or enabling the plugin, then restart Claude Code: it checks settings, not whether an already-running session loaded them.
- Feedback and bug-report templates ask for the command, plugin version and error you encountered. They warn you to keep canvas and decision-log text out of public issues.

### Changed

- The session URL carries a single-use code that expires after 60 seconds. Once the view loads, a saved copy of that URL cannot authorize another session. Restart the server if the code has expired or has already been used.
- More wrapped or inline calls to acceptance and the session server are refused to the model. You start the server and make approvals yourself; these restrictions are not a sandbox for arbitrary programs.

### Fixed

- `--help`, `-h`, and calling the CLI without a subcommand now display help successfully. Project and outlet values containing colons or quotes no longer produce invalid canvas frontmatter.
- Reduced false shell refusals caused by patterns in text replacements, interpreter programs passed through standard input, and variables holding ordinary commands that happen to name a research-harness checkout.

## 0.2.1 (2026-09-29)

- In repositories without a research canvas or decision log, ordinary file moves and search patterns under a notes directory named `research` are no longer mistaken for writes to research state. Commands that could create or overwrite the canvas or log remain checked.
- Shell brace expansion and literal loop values can no longer hide a write to research state. A loop variable that is reassigned inside the command is treated as unknown rather than trusted to keep its original value.

## 0.2.0 (2026-09-23)

### Changed

- Model-side shell checks now follow more command wrappers and inspect programs passed directly to supported shells and interpreters. Command substitutions and scripts supplied through standard input can no longer hide the covered writes or acceptance calls.
- In a paper project, a shell write whose destination comes from a command substitution the harness cannot resolve may be refused. Use a literal path when you need the model to work on an unrelated file.

### Fixed

- Reduced interference in repositories with no canvas or decision log: a bare word `research`, an unresolved path, or a pattern matching a nonexistent state directory no longer triggers the paper-project read-only rule. Explicit paths that could create research state are still checked.
- Protected state remains recognized when its path contains brackets or a symbolic-link ancestor. Ordinary array text and shell output redirection such as `2>&1` are no longer mistaken for state-file writes.
- Invisible control characters can no longer change the interpretation of a stated or accepted commitment without being reported as a parse problem. Free-text reasons and rejected alternatives can no longer insert a fake log-entry heading that breaks later acceptance.
- `status` and `review` report an unreadable canvas with a short filesystem error instead of a stack trace.
- Status, review and the session summary now distinguish proposals from open elements. A field containing only suggestions is reported as open with a proposal count, rather than as "open (+1 open)".

## 0.1.0 (2026-09-21)

The first installable research-harness plugin.

### Added

- `/research-harness:canvas` builds a nine-element research canvas through dialogue. Start from brainstorming, a seed idea, or an existing manuscript. The canvas and decision log are Markdown you can keep in your paper's repository.
- An initial qualitative information-systems profile supplies questions, dependencies between elements, and readings on problematization and publishing. The plugin includes its own questions and source references, not copies of the cited publications.
- `/research-harness:canvas-review` challenges the canvas and records findings. Its mechanical report flags empty fields, proposals without commitments, unmet dependencies, missing evidence tags, and acceptances whose recorded text no longer matches.
- `/research-harness:accept <n.m>` accepts a statement and records the decision against its text. It refuses when prerequisite elements are not accepted and asks you to select a candidate when a question has more than one statement.
- A short summary at session start tells Claude Code where the project stands and shows decisions not yet seen in that session. Repositories without a canvas receive no summary.
- Model writes are checked to preserve stated and accepted commitments, including their questions and evidence tags. The model may propose alternatives and transcribe your words, but recognized attempts to accept, rewrite commitments or directly edit the decision log are refused. Ordinary reflow does not invalidate an acceptance.
- Decision-log entries carry chained seals. Review distinguishes verified entries, entries that cannot be verified on this machine, and a broken log. The sealing key stays outside the paper repository; older unsealed entries are reported as legacy, not silently treated as verified approvals.
- CLI operations initialize a project, show its status, review it, accept statements, and append findings or constraints. Initialization does not overwrite an existing canvas, and a broken log is not automatically repaired.
- Review also flags stated or accepted statements hidden in HTML comments or indented code blocks, so commitments that disappear from the rendered canvas do not disappear from the discussion.
