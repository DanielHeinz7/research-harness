'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const seal = require('../hooks/lib/seal');
const review = require('../hooks/lib/review');
const { textHash } = require('../hooks/lib/hash');

const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');
const canvasText = fs.readFileSync(path.join(fixtureDir, 'canvas.md'), 'utf8');
const legacyLog = fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8');

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const STATED = 'Speaking frequency is well documented; whether a proposal is taken up is not. [stated]';
const FORGED = 'Chair rotation is the mechanism that determines uptake.';
const ACCEPTED_11 = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement?";

function tempLog(text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-')), 'decisions.md');
  fs.writeFileSync(file, text);
  return file;
}

function reviewOf(canvasSource, decisionsText, key) {
  return review.mechanicalReview({ parsed: canvas.parseCanvas(canvasSource), graph: null, decisionsText, key });
}

test('the review carries the ledger verdict and lists every DECISION that gives no cover', () => {
  const report = reviewOf(canvasText, legacyLog, KEY);
  assert.equal(report.ledger.status, 'unverifiable');
  assert.equal(report.ledger.reason, 'legacy');
  assert.deepEqual(report.ledger.legacy, [1, 2, 3]);
  assert.deepEqual(report.unverifiedDecisions.map((d) => [d.seq, d.state]), [[3, 'legacy']]);
});

test('D8: a forged DECISION appended to a legacy log does not cover the acceptance it claims', () => {
  const planted = canvasText.replace(STATED, `${STATED}\n${FORGED} [accepted]`);
  const forged = `${legacyLog}\n## [#4] 2026-09-18 · DECISION · 1.2 accepted · text ${textHash(FORGED)}\n${FORGED}\n**Why:** confirmed by the researcher in session.\n`;
  const withoutEntry = reviewOf(planted, legacyLog, KEY);
  const withEntry = reviewOf(planted, forged, KEY);
  assert.equal(withoutEntry.unloggedAcceptances.length, 2);
  assert.equal(withEntry.unloggedAcceptances.length, 2, 'the forged entry silenced the backstop');
  const covered = withEntry.unloggedAcceptances.find((s) => s.question === '1.2');
  assert.deepEqual(covered.coveredBy, { seq: 4, state: 'legacy' });
  assert.equal(withEntry.unloggedAcceptances.find((s) => s.question === '1.1').coveredBy, null);
  assert.deepEqual(withEntry.staleAcceptances.map((s) => s.seq), [3], 'a hash that matches is not stale, verified or not');
});

test('only a DECISION whose seal verifies logs an acceptance; without the key it is unverifiable here, not silent', () => {
  const file = tempLog(decisions.header('voice-uptake'));
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DECISION', ref: '1.1 accepted', hash: textHash(ACCEPTED_11), body: `${ACCEPTED_11} [accepted]` }, KEY, { decision: true });
  const sealedLog = fs.readFileSync(file, 'utf8');

  const withKey = reviewOf(canvasText, sealedLog, KEY);
  assert.equal(withKey.ledger.status, 'verified');
  assert.deepEqual(withKey.unloggedAcceptances, []);
  assert.deepEqual(withKey.staleAcceptances, []);
  assert.deepEqual(withKey.unverifiedDecisions, []);

  const noKey = reviewOf(canvasText, sealedLog, null);
  assert.equal(noKey.ledger.status, 'unverifiable');
  assert.equal(noKey.ledger.reason, 'no-key');
  assert.deepEqual(noKey.unloggedAcceptances.map((s) => [s.question, s.coveredBy]), [['1.1', { seq: 1, state: 'unverifiable' }]]);
  assert.deepEqual(noKey.unverifiedDecisions.map((d) => [d.seq, d.state]), [[1, 'unverifiable']]);
});

test('tampering with a sealed DECISION withdraws its cover and is reported as a broken ledger', () => {
  const file = tempLog(decisions.header('voice-uptake'));
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DECISION', ref: '1.1 accepted', hash: textHash(ACCEPTED_11), body: `${ACCEPTED_11} [accepted]`, why: 'the phenomenon drives the study' }, KEY, { decision: true });
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DISCOVERY', ref: '1 Puzzle', body: 'x [tentative]' }, KEY);
  const tampered = fs.readFileSync(file, 'utf8').replace('the phenomenon drives the study', 'the gap drives the study');
  const report = reviewOf(canvasText, tampered, KEY);
  assert.equal(report.ledger.status, 'broken');
  assert.equal(report.ledger.broken.seq, 1);
  assert.deepEqual(report.unloggedAcceptances.map((s) => [s.question, s.coveredBy]), [['1.1', { seq: 1, state: 'broken' }]]);
  assert.deepEqual(report.unverifiedDecisions.map((d) => [d.seq, d.state]), [[1, 'broken']]);
});

