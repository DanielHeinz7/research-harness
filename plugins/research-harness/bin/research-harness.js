#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const project = require('../hooks/lib/project');
const canvasLib = require('../hooks/lib/canvas');
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
  'research-harness init --project <slug> --mode brainstorming|seed|import [--outlet <name>] [--title <text>] [--profile <id>]',
  'research-harness status [--key <file>]',
  'research-harness review [--key <file>]',
  'research-harness accept <n.m> --explained <text> [--match <substring>] [--why <text>] [--rejected <text>]',
  'research-harness log DISCOVERY|CONSTRAINT <ref> --body <text> [--why <text>] [--supersedes <n>]',
  'research-harness title [<text>]',
  'research-harness serve [--no-open]',
  'research-harness doctor',
  'research-harness install-cli [--dir <path>]',
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

// Three frontmatter values are the researcher's own text: the project slug, the
// title and the outlet. Written bare, an outlet like `open: ISR / MISQ` makes
// the whole frontmatter unreadable for a real YAML reader — pandoc refuses the canvas
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
  const decisionsFile = project.decisionsPath(root);
  // An existing project may still lack a key on this machine — a co-author's
  // clone, or a project started before the seal existed. init creates the
  // missing key and touches nothing else; with both present it does nothing.
  // A log already sealed under another machine's key is the exception, below.
  if (fs.existsSync(canvasFile)) {
    // A canvas that exists is never rewritten, so a title given here would be
    // dropped in silence. `title` is the one door for that line: init points at
    // it rather than editing a frontmatter the researcher already has.
    if (typeof flags.title === 'string') {
      say(`--title was not applied: ${path.relative(root, canvasFile)} already exists; run research-harness title "<text>" to set it.`);
    }
    // A log that already carries seals was sealed with a key this machine does
    // not have, and a seal recomputes under that key alone: a fresh key here
    // would report an intact log as BROKEN (SQ-122). init refuses to make one
    // and names where the sealing machine's key belongs instead.
    const keyFile = seal.keyPath(root);
    const logText = fs.existsSync(decisionsFile) ? fs.readFileSync(decisionsFile, 'utf8') : '';
    if (!fs.existsSync(keyFile) && decisions.parseDecisions(logText).entries.some((e) => e.seal !== null)) {
      say(`${path.relative(root, decisionsFile)} is sealed on another machine: it stays unverifiable here until that machine's key is copied to ${keyFile}; nothing was changed.`);
      return 0;
    }
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
  const frontmatterLines = [
    '---',
    `project: ${yamlString(flags.project)}`,
  ];
  // A title is optional and the view falls back to the slug without one, so a
  // project that was given none carries no title line rather than an empty one.
  if (typeof flags.title === 'string') frontmatterLines.push(`title: ${yamlString(flags.title)}`);
  frontmatterLines.push(
    `outlet: ${yamlString(typeof flags.outlet === 'string' ? flags.outlet : '')}`,
    `profile: ${profileId}`,
    `created: ${today()}`,
    `mode: ${flags.mode}`,
    'canvas-schema: 2',
    '---',
    '',
  );
  const frontmatter = frontmatterLines.join('\n');
  fs.mkdirSync(path.dirname(canvasFile), { recursive: true });
  fs.writeFileSync(canvasFile, `${frontmatter}${body}`);
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

// `--key <file>` is the released key of a record received from elsewhere: what
// `review` and `status` verify with instead of the key this machine would read
// (§4.7). A key that cannot be read, or that is not 32 bytes, is refused in
// one line before anything is judged. Verification only: no writing path takes
// this. `{}` means no `--key` was given, which is not the same as a key of
// null.
function keyOverride(flags) {
  if (flags.key === undefined) return {};
  if (typeof flags.key !== 'string') return { error: `--key takes the file the sealing key was released as.\n${USAGE}`, code: 2 };
  try {
    return { key: seal.readKeyFile(flags.key) };
  } catch (err) {
    return { error: err.message };
  }
}

// The session hook and this command must never render the same state twice:
// summarize() is the one rendering, and it lives with the hook that injects it.
function status(flags) {
  const root = project.projectDir({});
  const given = keyOverride(flags);
  if (given.error) return fail(given.error, given.code || 1);
  const summary = summarize(root, { seenSeq: 0, key: given.key });
  if (!summary) return fail('This is not a paper project: no research/canvas.md (or the file has no elements). Run research-harness init first.');
  say(summary.text);
  return 0;
}

function review(flags) {
  const given = keyOverride(flags);
  if (given.error) return fail(given.error, given.code || 1);
  const state = loadState();
  if (state.error) return fail(state.error);
  // With `--key`, the key this machine happens to hold is not what this run
  // judges with, so a complaint about reading that one is not its business.
  const key = given.key === undefined ? state.key : given.key;
  const report = mechanicalReview({ parsed: state.parsed, graph: state.graph, decisionsText: state.decisionsText, key });
  const list = (arr) => (arr.length ? arr.join(', ') : 'none');
  const stmt = (s) => `${s.question} [${s.marker === null ? 'unmarked' : s.marker}] (line ${s.line}): ${s.text}`;
  const lines = ['# Mechanical review', ''];
  if (state.profileError) lines.push(`> ${state.profileError}; dependencies not checked.`, '');
  if (state.keyError && given.key === undefined) lines.push(`> ${state.keyError}; the ledger is judged as if there were none.`, '');
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
  // The head of the record as one line (SQ-124): the reviewer compares it with
  // the anchor the authors published, which is what catches a rewrite after the
  // fact. It needs no key of its own, so it prints on every run.
  lines.push('## Anchor', `Anchor: ${seal.logAnchor(state.decisionsText)}`, '');
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
    explained: typeof flags.explained === 'string' ? flags.explained : undefined,
    rejected: typeof flags.rejected === 'string' ? flags.rejected : undefined,
    pluginRoot: pluginRoot(),
  });
  if (!result.ok) return refused(result);
  say(`Accepted ${questionId} (was [${result.was}]): ${result.text}`);
  if (result.openAtAccept.length) say(`Accepted with open check questions: ${result.openAtAccept.map((n) => `#${n}`).join(', ')}.`);
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

// ---------- title ----------

// Where the title line is, or where it goes: the `title:` line already in the
// frontmatter, or the position directly after `project:` that init --title
// writes it to. `replace` says which of the two this is. Against a canvas this
// cannot place a line in — no frontmatter, no project: anchor — the answer is
// null, because any other position would be a guess at a file the researcher
// owns.
function titleLine(lines) {
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) return null;
  const block = lines.slice(1, end);
  const existing = block.findIndex((line) => /^title:/.test(line));
  if (existing >= 0) return { index: existing + 1, replace: true };
  const anchor = block.findIndex((line) => /^project:/.test(line));
  return anchor >= 0 ? { index: anchor + 2, replace: false } : null;
}

