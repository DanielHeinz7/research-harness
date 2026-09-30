'use strict';

const fs = require('node:fs');

const canvas = require('./canvas');
const decisions = require('./decisions');
const project = require('./project');
const profileLib = require('./profile');
const seal = require('./seal');
const { textHash } = require('./hash');
const { loadState, ledgerRefusal, findQuestion, statementsByHash, withMarker, QUESTION_ID } = require('./state');
const { headingRefusal, labelRefusal, today, refuse } = require('./log');

// The statement an accept means. Without expectedHash (the CLI) that is the
// single open candidate, narrowed by match; ambiguity is refused with the
// candidates, never guessed: picking for the researcher would be the model
// accepting on their behalf. With expectedHash (the view) it is the statement
// whose text the view showed; if that text is gone, the view was stale.
function pickTarget(parsed, questionId, match, expectedHash) {
  const matchNote = typeof match === 'string' ? ` matching "${match}"` : '';
  if (expectedHash !== undefined) {
    const found = statementsByHash(parsed, questionId, expectedHash, match);
    if (!found.length) return refuse('stale', `Question ${questionId} no longer holds the statement you saw (text ${expectedHash}); reload and look again. Nothing is accepted.`);
    if (found.length > 1) return refuse('ambiguous', `Question ${questionId} has ${found.length} statements with text ${expectedHash}; pick one with --match <substring>.`);
    const [target] = found;
    if (target.marker === 'accepted') return refuse('already', `Question ${questionId}: this statement is already accepted.`);
    if (target.marker === null) return refuse('not-found', `Question ${questionId}: nothing to accept${matchNote}.`);
    return { ok: true, target };
  }
  const { question } = findQuestion(parsed, questionId);
  let candidates = question.statements.filter((s) => s.marker !== null && s.marker !== 'accepted');
  if (typeof match === 'string') candidates = candidates.filter((s) => s.text.includes(match));
  if (!candidates.length) return refuse('not-found', `Question ${questionId}: nothing to accept${matchNote}.`);
  if (candidates.length > 1) {
    return refuse('ambiguous', `Question ${questionId} has ${candidates.length} candidates; pick one with --match <substring>:\n${candidates.map((s) => `  - [${s.marker}] ${s.text}`).join('\n')}`);
  }
  return { ok: true, target: candidates[0] };
}

// The approval path: the statement's marker becomes [accepted] and a sealed
// DECISION carrying its text hash is appended. The CLI and the session view
// both come through here.
function acceptStatement({ root, questionId, match, why, explained, rejected, expectedHash, pluginRoot } = {}) {
  const state = loadState(root, { pluginRoot });
  if (state.error) return refuse(state.code, state.error);
  if (typeof questionId !== 'string' || !QUESTION_ID.test(questionId)) return refuse('invalid', 'accept needs a question id like 3.1.', true);
  if (expectedHash !== undefined && typeof expectedHash !== 'string') return refuse('invalid', 'expectedHash must be a text hash.');
  // Every acceptance carries the researcher's own one-sentence explanation of
  // what they accept; without it nothing is accepted.
  if (typeof explained !== 'string' || !explained.trim()) {
    return refuse('explanation-required', `Accepting ${questionId} needs your explanation: one sentence, in your own words, of what you accept and why it holds (--explained <text>). Nothing is accepted.`);
  }
  const explanation = explained.trim();
  const reason = typeof why === 'string' ? why : undefined;
  const rejectedText = typeof rejected === 'string' ? rejected : undefined;
  const heading = headingRefusal(reason, explanation, rejectedText) || labelRefusal(reason, explanation, rejectedText);
  if (heading) return refuse('invalid', heading);
  if (state.profileError) return refuse('dependency', `${state.profileError}; cannot check dependencies, so nothing is accepted.`);

  const { element, question } = findQuestion(state.parsed, questionId);
  if (!question) return refuse('not-found', `There is no question ${questionId} in the canvas.`);

  const picked = pickTarget(state.parsed, questionId, match, expectedHash);
  if (!picked.ok) return picked;
  let { target } = picked;

  const statuses = profileLib.statusByNumber(state.parsed);
  const unmet = (state.graph[element.number] || [])
    .map((d) => ({ element: d, status: statuses[d] ? statuses[d].status : 'missing' }))
    .filter((d) => d.status !== 'accepted');
  if (unmet.length) {
    return refuse('dependency', `Cannot accept ${questionId}: element ${element.number} depends on ${unmet.map((d) => `element ${d.element} is ${d.status}`).join(', ')}. Accept those first, or change the graph in the profile.`);
  }
  // An acceptance is logged only by an entry that verifies (§4.4), so a
  // ledger that cannot take one refuses the acceptance before the canvas moves.
  const refusal = ledgerRefusal(state);
  if (refusal) return refuse(refusal.code, `Cannot accept ${questionId}: ${refusal.error}`);

  // The view saw the canvas some time ago: read it again right before the
  // write and find the statement it saw, or refuse.
  let canvasText = state.canvasText;
  if (expectedHash !== undefined) {
    canvasText = project.readIfExists(state.paths.canvas);
    if (canvasText === null) return refuse('stale', 'research/canvas.md is gone; nothing is accepted.');
    const again = pickTarget(canvas.parseCanvas(canvasText), questionId, match, expectedHash);
    if (!again.ok) return again;
    target = again.target;
  }

  // Check questions still open at this moment are recorded, not gating: the
  // researcher may accept anyway. Computed here from decisions.md alone, so
  // every route writes the same bytes.
  const openAtAccept = openChecks(project.readIfExists(state.paths.decisions) || '', questionId).map((e) => e.seq);

  fs.writeFileSync(state.paths.canvas, withMarker(canvasText, target, 'accepted'));

  const hash = textHash(target.text);
  const logged = seal.sealedAppend(state.paths.decisions, {
    date: today(),
    kind: 'DECISION',
    ref: `${questionId} accepted`,
    hash,
    body: `${target.text} [accepted${target.tags.length ? `, ${target.tags.join(', ')}` : ''}]`,
    why: reason,
    explained: explanation,
    rejected: rejectedText,
    openAtAccept,
  }, state.key, { decision: true });
  return { ok: true, seq: logged.seq, seal: logged.seal, hash, text: target.text, elementNumber: element.number, was: target.marker, openAtAccept };
}

// The open check questions on a question: every DISCOVERY with ref
// `<n.m> check` logged after the last DECISION on `n.m`. A DECISION on the
// question closes the checks before it.
function openChecks(decisionsText, questionId) {
  const { entries } = decisions.parseDecisions(decisionsText);
  const onQuestion = (e) => e.ref.trim().split(/\s+/)[0] === questionId;
  const lastDecision = entries.filter((e) => e.kind === 'DECISION' && onQuestion(e)).reduce((max, e) => Math.max(max, e.seq), 0);
  return entries.filter((e) => e.kind === 'DISCOVERY' && e.ref.trim() === `${questionId} check` && e.seq > lastDecision);
}

module.exports = { acceptStatement, openChecks };
