# Construct glossary design

Date: 2026-10-05
Status: design for implementation; no glossary feature ships with this note.
Brief: SQ-9, construct drift and conflation while writing a paper.

## Decision and scope

Store entries in a separate `research/glossary.md`. Element 4.1 points to those entries; elements 4.2 and 4.3 retain the relationships and mechanisms. Do not copy the definitions into the canvas. The glossary is element 4's working reference, with one definition per construct and explicit distinctions from neighbouring constructs.

Putting entries inside 4.1 would reuse its paragraph parser and existing protection immediately. It would also turn a question about the core concepts into a growing catalogue, bind unrelated definitions to a question-level acceptance, and make manuscript references depend on locating prose. The separate file gives each entry a stable identifier and acceptance. Its cost is real: path protection, acceptance cover and review must be extended before agents can safely use it. A new Markdown file alone is not this feature.

This design covers definition provenance, declared construct coverage and changes to accepted text. It does not build a literature database, assess construct validity, extract constructs with a model, or freeze qualitative analysis before findings. No implementation files, paper glossary, commands or profiles change in SQ-9.

## Checked baseline and limits of the evidence

The following observations come from this checkout, not from the backlog's claims:

- `hooks/lib/accept.js`, read with `Read`, calls `loadState`, selects an unambiguous candidate, requires the researcher's explanation, checks element dependencies and `ledgerRefusal`, then changes the marker and appends a sealed DECISION. A stale view is reread before writing. CLI acceptance imports this shared function from `bin/research-harness.js`.
- `hooks/lib/hash.js` and `hooks/lib/canvas.js`, inspected with `Read` and `sed -n '20,34p'`, bind normalized text using NFC, collapsed ASCII space/tab/CR/LF, and the first eight hexadecimal characters of SHA-256. This text hash is distinct from the ledger seal.
- `hooks/lib/review.js`, read with `Read`, grants acceptance cover only to a matching, verified DECISION. It separately reports stale text and accepted markers without verified cover. A missing key, a legacy entry and a broken chain are not verified acceptance.
- `sed -n '2400,2450p'` and `sed -n '2540,2610p' hooks/guard-promotion.js` show path routing for canvas and decisions, including variants and filesystem aliases. There is no glossary kind today. All paths here are relative to `plugins/research-harness/`.
- `skills/canvas-review/SKILL.md` places source support and manuscript comparison in the skill's judgment half. Current mechanical review reports missing tags; it does not resolve arbitrary `src:` targets. Adding glossary resolution is new work.
- A focused Node probe run from the checkout asserted that reflow preserves `textHash`, changed wording changes it, and `parseCanvas` preserves `src: glossary.md#felt-safety` as a tag. All three assertions passed. This tests compatibility of existing primitives, not the proposed feature.

`references/canvas-elements.md` asks for definitions and sources at 4.1, relations at 4.2, and mechanism at 4.3. The two profile files were read. Their prose says dependency checks never enforce acceptance order, but executable `accept.js` refuses unmet dependencies. This design follows that executable behavior; it does not silently relax it.

The AMJ relationship below uses the checked local map only. The editorial's full text was not retrieved. Manuscript formats other than Markdown, a glossary guard, glossary acceptance and glossary review were not exercised: they do not exist yet. The schema, commands and checks below are design decisions, not descriptions of installed behavior.

## Entry format and references

Use ordinary Markdown with a small, versioned grammar. The file lives beside the selected canvas and decisions log, using `project.stateDirOf`, not a hard-coded `research` directory. A variant has its own glossary and uses its own decisions log; do not share accepted definitions silently across framings. Copying an entry to a variant creates a proposal requiring that variant's acceptance.

The proposed file header declares `glossary-schema: 1` and `manuscripts: paper.md; sections/theory.md` as scalar frontmatter fields. Manuscript paths are explicit, project-root-relative Markdown paths. No recursive repository scan, network fetching or automatic format conversion. A missing, unreadable or unsupported declared manuscript makes coverage `not checked` for that file, never clean. Resolve source and manuscript paths against their declared base, reject traversal or symlinks escaping the project, and report unreadable targets instead of treating them as absent. An absent manuscript list means manuscript coverage was not requested, not that there are no constructs.

Each entry has a unique lowercase hyphenated ID as its level-two heading. Its fields appear once in fixed order: term, aliases, definition, origin, distinctions, then authorization marker. An ID is the link target; changing a display term does not rename the ID. Reject duplicate IDs, duplicate fields, unsupported schema and malformed blocks as unjudgeable. Do not discard malformed content to obtain a clean result.

