'use strict';

const fs = require('node:fs');
const path = require('node:path');

const canvas = require('./canvas');
const decisions = require('./decisions');
const glossary = require('./glossary');
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
    by: state.by,
    why: reason,
    explained: explanation,
    rejected: rejectedText,
    openAtAccept,
  }, state.key, { decision: true });
  return { ok: true, seq: logged.seq, seal: logged.seal, hash, text: target.text, elementNumber: element.number, was: target.marker, openAtAccept };
}

// The glossary's approval path (§ Authorization and text binding): the entry's
// marker becomes [accepted] and a sealed DECISION binds the payload hash and
// the payload itself. Human-only like `accept`: the CLI and its skill are the
// routes, and the command guard refuses `glossary accept` to the model, so
// nothing here can be reached on the researcher's behalf.
function acceptGlossaryEntry({ root, id, why, explained, rejected, expectedHash, pluginRoot } = {}) {
  const state = loadState(root, { pluginRoot });
  if (state.error) return refuse(state.code, state.error);
  if (typeof id !== 'string' || !glossary.ID_RE.test(id)) return refuse('invalid', 'glossary accept needs an entry id like felt-safety: lowercase letters, digits and hyphens, the heading of the entry.', true);
  if (expectedHash !== undefined && typeof expectedHash !== 'string') return refuse('invalid', 'expectedHash must be a payload hash.');
  // Every acceptance carries the researcher's own one-sentence explanation of
  // what they accept; without it nothing is accepted.
  if (typeof explained !== 'string' || !explained.trim()) {
    return refuse('explanation-required', `Accepting the glossary entry ${id} needs your explanation: one sentence, in your own words, of why this is the definition that holds (--explained <text>). Nothing is accepted.`);
  }
  const explanation = explained.trim();
  const reason = typeof why === 'string' ? why : undefined;
  const rejectedText = typeof rejected === 'string' ? rejected : undefined;
  const heading = headingRefusal(reason, explanation, rejectedText) || labelRefusal(reason, explanation, rejectedText);
  if (heading) return refuse('invalid', heading);
  if (state.profileError) return refuse('dependency', `${state.profileError}; cannot check dependencies, so nothing is accepted.`);

  const relative = path.relative(state.root, state.paths.glossary);
  const text = project.readIfExists(state.paths.glossary);
  if (text === null) return refuse('not-found', `There is no ${relative}. Write the entry as a proposal first; nothing is accepted.`);
  // A document this reader cannot judge could mean the payload being bound is
  // not the payload a reader sees, so nothing is accepted from it.
  const parsed = glossary.parseGlossary(text);
  if (parsed.problems.length) {
    return refuse('unjudgeable', `Cannot accept ${id}: ${relative} does not parse cleanly (${parsed.problems.join('; ')}). Fix that first; nothing is accepted.`);
  }
  const entry = glossary.entryById(parsed, id);
  if (!entry) {
    const ids = parsed.entries.map((e) => e.id).filter(Boolean);
    return refuse('not-found', `There is no glossary entry ${id}. The entries are ${ids.length ? ids.join(', ') : 'none'}.`);
  }
  if (entry.problems.length) return refuse('unjudgeable', `Cannot accept ${id}: ${entry.problems.join('; ')}. Fix that first; nothing is accepted.`);
  if (entry.incomplete.length) return refuse('incomplete', `Cannot accept ${id}: ${entry.incomplete.join('; ')}.`);
  const origin = glossary.resolveOrigin(state.root, entry);
  if (origin.status !== 'ok') return refuse('origin', `Cannot accept ${id}: its origin cannot carry an acceptance (${origin.reason}).`);
  if (entry.marker === 'accepted') return refuse('already', `The glossary entry ${id} is already accepted.`);

  // The glossary is element 4's working reference, so element 4's own
  // dependencies gate an entry the way they gate 4's questions: a definition is
  // made of what the accepted elements say, and accepting it before them would
  // bind a payload that is about to move.
  const statuses = profileLib.statusByNumber(state.parsed);
  const unmet = (state.graph[4] || [])
    .map((d) => ({ element: d, status: statuses[d] ? statuses[d].status : 'missing' }))
    .filter((d) => d.status !== 'accepted');
  if (unmet.length) {
    return refuse('dependency', `Cannot accept ${id}: element 4 depends on ${unmet.map((d) => `element ${d.element} is ${d.status}`).join(', ')}. Accept those first, or change the graph in the profile.`);
  }
  // An acceptance is logged only by an entry that verifies (§4.4), so a ledger
  // that cannot take one refuses before the glossary moves. Everything that
  // can refuse has refused by the time the marker is written: a failed write
  // leaves the entry as it was, and the sealed entry below is what turns the
  // marker into an acceptance.
  const refusal = ledgerRefusal(state);
  if (refusal) return refuse(refusal.code, `Cannot accept ${id}: ${refusal.error}`);

  // The payload the accept view displayed, bound to the entry read right here:
  // if the entry changed while the view was open, the hashes differ and nothing
  // is written.
  const payload = glossary.entryPayload(entry);
  const hash = glossary.payloadHash(entry);
  if (expectedHash !== undefined && expectedHash !== hash) {
    return refuse('stale', `The glossary entry ${id} no longer holds the text you saw (it now hashes ${hash}); reload and look again. Nothing is accepted.`);
  }

  fs.writeFileSync(state.paths.glossary, glossary.withEntryMarker(text, entry, 'accepted'));

  const logged = seal.sealedAppend(state.paths.decisions, {
    date: today(),
    kind: 'DECISION',
    ref: `glossary ${id} accepted`,
    hash,
    body: JSON.stringify(payload),
    by: state.by,
    why: reason,
    explained: explanation,
    rejected: rejectedText,
  }, state.key, { decision: true });
  return { ok: true, seq: logged.seq, seal: logged.seal, hash, id, term: entry.term, payload, was: entry.marker };
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

module.exports = { acceptStatement, acceptGlossaryEntry, openChecks };
