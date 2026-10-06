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

// Optional browser coverage uses the same locally supplied Playwright as the
// screenshot script; the plugin and its ordinary Node tests need no browser.
let chromium;
try { ({ chromium } = require('playwright')); } catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

function luminance(rgb) {
  const channels = rgb.map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const levels = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (levels[0] + 0.05) / (levels[1] + 0.05);
}

// Shrinking a role, restoring the old muted ink or losing the poster's
// viewport-height grid must fail on the rendered showcase, not a CSS grep.
test('the rendered session view scales for projectors and keeps text contrast above 7:1', { skip: !chromium, timeout: 120000 }, async (t) => {
  let browser;
  try { browser = await chromium.launch(); } catch (err) {
    if (!/Executable doesn't exist/.test(err.message)) throw err;
    browser = await chromium.launch({ channel: 'chromium' });
  }
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://session.test/**', (route) => route.fulfill({
    contentType: route.request().url().endsWith('fixture.json') ? 'application/json' : 'text/html',
    body: route.request().url().endsWith('fixture.json') ? JSON.stringify(state) : html,
  }));
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const view of ['poster', 'compare', 'agenda', 'log', 'element-3']) {
        await page.goto(`http://session.test/?fixture=/fixture.json&view=${view}`);
        await page.waitForSelector('section[data-view].active');
        const metrics = await page.evaluate(() => {
          const active = document.querySelector('section[data-view].active');
          const nodes = [active, ...active.querySelectorAll('*'), ...document.querySelectorAll('#topbar *, #rail *')]
            .filter((node) => node.getClientRects().length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()));
          const sizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize));
          const tokens = getComputedStyle(document.documentElement);
          const rgb = (name) => tokens.getPropertyValue(name).trim().match(/[a-f\d]{2}/gi).map((hex) => parseInt(hex, 16));
          const stage = document.querySelector('#stage');
          return {
            minimum: Math.min(...sizes), body: parseFloat(getComputedStyle(document.querySelector('.field-lead')).fontSize),
            label: parseFloat(getComputedStyle(document.querySelector('.status-label')).fontSize),
            colors: Object.fromEntries(['--bg', '--surface', '--ink', '--ink-soft', '--action', '--action-ink', '--action-hover', '--icon-grad-start', '--accent-surface', '--accent-ink', '--suggestion-ink'].map((name) => [name, rgb(name)])),
            stageHeight: stage.clientHeight, stageContent: stage.scrollHeight,
            posterBottom: document.querySelector('.poster-grid').getBoundingClientRect().bottom,
          };
        });
        assert.ok(metrics.minimum >= 14, `${colorScheme} ${width} ${view}: smallest visible text is ${metrics.minimum}px`);
        for (const ink of ['--ink', '--ink-soft', '--action', '--suggestion-ink']) {
          for (const bg of ['--bg', '--surface']) {
            assert.ok(contrast(metrics.colors[ink], metrics.colors[bg]) >= 7, `${colorScheme}: ${ink} on ${bg} meets 7:1`);
          }
        }
        for (const bg of ['--action', '--action-hover', '--icon-grad-start']) {
          assert.ok(contrast(metrics.colors['--action-ink'], metrics.colors[bg]) >= 7, `${colorScheme}: badge/action text on ${bg} meets 7:1`);
        }
        assert.ok(contrast(metrics.colors['--accent-ink'], metrics.colors['--accent-surface']) >= 7);
        if (view === 'poster' && width >= 1440) {
          assert.ok(metrics.stageContent <= metrics.stageHeight + 1, `${width}: poster fits without scrolling (${metrics.stageContent}/${metrics.stageHeight}, bottom ${metrics.posterBottom})`);
          assert.ok(metrics.posterBottom >= height - 40, `${width}: poster fills the viewport`);
        }
        if (width === 1920) assert.ok(metrics.body >= 18, '1920px body reaches the projector floor');
        t.diagnostic(`${colorScheme} ${width} ${view}: body=${metrics.body}px label=${metrics.label}px min=${metrics.minimum}px`);
      }
    }
  }
});

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
