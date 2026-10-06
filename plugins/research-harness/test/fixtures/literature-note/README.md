# literature-note fixtures

Invented PDFs for `test/literature-extraction.test.js`. They carry no publisher
text: the journal, the authors, the references and every sentence in them were
written for these tests, and the download banner points at `example.invalid`.

`make-fixtures.py` writes them with the Python standard library only — no
third-party package, no reportlab — and `references/literature-note.md`
documents how the extractor is meant to treat each one. Regenerate them with:

```
cd plugins/research-harness/test/fixtures/literature-note
python3 make-fixtures.py
```

| Fixture | What it exercises |
|---|---|
| `regular.pdf` | Footers 41, 42, 43: a constant `printed - physical` of +40, a download banner on page 1, a References section on page 3 |
| `irregular.pdf` | Footers 41, 43, 44: no constant offset, so only a confirmed map may number it |
| `missing-label.pdf` | Page 3 carries no footer label at all |
| `ambiguous-label.pdf` | The bare volume number `12` sits beside the footer label, so one band yields two candidates |
| `blank-page.pdf` | Page 2 has an empty content stream and no text layer |
| `repeated-body.pdf` | A sentence repeated on every page as body text, with the banner and references of `regular.pdf` |

`irregular.confirmed-map.json` and `blank-page.confirmed-map.json` are the
researcher-confirmed page maps for those two fixtures: the first pairs
1→41, 2→43, 3→44, the second marks page 2 as explicitly unnumbered.
