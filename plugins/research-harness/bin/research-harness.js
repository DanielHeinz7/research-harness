#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('../hooks/lib/project');
const canvas = require('../hooks/lib/canvas');
const decisions = require('../hooks/lib/decisions');
const { textHash } = require('../hooks/lib/hash');
const profileLib = require('../hooks/lib/profile');
const { mechanicalReview } = require('../hooks/lib/review');
const { summarize } = require('../hooks/inject-state');

const MODES = ['brainstorming', 'seed', 'import'];
const USAGE = [
  'research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--profile <id>]',
  'research-harness status',
  'research-harness review',
  'research-harness accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]',
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
  if (fs.existsSync(canvasFile)) return fail(`${path.relative(root, canvasFile)} already exists; nothing written.`);

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
  say(`Created ${path.relative(root, canvasFile)} and ${path.relative(root, decisionsFile)} (profile ${profileId}, mode ${flags.mode}).`);
  say('Every element is empty. That is the correct starting state.');
  return 0;
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
  return { root, canvasText, parsed, decisionsText, graph, profileError };
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
  const report = mechanicalReview({ parsed: state.parsed, graph: state.graph, decisionsText: state.decisionsText });
  const list = (arr) => (arr.length ? arr.join(', ') : 'none');
  const stmt = (s) => `${s.question} [${s.marker === null ? 'unmarked' : s.marker}] (line ${s.line}): ${s.text}`;
  const lines = ['# Mechanical review', ''];
  if (state.profileError) lines.push(`> ${state.profileError}; dependencies not checked.`, '');
  if (report.problems.length) lines.push('## Parse problems', ...report.problems, '');
  lines.push('## Element status', ...state.parsed.elements.map((e) => `${e.number} ${e.title}: ${report.statuses[e.number].status}${report.statuses[e.number].open ? ` (+${report.statuses[e.number].open} open)` : ''}`), '');
  lines.push('## Empty elements', list(report.empty), '');
  lines.push('## Open elements (proposals only)', list(report.open), '');
  lines.push('## Dependency violations', ...(report.violations.length ? report.violations.map((v) => `element ${v.element} is accepted but ${v.missing.map((m) => `element ${m.element} is ${m.status}`).join(', ')}`) : ['none']), '');
  lines.push('## Unmarked statements', ...(report.unmarked.length ? report.unmarked.map(stmt) : ['none']), '');
  lines.push('## Untagged statements', '(no `src:` or `unverified` — decide whether each is a factual claim)', ...(report.untagged.length ? report.untagged.map(stmt) : ['none']), '');
  lines.push('## Conversational [stated] statements (review periodically)', ...(report.conversationalStated.length ? report.conversationalStated.map(stmt) : ['none']), '');
  lines.push('## Stale acceptances', ...(report.staleAcceptances.length ? report.staleAcceptances.map((s) => `#${s.seq} ${s.ref} — text ${s.hash} no longer matches any accepted statement`) : ['none']), '');
  lines.push('## Unlogged acceptances', ...(report.unloggedAcceptances.length ? report.unloggedAcceptances.map((s) => `${s.question} (line ${s.line}): ${s.text}`) : ['none']), '');
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

  const lines = state.canvasText.split('\n');
  const start = target.line - 1;
  const count = target.raw.split('\n').length;
  const replaced = replaceMarker(target.raw, 'accepted');
  lines.splice(start, count, ...replaced.split('\n'));
  fs.writeFileSync(project.canvasPath(state.root), lines.join('\n'));

  const log = decisions.parseDecisions(state.decisionsText);
  const hash = textHash(target.text);
  decisions.appendEntry(project.decisionsPath(state.root), decisions.formatEntry({
    seq: log.maxSeq + 1,
    date: today(),
    kind: 'DECISION',
    ref: `${questionId} accepted`,
    hash,
    body: `${target.text} [accepted${target.tags.length ? `, ${target.tags.join(', ')}` : ''}]`,
    why: typeof flags.why === 'string' ? flags.why : undefined,
    rejected: typeof flags.rejected === 'string' ? flags.rejected : undefined,
  }));
  say(`Accepted ${questionId} (was [${target.marker}]): ${target.text}`);
  say(`Logged as #${log.maxSeq + 1} with text ${hash}.`);
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
    default: return fail(USAGE, 2);
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, replaceMarker };