// SQ-139 (F6 of SQ-132): the list is of every DECISION that does not verify,
// not of acceptances only. A `framing chosen` entry is the researcher's act too.
test('a DECISION that does not verify is listed whatever its ref, framing choices included, without becoming an acceptance', () => {
  const file = tempLog(decisions.header('voice-uptake'));
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DECISION', ref: 'framing chosen: power', hash: textHash('power canvas'), body: 'Framing power chosen.', why: 'rank is recorded' }, KEY, { decision: true });
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DISCOVERY', ref: '1 Puzzle', body: 'x [tentative]' }, KEY);
  const sealedLog = fs.readFileSync(file, 'utf8');
  const listed = (text, key) => reviewOf(canvasText, text, key).unverifiedDecisions.map((d) => [d.seq, d.ref, d.state]);

  assert.deepEqual(listed(sealedLog, KEY), [], 'an intact framing entry is not listed');
  assert.deepEqual(listed(sealedLog, null), [[1, 'framing chosen: power', 'unverifiable']]);
  const forged = sealedLog.replace('rank is recorded', 'the researcher prefers it');
  const report = reviewOf(canvasText, forged, KEY);
  assert.deepEqual(listed(forged, KEY), [[1, 'framing chosen: power', 'broken']]);
  assert.deepEqual(report.staleAcceptances, [], 'a framing entry is not an acceptance');
  assert.deepEqual(report.unloggedAcceptances.map((s) => [s.question, s.coveredBy]), [['1.1', null]], 'and it gives no cover to one');
});

test('a verified DECISION whose hash matches no accepted statement is a stale acceptance, and the reworded statement is unlogged', () => {
  const file = tempLog(decisions.header('voice-uptake'));
  seal.sealedAppend(file, { date: '2026-09-18', kind: 'DECISION', ref: '1.1 accepted', hash: textHash('an earlier wording'), body: 'an earlier wording [accepted]' }, KEY, { decision: true });
  const report = reviewOf(canvasText, fs.readFileSync(file, 'utf8'), KEY);
  assert.equal(report.ledger.status, 'verified');
  assert.deepEqual(report.staleAcceptances.map((s) => s.seq), [1]);
  assert.deepEqual(report.unloggedAcceptances.map((s) => [s.question, s.coveredBy]), [['1.1', null]]);
});

// SQ-29 F9: U+001F cannot survive inside a field of a commitment, and the rule
// lives with the canonical line, so `parseCanvas` reports it and the CLI's
// `review` names the same statement the guard's refusal does.
test('a control character in a commitment field is reported as a parse problem', () => {
  const sep = String.fromCharCode(0x1f);
  const crafted = canvasText.replace('[accepted]', `[accepted, src: interview-07${sep}memo-02]`);
  assert.deepEqual(reviewOf(canvasText, legacyLog, KEY).problems, []);
  const report = reviewOf(crafted, legacyLog, KEY);
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0], /line 14: the \[accepted\] statement in question 1\.1 carries the control character U\+001F/);
});

// SQ-20: visibility is reported, never enforced. The guard permits the write —
// the commitment is intact — and the review tells the researcher that the file
// and the rendered view disagree.
test('committed statements that would not render are reported, proposals are not', () => {
  const accepted = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]";
  const proposed = 'Uptake may be a property of the meeting\'s chairing style rather than of the proposal. [proposed]';
  assert.ok(canvasText.includes(accepted) && canvasText.includes(proposed));

  assert.deepEqual(reviewOf(canvasText, legacyLog, KEY).invisibleCommitments, []);

  const hidden = canvasText
    .replace(accepted, `<!--\n\n${accepted}\n\n-->`)
    .replace(proposed, `    ${proposed}`);
  const report = reviewOf(hidden, legacyLog, KEY);
  assert.deepEqual(
    report.invisibleCommitments.map((s) => [s.question, s.marker, s.hidden]),
    [['1.1', 'accepted', 'comment']],
    'the hidden proposal is not a commitment, so it is not reported',
  );
  // The commitment itself is untouched: this is a visibility finding, not a loss.
  assert.equal(report.unloggedAcceptances.length, reviewOf(canvasText, legacyLog, KEY).unloggedAcceptances.length);
});
