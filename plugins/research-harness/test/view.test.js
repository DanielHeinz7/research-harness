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

test('canvas.html takes the dependency graph from the state, not from a copy of a profile', () => {
  assert.doesNotMatch(html, /PROFILE_GRAPHS/);
  assert.doesNotMatch(html, /'is-qualitative':\s*\{/);
  assert.match(html, /s\.graph/);
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

const { renderEntryBody } = lift(['esc', 'parseFindingBody', 'renderEntryBody', 'seqLinks']);
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

test('an entry body shows Explained as a quiet line and Open at acceptance as #seq links into History', () => {
  const markup = renderEntryBody('Speaking frequency is well documented. [accepted]\n**Why:** gap\n**Explained:** Earlier work counts who speaks,\nnot whether a proposal is taken up.\n**Open at acceptance:** #4, #7');
  assert.match(markup, /<span class="entry-note">Explained: Earlier work counts who speaks, not whether a proposal is taken up\.<\/span>/);
  assert.match(markup, /Open at acceptance: <button type="button" class="seq-link" data-view-target="log" data-scroll-to="entry-4">#4<\/button>, <button type="button" class="seq-link" data-view-target="log" data-scroll-to="entry-7">#7<\/button><\/span>/);
  assert.doesNotMatch(visibleText(markup), /\*\*/);
});

test('an entry body never reads its first line as a label, like the library', () => {
  const markup = renderEntryBody('**Explained:** I said so\n**Why:** real');
  assert.ok(visibleText(markup).startsWith('**Explained:** I said so'), 'the first line is the text');
  assert.match(markup, /Why: real<\/span>/);
  assert.doesNotMatch(markup, /entry-note">Explained/);
  assert.doesNotMatch(renderEntryBody('Text.\n  **Explained:** indented is text, not a label'), /entry-note">Explained/);
});

// The page script runs here against a stub document, so what the view renders
// and sends is checked without a browser. Nothing is stubbed that the page
// decides: the stubs only hold what it writes into them and record its fetches.
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
const variantsState = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'view-state-variants.json'), 'utf8'));
const chosenState = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'view-state-chosen.json'), 'utf8'));
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
    querySelectorAll() { return []; },
  };
}

// `routes` maps a URL to a state, or to a function of the request returning
// `{ status, body }`. `mode` 'fixture' loads the state from `?fixture=`;
// 'live' trades the code in the hash for the token 'T' first.
async function mount({ state, query = '', mode = 'fixture', routes = {} }) {
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = stubNode());
  const errorBox = { textContent: '' };
  node('dlg').querySelector = (selector) => (selector === '.dlg-error' ? errorBox : null);
  // The notice bar carries the `hidden` attribute in the markup; showNotice is
  // what lifts it.
  node('notice').hidden = true;
  const calls = [];
  const all = { '/fixture.json': state, '/api/state': state, '/api/session': { ok: true, token: 'T' }, ...routes };
  const fetchStub = (url, opts) => {
    calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
    const route = all[url];
    const res = typeof route === 'function' ? route(opts) : { status: route ? 200 : 404, body: route };
    return Promise.resolve({ ok: res.status < 400, status: res.status, json: () => Promise.resolve(res.body) });
  };
  const documentStub = { getElementById: (id) => (id === 'body-shell' ? null : node(id)) };
  const location = mode === 'fixture'
    ? { search: `?fixture=/fixture.json${query}`, hash: '', pathname: '/' }
    : { search: '', hash: '#c=abc123', pathname: '/' };
  new Function('document', 'location', 'history', 'fetch', script)(documentStub, location, { replaceState() {} }, fetchStub);
  await settle();
  const app = node('app');
  const dlg = node('dlg');
  return {
    app,
    dlg,
    errorBox,
    notice: node('notice'),
    noticeText: node('notice-text'),
    calls,
    writes: () => calls.filter((c) => c.opts && c.opts.method === 'POST' && c.url !== '/api/session'),
    click(attrs) {
      const btn = { getAttribute: (name) => (name in attrs ? attrs[name] : null) };
      app.listeners.click[0]({ target: { closest: (selector) => (selector === 'button[data-action]' ? btn : null) } });
    },
    async submit(values) {
      const elements = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }]));
      dlg.listeners.submit[0]({ preventDefault() {}, target: { elements } });
      await settle();
    },
  };
}

