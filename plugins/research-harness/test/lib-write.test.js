'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');
const { acceptStatement } = require('../hooks/lib/accept');
const { setStated } = require('../hooks/lib/stated');
const { appendLog } = require('../hooks/lib/log');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');

// The library runs in this process, so the process gets the same isolation the
// CLI tests give their children: no ambient project, a private key directory.
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.RESEARCH_HARNESS_DIR;
process.env.RESEARCH_HARNESS_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));

function run(root, args) {
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    encoding: 'utf8',
  });
}

// The fixture project with a key on this machine, created by init as a
// researcher would.
function keyedProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(root, 'research'));
  for (const f of ['canvas.md', 'decisions.md']) fs.copyFileSync(path.join(fixtureDir, f), path.join(root, 'research', f));
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(out.status, 0, out.stdout);
  return root;
}

const file = (root, name) => path.join(root, 'research', name);
const read = (root, name) => fs.readFileSync(file(root, name), 'utf8');
const SPEAKING = 'Speaking frequency is well documented; whether a proposal is taken up is not.';
const CHAIRING = "Uptake may be a property of the meeting's chairing style rather than of the proposal.";

test('acceptStatement writes the same canvas and decisions.md bytes as research-harness accept', () => {
  // One project, one key, one day: the CLI accepts, the files are put back,
  // and the library accepts the same statement with the same reason.
  const root = keyedProject();
  const before = { canvas: read(root, 'canvas.md'), decisions: read(root, 'decisions.md') };
  const out = run(root, ['accept', '1.2', '--match', 'Speaking frequency', '--why', 'the gap is uptake, not voice']);
  assert.equal(out.status, 0, out.stdout);
  const viaCli = { canvas: read(root, 'canvas.md'), decisions: read(root, 'decisions.md') };

  fs.writeFileSync(file(root, 'canvas.md'), before.canvas);
  fs.writeFileSync(file(root, 'decisions.md'), before.decisions);
  const result = acceptStatement({ root, questionId: '1.2', match: 'Speaking frequency', why: 'the gap is uptake, not voice', pluginRoot });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.seq, 4);
  assert.equal(result.hash, textHash(SPEAKING));
  assert.equal(result.text, SPEAKING);
  assert.equal(result.elementNumber, 1);
  assert.equal(read(root, 'decisions.md'), viaCli.decisions);
  assert.equal(read(root, 'canvas.md'), viaCli.canvas);

  // The view's route, with the hash it saw, lands on the same bytes too.
  fs.writeFileSync(file(root, 'canvas.md'), before.canvas);
  fs.writeFileSync(file(root, 'decisions.md'), before.decisions);
  const viewed = acceptStatement({ root, questionId: '1.2', why: 'the gap is uptake, not voice', expectedHash: textHash(SPEAKING), pluginRoot });
  assert.equal(viewed.ok, true, viewed.error);
  assert.equal(read(root, 'decisions.md'), viaCli.decisions);
});

test('a statement changed since the view loaded it is refused as stale, and nothing is written', () => {
  const root = keyedProject();
  const seen = textHash(SPEAKING);
  const changed = read(root, 'canvas.md').replace(SPEAKING, 'Speaking frequency is well documented; uptake is not.');
  fs.writeFileSync(file(root, 'canvas.md'), changed);
  const log = read(root, 'decisions.md');

  const accepted = acceptStatement({ root, questionId: '1.2', expectedHash: seen, pluginRoot });
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, 'stale');
  const stated = setStated({ root, questionId: '1.2', expectedHash: seen });
  assert.equal(stated.code, 'stale');
  assert.equal(read(root, 'canvas.md'), changed);
  assert.equal(read(root, 'decisions.md'), log);

  // Without expectedHash (the CLI) nothing is judged stale.
  const plain = acceptStatement({ root, questionId: '1.2', match: 'uptake is not', pluginRoot });
  assert.equal(plain.ok, true, plain.error);
});

test('setStated moves [proposed] to [stated] in the canvas only, and refuses what is already stated or accepted', () => {
  const root = keyedProject();
  const log = read(root, 'decisions.md');

  assert.equal(setStated({ root, questionId: '1.2' }).code, 'invalid', 'expectedHash is required');
  const ok = setStated({ root, questionId: '1.2', expectedHash: textHash(CHAIRING) });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.text, CHAIRING);
  assert.match(read(root, 'canvas.md'), /chairing style rather than of the proposal\. \[stated\]/);
  assert.equal(read(root, 'decisions.md'), log, 'no log entry: [stated] is unsealed by design');

  const again = setStated({ root, questionId: '1.2', expectedHash: textHash(CHAIRING) });
  assert.equal(again.code, 'already');
  const acceptedText = 'When do members\' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement?';
  const accepted = setStated({ root, questionId: '1.1', expectedHash: textHash(acceptedText) });
  assert.equal(accepted.ok, false);
  assert.equal(accepted.code, 'already');
  assert.match(read(root, 'canvas.md'), /polite acknowledgement\? \[accepted\]/);
  assert.equal(read(root, 'decisions.md'), log);
});

test('appendLog seals DISCOVERY entries and refuses a DECISION', () => {
  const root = keyedProject();
  const log = read(root, 'decisions.md');
  const refused = appendLog({ root, kind: 'DECISION', ref: '1.2', body: 'x' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'invalid');
  assert.equal(read(root, 'decisions.md'), log);

  const logged = appendLog({ root, kind: 'DISCOVERY', ref: '1 Puzzle', body: 'Chairs differ. [tentative]' });
  assert.equal(logged.ok, true, logged.error);
  assert.equal(logged.seq, 4);
  assert.match(logged.seal, /^[0-9a-f]{16}$/);
  const entry = decisions.parseDecisions(read(root, 'decisions.md')).entries[3];
  assert.equal(entry.kind, 'DISCOVERY');
  assert.equal(entry.seal, logged.seal);
});

test('refusals carry stable codes', () => {
  const root = keyedProject();
  assert.equal(acceptStatement({ root, questionId: '9.9', pluginRoot }).code, 'not-found');
  assert.equal(acceptStatement({ root, questionId: '1.2', pluginRoot }).code, 'ambiguous');
  assert.equal(acceptStatement({ root, questionId: '3.1', pluginRoot }).code, 'dependency');
  assert.equal(acceptStatement({ root, questionId: 'x', pluginRoot }).code, 'invalid');
  const noKey = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(noKey, 'research'));
  for (const f of ['canvas.md', 'decisions.md']) fs.copyFileSync(path.join(fixtureDir, f), path.join(noKey, 'research', f));
  assert.equal(acceptStatement({ root: noKey, questionId: '1.2', match: 'Speaking', pluginRoot }).code, 'ledger');
  assert.equal(appendLog({ root: noKey, kind: 'DISCOVERY', ref: '1', body: 'x' }).code, 'ledger');
});
