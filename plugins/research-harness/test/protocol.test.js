'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const seal = require('../hooks/lib/seal');
const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');
const { protocolOf } = require('../hooks/lib/protocol');

const KEY = Buffer.alloc(32, 9);
const HEADER = '# Decision log — t\n';

// Appends sealed entries to a text in memory, the way sealedAppend does on disk.
function append(text, entries) {
  let out = text;
  for (const f of entries) {
    const seq = decisions.parseDecisions(out).maxSeq + 1;
    const { text: entry } = seal.sealEntry(seal.lastSealOf(out), { date: '2026-10-08', body: 'x', ...f, seq }, KEY);
    out += decisions.separatorAfter(out) + entry;
  }
  return out;
}

const d = (ref, extra = {}) => ({ kind: 'DISCOVERY', ref, body: `finding ${ref}`, by: 'A. Researcher', ...extra });

// Two questions with an accepted statement each; 4.1's text is never read
// because its acceptance carries a hash the canvas no longer holds.
const canvasText = [
  '---',
  'project: t',
  'profile: is-qualitative',
  '---',
  '',
  '# 3 · What exactly do we ask?',
  '',
  '## 3.1 What is the phenomenon?',
  '',
  'Voice is taken up when it is answered. [accepted]',
  '',
  '# 4 · What is it made of?',
  '',
  '## 4.1 What is the mechanism?',
  '',
  'The mechanism is a chairing practice. [accepted]',
  '',
].join('\n');

const log = append(HEADER, [
  d('1'),
  { kind: 'SESSION', ref: 'First supervision', body: 'Session started.', by: 'A. Researcher' },
  {
    kind: 'DECISION',
    ref: '3.1 accepted',
    hash: textHash('Voice is taken up when it is answered.'),
    body: 'Voice is taken up when it is answered. [accepted]',
    explained: 'E1.',
    by: 'B. Supervisor',
  },
  { kind: 'DISCOVERY', ref: '7.1 check', body: 'Is the sample large enough?', why: 'Power.', by: 'B. Supervisor' },
  { kind: 'CONSTRAINT', ref: '6', body: 'No new data.' },
  {
    kind: 'DECISION',
    ref: '4.1 accepted',
    hash: 'deadbeef',
    body: 'The mechanism is a chairing practice. [accepted]',
    explained: 'E2.',
    by: 'A. Researcher',
  },
  { kind: 'SESSION', ref: 'Second supervision', body: 'Session started.', by: 'A. Researcher' },
  d('5'),
]);

test('latest session by default; #seq picks another; a non-marker seq refuses', () => {
  const latest = protocolOf({ decisionsText: log, canvasText, key: KEY });
  assert.match(latest.markdown, /^# Session protocol — Second supervision$/m);
  const first = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 });
  assert.match(first.markdown, /^# Session protocol — First supervision$/m);
  assert.equal(protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 3 }).ok, false);
});

test('section bounds, grouping, participants and unknown', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  assert.match(md, /^Participants: A\. Researcher, B\. Supervisor, unknown$/m);
  assert.match(md, /## Accepted[\s\S]*3\.1[\s\S]*Voice is taken up when it is answered\.[\s\S]*Explained: E1\.[\s\S]*By: B\. Supervisor/);
  assert.match(md, /4\.1[\s\S]*text changed since \(text deadbeef\)/);
  assert.match(md, /## Noted[\s\S]*7\.1 check[\s\S]*Why: Power\.[\s\S]*By: B\. Supervisor/);
  assert.match(md, /No new data\.[\s\S]*By: unknown/);
  assert.doesNotMatch(md, /DISCOVERY · 1\b|finding 1/, 'the entry before the marker is not in the section');
  assert.doesNotMatch(md, /Second supervision/);
});

test('open at the end: a check still open when the section ends', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  assert.match(md, /## Open at the end[\s\S]*7\.1 check #4/);
});

test('footer: seal status and the anchor as of the section\'s last entry', () => {
  const md = protocolOf({ decisionsText: log, canvasText, key: KEY, seq: 2 }).markdown;
  const upTo = log.slice(0, decisions.parseDecisions(log).entries[6].offset).replace(/\n+$/, '\n');
  assert.match(md, /Seal: verified/);
  assert.ok(md.includes(seal.logAnchor(upTo)));
});

test('a broken chain still gives a protocol, headed BROKEN; no marker refuses', () => {
  const broken = log.replace('No new data.', 'No new data!');
  assert.match(protocolOf({ decisionsText: broken, canvasText, key: KEY, seq: 2 }).markdown, /^\*\*BROKEN at #5\*\*/m);
  const none = protocolOf({ decisionsText: '# Decision log — t\n', canvasText, key: KEY });
  assert.equal(none.ok, false);
  assert.match(none.error, /session start/);
});