const statementIn = (state, id, marker) => state.elements.flatMap((e) => e.questions).find((q) => q.id === id).statements.find((s) => s.marker === marker);

test('Framings: one column per variant, headed by name and lens, with differing fields marked and identical ones faded', async () => {
  const page = await mount({ state: variantsState, query: '&view=compare' });
  const markup = page.app.innerHTML;
  assert.match(markup, /data-view-target="compare"[^>]*>Framings</, 'the tab exists while the project holds variants');
  assert.match(markup, /--k:3/);
  for (const v of variantsState.variants) {
    assert.match(markup, new RegExp(`<h3 class="cmp-name">${v.name}</h3><p class="cmp-lens">Lens: ${v.lens.replace(/"/g, '&quot;')}</p>`));
  }
  // The fixture's variants share fields 1, 5, 8 and 9 and word 2, 3, 4, 6 and 7
  // differently (7 is filled in one variant only): 4 rows faded, 5 marked.
  assert.equal((markup.match(/class="field-card cmp-card cmp-same"/g) || []).length, 4 * 3);
  assert.equal((markup.match(/class="field-card cmp-card cmp-diff"/g) || []).length, 5 * 3);
  assert.equal((markup.match(/<span class="diff-tag" aria-hidden="true">Differs<\/span>/g) || []).length, 5 * 3);
  assert.match(markup, /What puzzles us\?<span class="cmp-row-caption">&middot; the same in every framing<\/span>/);
  assert.match(markup, /Who cares, and what do they already know\?<span class="cmp-row-caption">&middot; differs between framings<\/span>/);
  // A card leads with one sentence and keeps the rest of the field one click away.
  assert.match(markup, /<summary>All 3 statements/);
});

test('Framings: a field differs when any statement in it differs, not only the lead', () => {
  const { fieldDiffers } = lift(['variantElement', 'fieldSignature', 'fieldDiffers']);
  const element = (texts) => ({ number: 1, questions: [{ id: '1.1', statements: texts.map((text) => ({ text })) }] });
  const variant = (texts) => ({ state: { elements: [element(texts)] } });
  assert.equal(fieldDiffers([variant(['A', 'B']), variant(['A', 'B'])], 1), false);
  assert.equal(fieldDiffers([variant(['A', 'B']), variant(['A', 'C'])], 1), true, 'the second statement differs under the same lead');
  assert.equal(fieldDiffers([variant(['A']), variant([])], 1), true, 'answered in one, empty in the other');
  assert.equal(fieldDiffers([variant(['A  b']), variant(['A b'])], 1), false, 'whitespace is not a difference');
});

test('Framings: choosing is disabled with a one-line reason while the main canvas holds an accepted or stated statement', async () => {
  const open = await mount({ state: variantsState, query: '&view=compare' });
  assert.doesNotMatch(open.app.innerHTML, /choose-note/);
  assert.equal((open.app.innerHTML.match(/data-action="choose" data-variant="[a-z-]+">/g) || []).length, 3, 'all three buttons are enabled');

  const accepted = await mount({ state: chosenState, query: '&view=compare' });
  assert.equal((accepted.app.innerHTML.match(/data-action="choose" data-variant="[a-z-]+" disabled aria-describedby="choose-note">/g) || []).length, 3);
  assert.match(accepted.app.innerHTML, /<p class="choose-note" id="choose-note">Choosing is off: the main canvas already holds 1 accepted \(1\.2\)\. A framing is chosen before anything is accepted\.<\/p>/);

  // A [stated] statement blocks too (US-3 story log #3), and is named.
  const stated = JSON.parse(JSON.stringify(variantsState));
  statementIn(stated, '1.2', 'tentative').marker = 'stated';
  const said = await mount({ state: stated, query: '&view=compare' });
  assert.match(said.app.innerHTML, /holds 1 said by the authors \(1\.2\)\. A choice would replace what the authors said\./);
  assert.match(said.app.innerHTML, /data-variant="power" disabled/);
});

