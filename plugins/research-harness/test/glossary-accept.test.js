'use strict';

// SQ-203, package 2 of the construct glossary design
// (docs/superpowers/specs/construct-glossary-design.md, § Authorization and
// text binding): accepting an entry is the researcher's act, it binds the
// entry's payload hash, and a failed accept leaves neither a marker without a
// decision nor a decision without its text. Every construct in these fixtures
// is invented for this file.

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const glossary = require('../hooks/lib/glossary');
const seal = require('../hooks/lib/seal');
const canvasLib = require('../hooks/lib/canvas');
const stateLib = require('../hooks/lib/state');
const { mechanicalReview } = require('../hooks/lib/review');
const { acceptGlossaryEntry } = require('../hooks/lib/accept');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');

// The library runs in this process, so the process gets the isolation the CLI
// tests give their children: no ambient project, a private key directory.
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.RESEARCH_HARNESS_DIR;
process.env.RESEARCH_HARNESS_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
fs.writeFileSync(path.join(process.env.RESEARCH_HARNESS_STATE_DIR, 'name'), 'A. Researcher\n');

// A plugin root whose only profile is this fixture's: element 4 depends on
// nothing, so nothing but the case a test is about stops an acceptance. `init`
// runs against the real plugin root, before the canvas is pointed at this one.
function fixturePluginRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-plugin-'));
  const dir = path.join(root, 'references', 'profiles');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'glossary-deps.md'), '# Profile: glossary-deps\n\nA fixture graph.\n\n```graph\n4 <-\n```\n');
  return root;
}

const PROFILE_ROOT = fixturePluginRoot();

function run(root, args, plugin = pluginRoot) {
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin },
    encoding: 'utf8',
  });
}

const HEADER = '---\nglossary-schema: 1\nmanuscripts: paper.md\n---\n\n';

function entryText(id, changes = {}) {
  const f = {
    term: 'Quiet window',
    definition: "An observer's report that a signal was expected and did not arrive.",
    origin: 'own-definition',
    distinctions: 'Unlike [handoff lag](#handoff-lag), this is an expectation rather than a measured delay.',
    marker: '[proposed]',
    ...changes,
  };
  const lines = [`## ${id}`, '', `Term: ${f.term}`];
  if (f.aliases !== undefined) lines.push(`Aliases: ${f.aliases}`);
  lines.push(`Definition: ${f.definition}`, `Origin: ${f.origin}`, `Distinctions: ${f.distinctions}`);
  if (f.marker !== null) lines.push(f.marker);
  return lines.join('\n');
}

const LAG = entryText('handoff-lag', {
  term: 'Handoff lag',
  definition: 'The interval between a request being made and its next visible acknowledgement.',
  distinctions: 'Unlike [quiet window](#quiet-window), this is measured in time rather than reported as an expectation.',
});

const doc = (...entries) => `${HEADER}${entries.join('\n\n')}\n`;

// The seed fixture with a key on this machine and a glossary holding the two
// fixture entries. `profile: 'is-qualitative'` keeps the shipped graph.
function keyedProject({ profile = 'glossary-deps', glossaryText = doc(entryText('quiet-window'), LAG) } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-glossary-accept-'));
  fs.mkdirSync(path.join(root, 'research'));
  for (const f of ['canvas.md', 'decisions.md']) fs.copyFileSync(path.join(fixtureDir, f), path.join(root, 'research', f));
  fs.writeFileSync(path.join(root, 'research', 'glossary.md'), glossaryText);
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(out.status, 0, out.stdout);
  if (profile !== 'is-qualitative') {
    const canvasFile = file(root, 'canvas.md');
    fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, 'utf8').replace('profile: is-qualitative', `profile: ${profile}`));
  }
  return root;
}

const file = (root, name) => path.join(root, 'research', name);
const read = (root, name) => fs.readFileSync(file(root, name), 'utf8');
const EXPLAINED = 'I accept this because both fieldnotes use the term this way.';
const hashOf = (text, id) => glossary.payloadHash(glossary.entryById(glossary.parseGlossary(text), id));

