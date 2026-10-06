'use strict';

// The session view rendered from docs/media/showcase-state.json — the state file
// the README screenshots and the video's UI scenes are captured from (SQ-223).
// The page script runs against the same stub document as view.test.js, in
// fixture mode, so a schema change that would leave a screenshot blank or on the
// error path fails here instead. The file itself is generated, never hand-written:
// see docs/media/README.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'canvas.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'media', 'showcase-state.json'), 'utf8'));
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function stubNode() {
  const listeners = {};
  return {
    listeners,
    innerHTML: '',
    textContent: '',
    hidden: false,
    open: false,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    showModal() { this.open = true; },
    close() { this.open = false; (listeners.close || []).forEach((fn) => fn()); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

// view.test.js's mount(), reduced to what this file checks: the page loads the
// state through `?fixture=` and the given `?view=`.
async function mount(query) {
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = stubNode());
  // The notice bar carries the `hidden` attribute in the markup; showNotice is
  // what lifts it.
  node('notice').hidden = true;
  const fetchStub = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(state) });
  const documentStub = { getElementById: (id) => (id === 'body-shell' ? null : node(id)) };
  const location = { search: `?fixture=/fixture.json${query}`, hash: '', pathname: '/' };
  const historyStub = { replaceState(_state, _title, url) {
    const replaced = new URL(url, 'http://127.0.0.1');
    location.hash = replaced.hash;
    location.search = replaced.search;
  } };
  new Function('document', 'location', 'history', 'fetch', script)(documentStub, location, historyStub, fetchStub);
  await settle();
  return { app: node('app'), notice: node('notice'), noticeText: node('notice-text') };
}

const statements = state.elements.flatMap((e) => e.questions.flatMap((q) => q.statements));

test('the showcase state holds what the session view renders, in the schema it reads', () => {
  assert.equal(state.project, 'ai-assistants-interviews');
  assert.equal(state.elements.length, 9, 'nine fields');
  assert.equal(state.variants.length, 3, 'three framings to compare');
  assert.ok(state.decisions.some((d) => d.ref === 'framing chosen: trust'), 'one framing is chosen');
  for (const marker of ['accepted', 'proposed', 'stated']) {
    assert.ok(statements.some((s) => s.marker === marker), `a [${marker}] statement`);
  }
  assert.ok(state.agenda.fields.length > 0, 'something to talk about');
  assert.deepEqual([...new Set(state.decisions.map((d) => d.by))].sort(), ['A. Author', 'B. Supervisor']);
  assert.equal(state.review.ledger.status, 'verified', 'no broken ledger banner over the showcase');
});

for (const [label, view, query] of [
  ['the poster', 'poster', ''],
  ['History', 'log', '&view=log'],
  ['To talk about', 'agenda', '&view=agenda'],
]) {
  test(`the showcase state renders on ${label} without the error or notice path`, async () => {
    const page = await mount(query);
    assert.doesNotMatch(page.app.innerHTML, /Could not load the canvas/);
    assert.doesNotMatch(page.app.innerHTML, /role="alert"/);
    assert.doesNotMatch(page.app.innerHTML, /notices-banner/);
    assert.equal(page.notice.hidden, true, 'no notices banner was shown');
    assert.equal(page.noticeText.textContent, '');
    assert.match(page.app.innerHTML, new RegExp(`<section id="${view}"`), 'the view itself rendered');
  });
}

test('the poster carries the paper title and the History both names', async () => {
  const poster = await mount('');
  assert.match(poster.app.innerHTML, /How senior developers decide whether to rely on an AI assistant/);
  const log = await mount('&view=log');
  assert.match(log.app.innerHTML, /A\. Author/);
  assert.match(log.app.innerHTML, /B\. Supervisor/);
});
