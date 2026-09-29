#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('../hooks/lib/project');
const decisions = require('../hooks/lib/decisions');
const profileLib = require('../hooks/lib/profile');
const seal = require('../hooks/lib/seal');
const stateLib = require('../hooks/lib/state');
const { acceptStatement } = require('../hooks/lib/accept');
const { appendLog } = require('../hooks/lib/log');
const { mechanicalReview, ledgerReport, coverNote, COVER_STATE } = require('../hooks/lib/review');
const { summarize } = require('../hooks/inject-state');

const MODES = ['brainstorming', 'seed', 'import'];
const USAGE = [
  'research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--profile <id>]',
  'research-harness status',
  'research-harness review',
  'research-harness accept <n.m> [--match <substring>] [--why <text>] [--rejected <text>]',
  'research-harness log DISCOVERY|CONSTRAINT <ref> --body <text> [--why <text>] [--supersedes <n>]',
  'research-harness serve [--no-open]',
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

// A refusal from the write library: a malformed call exits 2, with the usage
// text when the refusal is about the call's shape; anything else exits 1.
function refused(result) {
  if (result.code !== 'invalid') return fail(result.error);
  return fail(result.usage ? `${result.error}\n${USAGE}` : result.error, 2);
}

// ---------- init ----------

// Two frontmatter values are the researcher's own text: the project slug and
// the outlet. Written bare, an outlet like `open: ISR / MISQ` makes the whole
// frontmatter unreadable for a real YAML reader — pandoc refuses the canvas
// with "mapping values are not allowed in this context" (SQ-73) — while this
// plugin's own lenient reader hid the breach. A double-quoted scalar is valid
// YAML everywhere, and canvas.js reads the quotes and their escapes back off.
// profile and mode need no quoting: init has already refused any value that is
// not one of the plugin's own identifiers.
function yamlString(value) {
  return JSON.stringify(String(value));
}

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
    `project: ${yamlString(flags.project)}`,
    `outlet: ${yamlString(typeof flags.outlet === 'string' ? flags.outlet : '')}`,
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
  return stateLib.loadState(project.projectDir({}), { pluginRoot: pluginRoot() });
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

// The approval path lives in hooks/lib/accept.js; this maps its result to output.
function accept(positional, flags) {
  const questionId = positional[0];
  const result = acceptStatement({
    root: project.projectDir({}),
    questionId,
    match: typeof flags.match === 'string' ? flags.match : undefined,
    why: typeof flags.why === 'string' ? flags.why : undefined,
    rejected: typeof flags.rejected === 'string' ? flags.rejected : undefined,
    pluginRoot: pluginRoot(),
  });
  if (!result.ok) return refused(result);
  say(`Accepted ${questionId} (was [${result.was}]): ${result.text}`);
  say(`Logged as #${result.seq} with text ${result.hash}, sealed ${result.seal}.`);
  return 0;
}

// ---------- log ----------

// The append path lives in hooks/lib/log.js; this maps its result to output.
function log(positional, flags) {
  const [kind, ref] = positional;
  const result = appendLog({
    root: project.projectDir({}),
    kind,
    ref,
    body: flags.body,
    why: typeof flags.why === 'string' ? flags.why : undefined,
    supersedes: flags.supersedes === undefined ? undefined : Number(flags.supersedes),
    pluginRoot: pluginRoot(),
  });
  if (!result.ok) return refused(result);
  say(`Logged #${result.seq} ${kind} ${ref.trim()}, sealed ${result.seal}.`);
  return 0;
}

// ---------- serve ----------

// The session view (US-2). A human runs this in their own terminal; the URL
// with the single-use code goes to their browser and their terminal, and the
// token it is traded for never leaves the server and the view. The terminal
// also shows when the code is redeemed. It runs until SIGINT.
function serve(flags) {
  const root = project.projectDir({});
  if (!fs.existsSync(project.canvasPath(root))) return fail('This is not a paper project: no research/canvas.md. Run research-harness init first.');
  const canvasServe = require('./canvas-serve');
  canvasServe.start({ root, pluginRoot: pluginRoot(), log: say }).then((running) => {
    say(running.url);
    if (flags['no-open'] !== true) canvasServe.openInBrowser(running.url);
    process.once('SIGINT', () => {
      running.close().then(() => process.exit(0));
    });
  }, (err) => {
    say(`Cannot start the session view: ${err.message}`);
    process.exitCode = 1;
  });
  return 0;
}

// ---------- entry ----------

function main(argv) {
  // `--help`/`-h` is answered before anything else, on any subcommand: the
  // usage is the whole answer, exit 0, no project looked at and no file
  // touched. With no subcommand at all the usage is also the right answer
  // rather than the refusal an unknown subcommand earns.
  if (argv.includes('--help') || argv.includes('-h')) {
    say(USAGE);
    return 0;
  }
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();
  switch (command) {
    case 'init': return init(flags);
    case 'status': return status();
    case 'review': return review();
    case 'accept': return accept(positional, flags);
    case 'log': return log(positional, flags);
    case 'serve': return serve(flags);
    case undefined:
      say(USAGE);
      return 0;
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

module.exports = { main, replaceMarker: stateLib.replaceMarker };