test('Choose dialog: rejected is prefilled with the other variants and their lenses, the reason is required, and the POST carries both', async () => {
  const page = await mount({
    state: variantsState,
    mode: 'live',
    routes: { '/api/choose': () => ({ status: 200, body: { ok: true } }) },
  });
  page.click({ 'data-action': 'choose', 'data-variant': 'power' });
  assert.equal(page.dlg.open, true);
  assert.match(page.dlg.innerHTML, /Choose the &ldquo;power&rdquo; framing/);
  const prefill = 'rituals (lens: meeting routines and turn-taking); sense-making (lens: collective sense-making: &quot;who hears whom&quot;)';
  assert.ok(page.dlg.innerHTML.includes(`<textarea name="rejected" rows="3">${prefill}</textarea>`));
  assert.match(page.dlg.innerHTML, /<button type="submit" class="action-btn action-btn-primary">Choose this framing<\/button>/);

  await page.submit({ why: '  ', rejected: 'x' });
  assert.match(page.errorBox.textContent, /Say why you choose this framing/);
  assert.equal(page.writes().length, 0, 'an empty reason sends nothing');

  const rejected = 'rituals (lens: meeting routines and turn-taking); sense-making';
  await page.submit({ why: ' Rank is recorded for every meeting. ', rejected });
  const [sent] = page.writes();
  assert.equal(sent.url, '/api/choose');
  assert.equal(sent.opts.headers['X-Harness-Token'], 'T');
  assert.deepEqual(sent.body, { name: 'power', why: 'Rank is recorded for every meeting.', rejected });
  assert.equal(page.dlg.open, false, 'the dialog closes on success');
  assert.equal(page.calls.filter((c) => c.url === '/api/state').length, 2, 'the view reloads the state after a choice');
});

test('Choose dialog: an empty rejected is left out so the server applies its default, and a refusal is shown inside the dialog', async () => {
  const refusal = 'The main canvas already holds 1 [stated] statement, which choosing a framing would delete: 1.2 "Speaking frequency is well documented".';
  const page = await mount({
    state: variantsState,
    mode: 'live',
    routes: { '/api/choose': () => ({ status: 422, body: { ok: false, code: 'already', error: refusal } }) },
  });
  page.click({ 'data-action': 'choose', 'data-variant': 'rituals' });
  await page.submit({ why: 'Routines decide who can propose.', rejected: '   ' });
  assert.deepEqual(page.writes()[0].body, { name: 'rituals', why: 'Routines decide who can propose.' });
  assert.equal(page.errorBox.textContent, refusal, "the server's own message, unchanged");
  assert.equal(page.dlg.open, true, 'the dialog stays open, the typed text with it');
});

