'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');

const refDir = path.resolve(__dirname, '..', 'references');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'voice-uptake', 'research', 'canvas.md'), 'utf8');

test('canvas-elements.md parses as an empty canvas with the fixture\'s question ids', () => {
  const template = canvas.parseCanvas(fs.readFileSync(path.join(refDir, 'canvas-elements.md'), 'utf8'));
  assert.equal(template.problems.length, 0, template.problems.join('; '));
  assert.equal(template.elements.length, 9);
  const ids = template.elements.flatMap((e) => e.questions.map((q) => q.id));
  const fixtureIds = canvas.parseCanvas(fixture).elements.flatMap((e) => e.questions.map((q) => q.id));
  assert.deepEqual(ids, fixtureIds);
  assert.equal(canvas.allStatements(template).length, 0, 'the template carries no statements');
});

// The citation lives in the frontmatter because everything below it is body
// text that `init` copies and `parseCanvas` reads as statements.
test('the template carries its source in the frontmatter, not in the body', () => {
  const template = canvas.parseCanvas(fs.readFileSync(path.join(refDir, 'canvas-elements.md'), 'utf8'));
  assert.equal(typeof template.frontmatter.source, 'string', 'the template frontmatter names no source');
  assert.match(template.frontmatter.source, /Dorobantu/);
  assert.match(template.frontmatter.source, /doi\.org/);
});

test('every reference cites its source and none quotes it', () => {
  for (const name of ['canvas-elements.md', 'amj-map.md', 'problematization.md']) {
    const text = fs.readFileSync(path.join(refDir, name), 'utf8');
    assert.match(text, /Dorobantu|Monteiro|Colquitt/, `${name} cites nothing`);
    assert.match(text, /doi\.org|jstor\.org/, `${name} has no resolvable reference`);
  }
});