Illustrative proposed entry, invented for this design and not attributed to literature:

```markdown
## felt-safety

Term: Felt safety
Aliases: perceived safety
Definition: A participant's reported expectation that expressing a concern will not expose them to interpersonal harm.
Origin: own-definition
Distinctions: Unlike [speaking frequency](#speaking-frequency), this is an expectation rather than a count of speaking turns. It does not establish whether dissent occurred or whether a proposal was taken up.
[proposed]
```

`Origin` is either `own-definition` or `src: <project-relative file>#<anchor>` with a bibliographic citation and locator in that local source note. An adapted definition names its sources and says what the paper changed. A DOI alone does not establish that the adopted definition came from a checked passage. The tool checks presence and local target resolution; the researcher checks what that passage supports. `unverified` can describe an unfinished proposal but cannot satisfy the origin requirement for acceptance. An unresolved definition can remain `Definition: pending`; it is reported as incomplete and cannot be accepted.

`Distinctions` is required, including an explicit explanation when no neighbour is relevant. Neighbours are cited as Markdown links such as `[speaking frequency](#speaking-frequency)`; those entry IDs must resolve. The tool can check that text and targets exist, not that the distinction is sound. Aliases are declared equivalent labels, not opportunities to collapse constructs. If one alias maps to multiple IDs, report ambiguity and ask the researcher to disambiguate; never pick one.

### Canvas citation form

A canvas statement uses its existing evidence tag grammar:

```markdown
Felt safety and speaking frequency are distinct in this study. [proposed, src: glossary.md#felt-safety, src: glossary.md#speaking-frequency]
```

Resolve `glossary.md#<id>` relative to the selected canvas's state directory. This restricted new resolver recognizes glossary IDs; it does not reinterpret every existing source tag. A resolved link means an entry exists, not that it is accepted or supports the claim. Report the target's authorization and cover separately. Elements 3, 4, 7 and 8 declare each construct they use this way, including proposals and tentative statements. Element 4.1 links the core entries; 4.2 and 4.3 cite the definitions they rely on. A glossary entry is not a substitute for evidence supporting a finding or a causal relationship.

### Manuscript citation form

In a root-level Markdown manuscript, use `[felt safety](research/glossary.md#felt-safety)` at the definition and first substantive use in each section. For nested manuscripts or a configured state directory, use the correct relative path to the selected glossary. Keep the paper's ordinary literature citation alongside the definition; the glossary link is an internal writing reference, not a published scholarly citation.

Where a paragraph uses constructs without visible links, declare the IDs in `<!-- constructs: felt-safety, speaking-frequency -->`. These declarations are machine-readable usage, not acceptance or evidence. Count them even though they are hidden in rendered Markdown, and show their locations in review. Internal links and comments may be removed in a publication export, but review runs on the source manuscripts, not the stripped export. Export automation is outside this design.

## Authorization and text binding

The agent proposes entries and revisions. Only the researcher accepts them, using a new human-facing `research-harness glossary accept <id> --explained "<researcher's sentence>"` route. Do not grant agents that route through skill permissions or the command guard. `[accepted]` written into the file is never sufficient.

Reuse the existing normalization, `textHash`, project identity, sealing key, ledger refusal and sealed append machinery. For each entry, hash a canonical JSON array containing the ID followed by the fixed-order normalized field values. Normalize each value before serialization; aliases and distinction references remain in their declared order. Bind the whole entry payload, including provenance and distinctions, so changing a source cannot retain approval of the old definition. Exclude only the authorization marker. Review uses exactly the same payload builder. Formatting reflow is harmless; wording, aliases, origin or distinctions changing makes acceptance stale. The eight-character text hash retains the canvas's compatibility convention; it is not an authentication credential or a collision-proof semantic identifier. Authentication remains the sealed ledger's job.

Append a DECISION with ref `glossary <id> accepted`, its payload text hash, the accepted payload, `By` and `Explained`. Do not fake a `4.1 accepted` ref: accepting one definition must not accept the whole canvas question. Extend cover reporting and session protocol consumers to recognize the new ref. Apply element 4's current profile dependencies when accepting an entry, while allowing proposals at any time. Accepting an entry does not change any canvas marker; accepting 4.1 does not bulk-accept entries.

