#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('../hooks/lib/project');
const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');
const profileLib = require('../hooks/lib/profile');
const seal = require('../hooks/lib/seal');
const { mechanicalReview, ledgerReport, coverNote, COVER_STATE } = require('../hooks/lib/review');
const { summarize } = require('../hooks/inject-state');

const MODES = ['brainstorming', 'seed', 'import'];
const LOG_KINDS = ['DISCOVERY', 'CONSTRAINT'];
const USAGE = [
  'research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--profile <id>]',
  'research-harness status',
  'research-harness review',
  'research-harness accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]',
  'research-harness log DISCOVERY|CONSTRAINT <ref> --body <text> [--why <text>] [--supersedes <n>]',
].join('\n');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// Every message goes to stdout: the skills embed this command through a `!`
// line, and that line carries stdout only (§5.4). A refusal the researcher
// cannot read is the same as no refusal.
function say(text) {
  process.stdout.write(`${text}\n`);
}

function fail(text, code = 1) {
  say(text);
  return code;
}

// Every free-text field a command writes into decisions.md passes through this:
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

// ---------- init ----------

function init(flags) {
  const root = project.projectDir({});
  if (!flags.project || typeof flags.project !== 'string') return fail(`--project is required.\n${USAGE}`, 2);
  if (!MODES.includes(flags.mode)) return fail(`--mode must be one of ${MODES.join(', ')}.\n${USAGE}`, 2);
  const profileId = typeof flags.profile === 'string' ? flags.profile : 'is-qualitative';
  try {
    profileLib.loadProfile(profileId, pluginRoot());
  } catch (err) {
    return fail(err.message, 2);
  }
  const canvasFile = project.canvasPath(root);
  // An existing project may still lack a key on this machine — a co-author's
  // clone, or a project started before the seal existed. init creates the
  // missing key and touches nothing else; with both present it does nothing.
  if (fs.existsSync(canvasFile)) {
    const key = seal.createKey(root);
    if (!key.created) return fail(`${path.relative(root, canvasFile)} already exists; nothing written.`);
    say(`${path.relative(root, canvasFile)} already exists; kept.`);
    say(keyLine(key));
    return 0;
  }

  // The template's own frontmatter documents the template; the project gets
  // its own. Everything below the frontmatter is copied unchanged, so the
  // heading grammar the parser depends on has one source.
  const template = fs.readFileSync(path.join(pluginRoot(), 'references', 'canvas-elements.md'), 'utf8');
  const body = template.replace(/^---[\s\S]*?\n---\n/, '');
  const frontmatter = [
    '---',
    `project: ${flags.project}`,
    `outlet: ${typeof flags.outlet === 'string' ? flags.outlet : ''}`,
    `profile: ${profileId}`,
    `created: ${today()}`,
    `mode: ${flags.mode}`,
    'canvas-schema: 2',
    '---',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(canvasFile), { recursive: true });
  fs.writeFileSync(canvasFile, `${frontmatter}${body}`);
  const decisionsFile = project.decisionsPath(root);
  if (!fs.existsSync(decisionsFile)) fs.writeFileSync(decisionsFile, decisions.header(flags.project));
  const key = seal.createKey(root);
  say(`Created ${path.relative(root, canvasFile)} and ${path.relative(root, decisionsFile)} (profile ${profileId}, mode ${flags.mode}).`);
  say(keyLine(key));
  say('Every element is empty. That is the correct starting state.');
  return 0;
}

function keyLine(key) {
  return key.created
    ? `Sealing key created at ${key.path} (mode 0600, outside the repository). It seals every entry of the decision log written on this machine; it is never committed.`
    : `Sealing key already present at ${key.path}; kept.`;
}

// ---------- status / review ----------

