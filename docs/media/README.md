# Media

## showcase-state.json

One canvas as the session view reads it, so the README's pictures and the video's
UI scenes can be captured from the same state. The file is the view's own answer
to `GET /api/state` (`viewState` in `plugins/research-harness/bin/canvas-serve.js`),
not hand-written state: a walkthrough project, read after `trust` was chosen as
the framing, `1.1` accepted, `3.1` stated through the same function the view's
`POST /api/stated` calls, the check question on `3.1` still open, and a
supervision session started under a second name. It is built with the
walkthrough's own steps — `examples/ai-assistants-interviews/recorded.js` plus
`init`, `choose`, `log`, `accept`, `session start` and `name` — the same pattern
`plugins/research-harness/test/fixtures/make-variants-fixtures.js` follows.

`plugins/research-harness/test/showcase-state.test.js` loads the file through the
fixture path of the view (`?fixture=`) and fails when a schema change would leave
a screenshot on the view's error path.

The state carries no glossary: `canvasState` calls `mechanicalReview` without the
glossary text, so no glossary entry reaches the view, and the view renders none.

### Where the content comes from

The canvas texts and every `src: Interview_Pnn.md` citation are the walkthrough's,
drawn from the interviews of Hristova, M. Y., Gala Scaramuzza, R., Popovici,
C.-E., Burelli, P., & Tell, P. *Understanding AI Assistance in Professional
Software Engineering: An Interview Study of Development Practices and Workflows.*
PROFES 2026 (paper); replication package *Understanding AI Assistance in
Professional Software Engineering - Replication Package*, IT University of
Copenhagen, Zenodo, 2026-09-22, <https://doi.org/10.5281/zenodo.22893731>, under
CC BY 4.0. Cite the paper and the record as
[`examples/ai-assistants-interviews/README.md`](../../examples/ai-assistants-interviews/README.md)
asks; the demo's canvases are an illustration of the tool, not the authors'
framing of their study. The people in the state (`A. Author`, `B. Supervisor`)
are invented.

## Capturing a screenshot

```console
$ node scripts/capture-session-view.js --view log --out shot.png
wrote …/shot.png (1440x900, 184144 bytes)
```

The script serves `plugins/research-harness/dashboard/canvas.html` and this state
on a free localhost port, opens the page in fixture mode and screenshots the
viewport with Playwright Chromium. It prints the path and the size of the file it
wrote:

| Option | |
|---|---|
| `--view <name>` | `poster` (default), `compare`, `agenda`, `log`, `element-<n>` |
| `--width`, `--height` | viewport in pixels, default 1440x900 for the README; 1920x1080 for video stills |
| `--out <file>` | PNG to write, default `session-view.png` in the current directory |
| `--dark` | render the session view in its dark colour scheme |

Playwright is not a dependency of the plugin — only this script needs it. Install
it where Node can resolve it from the repository, then run the script from
anywhere in the repository:

```console
$ npm i --no-save playwright && npx playwright install chromium
```

Screenshots are not committed.