Before writing, revalidate the exact displayed payload, refuse ambiguous or stale targets, require complete fields and resolved origin, and check the ledger. A glossary acceptance must leave neither a promoted marker without a sealed decision nor a decision claiming text that was not written. Use the existing write path's recovery conventions and test failed writes explicitly; do not introduce a second ledger or an agent-editable acceptance index.

Extend protected state routing and the existing commitment-comparison boundary to the glossary. Agents cannot create accepted entries, downgrade markers, edit/delete committed fields, or evade protection through rename, shell commands, filesystem aliases or unknown tools. Protect `[stated]` transcriptions as the canvas does. Keep a revision proposal outside the committed entry block; the researcher applies and accepts a revision explicitly. Keep old ledger decisions; review distinguishes superseded history from unexplained drift and never repairs it. Missing keys and malformed content remain visible failures to establish cover.

A glossary entry's changed text must also surface to canvas consumers that cite it, even when their own statement hash is unchanged. Report `definition changed since acceptance` and list dependent statement/manuscript locations; do not silently invalidate or reaccept those statements. The researcher decides whether the new definition changes their claims.

## Mechanical review and its limits

Extend the existing read-only `review` command, with findings grouped under `Glossary mechanics`. This does not introduce a new scientific quality score or a build gate that prevents emergent analysis.

| Mechanical check | Report and boundary |
|---|---|
| Entry structure and provenance | Missing definition, missing source/own-definition, duplicate IDs/fields, ambiguous aliases and unresolved local origin. A source's existence does not prove it supports the definition. |
| Declared canvas coverage | Every glossary reference in elements 3, 4, 7 or 8 resolves to an entry. Show question, exact statement and missing ID. An existing proposal counts as an entry, but its incomplete/unaccepted state remains visible. |
| Declared manuscript coverage | Every glossary link and `constructs:` declaration in every declared readable Markdown manuscript resolves. Report file and location. Unknown IDs fail resolution even if no glossary term matches them. |
| Lexical cross-check | Search declared terms and aliases in those canvas statements and manuscript prose, with explicit Unicode word boundaries and no fuzzy stemming. List unmatched/unlinked occurrences for inspection. Exclude code examples, bibliography and link destinations from prose matching, but parse usage declarations independently. Ambiguous matches stay ambiguous. |
| Accepted text stability and cover | Compare the entry payload hash with its recorded decision and verify the ledger seal. Distinguish changed text, deleted accepted entry, marker without cover, legacy, broken and unverifiable here. Reflow alone passes. |

The requirement "every construct term has an entry" needs a declared inventory. A deterministic checker cannot recognize an undeclared scientific construct in arbitrary prose. Explicit references expose unknown IDs; lexical matching catches known labels used without declarations. Neither discovers all new constructs or detects a changed meaning behind unchanged wording. Review therefore always prints the files inspected and: `Declared construct coverage checked; undeclared constructs require human inspection.` No manuscript inventory or a failed read produces `not checked`, not zero missing entries.

The human part stays in canvas-review, with these questions left unanswered by mechanical output:

- Do the entries actually distinguish different things, or merely use different labels?
- Is the adopted definition appropriate for this study and supported by its source?
- Does the design measure or observe the construct the paper names?
- Did the manuscript introduce an undeclared construct, conflate terms, or change meaning while retaining the same words?

Always print `Human construct judgment: not performed by this check`, even when no mechanical problem was found and all entries have verified acceptance. Researcher acceptance records their decision about the displayed text; it does not certify measurement validity or turn a model's review into human judgment. An optional agent review writes proposals and open questions only.

## Genre ownership and AMJ relationship

The genre profile owns timing and interpretation, through its existing element-4 emphasis and dependency graph. It does not own the file schema, source requirement, hash algorithm, or authorization axis. Those rules hold across genres; no new profile-controlled bypass is needed.

For `is-qualitative`, proposed and tentative entries can start as sensitizing terms and gain definitions as findings emerge. Pending definitions remain visible; do not manufacture a literature source to make an early check green. Final entry acceptance follows the existing `4 <- 2, 7` dependencies. A later change requires a new researcher decision. This permits definition arriving late without pretending late definitions were fixed before data. For `is-quantitative`, entry acceptance follows `4 <- 2, 3`; the profile's existing emphasis on defining domains before measures remains relevant. Glossary acceptance must not be mistaken for registry preregistration, and must not fabricate a `4.1` hypothesis acceptance for the existing log-order check.