function loadState() {
  const root = project.projectDir({});
  const canvasText = project.readIfExists(project.canvasPath(root));
  if (canvasText === null) {
    return { error: `This is not a paper project: no ${path.relative(root, project.canvasPath(root)) || 'research/canvas.md'}. Run research-harness init first.` };
  }
  const parsed = canvas.parseCanvas(canvasText);
  const decisionsText = project.readIfExists(project.decisionsPath(root)) || '';
  let graph = null;
  let profileError = null;
  try {
    graph = profileLib.loadProfile(parsed.frontmatter.profile || 'is-qualitative', pluginRoot()).graph;
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
  return { root, canvasText, parsed, decisionsText, graph, profileError, key, keyError };
}

// Why the ledger cannot take a new entry right now, or null. Checked before
// the canvas is touched, so a refusal leaves nothing half-done.
function ledgerRefusal(state) {
  if (state.keyError) return `${state.keyError}; nothing is written.`;
  if (!state.key) {
    return `No sealing key for this project on this machine, so nothing is written: an entry counts only if it verifies (§4.7). Run \`research-harness init --project <slug> --mode <mode>\` once here to create the key, then retry.`;
  }
  const chain = seal.verifyChain(state.decisionsText, state.key);
  if (chain.status === 'broken') {
    return `research/decisions.md is broken at #${chain.broken.seq} (line ${chain.broken.line}); nothing is written. The harness never repairs a ledger — run research-harness review, then decide which version is true.`;
  }
  return null;
}

// The session hook and this command must never render the same state twice:
// summarize() is the one rendering, and it lives with the hook that injects it.
function status() {
  const root = project.projectDir({});
  const summary = summarize(root, { seenSeq: 0 });
  if (!summary) return fail('This is not a paper project: no research/canvas.md (or the file has no elements). Run research-harness init first.');
  say(summary.text);
  return 0;
}

function review() {
  const state = loadState();
  if (state.error) return fail(state.error);
  const report = mechanicalReview({ parsed: state.parsed, graph: state.graph, decisionsText: state.decisionsText, key: state.key });
  const list = (arr) => (arr.length ? arr.join(', ') : 'none');
  const stmt = (s) => `${s.question} [${s.marker === null ? 'unmarked' : s.marker}] (line ${s.line}): ${s.text}`;
  const lines = ['# Mechanical review', ''];
  if (state.profileError) lines.push(`> ${state.profileError}; dependencies not checked.`, '');
  if (state.keyError) lines.push(`> ${state.keyError}; the ledger is judged as if there were none.`, '');
  if (report.problems.length) lines.push('## Parse problems', ...report.problems, '');
  // Same wording as the session summary in hooks/inject-state.js: the count
  // names proposals, and an open element takes no plus sign because there is
  // nothing committed to add to.
  const status = (e) => {
    const s = report.statuses[e.number];
    const proposals = s.open ? ` (${s.status === 'open' ? '' : '+'}${s.open} proposal${s.open === 1 ? '' : 's'})` : '';
    return `${e.number} ${e.title}: ${s.status}${proposals}`;
  };
  lines.push('## Element status', ...state.parsed.elements.map(status), '');
  lines.push('## Empty elements', list(report.empty), '');
  lines.push('## Open elements (proposals only)', list(report.open), '');
  lines.push('## Dependency violations', ...(report.violations.length ? report.violations.map((v) => `element ${v.element} is accepted but ${v.missing.map((m) => `element ${m.element} is ${m.status}`).join(', ')}`) : ['none']), '');
  lines.push('## Unmarked statements', ...(report.unmarked.length ? report.unmarked.map(stmt) : ['none']), '');
  lines.push('## Untagged statements', '(no `src:` or `unverified` — decide whether each is a factual claim)', ...(report.untagged.length ? report.untagged.map(stmt) : ['none']), '');
  lines.push('## Conversational [stated] statements (review periodically)', ...(report.conversationalStated.length ? report.conversationalStated.map(stmt) : ['none']), '');
  const hiddenWhy = { comment: 'inside an HTML comment', code: 'inside a code block or indented as code' };
  lines.push('## Committed but not visible', '(the file holds these; a reader of the rendered canvas does not see them)', ...(report.invisibleCommitments.length ? report.invisibleCommitments.map((s) => `${s.question} [${s.marker}] (line ${s.line}): ${s.text} — ${hiddenWhy[s.hidden] || s.hidden}`) : ['none']), '');
  lines.push('## Decision log', ...ledgerReport(report.ledger, seal.keyPath(state.root)), '');
  lines.push('## Stale acceptances', ...(report.staleAcceptances.length ? report.staleAcceptances.map((s) => `#${s.seq} ${s.ref} — text ${s.hash} no longer matches any accepted statement`) : ['none']), '');
  lines.push('## Unlogged acceptances', '(no verified DECISION entry accounts for these)', ...(report.unloggedAcceptances.length ? report.unloggedAcceptances.map((s) => `${s.question} (line ${s.line}): ${s.text}${coverNote(s.coveredBy)}`) : ['none']), '');
  lines.push('## Unverified decisions', '(DECISION entries that give no cover)', ...(report.unverifiedDecisions.length ? report.unverifiedDecisions.map((d) => `#${d.seq} ${d.ref} — ${COVER_STATE[d.state]}`) : ['none']), '');
  say(lines.join('\n'));
  return 0;
}

// ---------- accept ----------

// Only the marker changes; the evidence tags the researcher put on the
// statement are the statement's, not the acceptance's.
function replaceMarker(raw, newMarker) {
  return raw.replace(/\[([^[\]]+)\]\s*$/, (_, group) => {
    const parts = group.split(',').map((p) => p.trim()).filter(Boolean);
    parts[0] = newMarker;
    return `[${parts.join(', ')}]`;
  });
}

function accept(positional, flags) {
  const state = loadState();
  if (state.error) return fail(state.error);
  const questionId = positional[0];
  if (!questionId || !/^[1-9]\.\d+$/.test(questionId)) return fail(`accept needs a question id like 3.1.\n${USAGE}`, 2);
  const why = typeof flags.why === 'string' ? flags.why : undefined;
  const rejected = typeof flags.rejected === 'string' ? flags.rejected : undefined;
  const heading = headingRefusal(why, rejected);
  if (heading) return fail(heading, 2);
  if (state.profileError) return fail(`${state.profileError}; cannot check dependencies, so nothing is accepted.`);

  const element = state.parsed.elements.find((e) => e.questions.some((q) => q.id === questionId));
  const question = element && element.questions.find((q) => q.id === questionId);
  if (!question) return fail(`There is no question ${questionId} in the canvas.`);

  // Ambiguity is refused with the candidates, never guessed: picking for the
  // researcher would be the model accepting on their behalf.
  let candidates = question.statements.filter((s) => s.marker !== null && s.marker !== 'accepted');
  if (typeof flags.match === 'string') candidates = candidates.filter((s) => s.text.includes(flags.match));
  if (!candidates.length) return fail(`Question ${questionId}: nothing to accept${typeof flags.match === 'string' ? ` matching "${flags.match}"` : ''}.`);
  if (candidates.length > 1) {
    return fail(`Question ${questionId} has ${candidates.length} candidates; pick one with --match <substring>:\n${candidates.map((s) => `  - [${s.marker}] ${s.text}`).join('\n')}`);
  }
  const target = candidates[0];

  const statuses = profileLib.statusByNumber(state.parsed);
  const unmet = (state.graph[element.number] || [])
    .map((d) => ({ element: d, status: statuses[d] ? statuses[d].status : 'missing' }))
    .filter((d) => d.status !== 'accepted');
  if (unmet.length) {
    return fail(`Cannot accept ${questionId}: element ${element.number} depends on ${unmet.map((d) => `element ${d.element} is ${d.status}`).join(', ')}. Accept those first, or change the graph in the profile.`);
  }
  // An acceptance is logged only by an entry that verifies (§4.4), so a
  // ledger that cannot take one refuses the acceptance before the canvas moves.
  const refusal = ledgerRefusal(state);
  if (refusal) return fail(`Cannot accept ${questionId}: ${refusal}`);

  const lines = state.canvasText.split('\n');
  const start = target.line - 1;
  const count = target.raw.split('\n').length;
  const replaced = replaceMarker(target.raw, 'accepted');
  lines.splice(start, count, ...replaced.split('\n'));
  fs.writeFileSync(project.canvasPath(state.root), lines.join('\n'));

  const hash = textHash(target.text);
  const logged = seal.sealedAppend(project.decisionsPath(state.root), {
    date: today(),
    kind: 'DECISION',
    ref: `${questionId} accepted`,
    hash,
    body: `${target.text} [accepted${target.tags.length ? `, ${target.tags.join(', ')}` : ''}]`,
    why,
    rejected,
  }, state.key, { decision: true });
  say(`Accepted ${questionId} (was [${target.marker}]): ${target.text}`);
  say(`Logged as #${logged.seq} with text ${hash}, sealed ${logged.seal}.`);
  return 0;
}

// ---------- log ----------

// The append path for what the model and the researcher find out: sealed,
// so it verifies, and never a DECISION, which is the approval path's alone.
function log(positional, flags) {
  const [kind, ref] = positional;
  if (kind === 'DECISION') return fail(`A DECISION is the researcher's act: it is written by /research-harness:accept, never by log.\n${USAGE}`, 2);
  if (!LOG_KINDS.includes(kind)) return fail(`log needs a kind, ${LOG_KINDS.join(' or ')}.\n${USAGE}`, 2);
  if (typeof ref !== 'string' || !ref.trim() || /[·\n]/.test(ref)) return fail(`log needs a reference — an element number or title, or a question id like 3.1 — without a middle dot or a line break.\n${USAGE}`, 2);
  const body = typeof flags.body === 'string' ? flags.body.trim() : '';
  if (!body) return fail(`log needs --body <text>.\n${USAGE}`, 2);
  const why = typeof flags.why === 'string' ? flags.why : undefined;
  const heading = headingRefusal(body, why);
  if (heading) return fail(heading, 2);
  const supersedes = flags.supersedes === undefined ? undefined : Number(flags.supersedes);
  if (supersedes !== undefined && !Number.isInteger(supersedes)) return fail('--supersedes takes an entry number.', 2);

  const state = loadState();
  if (state.error) return fail(state.error);
  const refusal = ledgerRefusal(state);
  if (refusal) return fail(`Cannot log: ${refusal}`);
  const logged = seal.sealedAppend(project.decisionsPath(state.root), {
    date: today(),
    kind,
    ref: ref.trim(),
    body,
    why,
    supersedes,
  }, state.key);
  say(`Logged #${logged.seq} ${kind} ${ref.trim()}, sealed ${logged.seal}.`);
  return 0;
}

// ---------- entry ----------

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();
  switch (command) {
    case 'init': return init(flags);
    case 'status': return status();
    case 'review': return review();
    case 'accept': return accept(positional, flags);
    case 'log': return log(positional, flags);
    default: return fail(USAGE, 2);
  }
}

// readIfExists lets every error but ENOENT through, so a canvas that exists but
// cannot be read (EACCES, EISDIR, ELOOP, ...) reaches this point as the
// operating system's error. That is the right answer and it belongs on one
// line, not in a stack trace: the researcher needs the file and the code, and
// "not a paper project" would be a lie. Anything that is not a filesystem
// error is a bug and keeps its trace. EISDIR arrives from `read`, not `open`,
// and carries no path; the state directory is the closest name there is.
function run(argv) {
  try {
    return main(argv);
  } catch (err) {
    if (err && err.code && err.syscall) {
      const where = err.path || `a state file in ${project.stateDir(project.projectDir({}))}`;
      return fail(`Cannot read ${where} (${err.code}). Restore access to the file and run the command again.`);
    }
    throw err;
  }
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));

module.exports = { main, replaceMarker };
