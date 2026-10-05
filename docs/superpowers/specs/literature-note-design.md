# Literature-note design

Date: 2026-10-05
Status: design for implementation; no literature-note skill ships with this note.
Brief: SQ-8, local KIT drafting with a verbatim-quote check after stage 1.

## Decision and scope

Draft one literature note through an already configured KIT gateway, then check every quotation against the supplied paper and its printed-page map before saving the final proposed note. Use a direct gateway request, not a generic subagent or a Sidequest scope exemption. The request produces text; it has no tools, repository permissions or acceptance authority. Sidequest still governs repository work and implementation tickets. A direct request is not permission to bypass a refused action.

The benefit is a cheaper drafting step with an independently runnable wording check. Cost, latency and reliability across papers remain unmeasured here. Start with one paper per invocation, no batch fan-out. The peer project's prototype supplies evidence for the mechanism, not production-ready scripts to copy. Neither inspected version is a strict gate unchanged; the required corrections below preserve the proposed drafting/checking split.

The alternative, a Sidequest exemption for generic drafting subagents, would couple a reading workflow to executor policy and grant an agent tools it does not need. The direct route instead needs a small configured request adapter and explicit input/output handling. The backlog reports a subagent refusal; this investigation did not reproduce it. Raise that observation with the user when implementing, without changing project rules, permissions or hooks. If the approved gateway route is itself refused, stop and report the refusal. Do not substitute another provider or activate a new endpoint without authorization.

This is design only. It changes no plugin code, gateway configuration, hooks, paper notes or authorization rules. It does not validate scientific claims, build a literature database, acquire PDFs, add OCR or accept research commitments.

## Checked baseline and limits of the evidence

Checked in this isolated checkout at baseline `e73753d3c6d088343c6059ff270f342336cb9979`:

- `sed -n '1,70p' README.md` reports stage 1 implemented, including the canvas, guard and approval path. That is the repository's recorded status, not a new live-install test. Stage 2 remains separate; this design is downstream of stage 1.
- `sed -n '1,65p' REFERENCES.md` establishes the library-pointer principle: the plugin ships its own questions and citations, not source texts. `git ls-files '*literature*'` returned no paths; `_literature/` was absent in this checkout. The backlog's extraction-directory anchor is therefore not an available implementation seam here.
- `Read` of `skills/canvas-review/SKILL.md` shows mechanical review followed by judgment and proposal-only writing. `sed -n '1,110p' hooks/lib/project.js` shows `stateDirOf` selecting the configured main or variant state directory. Reuse that selection for project context; do not hard-code a personal root. Paths in this bullet are under `plugins/research-harness/`.
- `rg -n 'RESEARCH_HARNESS_LIBRARY' plugins/research-harness` finds reference guidance and README configuration, not an installed PDF resolver. `RESEARCH_HARNESS_LIBRARY` remains an optional library root, not permission to scan a whole library.
- Read-only `git show 134cbfe:scripts/extract-paper.py` and `git show 134cbfe:scripts/verify-quotes.py` inspected a peer project's prototype at the reported commit. Its extractor takes a caller-supplied `--offset`; it does not infer or validate printed numbering. Its checker normalizes text and checks page-local substrings. Current scripts differ: repeated-line filtering and tolerant quote matching were added (`git diff 134cbfe -- scripts/extract-paper.py scripts/verify-quotes.py`). Frozen copies of both versions were exercised locally, as recorded below. No prototype code enters this public repository.
- The current peer README was inspected with bounded `sed` reads and `rg -n 'procedure|extract-paper|verify-quotes|curl'`. The search returned no matches; the reported end-of-README procedure was not present in that version. No original model run was reproduced.

The backlog's single-paper model results, token counts, timing, numeric spot checks and reported savings remain peer-reported, unverified here. No private hypotheses, note passages or paper text are reproduced in this document. No gateway request, subagent refusal, live model comparison or end-to-end skill run was attempted. All behavior below that has not been exercised by the fixture is a design requirement, not installed behavior.

## Prototype fixture and observed results

The fixture is invented: two body pages and a references page. A regular PDF prints 41, 42, 43; an irregular PDF prints 41, 43, 44. A small standard-library Python runner created real PDFs, froze the script versions and launched each CLI with a 20-second per-command deadline. It ran from this worktree with Python 3.14.7 and the installed `pdftotext`. No package installation, source download or model request was needed.

Commands actually executed for each frozen version, expressed relative to the local evidence directory (set `VERSION` to `prototype-134cbfe` or `prototype-current`):