The checked `references/amj-map.md` pairs element 4 with Sparrowe and Mayer (2011), *Publishing in AMJ — Part 4: Grounding Hypotheses*, AMJ 54(6), 1098–1102, and directs qualitative profiles to Part 7. This pairing is the plugin's reading, not an author-published mapping. The glossary supplies definitions and distinctions to work on relations and mechanisms in 4.2/4.3; it does not itself ground a hypothesis. Do not present this file format or its mechanical checks as a prescription from Sparrowe and Mayer. No further claim about that editorial's argument is made without reading the text.

The brief's voice example remains a useful review case: speaking frequency, dissent, proposal uptake and felt safety get separate entries if the study uses them. A count of speaking turns does not establish dissent; expressed dissent does not establish uptake; any of these can occur without a matching report of felt safety. These are illustrative distinctions to scrutinize, not accepted definitions or fabricated literature claims.

## Implementation tickets to follow

These are proposed work packages, not tickets created by SQ-9. Implement them in order. All paths below are under `plugins/research-harness/` unless explicitly prefixed otherwise. Each producer includes its own release fragment when dispatched; independent review is assigned by the orchestrator.

1. **Entry parser, payload and selected-state paths.** Files: new `hooks/lib/glossary.js`, `hooks/lib/project.js`, `hooks/lib/state.js`, new `references/construct-glossary.md`, new `test/glossary.test.js`. Resolve schema, ID uniqueness, field completeness, local provenance and variant isolation using native filesystem/path support and existing text normalization. Verify: `node --test test/glossary.test.js test/canvas.test.js` from the plugin directory. Named assertions must cover duplicate/malformed entries, pending definitions, own versus sourced definitions, reflow equality, field-edit inequality, ambiguous aliases, configured state directories and variant isolation.
2. **Researcher acceptance and protection.** Files: `hooks/lib/glossary.js`, `hooks/lib/accept.js`, `hooks/lib/review.js`, `hooks/lib/protocol.js`, `hooks/guard-promotion.js`, `bin/research-harness.js`, new `skills/glossary-accept/SKILL.md`, new `test/glossary-accept.test.js`, `test/guard-promotion.test.js`, `test/protocol.test.js`, `test/skills.test.js`. Reuse acceptance/ledger primitives, extend ref consumers and every existing protected-path route; no second acceptance authority. Verify: `node --test test/glossary-accept.test.js test/guard-promotion.test.js test/protocol.test.js test/skills.test.js`. Assertions cover stale views, dependency refusal, required explanation, missing/broken keys, failed writes without false cover, manual promotion without cover, agent rewrite/delete/downgrade refusal and path/command aliases. This trust-boundary ticket requires independent review of protected-path routing and acceptance authority before integration.
3. **Coverage and drift diagnostics.** Files: `hooks/lib/glossary.js`, `hooks/lib/review.js`, `bin/research-harness.js`, new `test/glossary-review.test.js`, `test/review.test.js`, new fixtures under `test/fixtures/construct-glossary/`. Verify: `node --test test/glossary-review.test.js test/review.test.js`. Assertions exercise all four voice entries across introduction/theory/findings, unknown IDs in elements 3/4/7/8, manuscript links and hidden declarations, lexical alias ambiguity, unchanged words with explicitly unassessed meaning, stale definition/source/distinction payloads, no key, missing manuscript and unsupported input. A mechanically clean fixture must still print the human-judgment disclaimer and bounded inventory.
4. **Writing workflow and profile guidance.** Files: `skills/canvas/SKILL.md`, `skills/canvas-review/SKILL.md`, `references/profiles/is-qualitative.md`, `references/profiles/is-quantitative.md`, `references/amj-map.md`, `test/skills.test.js`, `test/references.test.js`, root `README.md`. Explain proposal-only agent work, late emergent definitions, citation forms and the distinction between mechanics and judgment; reconcile dependency prose with the acceptance behavior without changing the graph. Verify: `node --test test/skills.test.js test/references.test.js` from the plugin directory, plus manually run the documented propose/review/researcher-accept workflow on the glossary fixture in an isolated paper project. Inspect rendered links and confirm a qualitative pending definition is allowed as a proposal, refused for acceptance until complete/dependencies met, and never reported as human-validated.

This note's acceptance is a document check against SQ-9's five required decisions and the design-only scope. It does not stand in for any of those implementation regressions.
