'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'canvas.html'), 'utf8');

test('canvas.html is self-contained: no http(s) URLs other than 127.0.0.1', () => {
  const matches = html.match(/https?:\/\/[^\s"'<>)]*/g) || [];
  const offenders = matches.filter((url) => !url.startsWith('http://127.0.0.1'));
  assert.deepEqual(offenders, []);
});

test('canvas.html reads a single-use code from location.hash and trades it for the token', () => {
  assert.match(html, /location\.hash/);
  assert.match(html, /\[#&\]\)c=/);
  assert.doesNotMatch(html, /\[#&\]\)t=/, 'the URL no longer carries the token');
  assert.match(html, /'\/api\/session'/);
  assert.match(html, /This session link was already used\. Stop `serve` and start it again\./);
});

test('canvas.html keeps the token in memory only', () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('canvas.html clears the code from the URL with history.replaceState', () => {
  assert.match(html, /history\.replaceState/);
});

test('canvas.html supports fixture mode via the fixture query param', () => {
  assert.match(html, /fixture/);
  assert.match(html, /location\.search/);
});

test('canvas.html sends the harness token and JSON content type on writes', () => {
  assert.match(html, /X-Harness-Token/);
  assert.match(html, /application\/json/);
});

test('canvas.html opens on the poster: the initial view is "poster" and the poster section is rendered', () => {
  assert.match(html, /var activeView = 'poster';/);
  assert.match(html, /<section id="poster" data-view="poster"/);
  assert.match(html, /tabButton\('poster', 'Poster'\)/);
});

test('canvas.html gives a poster card a "to talk about" line that opens that field in the To talk about tab', () => {
  assert.match(html, /data-view-target="agenda" data-scroll-to="agenda-field-/);
  assert.match(html, /id="agenda-field-'/);
});

test('canvas.html shows the paper title once: the top bar carries no title', () => {
  assert.doesNotMatch(html, /project-name|project-tag/);
  assert.equal((html.match(/esc\(paperTitle\(/g) || []).length, 1);
});

// The entry-body functions are pure; lift them out of the page's script so
// the rendered text can be checked without a browser.
function lift(names) {
  const src = names.map((name) => {
    const from = html.indexOf(`  function ${name}(`);
    assert.notEqual(from, -1, `${name} is in canvas.html`);
    return html.slice(from, html.indexOf('\n  }\n', from) + 4);
  }).join('\n');
  const labelDecl = html.match(/  var ENTRY_LABEL = .*;\n/)[0];
  return new Function(`${labelDecl}${src}\nreturn { ${names.join(', ')} };`)();
}

const { renderEntryBody } = lift(['esc', 'parseFindingBody', 'renderEntryBody']);
const viewState = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'view-state.json'), 'utf8'));

function visibleText(markup) {
  return markup.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

test('a DECISION with a why renders its text, a superscript page and a quiet Why line, no raw markup', () => {
  const entry = viewState.decisions.find((d) => d.kind === 'DECISION' && /src:/.test(d.body) && /\*\*Why:\*\*/.test(d.body));
  assert.ok(entry, 'the fixture holds a sealed DECISION with a src and a why');
  const markup = renderEntryBody(entry.body);
  const text = visibleText(markup);
  assert.doesNotMatch(text, /\*\*/);
  assert.doesNotMatch(text, /\[accepted/);
  assert.doesNotMatch(text, /src:/);
  assert.match(markup, /<sup class="src-ref">p\. 1706<\/sup>/);
  assert.match(markup, /<span class="entry-note">Why: The study starts from the phenomenon, not from a gap\.<\/span>/);
  assert.ok(text.startsWith('How can we understand how members'));
});

test('a DISCOVERY with a why renders its text and a quiet Why line, no asterisks', () => {
  const entry = viewState.decisions.find((d) => d.kind === 'DISCOVERY' && /\*\*Why:\*\*/.test(d.body));
  assert.ok(entry, 'the fixture holds a DISCOVERY with a why');
  const markup = renderEntryBody(entry.body);
  assert.doesNotMatch(visibleText(markup), /\*\*/);
  assert.match(markup, /<span class="entry-note">Why: The puzzle may hold for only one group\.<\/span>/);
  assert.equal(visibleText(markup).split(' Why:')[0], 'Ask whether the twelve meetings cover more than one team.');
});

test('no fixture entry renders a raw label or an accepted marker, and Rejected and Supersedes read as quiet lines too', () => {
  for (const d of viewState.decisions) {
    const text = visibleText(renderEntryBody(d.body));
    assert.doesNotMatch(text, /\*\*/, `#${d.seq}`);
    assert.doesNotMatch(text, /\[accepted/, `#${d.seq}`);
  }
  const markup = renderEntryBody('Text. [accepted]\n**Why:** because\nit is so\n**Rejected:** other\n**Supersedes:** #2');
  assert.match(markup, /Why: because it is so<\/span>/);
  assert.match(markup, /Rejected: other<\/span>/);
  assert.match(markup, /Supersedes: #2<\/span>/);
  assert.equal(visibleText(markup).split(' Why:')[0], 'Text.');
});

test('History, To talk about and the element view all render an entry body through renderEntryBody', () => {
  assert.equal((html.match(/renderEntryBody\(d\.body\)/g) || []).length, 3);
  assert.equal((html.match(/parseFindingBody\(/g) || []).length, 2, 'declared once, called once (by renderEntryBody)');
});