function reviewOf(root) {
  const state = stateLib.loadState(root, { pluginRoot: PROFILE_ROOT });
  return mechanicalReview({
    parsed: canvasLib.parseCanvas(state.canvasText),
    graph: state.graph,
    decisionsText: state.decisionsText,
    glossaryText: read(root, 'glossary.md'),
    key: state.key,
  });
}

// The marker line and nothing else is what an acceptance rewrites.
function unmark(text, markerLine, marker) {
  const lines = text.split('\n');
  assert.equal(lines[markerLine - 1], marker, `line ${markerLine} is the marker`);
  lines[markerLine - 1] = '[proposed]';
  return lines.join('\n');
}

test('accepting an entry marks it accepted and seals a DECISION bound to its payload hash', () => {
  const root = keyedProject();
  const before = read(root, 'glossary.md');
  const entry = glossary.entryById(glossary.parseGlossary(before), 'quiet-window');
  const hash = glossary.payloadHash(entry);
  const logBefore = read(root, 'decisions.md');

  const result = acceptGlossaryEntry({
    root,
    id: 'quiet-window',
    why: 'the construct drives the coding',
    explained: EXPLAINED,
    pluginRoot: PROFILE_ROOT,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.seq, 4, 'the seed log holds #1 to #3');
  assert.equal(result.hash, hash);
  assert.equal(result.was, 'proposed');
  assert.equal(result.term, 'Quiet window');
  assert.deepEqual(result.payload, ['quiet-window', 'Quiet window', null, entry.definition, 'own-definition', entry.distinctions]);

  // The glossary: the marker line moved, every other byte is the file it was.
  const after = read(root, 'glossary.md');
  assert.equal(unmark(after, entry.markerLine, '[accepted]'), before, 'nothing but the marker line changed');
  assert.match(after.slice(after.indexOf('## quiet-window')), /\n\[accepted\]\n/);

  // The log: one DECISION, named by the entry id, holding the payload and the
  // researcher's sentence, sealed and verifiable under this machine's key.
  const log = read(root, 'decisions.md');
  assert.equal(log.slice(0, logBefore.length), logBefore, 'the earlier entries are untouched');
  const entryText = log.slice(log.indexOf('## [#4]'));
  assert.match(entryText, /^## \[#4\] \d{4}-\d{2}-\d{2} · DECISION · glossary quiet-window accepted · text [0-9a-f]{8} · seal [0-9a-f]{16}\n/);
  assert.ok(entryText.includes(`· text ${hash} ·`), 'the entry binds the payload hash');
  assert.ok(entryText.includes(`**Why:** the construct drives the coding`));
  assert.ok(entryText.includes(`**Explained:** ${EXPLAINED}`));
  assert.ok(entryText.includes('**By:** A. Researcher'));
  assert.deepEqual(JSON.parse(entryText.split('\n')[1]), result.payload, 'the body is the accepted payload');
  assert.doesNotMatch(log, /4\.1 accepted/, 'a glossary acceptance is never logged as a canvas acceptance');
  const chain = seal.verifyChain(log, seal.readKey(root));
  assert.ok(chain.verified.has(4), `#4 verifies (${chain.status})`);
});

test('the CLI and the library write the same glossary and decisions.md bytes', () => {
  const root = keyedProject();
  const before = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };

  const out = run(root, ['glossary', 'accept', 'quiet-window', '--explained', EXPLAINED], PROFILE_ROOT);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /Accepted glossary entry quiet-window \(was \[proposed\]\): Quiet window/);
  assert.match(out.stdout, /Logged as #4 with payload [0-9a-f]{8}/);
  const viaCli = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };

  fs.writeFileSync(file(root, 'glossary.md'), before.glossary);
  fs.writeFileSync(file(root, 'decisions.md'), before.decisions);
  const result = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(result.ok, true, result.error);
  assert.equal(read(root, 'glossary.md'), viaCli.glossary);
  assert.equal(read(root, 'decisions.md'), viaCli.decisions);
});

