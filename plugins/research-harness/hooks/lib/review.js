'use strict';

const { allStatements, COMMITTED } = require('./canvas');
const { textHash } = require('./hash');
const { parseDecisions } = require('./decisions');
const { verifyChain } = require('./seal');
const { dependencyViolations, statusByNumber } = require('./profile');

const ACCEPT_REF_RE = /^([1-9]\.\d+) accepted$/;
const COMMITTED_MARKERS = COMMITTED;

// The mechanical half of canvas-review (§5.4, items 1, 2, 5, 6, 7). The
// judgment half — fit, refutation, manuscript support — stays in the skill.
// Nothing here decides whether two elements contradict each other; it only
// computes what needs no judgment at all.
// `key` is the sealing key of this machine, or null on a checkout that has
// none; the ledger verdict and every acceptance's cover depend on it (§4.7).
function mechanicalReview({ parsed, graph, decisionsText, key = null }) {
  const statuses = statusByNumber(parsed);
  const numbers = parsed.elements.map((e) => e.number);
  const statements = allStatements(parsed);
  const log = parseDecisions(decisionsText || '');
  const ledger = verifyChain(decisionsText || '', key);

  const empty = numbers.filter((n) => statuses[n].status === 'empty');
  const open = numbers.filter((n) => statuses[n].status === 'open');
  const violations = graph ? dependencyViolations(parsed, graph) : [];
  const unmarked = statements.filter((s) => s.marker === null);
  // Committed, but not where a reader would see it (§4.3, SQ-20). Reported and
  // never enforced: the commitment is intact, and which of the two views is
  // the one the researcher meant is their judgment, not the parser's.
  const invisibleCommitments = statements.filter((s) => s.hidden && COMMITTED_MARKERS.has(s.marker));
  const untagged = statements.filter((s) => s.marker !== null && s.tags.length === 0);
  const conversationalStated = untagged.filter((s) => s.marker === 'stated');

  // Acceptances recorded in the log must still match a statement's text.
  const acceptedByQuestion = new Map();
  for (const s of statements) {
    if (s.marker !== 'accepted') continue;
    if (!acceptedByQuestion.has(s.question)) acceptedByQuestion.set(s.question, []);
    acceptedByQuestion.get(s.question).push({ ...s, hash: textHash(s.text) });
  }
  // What a DECISION entry that does not verify is, in the order the researcher
  // needs to know it: after the break everything is broken; before the first
  // seal everything is legacy; a sealed entry with no key here is unverifiable.
  const stateOf = (e) => {
    if (ledger.verified.has(e.seq)) return 'verified';
    if (ledger.broken && e.seq >= ledger.broken.seq) return 'broken';
    if (ledger.legacy.includes(e.seq)) return 'legacy';
    return 'unverifiable';
  };
  // An acceptance is logged only by an entry naming its question and hash
  // that verifies (§4.4). An entry that does not still binds a hash — stale is
  // stale whoever wrote it — but it gives no cover: SQ-21's D7b/D7c/D8 forged
  // exactly such an entry.
  const coverByAcceptance = new Map();
  const staleAcceptances = [];
  const unverifiedDecisions = [];
  for (const e of log.entries) {
    if (e.kind !== 'DECISION') continue;
    const state = stateOf(e);
    // Every DECISION that does not verify is listed, whatever its ref: a
    // `framing chosen` entry is as much the researcher's act as an acceptance
    // (SQ-139). Only the cover and stale bookkeeping below is about acceptances.
    if (state !== 'verified') unverifiedDecisions.push({ seq: e.seq, ref: e.ref, hash: e.hash, line: e.line, state });
    const m = e.hash ? ACCEPT_REF_RE.exec(e.ref) : null;
    if (!m) continue;
    const cover = { seq: e.seq, state };
    const acceptance = `${m[1]}:${e.hash}`;
    const covered = coverByAcceptance.get(acceptance);
    if (!covered || (state === 'verified' && covered.state !== 'verified')) coverByAcceptance.set(acceptance, cover);
    const live = (acceptedByQuestion.get(m[1]) || []).some((s) => s.hash === e.hash);
    if (!live) staleAcceptances.push({ seq: e.seq, ref: e.ref, hash: e.hash });
  }
  // Accepted statements no verified entry accounts for: a hand edit, a merge,
  // or a planted acceptance. `coveredBy` names the entry that claims it, if
  // any, and why that claim does not count.
  const unloggedAcceptances = [];
  for (const list of acceptedByQuestion.values()) {
    for (const s of list) {
      const cover = coverByAcceptance.get(`${s.question}:${s.hash}`) || null;
      if (cover && cover.state === 'verified') continue;
      unloggedAcceptances.push({ question: s.question, line: s.line, hash: s.hash, text: s.text, coveredBy: cover });
    }
  }

  return {
    statuses,
    empty,
    open,
    violations,
    unmarked,
    untagged,
    invisibleCommitments,
    conversationalStated,
    staleAcceptances,
    unloggedAcceptances,
    unverifiedDecisions,
    ledger,
    problems: parsed.problems,
  };
}

const WHY = {
  unsealed: 'an unsealed entry follows a sealed one',
  anchor: 'its own content or the unsealed block before it changed',
  chain: 'entries before it are missing or were removed',
  content: 'its own heading or body changed',
};

const COVER_STATE = {
  legacy: 'legacy (no seal)',
  unverifiable: 'unverifiable here',
  broken: 'broken',
};

function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : noun.endsWith('y') ? '' : 's'}`.replace(/entry(s)?$/, n === 1 ? 'entry' : 'entries');
}

// One word for the session summary (§5.2's budget) …
function ledgerSummary(ledger) {
  if (ledger.status === 'broken') return `BROKEN at #${ledger.broken.seq} (${ledger.broken.why}) — run research-harness review`;
  if (ledger.status === 'unverifiable') {
    return ledger.reason === 'no-key' ? 'unverifiable here (no key on this machine)' : `unverifiable (${plural(ledger.legacy.length, 'entry')} predate the seal)`;
  }
  return ledger.verified.size ? 'verified' : 'empty';
}

// … and the full verdict for `review`, which is where the researcher reads
// which entry broke and what to do about it (§4.7: the harness never repairs).
function ledgerReport(ledger, keyFile) {
  const legacyNote = ledger.legacy.length ? `entries ${ledger.legacy.map((n) => `#${n}`).join(', ')} predate the seal` : '';
  if (ledger.status === 'broken') {
    return [
      `BROKEN at #${ledger.broken.seq} (line ${ledger.broken.line}): ${WHY[ledger.broken.why]}.`,
      'The harness never repairs a ledger: deciding which version is true is the researcher\'s act. Until then no entry from the break onward gives an acceptance cover.',
    ];
  }
  if (ledger.status === 'unverifiable') {
    if (ledger.reason === 'legacy') return [`unverifiable: ${legacyNote}`];
    return [`unverifiable here: no sealing key on this machine (expected at ${keyFile}); the sealed entries read as intact and cannot be confirmed here${legacyNote ? `; ${legacyNote}` : ''}`];
  }
  if (!ledger.verified.size) return ['empty: no entries yet'];
  return [`verified: ${plural(ledger.verified.size, 'sealed entry')}${legacyNote ? `; ${legacyNote}` : ''}`];
}

function coverNote(coveredBy) {
  return coveredBy ? ` — covered only by #${coveredBy.seq}, ${COVER_STATE[coveredBy.state]}` : '';
}

module.exports = { mechanicalReview, ledgerSummary, ledgerReport, coverNote, COVER_STATE };