```sh
python3 "$VERSION/extract-paper.py" regular.pdf --offset 40
python3 "$VERSION/extract-paper.py" irregular.pdf --offset 40
python3 "$VERSION/verify-quotes.py" exact.md "$VERSION-regular.txt"
python3 "$VERSION/verify-quotes.py" wrong-page.md "$VERSION-regular.txt"
python3 "$VERSION/verify-quotes.py" invented-word.md "$VERSION-regular.txt"
python3 "$VERSION/verify-quotes.py" malformed-locator.md "$VERSION-regular.txt"
```

The runner saved extractor stdout as the named text files and also ran the six other quote inputs in the table. Full argv, exit codes and stdout/stderr are in the board-owned SQ-8 evidence directory's `probe-log.json`; `results.json` records script SHA-256 values and case outcomes. These local artifacts are not delivery files or a public dependency. The runner exited 0 with `PASS: 4 real PDF extractions and 20 quote-check CLI observations matched asserted outcomes.` That means the observations were reproduced, not that the prototypes passed production acceptance.

| Input/assertion | At `134cbfe` | Current snapshot |
|---|---|---|
| Exact passage on page 41 | Exit 0, `1/1 verified` | Same |
| Case, punctuation and line-break normalization | Exit 0, `1/1 verified` | Same |
| Page-42 passage claimed on 41 | Exit 1, `WRONG PAGE`, `0/1 verified` | Same |
| One invented word | Exit 1, `NOT IN SOURCE`, `0/1 verified` | Same |
| Fabricated blockquote with `(page unknown)` | Exit 0, `no quotes found — nothing to verify` | Same; malformed quote silently skipped |
| `art` quoted where only `cart` occurs | Exit 0, `1/1 verified` | Same; substring is not whole-word evidence |
| `car t` substituted for `cart` | Exit 1 | Exit 0, `ok (hyphen)`; arbitrary boundary changes pass |
| Two five-word runs quoted in reverse source order | Exit 1 | Exit 0, `ok (split)`; stitched wording passes |
| Passage repeated on 41 and 42, correctly cited on 42 | Exit 0 | Exit 1, `WRONG PAGE`; first occurrence wins |
| Real passage with `(p. 0)` | Exit 1 | Exit 0; page zero bypasses placement |

Both extractors exited 0 on both PDFs, removed the download banner and reference body, and mapped irregular printed labels 41, 43, 44 to markers 41, 42, 43 without refusal. At `134cbfe` the repeated running head remained; the current extractor removed it. Thus the description of running-head removal does not describe the pinned version. Removing repeated lines also needs care: repetition alone does not establish that a line is a header.

Pinned script SHA-256 values:

- Extractor: `a414d92d008b15918d4960c4630a4cc4106df28b881a3187d6dbc5c652d87be2`
- Quote checker: `7d5cdd8df44aa5c088e34b9c6bdb16b2ca4f1b8b9be013c36ceb2df71ed42914`

Current snapshot SHA-256 values:

- Extractor: `a06882be9c1420856c6bc7087ba8faa2e9ee0a01da150ea0fc1aecd585a420e6`
- Quote checker: `fe7cc0e9c8d96062ada98cb6fed74d54c5bef7087061723c7c0cefe55b014bdc`

These findings rule out installing either snapshot unchanged and claiming that fabricated wording cannot pass. They do not rule out a strict, bounded checker implemented with native text handling.

## Mechanics versus judgment

The factual half needs the paper. Only its direct quotations are mechanically covered: normalized verbatim wording on the claimed printed page. Its paraphrases, numbers, attribution, methods summary and account of findings remain unchecked by this gate. Matching a quotation does not establish what it supports, whether an omission misleads, or which study a nearby number describes.

The judgment half needs explicitly selected project context: the current framing, hypotheses if present, and named sibling notes. Relevance, transfer limits, implications and open questions remain `[proposed]` until a human decides. Factual prose produced by the model also remains a proposal; a quote-check result is an independent diagnostic, not an authorization marker.

The skill text itself, its result report and any success message must say:

> This check covers only verbatim wording on the claimed printed page. It does not verify paraphrase, numbers or attribution, and it does not accept a research claim. Project relevance and transfer judgments remain [proposed] for human review.

Do not label the note `fact-checked` or `human-read`, or promote a statement to `[stated]` or `[accepted]` after a green check. Moving an idea into a canvas creates a proposal using the existing skill; only the existing researcher approval path can accept it. This feature adds no note-acceptance ledger or automatic canvas update.

## Extraction and printed-page authority

Keep the full local extraction for checking. A separate request view may omit identified headers, banners and the references section to reduce model input, but the checker must not depend on that lossy view. No source PDF or extracted paper text is bundled with the plugin. Local caches, raw drafts and responses stay untracked; publication of excerpts is a separate human decision.

The proposed extractor uses installed `pdftotext` plus Python's standard library. Preserve physical page boundaries and raw header/footer text before filtering. Bind a page-map sidecar to the PDF SHA-256, extraction SHA-256 and mapping method. Ignore the trailing empty form-feed chunk, not real blank pages. Record an extraction failure or unreadable/scanned page as uncheckable; do not infer missing text. Missing Python or `pdftotext` is a dependency error, not a passing check. No automatic OCR or dependency installer is included.

