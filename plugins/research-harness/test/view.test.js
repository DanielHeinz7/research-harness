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
