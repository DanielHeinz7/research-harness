'use strict';

const path = require('node:path');

const project = require('./project');
const canvas = require('./canvas');
const profileLib = require('./profile');
const seal = require('./seal');
const { textHash } = require('./hash');

function defaultPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
}

// The project state every write reads first. The CLI and the session server
// both call this in-process, so there is one reading of the files. `variant`
// reads a variant's state directory instead of the main one; the sealing key
// is the project's either way, since it belongs to the root.
function loadState(root, { pluginRoot, variant } = {}) {
  if (variant !== undefined && !project.isVariantName(variant)) {
    return { root, error: `--variant takes a name of lowercase letters, digits and hyphens, not ${JSON.stringify(variant)}.`, code: 'invalid' };
  }
  const paths = { canvas: project.canvasPath(root, variant), decisions: project.decisionsPath(root, variant) };
  const canvasText = project.readIfExists(paths.canvas);
  if (canvasText === null) {
    if (variant !== undefined) {
      return { root, paths, error: `There is no variant "${variant}": no ${path.relative(root, paths.canvas)}. Create it with research-harness init --variant ${variant} --lens "<text>".`, code: 'not-found' };
    }
    return {
      root,
      paths,
      error: `This is not a paper project: no ${path.relative(root, paths.canvas) || 'research/canvas.md'}. Run research-harness init first.`,
      code: 'not-found',
    };
  }
  const parsed = canvas.parseCanvas(canvasText);
  const decisionsText = project.readIfExists(paths.decisions) || '';
  let graph = null;
  let profileError = null;
  try {
    graph = profileLib.loadProfile(parsed.frontmatter.profile || 'is-qualitative', pluginRoot || defaultPluginRoot()).graph;
  } catch (err) {
    profileError = err.message;
  }
  // No key is the normal state of a fresh clone; a key that exists and cannot
  // be read is reported, not hidden behind "no key".
  let key = null;
  let keyError = null;
  try {
    key = seal.readKey(root);
  } catch (err) {
    keyError = `the sealing key at ${seal.keyPath(root)} exists but cannot be read (${(err && err.code) || 'unknown error'})`;
  }
  return { root, variant, paths, canvasText, parsed, decisionsText, graph, profileError, key, keyError };
}

// Why the ledger cannot take a new entry right now, or null. Checked before
// the canvas is touched, so a refusal leaves nothing half-done.
function ledgerRefusal(state) {
  const refuse = (error) => ({ error, code: 'ledger' });
  if (state.keyError) return refuse(`${state.keyError}; nothing is written.`);
  if (!state.key) {
    return refuse('No sealing key for this project on this machine, so nothing is written: an entry counts only if it verifies (§4.7). Run `research-harness init --project <slug> --mode <mode>` once here to create the key, then retry.');
  }
  const chain = seal.verifyChain(state.decisionsText, state.key);
  if (chain.status === 'broken') {
    return refuse(`${path.relative(state.root, state.paths.decisions)} is broken at #${chain.broken.seq} (line ${chain.broken.line}); nothing is written. The harness never repairs a ledger — run research-harness review, then decide which version is true.`);
  }
  return null;
}

// The statement a write from the view means: the one in this question whose
// text hash is the one the view saw. Returns the matches (any marker), so the
// caller decides what "gone", "twice" and "already done" mean for its write.
function statementsByHash(parsed, questionId, expectedHash, match) {
  const question = findQuestion(parsed, questionId).question;
  if (!question) return [];
  return question.statements.filter((s) => textHash(s.text) === expectedHash
    && (typeof match !== 'string' || s.text.includes(match)));
}

function findQuestion(parsed, questionId) {
  const element = parsed.elements.find((e) => e.questions.some((q) => q.id === questionId));
  const question = element ? element.questions.find((q) => q.id === questionId) : null;
  return { element, question };
}

// Only the marker changes; the evidence tags the researcher put on the
// statement are the statement's, not the acceptance's.
function replaceMarker(raw, newMarker) {
  return raw.replace(/\[([^[\]]+)\]\s*$/, (_, group) => {
    const parts = group.split(',').map((p) => p.trim()).filter(Boolean);
    parts[0] = newMarker;
    return `[${parts.join(', ')}]`;
  });
}

// Rewrites one statement's lines in the canvas text with a new marker.
function withMarker(canvasText, statement, marker) {
  const lines = canvasText.split('\n');
  const replaced = replaceMarker(statement.raw, marker);
  lines.splice(statement.line - 1, statement.raw.split('\n').length, ...replaced.split('\n'));
  return lines.join('\n');
}

const QUESTION_ID = /^[1-9]\.\d+$/;

module.exports = { loadState, ledgerRefusal, findQuestion, statementsByHash, replaceMarker, withMarker, QUESTION_ID, defaultPluginRoot };