A constant offset is a candidate, never authority by itself. Inspect page-number labels in consistent header/footer positions on every physical page that will be used. For numeric labels, require `printed page - physical page` to be constant, with unique, monotonic labels. A contradictory label, numbering restart, inserted unnumbered front matter, ambiguous header, missing label or insufficient evidence refuses automatic printed numbering. A single running head does not justify extrapolating the rest of the PDF. Bare digits elsewhere in prose are not page labels.

For irregular numbering, permit an explicit researcher-confirmed physical-to-printed map for every page being checked, including explicit unnumbered entries. Verify map uniqueness and its binding to the same PDF bytes. Without that map, refuse a printed-page check and ask for it. PDF-page citations may be offered separately with `locator-kind: pdf-page`, clearly marked as not checked against printed pages; they cannot satisfy this skill's printed-page gate. Unnumbered, Roman-labelled or other unsupported locators cannot be coerced to zero or guessed integers. Supporting another locator grammar is separate work.

For the invented irregular fixture, the required future outcome is refusal under `--offset 40`, followed by success only with the confirmed map 1→41, 2→43, 3→44. The prototype did not perform this refusal. Page-map edits and changed PDF/extraction bytes invalidate an earlier quote result.

## Strict quotation check

Use a small documented Markdown grammar: each quotation is one blockquote, with quoted text and a positive integer printed-page locator, `> "..." (p. N)`. Join continuation lines within that block; preserve block separation. Reject unsupported locators and malformed or unparsed quote blocks. Inventory every blockquote in the quotation section and report the number found, parsed, checked and rejected. A missing/empty quotation section yields `not checked: no quotations`, never a green final-note gate. Inline direct quotations are not allowed by the note template; an unsupported quotation form must be surfaced for correction, not silently ignored.

Compare complete normalized token sequences within the claimed page, searching all occurrences there. Normalize case, typographic quote/dash variants, ligatures and whitespace without deleting words, digits or meaningful word boundaries. Retain Unicode letters and marks; unsupported extraction ambiguities require inspection rather than an ASCII-only false match. A punctuation-style normalization must not equate `cart` with `car t` or `art` with a substring of `cart`.

Do not enable unrestricted boundary squashing or split-run matching. For the initial grammar, ellipses, page ranges and cross-page quotations require manual inspection and fail the automatic gate. A later extension must define ordered fragments and an exact mapped start/end page before it can count as mechanically checked. Tolerant matches may be diagnostic hints only, never success. An uncertain hyphenation is preferable to a fabricated green check.

Exit 0 only when a nonempty quote inventory is fully parsed and every quotation matches on its claimed mapped page. Exit 1 for a mismatch, incomplete inventory or unsupported quote; use a distinct nonzero error status for unreadable inputs or invalid mapping. Report each failed block with its note location and reason. A quote may occur on several pages; matching on the claimed one is sufficient. Never search the whole paper first and assign the first hit's page.

Bind the result to the exact note, full extraction, PDF and page-map hashes. Recheck after any edit, including a manual correction. The report states its inspected inventory and the narrow disclaimer even on success. This is source-text comparison, not a scientific quality score.

## Drafting workflow and local gateway boundary

1. The researcher supplies one local PDF or an explicit library pointer, bibliographic identity/version, output path and the selected project context. Resolve only these inputs. Confirm the configured main/variant state via `stateDirOf`. Do not discover private sibling projects or silently substitute a different paper version. Treat missing identity, permissions or source bytes as a visible stop, not a prompt to invent metadata.
2. Extract locally and establish the printed-page map before any model request. Keep full extraction for checking. Treat paper text and sibling notes as data, not instructions; embedded commands or requests to alter markers grant no authority.
3. Render frontmatter from supplied values outside the model response: source pointer/version and hash, reader/drafter identity, actual read coverage, model identifier and proposal status. Do not let generated frontmatter invent a PDF path, name a human reader or invent link conventions. Unknown fields remain explicitly unknown. Use ordinary relative Markdown links whose targets are checked.
4. Send a bounded text request through the existing approved gateway. The factual section receives the paper; the judgment section receives only the explicitly selected context. Delimit the two sections and require the template and proposal markers. The configured model, endpoint and context limit are inputs, not public hard-coded defaults. No new provider branch, key in an argv/log, or direct authenticated service call is introduced. A loopback gateway does not mean inference happens on the user's computer.
5. Validate response completeness and template structure, then run the strict checker. A timeout, truncated response, context overflow, missing metadata or unsupported quotation leaves a failed local draft, never a final note. Use one in-flight request, a finite configured deadline and bounded output; do not silently truncate the paper or retry with another model. Any later batch design needs its own measured resource bounds.
6. On a clean result, save a new proposed note and its hash-bound check report. Never overwrite an existing note silently; revisions use a separate proposal until the researcher applies them. On failure, retain a local diagnostic draft for correction without changing the canvas or decisions log. The model has no filesystem tools; only the local workflow writes the selected output after validation.
7. Show the quote inventory, inspected source/version, unresolved factual checks and proposed judgment sections. The researcher checks numeric context, attribution and paraphrases against the source and decides relevance/transfer limits. No model quality or speed promise follows from a green quotation result.