test('an accept without the researcher\'s sentence, or without a known complete entry, writes nothing', () => {
  const root = keyedProject();
  const before = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };
  const attempt = (changes) => acceptGlossaryEntry({ root, explained: EXPLAINED, pluginRoot: PROFILE_ROOT, ...changes });

  assert.equal(attempt({ id: 'quiet-window', explained: undefined }).code, 'explanation-required');
  assert.equal(attempt({ id: 'quiet-window', explained: '   ' }).code, 'explanation-required');
  assert.equal(attempt({ id: 'not an id' }).code, 'invalid');
  assert.equal(attempt({ id: 'wrong-shape' }).code, 'not-found', 'there is no such entry in this glossary');
  assert.equal(attempt({ id: 'quiet-window', expectedHash: 7 }).code, 'invalid');

  // A refusal is not a partial write: both files are the bytes they were.
  assert.equal(read(root, 'glossary.md'), before.glossary);
  assert.equal(read(root, 'decisions.md'), before.decisions);
});

test('an incomplete entry, a dangling origin, an unjudgeable glossary or an already accepted entry each refuse', () => {
  const cases = [
    ['incomplete', doc(entryText('quiet-window', { origin: 'unverified' }), LAG), 'quiet-window'],
    ['origin', doc(entryText('quiet-window', { origin: 'src: notes/absent.md#nowhere' }), LAG), 'quiet-window'],
    ['unjudgeable', doc(entryText('quiet-window'), entryText('quiet-window', { term: 'Quiet window (again)' }), LAG), 'quiet-window'],
    ['already', doc(entryText('quiet-window', { marker: '[accepted]' }), LAG), 'quiet-window'],
  ];
  for (const [code, glossaryText, id] of cases) {
    const root = keyedProject({ glossaryText });
    const before = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };
    const result = acceptGlossaryEntry({ root, id, explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
    assert.equal(result.ok, false, `${code} must refuse`);
    assert.equal(result.code, code, result.error);
    assert.equal(read(root, 'glossary.md'), before.glossary, `${code} left the glossary alone`);
    assert.equal(read(root, 'decisions.md'), before.decisions, `${code} left the log alone`);
  }
});

test('element 4\'s profile dependencies stop a glossary acceptance before anything is written', () => {
  const root = keyedProject({ profile: 'is-qualitative' });
  const before = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };

  const result = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, pluginRoot });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'dependency');
  assert.match(result.error, /element 4 depends on element 2 is [a-z]+, element 7 is [a-z]+/);
  assert.equal(read(root, 'glossary.md'), before.glossary);
  assert.equal(read(root, 'decisions.md'), before.decisions);

  // The shipped graph is the one that refuses: the same entry, in the same
  // project, accepted once the canvas names the fixture graph instead.
  const canvasFile = file(root, 'canvas.md');
  fs.writeFileSync(canvasFile, fs.readFileSync(canvasFile, 'utf8').replace('profile: is-qualitative', 'profile: glossary-deps'));
  const ok = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(ok.ok, true, ok.error);
});

test('a payload changed since it was displayed is refused as stale, and nothing is written', () => {
  const root = keyedProject();
  const before = { glossary: read(root, 'glossary.md'), decisions: read(root, 'decisions.md') };
  const seen = hashOf(before.glossary, 'quiet-window');
  const other = hashOf(before.glossary, 'handoff-lag');

  const stale = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, expectedHash: other, pluginRoot: PROFILE_ROOT });
  assert.equal(stale.code, 'stale');
  assert.equal(read(root, 'glossary.md'), before.glossary);
  assert.equal(read(root, 'decisions.md'), before.decisions);

  const fresh = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, expectedHash: seen, pluginRoot: PROFILE_ROOT });
  assert.equal(fresh.ok, true, fresh.error);
});

