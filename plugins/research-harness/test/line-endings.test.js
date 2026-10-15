'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const lineEndings = require('../hooks/lib/line-endings');
const canvas = require('../hooks/lib/canvas');
const glossary = require('../hooks/lib/glossary');
const decisions = require('../hooks/lib/decisions');
const seal = require('../hooks/lib/seal');

const crlf = (s) => s.replace(/\n/g, '\r\n');
const CANVAS = fs.readFileSync(path.join(__dirname, 'fixtures', 'constant-checking', 'research', 'canvas.md'), 'utf8');

function sealedLog(key) {
  let log = decisions.header('crlf');
  for (const [seq, body] of [[1, 'First finding.'], [2, 'Second finding.']]) {
    const { text } = seal.sealEntry(seal.lastSealOf(log), { seq, date: '2026-10-15', kind: 'DISCOVERY', ref: '1.1 check', body, by: 'A' }, key);
    log += decisions.separatorAfter(log) + text;
  }
  return log;
}

test('firstCrlfLine names the first CR LF line and ignores a lone CR', () => {
  assert.equal(lineEndings.firstCrlfLine('a\nb\r\nc\r\n'), 2);
  assert.equal(lineEndings.firstCrlfLine('a\rb\n'), null);
  assert.equal(lineEndings.firstCrlfLine(''), null);
  assert.equal(lineEndings.firstCrlfLine(null), null);
});

test('a CRLF canvas is a parse problem, not an empty canvas', () => {
  assert.deepEqual(canvas.parseCanvas(CANVAS).problems, []);
  const parsed = canvas.parseCanvas(crlf(CANVAS));
  assert.match(parsed.problems[0], /^line 1: Windows line endings \(CRLF\)/);
});

test('a CRLF glossary is a parse problem', () => {
  const text = crlf('---\nglossary-schema: 1\n---\n');
  assert.match(glossary.parseGlossary(text).problems[0], /^line 1: Windows line endings \(CRLF\)/);
  assert.equal(glossary.parseGlossary(text).judgeable, false);
});

test('a CRLF decision log is broken with why line-endings, never verified', () => {
  const key = crypto.randomBytes(32);
  const log = sealedLog(key);
  assert.equal(seal.verifyChain(log, key).status, 'verified');
  const chain = seal.verifyChain(crlf(log), key);
  assert.equal(chain.status, 'broken');
  assert.deepEqual(chain.broken, { seq: 1, line: 1, why: 'line-endings' });
});

test('a header-only CRLF log is broken too, so nothing anchors on CRLF bytes', () => {
  const chain = seal.verifyChain(crlf(decisions.header('crlf')), crypto.randomBytes(32));
  assert.equal(chain.status, 'broken');
  assert.deepEqual(chain.broken, { seq: 0, line: 1, why: 'line-endings' });
});

test('sealedAppend refuses to extend a CRLF log', (t) => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rh-crlf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  const file = path.join(dir, 'decisions.md');
  fs.writeFileSync(file, crlf(sealedLog(key)));
  const before = fs.readFileSync(file);
  assert.throws(() => seal.sealedAppend(file, { date: '2026-10-15', kind: 'DISCOVERY', ref: '1.1 check', body: 'x', by: 'A' }, key), /line-endings/);
  assert.ok(fs.readFileSync(file).equals(before));
});