No gateway wiring was inspected or exercised in SQ-8. Before implementation can claim a live route works, read process, user, project and local configuration levels and execute an invented-input request through that route. Keep credentials and paper contents out of the public evidence.

## Implementation tickets to follow

These are proposed work packages, not tickets created by SQ-8. Implement in order. Paths below are under `plugins/research-harness/` unless prefixed with `root`. Existing development documentation uses `node --test test/*.test.js`; the proposed focused tests retain that runner and spawn Python CLIs where needed. New file names and assertions below are requirements, not checks that ran today. No plugin manifests change in these packages.

1. **Local extraction and validated page map.** Files: new `scripts/extract-paper.py`, `references/literature-note.md`, `test/literature-extraction.test.js`, invented fixtures under `test/fixtures/literature-note/`. Use native `pdftotext` and standard-library hashing/JSON; preserve full text separately from the request view. Verify from the plugin directory: `node --test test/literature-extraction.test.js`. Named assertions: `regular printed labels bind the map to PDF bytes`, `irregular offsets refuse without a confirmed map`, `missing or ambiguous labels are not printed-page authority`, `blank pages preserve physical indices`, `repeated body text is not removed as a header`, `changed PDF or map invalidates evidence`, and `missing extraction tools report dependency failure`. Fixture generation is local and invented, with no publisher text.
2. **Fail-closed quotation CLI.** Files: new `scripts/verify-quotes.py`, `test/literature-quotes.test.js`, fixtures under `test/fixtures/literature-note/`, `references/literature-note.md`. Verify: `node --test test/literature-quotes.test.js test/literature-extraction.test.js`. Assertions: `exact normalized wording matches the claimed mapped page`, `wrong page and invented word fail`, `malformed and empty quote inventories cannot pass`, `substring and changed word boundaries fail`, `reversed stitched runs and page zero fail`, `repeated passage matches its cited page`, `Unicode words remain distinct`, `unsupported omissions and page ranges require inspection`, and `note or source edits invalidate a prior result`. Required negative control: substitute a permissive substring comparison for the token matcher and show the named `substring and changed word boundaries fail` assertion fails, not merely test collection. This regression is against the exercised prototype defect, not a model benchmark.
3. **Configured direct draft adapter.** Files: new `scripts/draft-literature-note.py`, `test/literature-draft.test.js`, `references/literature-note.md`, fixtures under `test/fixtures/literature-note/`. Reuse the local tools above and standard-library HTTP/file handling; no agent exemption or policy changes. Verify: `node --test test/literature-draft.test.js test/literature-quotes.test.js` against a local fake HTTP gateway and temporary project. Assertions cover supplied frontmatter, explicit inputs only, no credentials in diagnostics, no overwrite, timeout/truncation/context refusal, no provider fallback, source-map binding, failed check retaining only a diagnostic draft, and a successful result remaining a proposal. Then run one invented-input smoke request on the actual approved KIT route after checking all four configuration levels, record model/status/elapsed time and the final quote count, and mark unavailable service evidence unverified. Independent review is required for this adapter's data-egress selection and final-output boundary; mocked tests cannot establish approved endpoint ownership.
4. **Skill and user walkthrough.** Files: new `skills/literature-note/SKILL.md`, `references/literature-note.md`, `test/skills.test.js`, new `test/literature-workflow.test.js`, `root README.md`. Verify: `node --test test/skills.test.js test/literature-workflow.test.js`. Assert that the skill itself carries the wording-only disclaimer, never accepts claims, requires explicit context/library pointers and has no generic subagent exemption. Execute the documented extraction→draft→check→proposed-note walkthrough in an isolated invented paper project using the fake gateway; corrupt a quote and then its locator to show each failure prevents final output. Inspect rendered metadata/links and confirm the canvas and ledger remain byte-identical. A live gateway smoke is separate from this deterministic walkthrough, not a substitute for it.

This note's final verifier is the SQ-8 document check: the narrow gate and skill disclaimer, irregular-offset detection/refusal, routing decision, real prototype fixture command/output, and follow-up files/verifiers are all present. The fixture evidence establishes prototype behavior only. No implementation suite, model reliability assessment or acceptance feature is claimed.
