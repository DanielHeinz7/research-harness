# Literature note: local extraction, printed-page map and quotation check

This file documents the local stages of the literature-note design
(`docs/superpowers/specs/literature-note-design.md`). It covers that design's
package 1, turning one local PDF into a full text, a reduced request view and a
page map that says which printed page each physical page is, and package 2, the
fail-closed check of a note's quotations against that paper. The drafting
adapter, the review loop and the skill are later packages; nothing here
establishes a reviewed note or an accepted research claim.

## Why the printed page is the anchor

A reader finds a claim in the published article by its printed page number.
The PDF's own page index is not that number: covers, inserted front matter and
numbering restarts move it. Every page map therefore records both the physical
index used to read the file and the printed page a reader would cite, and the
extraction keeps enough evidence to defend that pairing.

## Running the extractor

```
python3 scripts/extract-paper.py PAPER.pdf [--offset N | --map FILE] [--out DIR] [--extractor NAME]
python3 scripts/extract-paper.py PAPER.pdf --verify PAGE-MAP.json
```

Run it from the plugin directory. Everything happens on this machine: the
installed `pdftotext` for the text, Python's standard library for hashing and
JSON. There is no network request, no OCR and no automatic dependency install.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Extraction or verification succeeded |
| 1 | Usage error, or a verification that did not pass its checks |
| 2 | A required tool (`pdftotext`, `python3`) is missing. This is a dependency failure, never a passing check |
| 3 | The printed-page numbering was refused, or no map was supplied for an irregular document |
| 4 | Unreadable or invalid input: missing PDF, malformed page map, a map that is not bound to these PDF bytes |
| 5 | Recorded evidence changed: the PDF, the confirmed map or the extraction is not the one that was mapped |

For the fixture PDFs this is:

```
python3 scripts/extract-paper.py test/fixtures/literature-note/regular.pdf --offset 40 --out /tmp/paper
python3 scripts/extract-paper.py test/fixtures/literature-note/irregular.pdf --map test/fixtures/literature-note/irregular.confirmed-map.json --out /tmp/paper
python3 scripts/extract-paper.py test/fixtures/literature-note/regular.pdf --verify /tmp/paper/regular.page-map.json
```

## Outputs

Named after the PDF stem, written into `--out` (default: beside the PDF):

- `<stem>.full.txt` — the complete local extraction, physical pages joined by a
  form feed, raw headers and footers included. This is the copy the quotation
  check must read; local caches and extracted text stay untracked.
- `<stem>.request.txt` — the reduced request view (below). Lossy, and never the
  basis of a check.
- `<stem>.page-map.json` — the sidecar described next.

## The page-map sidecar

`schema` is `literature-note/page-map@1`. The map is bound to the bytes it was
made from, so a changed PDF can be detected rather than silently re-used:

| Field | Meaning |
|---|---|
| `pdfFile`, `pdfSha256` | The PDF this map was made from |
| `physicalPages` | Number of physical pages read, including blank ones |
| `mapping.method` | `offset`, `confirmed-map` or `none` |
| `mapping.offset` | The constant offset used, for `offset` |
| `mapping.mapFile`, `mapping.mapSha256`, `mapping.confirmedBy`, `mapping.confirmedAt` | The confirmed map and who confirmed it, for `confirmed-map` |
| `extractionFile`, `extractionSha256`, `requestFile`, `requestSha256` | Relative to the sidecar's directory |
| `requestLossy`, `omittedFromRequest` | What the request view dropped: `bannerLines`, `labelLines`, `referenceLines` |
| `uncheckablePages` | Physical pages with no extractable text; recorded, never guessed |
| `pages[]` | Per page: `physical`, `printed`, `printedSource`, `hasText`, `chars`, `textSha256`, what the `label` looked like and in which `bands`, any `labelProblem`, and whether the map `agreesWithLabel` |

## Printed-page authority

A constant offset is a candidate, never authority by itself. `--offset N` is
accepted only when the labels found on every physical page agree with it:
consistent header/footer positions, a constant `printed - physical`, and
unique, monotonic labels. A contradictory label, a numbering restart, inserted
unnumbered front matter, an ambiguous header, a missing label or otherwise
insufficient evidence refuses automatic numbering with exit 3 and names the
readings it saw. A single running head does not justify extrapolating the rest
of the document, and bare digits in prose are not page labels.

For irregular numbering, pass `--map FILE` with an explicit researcher-confirmed
physical-to-printed map covering every page, including entries that are
explicitly unnumbered (`"printed": null`). The map must declare the same schema,
be bound to the same `pdfSha256`, list each physical page once, and list printed
numbers uniquely and in increasing order. Without it the extractor refuses and
asks for one; it never invents a number, coerces a Roman or unnumbered page to
an integer, or extrapolates from a partial label set.