// The title is presentational: the view prints it and no marker, seal or
// acceptance reads it, so the model may set it here even though the guard keeps
// refusing a Write or Edit on the frontmatter. The file is rewritten one line at
// a time — insert the line, or replace it — and every other byte stays as it was.
function title(positional) {
  const root = project.projectDir({});
  const canvasFile = project.canvasPath(root);
  if (!fs.existsSync(canvasFile)) {
    return fail(`This is not a paper project: no ${path.relative(root, canvasFile)}. Run research-harness init first.`);
  }
  const text = fs.readFileSync(canvasFile, 'utf8');
  if (!positional.length) {
    const current = canvasLib.parseCanvas(text).frontmatter.title;
    say(current === undefined || String(current).trim() === '' ? 'No title set.' : String(current));
    return 0;
  }
  // An unquoted title arrives as several words; they are one title, not the
  // first word of one. A title that is empty once trimmed is refused rather
  // than written as an empty line the view would show as a blank header.
  const wanted = positional.join(' ').trim();
  if (!wanted) return fail(`A title cannot be empty. Pass it as the argument: research-harness title "<text>"`);
  const lines = text.split('\n');
  const at = titleLine(lines);
  if (!at) return fail(`${path.relative(root, canvasFile)} has no frontmatter with a project: line, so there is nowhere to set a title.`);
  const line = `title: ${yamlString(wanted)}`;
  if (at.replace) lines[at.index] = line;
  else lines.splice(at.index, 0, line);
  fs.writeFileSync(canvasFile, lines.join('\n'));
  say(`Title set: ${wanted}`);
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

// ---------- doctor ----------

const PLUGIN_NAME = 'research-harness';

// The three settings files Claude Code reads for this cwd, in the order a
// later one overrides an earlier one. doctor can only read what is on disk;
// it cannot see whether a running Claude Code process actually loaded the
// plugin.
function settingsSources(root) {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return [
    { label: 'user settings', file: path.join(home, 'settings.json') },
    { label: 'project settings', file: path.join(root, '.claude', 'settings.json') },
    { label: 'local settings', file: path.join(root, '.claude', 'settings.local.json') },
  ];
}

function checkPluginEnabled(root) {
  let match = null;
  const problems = [];
  for (const { label, file } of settingsSources(root)) {
    let raw;
    try {
      raw = project.readIfExists(file);
    } catch (err) {
      problems.push(`${file} cannot be read (${(err && err.code) || 'unknown error'})`);
      continue;
    }
    if (raw === null) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      problems.push(`${file} does not parse as JSON (${err.message})`);
      continue;
    }
    const enabled = data && typeof data === 'object' ? data.enabledPlugins : null;
    if (!enabled || typeof enabled !== 'object') continue;
    // The last file to name the key wins, which is exactly Claude Code's own
    // precedence (user, then project, then local) — so a later file that
    // disables the plugin is the answer, not the earlier one that enabled it.
    for (const key of Object.keys(enabled)) {
      if (key.startsWith(`${PLUGIN_NAME}@`)) {
        match = { label, file, key, value: !!enabled[key] };
      }
    }
  }
  if (problems.length) return { ok: false, name: 'plugin enabled', detail: problems.join('; ') };
  if (!match) {
    const files = settingsSources(root).map((s) => s.file).join(', ');
    return { ok: false, name: 'plugin enabled', detail: `no enabledPlugins entry for ${PLUGIN_NAME}@<marketplace> in ${files}` };
  }
  if (!match.value) return { ok: false, name: 'plugin enabled', detail: `${match.key} is disabled by ${match.label} (${match.file})` };
  return { ok: true, name: 'plugin enabled', detail: `${match.key} is enabled by ${match.label} (${match.file})` };
}

