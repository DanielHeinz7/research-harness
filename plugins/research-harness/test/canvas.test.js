'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const project = require('../hooks/lib/project');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'voice-uptake', 'research', 'canvas.md'),
  'utf8',
);

test('parseCanvas reads frontmatter, nine elements and their questions', () => {
  const parsed = canvas.parseCanvas(fixture);
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.frontmatter.project, 'voice-uptake');
  assert.equal(parsed.frontmatter.profile, 'is-qualitative');
  assert.equal(parsed.frontmatter.mode, 'seed');
  assert.equal(parsed.elements.length, 9);
  assert.deepEqual(parsed.elements.map((e) => e.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(parsed.elements[0].title, 'Puzzle');
  assert.deepEqual(parsed.elements[0].questions.map((q) => q.id), ['1.1', '1.2', '1.3']);
});

test('statements carry marker, tags and normalized text; placeholders are not statements', () => {
  const parsed = canvas.parseCanvas(fixture);
  const q12 = parsed.elements[0].questions[1];
  assert.equal(q12.statements.length, 2);
  assert.equal(q12.statements[0].marker, 'stated');
  assert.deepEqual(q12.statements[0].tags, []);
  assert.equal(q12.statements[1].marker, 'proposed');
  const q13 = parsed.elements[0].questions[2];
  assert.equal(q13.statements.length, 0, '_(empty)_ is not a statement');
  const q22 = parsed.elements[1].questions[1];
  assert.deepEqual(q22.statements[0].tags, ['unverified']);
  const q31 = parsed.elements[2].questions[0];
  assert.deepEqual(q31.statements[0].tags, ['src: memo-03']);
  assert.equal(q31.statements[0].text, "Under what meeting conditions does a junior member's proposal get taken up?");
});

test('parseMarkerGroup accepts only known markers', () => {
  assert.deepEqual(canvas.parseMarkerGroup('Claim. [accepted]'), { text: 'Claim.', marker: 'accepted', tags: [] });
  assert.deepEqual(canvas.parseMarkerGroup('Claim. [proposed, src: x, unverified]'), { text: 'Claim.', marker: 'proposed', tags: ['src: x', 'unverified'] });
  assert.equal(canvas.parseMarkerGroup('Claim. [verified]'), null);
  assert.equal(canvas.parseMarkerGroup('Claim without marker.'), null);
});

test('a paragraph without a marker is recorded as unmarked, not dropped', () => {
  const text = fixture.replace('_(empty)_', 'Because meetings are where allocation happens.');
  const parsed = canvas.parseCanvas(text);
  const q13 = parsed.elements[0].questions[2];
  assert.equal(q13.statements.length, 1);
  assert.equal(q13.statements[0].marker, null);
});

test('text outside a question and an unterminated frontmatter are problems', () => {
  const stray = canvas.parseCanvas('---\nproject: x\n---\n\nloose text\n\n# 1 · Puzzle\n');
  assert.match(stray.problems[0], /outside any question/);
  const open = canvas.parseCanvas('---\nproject: x\n');
  assert.match(open.problems[0], /not terminated/);
});

test('elementStatus derives from committed statements only', () => {
  const parsed = canvas.parseCanvas(fixture);
  const [e1, e2, e3, e4, e5] = parsed.elements;
  assert.deepEqual(canvas.elementStatus(e1), { status: 'stated', open: 1 }); // accepted + stated + one proposal → weakest committed is stated
  assert.deepEqual(canvas.elementStatus(e2), { status: 'open', open: 1 });   // only a proposal
  assert.deepEqual(canvas.elementStatus(e3), { status: 'stated', open: 0 });
  assert.deepEqual(canvas.elementStatus(e4), { status: 'empty', open: 0 });
  assert.deepEqual(canvas.elementStatus(e5), { status: 'stated', open: 0 });
});

test('elementStatus is accepted only when every committed statement is accepted', () => {
  const text = fixture.replace(
    'Speaking frequency is well documented; whether a proposal is taken up is not. [stated]',
    'Speaking frequency is well documented; whether a proposal is taken up is not. [accepted]',
  );
  const parsed = canvas.parseCanvas(text);
  assert.deepEqual(canvas.elementStatus(parsed.elements[0]), { status: 'accepted', open: 1 });
});

test('allStatements flattens with element and question ids', () => {
  const all = canvas.allStatements(canvas.parseCanvas(fixture));
  assert.equal(all.length, 6);
  assert.deepEqual(all.map((s) => s.question), ['1.1', '1.2', '1.2', '2.2', '3.1', '5.1']);
  assert.equal(all[0].element, 1);
  assert.equal(typeof all[0].line, 'number');
});

test('project paths honour RESEARCH_HARNESS_DIR and default to research/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  const saved = process.env.RESEARCH_HARNESS_DIR;
  delete process.env.RESEARCH_HARNESS_DIR;
  assert.equal(project.stateDir(root), path.join(root, 'research'));
  assert.equal(project.canvasPath(root), path.join(root, 'research', 'canvas.md'));
  process.env.RESEARCH_HARNESS_DIR = 'paper/state';
  assert.equal(project.decisionsPath(root), path.join(root, 'paper', 'state', 'decisions.md'));
  if (saved === undefined) delete process.env.RESEARCH_HARNESS_DIR; else process.env.RESEARCH_HARNESS_DIR = saved;
  assert.equal(project.readIfExists(path.join(root, 'nope.md')), null);
});

test('projectDir prefers CLAUDE_PROJECT_DIR, then data.cwd, then process.cwd', () => {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = '/from/env';
  assert.equal(project.projectDir({ cwd: '/from/data' }), '/from/env');
  delete process.env.CLAUDE_PROJECT_DIR;
  assert.equal(project.projectDir({ cwd: '/from/data' }), '/from/data');
  assert.equal(project.projectDir({}), process.cwd());
  if (saved !== undefined) process.env.CLAUDE_PROJECT_DIR = saved;
});
