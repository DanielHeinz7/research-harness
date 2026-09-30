'use strict';

// US-3/B: variant canvases under research/variants/<name>/ and the
// researcher's choice of one framing, through the CLI and through the library
// function the session server will call.

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const seal = require('../hooks/lib/seal');
const { textHash } = require('../hooks/lib/hash');
const { mechanicalReview } = require('../hooks/lib/review');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');

const stateDirs = new Map();
function stateDirOf(root) {
  if (!stateDirs.has(root)) stateDirs.set(root, fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-')));
  return stateDirs.get(root);
}

function run(root, args) {
  const { CLAUDE_PROJECT_DIR: _project, RESEARCH_HARNESS_DIR: _dir, ...ambient } = process.env;
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot, RESEARCH_HARNESS_STATE_DIR: stateDirOf(root) },
    encoding: 'utf8',
  });
}

// The project's key, read under the same state root the CLI runs with.
function keyOf(root) {
  const saved = process.env.RESEARCH_HARNESS_STATE_DIR;
  process.env.RESEARCH_HARNESS_STATE_DIR = stateDirOf(root);
  try {
    return seal.readKey(root);
  } finally {
    if (saved === undefined) delete process.env.RESEARCH_HARNESS_STATE_DIR;
    else process.env.RESEARCH_HARNESS_STATE_DIR = saved;
  }
}

function ok(out) {
  assert.equal(out.status, 0, out.stdout + out.stderr);
  return out.stdout;
}

const file = (root, ...parts) => path.join(root, 'research', ...parts);
const read = (f) => fs.readFileSync(f, 'utf8');

// A fresh project with two variants, each holding one proposal under 1.1.
function projectWithVariants() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-var-'));
  ok(run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed', '--title', 'Voice uptake']));
  ok(run(root, ['init', '--variant', 'power', '--lens', 'power and hierarchy']));
  ok(run(root, ['init', '--variant', 'sense-making', '--lens', 'collective sense-making: "who hears whom"']));
  for (const [name, statement] of [
    ['power', 'Uptake follows rank rather than argument. [proposed, unverified]'],
    ['sense-making', 'Uptake follows whether a proposal fits the frame the room already shares. [tentative, unverified]'],
  ]) {
    const f = file(root, 'variants', name, 'canvas.md');
    const text = read(f);
    const at = text.indexOf('_(empty)_');
    fs.writeFileSync(f, `${text.slice(0, at)}${statement}${text.slice(at + '_(empty)_'.length)}`);
  }
  return root;
}

test('init --variant creates a full state directory with variant and lens in the frontmatter', () => {
  const root = projectWithVariants();
  const parsed = canvas.parseCanvas(read(file(root, 'variants', 'sense-making', 'canvas.md')));
  assert.equal(parsed.frontmatter.variant, 'sense-making');
  assert.equal(parsed.frontmatter.lens, 'collective sense-making: "who hears whom"');
  assert.equal(parsed.frontmatter.project, 'voice-uptake');
  assert.equal(parsed.frontmatter.mode, 'seed');
  assert.equal(parsed.elements.length, canvas.parseCanvas(read(file(root, 'canvas.md'))).elements.length);
  assert.match(read(file(root, 'variants', 'sense-making', 'decisions.md')), /^# Decision log — voice-uptake · variant sense-making\n$/);
  // The key is the project's: no second key file anywhere in the state root.
  const keys = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (n === seal.KEY_FILE) keys.push(f); } };
  walk(stateDirOf(root));
  assert.equal(keys.length, 1);

  const again = run(root, ['init', '--variant', 'power', '--lens', 'x']);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /already exists; nothing written/);
  for (const args of [['init', '--variant', '../x', '--lens', 'x'], ['init', '--variant', 'Power', '--lens', 'x'], ['init', '--variant', 'y'], ['init', '--variant', 'y', '--lens', 'x', '--mode', 'bad']]) {
    assert.equal(run(root, args).status, 2, args.join(' '));
  }
  assert.equal(fs.existsSync(path.join(root, 'research', 'x')), false);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-var-bare-'));
  assert.equal(run(bare, ['init', '--variant', 'a', '--lens', 'x']).status, 1);
  assert.equal(fs.existsSync(path.join(bare, 'research')), false);
});