## The request view

`request.txt` removes only identified furniture: download banners and licences,
the page-number label lines the map identified, and the references section
(everything from a `References` heading onward) — each with its count recorded
in `omittedFromRequest`. Repeated body text is not a header and stays. The
request view exists to reduce model input; the checker must use `full.txt`, and
nothing about a check may depend on lines a filter removed.

## Recording and invalidating evidence

`--verify` re-reads the PDF and the text files and compares their SHA-256
against the sidecar. A changed PDF, an edited page map or an edited extraction
invalidates the earlier record and exits 5: re-extract and re-confirm rather
than trusting the stale map. Pages with no extractable text (scanned images, real
blank pages) are listed in `uncheckablePages` and can only be reported as
unchecked; the extractor does not infer their content, and blank pages keep
their physical index so that later pages do not shift.

## Running the quotation check

```
python3 scripts/verify-quotes.py NOTE.md --page-map PAPER.page-map.json [--out DIR]
python3 scripts/verify-quotes.py --verify QUOTE-REPORT.json
```

Run it from the plugin directory. `verify-quotes.py` reads the note and the
paper's `full.txt` (never the request view) and compares every quotation
against the physical page that the claimed printed page maps to. Only the
claimed page is searched: a quotation that really is somewhere else in the
paper fails here.

The note grammar is one form, a blockquote inside the note's `Quotations`
section:

```
## Quotations

> "A passage exactly as the page carries it." (p. 42)
```

A quotation may continue over several `>` lines; those lines are joined before
comparison. Everything else is inventoried and rejected rather than ignored: a
blockquote outside the `Quotations` section, a blockquote that is not
`> "..." (p. N)`, an inline `"..." (p. N)` inside prose, an omitted passage (an
ellipsis) and a page range (`pp. 42-43`). A note whose quotation section holds
nothing is `not checked: no quotations`, which is not a pass.

Comparison normalizes only what is typographic: NFC composition, the
typographic quotes and dashes folded onto their plain form, the `ﬁ` ligature
expanded to the letters it stands for, case folded, and the wording compared as
a contiguous sequence of words — never as a substring, never with word
boundaries squashed. Accents and letters are not folded: `café` is not `cafe`
and `naïve` is not `naive`.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Every quotation was found on the printed page it claims |
| 1 | Not a pass: a quotation was not verified, a quotation form was rejected, the inventory was empty, or the call was malformed |
| 4 | Unreadable or invalid input, including a page map whose `mapping.method` is `none` and that therefore establishes no printed pages |
| 5 | Recorded evidence changed: the note, the PDF, the page map or the full extraction is not the one that was checked |

For the fixtures this is:

```
python3 scripts/verify-quotes.py test/fixtures/literature-note/quote-notes/exact.md --page-map /tmp/paper/regular.page-map.json --out /tmp/paper
```

### The quote report

`<note-stem>.quote-check.json` is written into `--out` (default: beside the
note), for a failing check as well. Its `schema` is
`literature-note/quote-check@1`:

| Field | Meaning |
|---|---|
| `result` | `verified`, `failed` or `not-checked` |
| `noteFile`, `noteSha256`, `pdfFile`, `pdfSha256`, `extractionFile`, `extractionSha256`, `pageMapFile`, `pageMapSha256` | The exact bytes this result is bound to |
| `inventory` | `found`, `parsed`, `checked`, `rejected` |
| `quotations[]` | Per quotation: `line`, `kind`, `printed`, `physical`, `status` (`verified`, `failed` or `rejected`) and the `reason` for anything that is not verified |
| `disclaimer` | The boundary below, stored with the result |

`--verify` re-reads the note, the PDF, the full extraction and the page map and
compares their SHA-256 against the report; any change exits 5 and the note has
to be checked again. A refused run (exit 4 or 5) writes no report at all, so no
later reader mistakes a refusal for a checked result.

## The boundary of a checked quotation

```
This check covers only verbatim wording on the claimed printed page. It does not
verify paraphrase, numbers or attribution, and it does not accept a research
claim. Project relevance and transfer judgments remain [proposed] for human
review.
```

The wording is printed on every outcome and stored in the report, so a
successful check cannot be quoted without its boundary.

## What these stages do not do

They do not draft a note, do not accept a research claim, and do not touch the
canvas or the decisions log. The drafting adapter, the review loop, the
acceptance contract and the skill belong to later packages of the design: a
checked quotation is one input to a note, never a reviewed note, and neither a
successful extraction nor a verified quotation follows from, or replaces, a
human reading.
