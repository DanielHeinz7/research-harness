# Literature note: local extraction and printed-page map

This file documents the local extraction stage of the literature-note design
(`docs/superpowers/specs/literature-note-design.md`). It covers that design's
package 1 only: turning one local PDF into a full text, a reduced request view
and a page map that says which printed page each physical page is. The
quotation check, the drafting adapter and the skill are later packages; until
they exist nothing here establishes a checked quotation, a reviewed note or an
accepted research claim.

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

## What this stage does not do

It does not check quotations, does not draft a note, does not accept a claim and
does not touch the canvas or the decisions log. The narrow wording-only
disclaimer, the strict quotation grammar and the proposal boundary belong to the
later packages of the design and do not follow from a successful extraction.