test('status, review and log take --variant and read and write only that variant', () => {
  const root = projectWithVariants();
  const mainLog = read(file(root, 'decisions.md'));
  const status = ok(run(root, ['status', '--variant', 'power']));
  assert.match(status, /variant power \(lens: power and hierarchy\)/);
  assert.match(status, /1 open \(1 proposal\)/);
  const review = ok(run(root, ['review', '--variant', 'power']));
  assert.match(review, /^# Mechanical review — variant power \(lens: power and hierarchy\)/);
  assert.match(review, /## Open elements \(proposals only\)\n1\n/);

  const logged = ok(run(root, ['log', 'DISCOVERY', '1.1', '--body', 'Rank is recorded in the minutes.', '--variant', 'power']));
  assert.match(logged, /^Logged #1 DISCOVERY 1\.1 in variant power, sealed [0-9a-f]{16}\./);
  assert.equal(read(file(root, 'decisions.md')), mainLog);
  const variantLog = read(file(root, 'variants', 'power', 'decisions.md'));
  assert.equal(seal.verifyChain(variantLog, keyOf(root)).status, 'verified');
  assert.match(variantLog, /## \[#1\] \d{4}-\d{2}-\d{2} · DISCOVERY · 1\.1 · seal [0-9a-f]{16}\nRank is recorded in the minutes\./);
  assert.match(ok(run(root, ['review', '--variant', 'power'])), /## Decision log\nverified: 1 sealed entry/);

  assert.equal(run(root, ['status', '--variant', 'nope']).status, 1);
  assert.equal(run(root, ['review', '--variant', 'nope']).status, 1);
  assert.equal(run(root, ['status', '--variant', '../..']).status, 2);
  assert.equal(run(root, ['log', 'DISCOVERY', '1.1', '--body', 'x', '--variant', '../../x']).status, 2);
});

test('accept works on the main canvas only', () => {
  const root = projectWithVariants();
  const before = read(file(root, 'variants', 'power', 'canvas.md'));
  const out = run(root, ['accept', '1.1', '--variant', 'power']);
  assert.equal(out.status, 2);
  assert.match(out.stdout, /accept works on the main canvas only/);
  assert.equal(read(file(root, 'variants', 'power', 'canvas.md')), before);
});

test('choose copies the variant\'s statements into the main canvas and seals a framing DECISION in the main log', () => {
  const root = projectWithVariants();
  const mainBefore = read(file(root, 'canvas.md'));
  const variantText = read(file(root, 'variants', 'sense-making', 'canvas.md'));
  const variantLogs = ['power', 'sense-making'].map((n) => read(file(root, 'variants', n, 'decisions.md')));

  const out = ok(run(root, ['choose', 'sense-making', '--why', 'It explains the two meetings the power lens cannot.']));
  assert.match(out, /^Chose framing sense-making \(lens: collective sense-making: "who hears whom"\): 1 statement copied into research\/canvas\.md\./);

  const mainAfter = read(file(root, 'canvas.md'));
  // The main frontmatter stays; everything below it is the variant's.
  const head = (t) => t.slice(0, t.indexOf('\n---\n') + 5);
  assert.equal(head(mainAfter), head(mainBefore));
  assert.equal(mainAfter.slice(head(mainAfter).length), variantText.slice(head(variantText).length));
  const statements = canvas.allStatements(canvas.parseCanvas(mainAfter)).filter((s) => s.marker !== null);
  assert.deepEqual(statements.map((s) => [s.question, s.marker]), [['1.1', 'tentative']]);

  const log = decisions.parseDecisions(read(file(root, 'decisions.md')));
  const entry = log.entries[log.entries.length - 1];
  assert.equal(entry.kind, 'DECISION');
  assert.equal(entry.ref, 'framing chosen: sense-making');
  assert.equal(entry.hash, textHash(variantText));
  assert.match(entry.body, /\*\*Why:\*\* It explains the two meetings the power lens cannot\./);
  assert.match(entry.body, /\*\*Rejected:\*\* power \(lens: power and hierarchy\)$/m);
  assert.match(ok(run(root, ['review'])), /## Decision log\nverified: 1 sealed entry/);

  // The variants stay as the record, logs untouched.
  assert.equal(read(file(root, 'variants', 'sense-making', 'canvas.md')), variantText);
  assert.deepEqual(['power', 'sense-making'].map((n) => read(file(root, 'variants', n, 'decisions.md'))), variantLogs);
});

test('choose takes an explicit --rejected, and needs --why and an existing variant', () => {
  const root = projectWithVariants();
  const before = read(file(root, 'canvas.md'));
  assert.equal(run(root, ['choose', 'power']).status, 2);
  assert.equal(run(root, ['choose', '--why', 'x']).status, 2);
  assert.equal(run(root, ['choose', '../power', '--why', 'x']).status, 2);
  assert.equal(run(root, ['choose', 'nope', '--why', 'x']).status, 1);
  assert.equal(read(file(root, 'canvas.md')), before);

  ok(run(root, ['choose', 'power', '--why', 'Rank predicts every uptake.', '--rejected', 'sense-making: no minutes to test it']));
  const log = decisions.parseDecisions(read(file(root, 'decisions.md')));
  assert.match(log.entries[0].body, /\*\*Rejected:\*\* sense-making: no minutes to test it$/m);
});

test('choose refuses once the main canvas holds an [accepted] statement, and refuses to copy a planted [accepted]', () => {
  const root = projectWithVariants();
  const main = file(root, 'canvas.md');
  const text = read(main);
  const at = text.indexOf('_(empty)_');
  fs.writeFileSync(main, `${text.slice(0, at)}An accepted question. [accepted]${text.slice(at + 9)}`);
  const before = read(main);
  const logBefore = read(file(root, 'decisions.md'));
  const out = run(root, ['choose', 'power', '--why', 'x']);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /already holds 1 \[accepted\] statement \(1\.1\)/);
  assert.equal(read(main), before);
  assert.equal(read(file(root, 'decisions.md')), logBefore);

  const other = projectWithVariants();
  const v = file(other, 'variants', 'power', 'canvas.md');
  fs.writeFileSync(v, read(v).replace('[proposed, unverified]', '[accepted]'));
  const planted = run(other, ['choose', 'power', '--why', 'x']);
  assert.equal(planted.status, 2);
  assert.match(planted.stdout, /holds \[accepted\] statements/);
});

test('choose refuses a field label in --why or --rejected, and copies nothing', () => {
  const root = projectWithVariants();
  const main = file(root, 'canvas.md');
  const before = read(main);
  const logBefore = read(file(root, 'decisions.md'));
  for (const args of [
    ['choose', 'power', '--why', 'Rank predicts every uptake.\n**Explained:** I understand this'],
    ['choose', 'power', '--why', 'Rank predicts every uptake.', '--rejected', '**Open at acceptance:** #1'],
  ]) {
    const out = run(root, args);
    assert.equal(out.status, 2, `${args.join(' ')} was not refused: ${out.stdout}`);
    assert.match(out.stdout, /starts like a field label/);
  }
  assert.equal(read(main), before, 'a refused label copies no statement');
  assert.equal(read(file(root, 'decisions.md')), logBefore, 'a refused label seals no framing entry');
  ok(run(root, ['choose', 'power', '--why', 'Rank predicts every uptake.']));
});

test('mechanicalReview does not count a framing-chosen DECISION as an acceptance', () => {
  const root = projectWithVariants();
  ok(run(root, ['choose', 'power', '--why', 'x']));
  const decisionsText = read(file(root, 'decisions.md'));
  const parsed = canvas.parseCanvas(read(file(root, 'canvas.md')));
  // With the key the entry verifies; without it the DECISION is unverifiable
  // here, and still is not reported as an acceptance lacking cover.
  for (const key of [keyOf(root), null]) {
    const report = mechanicalReview({ parsed, graph: null, decisionsText, key });
    assert.equal(report.ledger.status, key ? 'verified' : 'unverifiable');
    assert.deepEqual(report.staleAcceptances, []);
    assert.deepEqual(report.unloggedAcceptances, []);
    assert.deepEqual(report.unverifiedDecisions, []);
  }
});
