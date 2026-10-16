'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.statementLinks = require('../agent/statement-links');
const { renderBlocks } = require('../agent/panel/render');

test('paragraphs, lists, emphasis and code', () => {
  assert.deepEqual(renderBlocks('One **two** *three* `four`\n\n- a\n- b\n\n1. c'), [
    { tag: 'p', items: [[{ type: 'text', value: 'One ' }, { type: 'strong', value: 'two' }, { type: 'text', value: ' ' }, { type: 'em', value: 'three' }, { type: 'text', value: ' ' }, { type: 'code', value: 'four' }]] },
    { tag: 'ul', items: [[{ type: 'text', value: 'a' }], [{ type: 'text', value: 'b' }]] },
    { tag: 'ol', items: [[{ type: 'text', value: 'c' }]] },
  ]);
});

test('statement numbers and web addresses become their own pieces', () => {
  assert.deepEqual(renderBlocks('See 3.4 and https://example.org/a.'), [{ tag: 'p', items: [[
    { type: 'text', value: 'See ' }, { type: 'number', value: '3.4' }, { type: 'text', value: ' and ' }, { type: 'url', value: 'https://example.org/a' }, { type: 'text', value: '.' },
  ]] }]);
  assert.deepEqual(renderBlocks('`3.4` stays code'), [{ tag: 'p', items: [[{ type: 'code', value: '3.4' }, { type: 'text', value: ' stays code' }]] }]);
});

test('HTML in model output is text', () => {
  const blocks = renderBlocks('<img src=x onerror=alert(1)> <script>x</script>');
  assert.deepEqual(blocks, [{ tag: 'p', items: [[{ type: 'text', value: '<img src=x onerror=alert(1)> <script>x</script>' }]] }]);
});

test('an underscore inside a word is not emphasis, one at a word edge is', () => {
  assert.deepEqual(renderBlocks('see research_harness_core and _this_'), [{ tag: 'p', items: [[
    { type: 'text', value: 'see research_harness_core and ' }, { type: 'em', value: 'this' },
  ]] }]);
});

test('a number inside a web address stays part of the address', () => {
  assert.deepEqual(renderBlocks('https://example.org/3.4/x'), [{ tag: 'p', items: [[{ type: 'url', value: 'https://example.org/3.4/x' }]] }]);
});