test('Accept dialog: the explanation is required, open checks are listed with their #seq, and the button says Accept anyway', async () => {
  const page = await mount({
    state: variantsState,
    mode: 'live',
    routes: { '/api/accept': () => ({ status: 200, body: { ok: true } }) },
  });
  const tentative = statementIn(variantsState, '1.2', 'tentative');
  page.click({ 'data-action': 'accept', 'data-question': '1.2', 'data-hash': tentative.hash });
  const dialogMarkup = page.dlg.innerHTML;
  assert.match(dialogMarkup, /In your own words, why does this hold\?/);
  assert.match(dialogMarkup, /<blockquote class="dlg-quote">Speaking frequency is well documented; whether a proposal is taken up is not\.<\/blockquote>/);
  assert.doesNotMatch(dialogMarkup, /contenteditable/);
  assert.match(dialogMarkup, /<span class="seq">#1<\/span>Does the twelve-meeting corpus hold enough proposals/);
  assert.match(dialogMarkup, /<span class="seq">#2<\/span>Which source says speaking frequency is &quot;well documented&quot;/);
  assert.match(dialogMarkup, />Accept anyway<\/button>/);
  assert.ok(dialogMarkup.indexOf('dlg-checks') < dialogMarkup.indexOf('dlg-actions'), 'the open checks sit above the buttons');

  await page.submit({ explained: '   ', why: '' });
  assert.match(page.errorBox.textContent, /Say in your own words why this holds/);
  assert.equal(page.writes().length, 0, 'a blank explanation sends nothing');

  await page.submit({ explained: ' The fieldnotes show it. ', why: 'the gap' });
  assert.deepEqual(page.writes().map((c) => [c.url, c.body]), [['/api/accept', {
    questionId: '1.2',
    expectedHash: tentative.hash,
    explained: 'The fieldnotes show it.',
    why: 'the gap',
  }]]);
  assert.equal(page.dlg.open, false);
});

test('Accept dialog: without open checks the button reads Accept and no check section is shown', async () => {
  const page = await mount({ state: variantsState, mode: 'live' });
  page.click({ 'data-action': 'accept', 'data-question': '1.1', 'data-hash': statementIn(variantsState, '1.1', 'proposed').hash });
  assert.match(page.dlg.innerHTML, />Accept<\/button>/);
  assert.doesNotMatch(page.dlg.innerHTML, /Accept anyway|dlg-checks/);
});

test('Accept dialog: a refusal of the explanation is shown inside the dialog and a stale statement reloads the state', async () => {
  const tentative = statementIn(variantsState, '1.2', 'tentative');
  const refusal = 'An explanation cannot hold a line that starts with **Why:**.';
  let answer = { status: 422, body: { ok: false, code: 'invalid', error: refusal } };
  const page = await mount({ state: variantsState, mode: 'live', routes: { '/api/accept': () => answer } });
  page.click({ 'data-action': 'accept', 'data-question': '1.2', 'data-hash': tentative.hash });
  await page.submit({ explained: 'text', why: '' });
  assert.equal(page.errorBox.textContent, refusal);
  assert.equal(page.dlg.open, true);
  answer = { status: 409, body: { ok: false, code: 'stale', error: 'stale' } };
  await page.submit({ explained: 'text', why: '' });
  assert.equal(page.dlg.open, false);
  assert.equal(page.calls.filter((c) => c.url === '/api/state').length, 2, 'the stale answer reloads the state');
});

// SQ-170: the accept is written, the dialog closes, and only the reload of the
// state fails. The dialog error box is not on screen any more, so the failure
// has to land in the notice bar or the researcher sees a stale canvas and no
// reason for it.
test('Accept dialog: a reload that fails after the write shows the notice bar, not a hidden dialog error', async () => {
  const tentative = statementIn(variantsState, '1.2', 'tentative');
  let answered = 0;
  const page = await mount({
    state: variantsState,
    mode: 'live',
    routes: {
      '/api/state': () => {
        answered += 1;
        return answered === 1 ? { status: 200, body: variantsState } : { status: 500, body: { ok: false, error: 'boom' } };
      },
      '/api/accept': () => ({ status: 200, body: { ok: true } }),
    },
  });
  page.click({ 'data-action': 'accept', 'data-question': '1.2', 'data-hash': tentative.hash });
  await page.submit({ explained: 'The fieldnotes show it.', why: '' });

  assert.deepEqual(page.writes().map((c) => c.url), ['/api/accept'], 'the accept went through');
  assert.equal(page.dlg.open, false, 'the dialog stayed closed: the accept is recorded');
  assert.equal(page.calls.filter((c) => c.url === '/api/state').length, 2, 'the second state call is the reload that failed');
  assert.equal(page.errorBox.textContent, '', 'nothing is written into the closed dialog');
  assert.equal(page.notice.hidden, false, 'the notice bar is visible');
  assert.match(page.noticeText.textContent, /failed to load state \(500\)/);
});

test('Accept dialog: a failure while the dialog is still open stays inside the dialog', async () => {
  const tentative = statementIn(variantsState, '1.2', 'tentative');
  const page = await mount({
    state: variantsState,
    mode: 'live',
    routes: { '/api/accept': () => ({ status: 500, body: { ok: false } }) },
  });
  page.click({ 'data-action': 'accept', 'data-question': '1.2', 'data-hash': tentative.hash });
  await page.submit({ explained: 'The fieldnotes show it.', why: '' });
  assert.equal(page.dlg.open, true, 'the dialog stays open so the typed text survives');
  assert.equal(page.errorBox.textContent, 'Request failed (500).');
  assert.equal(page.noticeText.textContent, '', 'the notice bar stays quiet while the dialog can speak');
});

test('fixture mode opens a view or a dialog from the URL, and its confirm button writes nothing', async () => {
  const accept = await mount({ state: variantsState, query: '&dialog=accept:1.2' });
  assert.equal(accept.dlg.open, true);
  assert.match(accept.dlg.innerHTML, /Accept anyway/);
  await accept.submit({ explained: 'because', why: '' });
  assert.equal(accept.errorBox.textContent, 'Fixture mode: nothing is written.');
  assert.equal(accept.writes().length, 0);

  const choose = await mount({ state: variantsState, query: '&view=compare&dialog=choose:sense-making' });
  assert.match(choose.dlg.innerHTML, /Choose the &ldquo;sense-making&rdquo; framing/);
  assert.equal(choose.writes().length, 0);
});

test('History shows the framing choice and the explained accept with #seq links that land on their entries', async () => {
  const page = await mount({ state: chosenState, query: '&view=log' });
  const markup = page.app.innerHTML;
  assert.match(markup, /<li class="history-card" id="entry-3" tabindex="-1"><p class="history-meta">#3 &middot; Framing chosen &middot; \d{4}-\d{2}-\d{2} &middot; power &middot; verified<\/p>/);
  assert.match(markup, /Framing power \(lens: power and hierarchy\) chosen; its statements are copied into the main canvas\.<span class="entry-note">Why: Every one of the twelve meetings records rank/);
  assert.match(markup, /<span class="entry-note">Rejected: rituals \(lens: meeting routines and turn-taking\); sense-making/);
  assert.match(markup, /<li class="history-card" id="entry-4" tabindex="-1"><p class="history-meta">#4 &middot; Decision &middot; \d{4}-\d{2}-\d{2} &middot; What puzzles us\? &middot; verified<\/p>/);
  assert.match(markup, /<span class="entry-note">Explained: Earlier work counts who speaks/);
  assert.match(markup, /Open at acceptance: <button[^>]*data-scroll-to="entry-1">#1<\/button>, <button[^>]*data-scroll-to="entry-2">#2<\/button>/);
  for (const id of ['entry-1', 'entry-2']) assert.ok(markup.includes(`id="${id}"`), `${id} exists for the link to land on`);
  assert.doesNotMatch(markup.replace(/<[^>]*>/g, ' '), /\*\*/, 'no raw label survives in any view');
});

// SQ-139 (F6 of SQ-132): the state already says which entries verify; the view
// has to say it too, or a forged `framing chosen` reads like the researcher's own.
const brokenState = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'view-state-broken.json'), 'utf8'));
const cardOf = (markup, seq) => markup.match(new RegExp(`<li class="history-card" id="entry-${seq}"[\\s\\S]*?</li>`))[0];

test('History: a DECISION that does not verify carries a visible "does not verify" marker, and the ledger banner names where it breaks', async () => {
  assert.deepEqual(brokenState.decisions.map((d) => d.sealStatus), ['verified', 'verified', 'broken'], 'the fixture is a real broken log');
  const page = await mount({ state: brokenState, query: '&view=log' });
  const markup = page.app.innerHTML;

  const forged = cardOf(markup, 3);
  assert.match(forged, /#3 &middot; Framing chosen &middot; \d{4}-\d{2}-\d{2} &middot; power &middot; broken<\/p>/, 'the status word sits in the quiet meta line');
  assert.match(forged, /<p class="seal-flag" role="note"><span aria-hidden="true">&#9888;<\/span> Does not verify: the log breaks here: its own heading or body changed\.<\/p>/);
  assert.match(visibleText(forged), /Does not verify/, 'the marker is text, not only colour');

  assert.match(markup, /<div class="notices-banner" role="alert"><p>Decision log: does not verify\. It breaks at <button type="button" class="seq-link" data-view-target="log" data-scroll-to="entry-3">#3<\/button> \(its own heading or body changed\)\./);
});

test('History: a verified entry renders its status word and no marker, and a verified log has no banner', async () => {
  const broken = await mount({ state: brokenState, query: '&view=log' });
  for (const seq of [1, 2]) {
    const card = cardOf(broken.app.innerHTML, seq);
    assert.match(card, /&middot; verified<\/p>/);
    assert.doesNotMatch(card, /seal-flag|does not verify/i);
  }
  const chosen = await mount({ state: chosenState, query: '&view=log' });
  assert.doesNotMatch(chosen.app.innerHTML, /seal-flag|does not verify|notices-banner/i, 'a verified DECISION (framing or accept) is marked nowhere');
  assert.match(cardOf(chosen.app.innerHTML, 4), /#4 &middot; Decision &middot; \d{4}-\d{2}-\d{2} &middot; What puzzles us\? &middot; verified<\/p>/);
});

test('History: a legacy or unverifiable DECISION is marked too, a legacy DISCOVERY only names its status, and there is no banner without a break', async () => {
  const state = JSON.parse(JSON.stringify(chosenState));
  state.decisions[0].sealStatus = 'legacy';
  state.decisions[2].sealStatus = 'unverifiable';
  const page = await mount({ state, query: '&view=log' });
  const markup = page.app.innerHTML;
  assert.match(cardOf(markup, 1), /&middot; legacy \(no seal\)<\/p>/);
  assert.doesNotMatch(cardOf(markup, 1), /seal-flag/);
  assert.match(cardOf(markup, 3), /&middot; unverifiable here<\/p><p class="seal-flag"[^>]*><span aria-hidden="true">&#9888;<\/span> Does not verify: it cannot be checked on this machine\.<\/p>/);
  assert.doesNotMatch(markup, /notices-banner/);
  // A state from before the view read seal status shows nothing extra.
  const older = JSON.parse(JSON.stringify(chosenState));
  older.decisions.forEach((d) => { delete d.sealStatus; });
  delete older.review;
  const plain = await mount({ state: older, query: '&view=log' });
  assert.doesNotMatch(plain.app.innerHTML, /seal-flag|notices-banner|&middot; verified/);
});

test('statement text is never editable in the view, and a state without variants shows no Framings tab', async () => {
  const page = await mount({ state: variantsState, query: '&view=compare' });
  assert.doesNotMatch(page.app.innerHTML, /<textarea|contenteditable|<input/);
  assert.doesNotMatch(html, /contenteditable/);
  const plain = await mount({ state: viewState, query: '&view=compare' });
  assert.doesNotMatch(plain.app.innerHTML, /data-view-target="compare"|id="compare"/, 'an older or variant-free state has no comparison');
  assert.match(plain.app.innerHTML, /id="poster"/);
});

test('canvas.html reads By as an entry field, so it is never shown as raw body text', () => {
  assert.match(html, /ENTRY_LABEL = \/\^\\\*\\\*\(By\|Why\|/);
});
