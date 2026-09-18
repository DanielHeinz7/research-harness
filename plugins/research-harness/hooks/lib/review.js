'use strict';

const { allStatements } = require('./canvas');
const { textHash } = require('./hash');
const { parseDecisions } = require('./decisions');
const { dependencyViolations, statusByNumber } = require('./profile');

const ACCEPT_REF_RE = /^([1-9]\.\d+) accepted$/;

// The mechanical half of canvas-review (§5.4, items 1, 2, 5, 6, 7). The
// judgment half — fit, refutation, manuscript support — stays in the skill.
// Nothing here decides whether two elements contradict each other; it only
// computes what needs no judgment at all.
function mechanicalReview({ parsed, graph, decisionsText }) {
  const statuses = statusByNumber(parsed);
  const numbers = parsed.elements.map((e) => e.number);
  const statements = allStatements(parsed);
  const log = parseDecisions(decisionsText || '');

  const empty = numbers.filter((n) => statuses[n].status === 'empty');
  const open = numbers.filter((n) => statuses[n].status === 'open');
  const violations = graph ? dependencyViolations(parsed, graph) : [];
  const unmarked = statements.filter((s) => s.marker === null);
  const untagged = statements.filter((s) => s.marker !== null && s.tags.length === 0);
  const conversationalStated = untagged.filter((s) => s.marker === 'stated');

  // Acceptances recorded in the log must still match a statement's text.
  const acceptedByQuestion = new Map();
  for (const s of statements) {
    if (s.marker !== 'accepted') continue;
    if (!acceptedByQuestion.has(s.question)) acceptedByQuestion.set(s.question, []);
    acceptedByQuestion.get(s.question).push({ ...s, hash: textHash(s.text) });
  }
  const loggedHashes = new Set();
  const staleAcceptances = [];
  for (const e of log.entries) {
    if (e.kind !== 'DECISION' || !e.hash) continue;
    const m = ACCEPT_REF_RE.exec(e.ref);
    if (!m) continue;
    loggedHashes.add(e.hash);
    const live = (acceptedByQuestion.get(m[1]) || []).some((s) => s.hash === e.hash);
    if (!live) staleAcceptances.push({ seq: e.seq, ref: e.ref, hash: e.hash });
  }
  // Accepted statements with no log entry: someone edited the file by hand.
  const unloggedAcceptances = [];
  for (const list of acceptedByQuestion.values()) {
    for (const s of list) {
      if (!loggedHashes.has(s.hash)) {
        unloggedAcceptances.push({ question: s.question, line: s.line, hash: s.hash, text: s.text });
      }
    }
  }

  return {
    statuses,
    empty,
    open,
    violations,
    unmarked,
    untagged,
    conversationalStated,
    staleAcceptances,
    unloggedAcceptances,
    problems: parsed.problems,
  };
}

module.exports = { mechanicalReview };
