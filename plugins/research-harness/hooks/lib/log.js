'use strict';

const seal = require('./seal');
const { loadState, ledgerRefusal } = require('./state');

const LOG_KINDS = ['DISCOVERY', 'CONSTRAINT'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Every free-text field a write puts into decisions.md passes through this:
// a line that reads as an entry heading is parsed as the next entry, which
// leaves it unsealed and breaks the chain — and a broken ledger stops the
// researcher's own approval path, so a write the model was allowed to make
// would cost them the accept (SQ-29 F10, chain C2/C3/C3b).
const ENTRY_HEADING = /^## \[#/m;
function headingRefusal(...fields) {
  for (const field of fields) {
    if (typeof field === 'string' && ENTRY_HEADING.test(field)) {
      return 'The body may not contain a line that starts like an entry heading (`## [#`).';
    }
  }
  return null;
}

// `usage` marks a refusal about the call's shape, which the CLI answers with
// its usage text.
function refuse(code, error, usage = false) {
  return usage ? { ok: false, code, error, usage } : { ok: false, code, error };
}

// The append path for what the model and the researcher find out: sealed,
// so it verifies, and never a DECISION, which is the approval path's alone.
function appendLog({ root, kind, ref, body, why, supersedes, pluginRoot, variant } = {}) {
  if (kind === 'DECISION') return refuse('invalid', 'A DECISION is the researcher\'s act: it is written by /research-harness:accept, never by log.', true);
  if (!LOG_KINDS.includes(kind)) return refuse('invalid', `log needs a kind, ${LOG_KINDS.join(' or ')}.`, true);
  if (typeof ref !== 'string' || !ref.trim() || /[·\n]/.test(ref)) return refuse('invalid', 'log needs a reference — an element number or title, or a question id like 3.1 — without a middle dot or a line break.', true);
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return refuse('invalid', 'log needs --body <text>.', true);
  const reason = typeof why === 'string' ? why : undefined;
  const heading = headingRefusal(text, reason);
  if (heading) return refuse('invalid', heading);
  if (supersedes !== undefined && !Number.isInteger(supersedes)) return refuse('invalid', '--supersedes takes an entry number.');

  const state = loadState(root, { pluginRoot, variant });
  if (state.error) return refuse(state.code, state.error);
  const refusal = ledgerRefusal(state);
  if (refusal) return refuse(refusal.code, `Cannot log: ${refusal.error}`);
  const logged = seal.sealedAppend(state.paths.decisions, {
    date: today(),
    kind,
    ref: ref.trim(),
    body: text,
    why: reason,
    supersedes,
  }, state.key);
  return { ok: true, seq: logged.seq, seal: logged.seal };
}

module.exports = { appendLog, headingRefusal, today, refuse, LOG_KINDS };
