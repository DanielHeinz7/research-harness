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

test('canvas.html reads the session token from location.hash', () => {
  assert.match(html, /location\.hash/);
});

test('canvas.html clears the token from the URL with history.replaceState', () => {
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