test('no key and a broken chain refuse before the glossary is touched', () => {
  // No key on this machine: the log cannot take a DECISION, so no marker.
  const noKey = keyedProject();
  const noKeyBefore = { glossary: read(noKey, 'glossary.md'), decisions: read(noKey, 'decisions.md') };
  fs.rmSync(seal.keyPath(noKey));
  const refused = acceptGlossaryEntry({ root: noKey, id: 'quiet-window', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(refused.code, 'ledger');
  assert.match(refused.error, /No sealing key for this project on this machine/);
  assert.equal(read(noKey, 'glossary.md'), noKeyBefore.glossary);
  assert.equal(read(noKey, 'decisions.md'), noKeyBefore.decisions);

  // A sealed log whose chain is broken: the same refusal, the same silence.
  const broken = keyedProject();
  const first = acceptGlossaryEntry({ root: broken, id: 'quiet-window', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(first.ok, true, first.error);
  const tampered = read(broken, 'decisions.md').replace(`text ${first.hash} ·`, `text ${'0'.repeat(8)} ·`);
  fs.writeFileSync(file(broken, 'decisions.md'), tampered);
  const before = read(broken, 'glossary.md');
  const second = acceptGlossaryEntry({ root: broken, id: 'handoff-lag', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(second.code, 'ledger');
  assert.match(second.error, /broken at #4/);
  assert.equal(read(broken, 'decisions.md'), tampered, 'the harness never repairs a ledger');
  assert.equal(read(broken, 'glossary.md'), before);
});

test('review covers an accepted entry only by a verified decision naming its payload', () => {
  // A marker written by hand, with no decision at all: unlogged, no cover.
  const handMade = keyedProject({ glossaryText: doc(entryText('quiet-window', { marker: '[accepted]' }), LAG) });
  let report = reviewOf(handMade);
  assert.equal(report.glossaryStaleAcceptances.length, 0);
  assert.equal(report.glossaryUnloggedAcceptances.length, 1);
  assert.equal(report.glossaryUnloggedAcceptances[0].id, 'quiet-window');
  assert.equal(report.glossaryUnloggedAcceptances[0].coveredBy, null);

  // A DECISION that claims the payload but does not verify gives no cover.
  const forged = keyedProject();
  const hash = hashOf(read(forged, 'glossary.md'), 'quiet-window');
  fs.appendFileSync(file(forged, 'decisions.md'), `\n## [#4] 2026-10-05 · DECISION · glossary quiet-window accepted · text ${hash}\nA quiet placeholder. [accepted]\n**Explained:** forged\n**By:** A. Researcher\n`);
  fs.writeFileSync(file(forged, 'glossary.md'), doc(entryText('quiet-window', { marker: '[accepted]' }), LAG));
  report = reviewOf(forged);
  assert.equal(report.glossaryUnloggedAcceptances.length, 1);
  assert.deepEqual(report.glossaryUnloggedAcceptances[0].coveredBy, { seq: 4, state: 'legacy' });

  // The real acceptance covers it, and keeps covering exactly that payload.
  const root = keyedProject();
  const accepted = acceptGlossaryEntry({ root, id: 'quiet-window', explained: EXPLAINED, pluginRoot: PROFILE_ROOT });
  assert.equal(accepted.ok, true, accepted.error);
  report = reviewOf(root);
  assert.equal(report.glossaryUnloggedAcceptances.length, 0);
  assert.equal(report.glossaryStaleAcceptances.length, 0);

  const edited = read(root, 'glossary.md').replace("An observer's report", "An observer's expectation");
  fs.writeFileSync(file(root, 'glossary.md'), edited);
  report = reviewOf(root);
  assert.equal(report.glossaryStaleAcceptances.length, 1);
  assert.deepEqual(report.glossaryStaleAcceptances[0], { seq: 4, ref: 'glossary quiet-window accepted', hash: accepted.hash });
  assert.equal(report.glossaryUnloggedAcceptances.length, 1, 'the edited entry answers to no decision');
  assert.equal(report.glossaryUnloggedAcceptances[0].coveredBy, null);
});