// Runs the guard exactly as Claude Code would: a PreToolUse payload on its
// stdin, cwd and CLAUDE_PROJECT_DIR pointed at the project, the verdict read
// back off stdout. Same mechanics as test/guard-promotion.test.js's run().
function runGuard(cwd, toolName, toolInput) {
  const { CLAUDE_PROJECT_DIR: _project, RESEARCH_HARNESS_DIR: _dir, ...ambient } = process.env;
  const script = path.join(pluginRoot(), 'hooks', 'guard-promotion.js');
  const result = childProcess.spawnSync(process.execPath, [script], {
    cwd,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot(), CLAUDE_PROJECT_DIR: cwd },
    input: JSON.stringify({ cwd, session_id: 'doctor', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
  });
  if (result.error) return { error: `could not run the guard (${result.error.message})` };
  if (result.status !== 0) return { error: `the guard exited ${result.status}: ${(result.stderr || result.stdout || '').trim()}` };
  if (!result.stdout) return { decision: null };
  const parsed = JSON.parse(result.stdout).hookSpecificOutput || {};
  return { decision: parsed.permissionDecision || null, reason: parsed.permissionDecisionReason };
}

// A throwaway project the guard is asked to judge: one [proposed] statement,
// promoted to [accepted] the way a model's Edit would. The guard must deny
// that, and must not deny an ordinary read — an always-deny guard is not a
// working guard.
function checkGuardDenies() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-doctor-'));
  try {
    fs.mkdirSync(path.join(dir, 'research'));
    const canvasFile = path.join(dir, 'research', 'canvas.md');
    const statement = 'A throwaway statement doctor writes to test the guard. [proposed]';
    const canvasText = [
      '---',
      'canvas-schema: 2',
      '---',
      '',
      '# 1 · Puzzle',
      '',
      '## 1.1 What is the broad question this project speaks to?',
      '',
      statement,
      '',
    ].join('\n');
    fs.writeFileSync(canvasFile, canvasText);

    const promote = runGuard(dir, 'Edit', {
      file_path: canvasFile,
      old_string: statement,
      new_string: statement.replace('[proposed]', '[accepted]'),
    });
    if (promote.error) return { ok: false, name: 'guard denies', detail: promote.error };
    if (promote.decision !== 'deny') {
      return { ok: false, name: 'guard denies', detail: 'the guard allowed a model edit that promotes a [proposed] statement to [accepted]; it should have denied it' };
    }

    const read = runGuard(dir, 'Read', { file_path: canvasFile });
    if (read.error) return { ok: false, name: 'guard denies', detail: read.error };
    if (read.decision === 'deny') {
      return { ok: false, name: 'guard denies', detail: `the guard denies an ordinary read of the canvas (${read.reason}); it should only deny writes it cannot judge` };
    }
    return { ok: true, name: 'guard denies', detail: 'guard-promotion.js denies a model promotion to [accepted] and allows an ordinary read' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Only inside a project: the sealing key `status` and `review` both need
// (via loadState) to write a verifiable decision-log entry.
function checkProjectState() {
  const state = loadState();
  if (state.error) return null;
  if (state.keyError) return { ok: false, name: 'project state', detail: state.keyError };
  if (!state.key) {
    return { ok: false, name: 'project state', detail: 'no sealing key for this project on this machine; run `research-harness init --project <slug> --mode <mode>` once here' };
  }
  return { ok: true, name: 'project state', detail: `sealing key present at ${seal.keyPath(state.root)}` };
}

// The shim `install-cli` writes and `doctor` looks for: the file a terminal
// resolves when the researcher types the bare command. Only a file carrying the
// marker counts as ours — another program of that name on PATH is not this CLI.
const SHIM_NAME = 'research-harness';
const SHIM_MARKER = '# research-harness install-cli shim';

// The directories a terminal resolves the bare command from: the default one,
// which need not be on PATH at all, and every directory PATH does carry.
function shimDirs() {
  const dirs = [path.join(os.homedir(), '.local', 'bin')];
  for (const entry of (process.env.PATH || '').split(path.delimiter)) if (entry) dirs.push(entry);
  return [...new Set(dirs)];
}

function checkTerminalCommand() {
  for (const dir of shimDirs()) {
    const file = path.join(dir, SHIM_NAME);
    let raw = null;
    try {
      raw = project.readIfExists(file);
    } catch (_) {
      continue; // unreadable is not installed; doctor says so in one line
    }
    if (raw !== null && raw.includes(SHIM_MARKER)) {
      return { ok: true, name: 'terminal command', detail: `shim at ${file}` };
    }
  }
  return { ok: false, name: 'terminal command', detail: 'not installed; run research-harness install-cli so serve works in your own terminal' };
}

function doctor() {
  const root = project.projectDir({});
  const checks = [checkPluginEnabled(root), checkGuardDenies(), checkProjectState(), checkTerminalCommand()].filter(Boolean);
  const failed = checks.filter((c) => !c.ok);
  say(`research-harness doctor: ${failed.length === 0 ? `ok (${checks.length} checks)` : `${failed.length} of ${checks.length} checks failed`}`);
  for (const c of failed) say(`- ${c.name}: ${c.detail}`);
  return failed.length === 0 ? 0 : 1;
}

// ---------- install-cli ----------

// Claude Code puts the plugin's bin/ on the Bash tool's PATH while the plugin is
// enabled, so the bare command works inside a session — and nowhere else. The
// researcher's own terminal is a different shell with a different PATH, which is
// where `serve` has to run. This writes one small shim into a directory a login
// shell already carries.
//
// The shim holds the resolution itself: it reads the plugin's current install
// path out of installed_plugins.json at every run, so a plugin update — a new
// versioned directory under the cache — leaves it working. Nothing here reads or
// writes the paper project.
function defaultBinDir() {
  return path.join(os.homedir(), '.local', 'bin');
}

function shimText() {
  // A single-quoted program: the shell expands nothing in it, so `$` would be
  // literal there — this text holds none, and no apostrophe either.
  const resolver = [
    'const fs = require("node:fs");',
    'let data;',
    'try { data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (err) { process.exit(1); }',
    'const entries = data && data.plugins && data.plugins["research-harness@research-harness"];',
    'for (const entry of [].concat(entries || [])) {',
    '  if (entry && typeof entry.installPath === "string" && fs.existsSync(entry.installPath)) {',
    '    process.stdout.write(entry.installPath);',
    '    process.exit(0);',
    '  }',
    '}',
    'process.exit(1);',
  ].join('\n');
  return [
    '#!/bin/sh',
    `${SHIM_MARKER}; do not edit, \`research-harness install-cli\` rewrites it.`,
    '# It finds the plugin from installed_plugins.json at every run, so the shim',
    '# survives the plugin being updated.',
    '',
    'config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"',
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "research-harness: node is not on this terminal\'s PATH; install Node.js 20 or newer, or open a shell where node runs."',
    '  exit 1',
    'fi',
    "if ! install_path=$(node -e '",
    resolver,
    '\' "$config/plugins/installed_plugins.json"); then',
    '  echo "research-harness: the plugin is not installed for Claude Code; install it with /plugin install research-harness@research-harness."',
    '  exit 1',
    'fi',
    'exec node "$install_path/bin/research-harness.js" "$@"',
    '',
  ].join('\n');
}

function installCli(flags) {
  if (flags.dir !== undefined && typeof flags.dir !== 'string') return fail(`--dir needs a path.\n${USAGE}`, 2);
  const dir = path.resolve(typeof flags.dir === 'string' ? flags.dir : defaultBinDir());
  const target = path.join(dir, SHIM_NAME);
  if (fs.existsSync(target)) {
    let existing = null;
    try {
      existing = fs.readFileSync(target, 'utf8');
    } catch (_) {
      existing = null; // unreadable, a directory, or binary: not a shim we wrote
    }
    if (existing === null || !existing.includes(SHIM_MARKER)) {
      return fail(`${target} already exists and is not the shim this command writes; refusing to overwrite it. Remove or rename that file first.`);
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, shimText(), { mode: 0o755 });
  fs.chmodSync(target, 0o755); // writeFileSync's mode applies only to a new file
  say(`Wrote ${target}.`);
  if ((process.env.PATH || '').split(path.delimiter).includes(dir)) {
    say(`${dir} is on PATH.`);
    return 0;
  }
  say(`${dir} is not on PATH. Add this line to ~/.zshrc:`);
  say(`export PATH="${dir}:$PATH"`);
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
    case 'status': return status(flags);
    case 'review': return review(flags);
    case 'accept': return accept(positional, flags);
    case 'log': return log(positional, flags);
    case 'title': return title(positional);
    case 'serve': return serve(flags);
    case 'doctor': return doctor();
    case 'install-cli': return installCli(flags);
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

// `run`, not `main`: the bare `bin/research-harness` is a one-line door to this
// file and every entry has to answer alike, filesystem errors included.
module.exports = { main, run, replaceMarker: stateLib.replaceMarker };
