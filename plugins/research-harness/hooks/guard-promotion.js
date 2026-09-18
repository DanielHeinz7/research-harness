#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const project = require('./lib/project');
const canvas = require('./lib/canvas');
const output = require('./lib/output');

// Every refusal ends here, because a guard that only says no blocks the
// harness against itself (§5.3).
const NEXT_STEP = 'Propose the change as [proposed] alongside the existing statement, or let the researcher make it with /research-harness:accept.';

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    return {};
  }
}

// ---------- canvas.md ----------

function headingKeys(parsed) {
  const keys = [];
  for (const el of parsed.elements) {
    keys.push(`#${el.number}`);
    for (const q of el.questions) keys.push(`##${q.id}`);
  }
  return keys;
}

// Returns a refusal reason, or null when the write is permitted (§5.3, §4.4).
function canvasVerdict(beforeText, afterText) {
  const before = canvas.parseCanvas(beforeText || '');
  const after = canvas.parseCanvas(afterText || '');
  if (after.problems.length) {
    return `Cannot judge this write: ${after.problems[0]}. Keep the canvas structure — frontmatter, "# N · Title", "## N.M question", statements ending in a marker group. ${NEXT_STEP}`;
  }
  if (!after.elements.length) {
    return `Cannot judge this write: the result has no elements. ${NEXT_STEP}`;
  }
  const afterHeadings = new Set(headingKeys(after));
  for (const key of headingKeys(before)) {
    if (!afterHeadings.has(key)) return `Removing or renaming the heading ${key} is not allowed; every element and question heading stays. ${NEXT_STEP}`;
  }

  // A statement is identified by where it sits and what it says; its tags are
  // free to change, its text is not (§4.3).
  const key = (s) => `${s.question}|${s.text}`;
  const b = canvas.allStatements(before);
  const a = canvas.allStatements(after);
  const bByKey = new Map(b.map((s) => [key(s), s]));
  const aByKey = new Map(a.map((s) => [key(s), s]));

  for (const s of a) {
    if (s.marker !== 'accepted') continue;
    const prev = bByKey.get(key(s));
    if (!prev || prev.marker !== 'accepted') {
      return `Only the researcher may write [accepted] (question ${s.question}). ${NEXT_STEP}`;
    }
  }
  for (const s of b) {
    if (!canvas.COMMITTED.has(s.marker)) continue;
    const next = aByKey.get(key(s));
    if (!next || next.marker !== s.marker) {
      return `The [${s.marker}] statement in question ${s.question} must not be altered, removed, or downgraded — it records what the researcher said or accepted. ${NEXT_STEP}`;
    }
  }
  for (const s of a) {
    if (s.marker !== 'stated') continue;
    const prev = bByKey.get(key(s));
    if (prev && !canvas.COMMITTED.has(prev.marker)) {
      return `A [${prev.marker}] statement cannot be promoted to [stated] by the model (question ${s.question}); only the researcher confirms it. ${NEXT_STEP}`;
    }
  }
  return null;
}

// Apply an Edit the way the tool would; null when it could not be applied
// unambiguously, which is a diff the guard must not guess at.
function applyEdit(current, toolInput) {
  const { old_string: oldString, new_string: newString, replace_all: replaceAll } = toolInput;
  if (typeof oldString !== 'string' || typeof newString !== 'string') return null;
  const first = current.indexOf(oldString);
  if (first < 0) return null;
  const second = current.indexOf(oldString, first + oldString.length);
  if (second >= 0 && !replaceAll) return null;
  return replaceAll ? current.split(oldString).join(newString) : `${current.slice(0, first)}${newString}${current.slice(first + oldString.length)}`;
}

// ---------- Bash ----------

// A gate built from string tests over an unparsed command line cannot
// enumerate the ways a shell can be told to write a file — quoting, chaining,
// globbing, assembling the path in a variable, `cd`, a nested substitution are
// all the same intent written differently. So the guard lexes the command far
// enough to see every word, and then asks one question of each: can this denote
// the research state directory? Where one can, nothing runs but a named
// read-only form. Deny by default inside a scope the lexer can see, rather than
// allow by default outside one (§5.3).

const MAX_COMMAND_LENGTH = 64 * 1024;
const MAX_SUBSTITUTION_DEPTH = 8;

// An expansion leaves a mark where it stood, so a word keeps its literal parts
// and still remembers that the rest of it is unknown.
const EXP_OPEN = '\u0000';
const EXP_CLOSE = '\u0001';
const EXP_UNKNOWN = `${EXP_OPEN}${EXP_CLOSE}`;
const EXP_RE = /\u0000([A-Za-z0-9_]*)\u0001/g;

const RUNNERS = new Set(['node', 'nodejs', 'npx', 'bun', 'deno', 'pnpm', 'yarn']);
const CLI_NAMES = new Set(['research-harness', 'research-harness.js']);
const CLI_READ_SUBS = new Set(['status', 'review', 'init']);

// Commands that read and cannot be talked into writing by their own arguments.
// `awk` is absent on purpose: its program text is a language this guard cannot
// read, and `print > f` inside it writes a file.
const READ_ONLY = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'nl', 'wc', 'cut', 'tr', 'column', 'sort', 'uniq',
  'grep', 'egrep', 'fgrep', 'rg', 'diff', 'cmp', 'stat', 'ls', 'file', 'find', 'realpath',
  'basename', 'dirname', 'md5sum', 'shasum', 'sha1sum', 'sha256sum', 'cksum',
  'echo', 'printf', 'pwd', 'cd', 'true', 'false', 'test', '[', '[[', 'date', 'sed', 'git',
]);
// `add` and `commit` stage and record; neither rewrites a tracked file, and
// leaving them out would refuse `git commit -m "update research/canvas.md"`
// for naming the path. `checkout`, `restore`, `stash` and `clean` do rewrite.
const GIT_READ_ONLY = new Set([
  'diff', 'log', 'show', 'status', 'blame', 'grep', 'add', 'commit',
  'rev-parse', 'ls-files', 'cat-file', 'describe', 'shortlog',
]);
const WRITE_FLAG_RE = /^--(?:output|out-file|output-file|write|in-place)(?:=|$)/;
const ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;
const VALUE_RE = /^[^=\s]+=([\s\S]+)$/;
const FRAGMENT_SPLIT = /[^A-Za-z0-9._\-/~*?[\]+@:]+/;

// Splits a command line into simple commands, each carrying its words and its
// redirections. Commands nested in `$(...)` or backticks are real commands and
// join the list; the word that held them keeps a mark that it is unknown.
function lexBash(text, depth) {
  const commands = [];
  let cmd = { words: [], redirects: [] };
  let word = null;
  let pending = null;
  const heredocs = [];
  let i = 0;

  function startWord() {
    if (!word) word = { text: '', opaque: false };
    return word;
  }
  function endWord() {
    if (!word) return;
    word.opaque = word.text.includes(EXP_OPEN);
    if (pending) {
      pending.target = word;
      if (pending.heredoc) heredocs.push(word.text);
      pending = null;
    } else {
      cmd.words.push(word);
    }
    word = null;
  }
  function endCommand() {
    endWord();
    pending = null;
    if (cmd.words.length || cmd.redirects.length) commands.push(cmd);
    cmd = { words: [], redirects: [] };
  }
  function nest(body) {
    if (depth >= MAX_SUBSTITUTION_DEPTH) return;
    for (const inner of lexBash(body, depth + 1)) commands.push(inner);
  }

  function readSubstitution() {
    let level = 1;
    let body = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') { body += ch + (text[i + 1] || ''); i += 2; continue; }
      if (ch === "'") {
        const end = text.indexOf("'", i + 1);
        const stop = end < 0 ? text.length : end + 1;
        body += text.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
        const stop = Math.min(j + 1, text.length);
        body += text.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === '(') level += 1;
      else if (ch === ')') {
        level -= 1;
        i += 1;
        if (!level) return body;
        body += ch;
        continue;
      }
      body += ch;
      i += 1;
    }
    return body;
  }

  function readBackquote(w) {
    let body = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') { body += text[i + 1] || ''; i += 2; continue; }
      if (ch === '`') { i += 1; break; }
      body += ch;
      i += 1;
    }
    w.text += EXP_UNKNOWN;
    nest(body);
  }

  function readDollar(w) {
    const next = text[i + 1];
    if (next === '(') {
      i += 2;
      const body = readSubstitution();
      w.text += EXP_UNKNOWN;
      nest(body);
      return;
    }
    if (next === '{') {
      i += 2;
      let name = '';
      let level = 1;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '{') { level += 1; name += ch; i += 1; continue; }
        if (ch === '}') {
          level -= 1;
          i += 1;
          if (!level) break;
          name += ch;
          continue;
        }
        name += ch;
        i += 1;
      }
      w.text += /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${EXP_OPEN}${name}${EXP_CLOSE}` : EXP_UNKNOWN;
      return;
    }
    if (next !== undefined && /[A-Za-z_]/.test(next)) {
      let j = i + 1;
      let name = '';
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) { name += text[j]; j += 1; }
      i = j;
      w.text += `${EXP_OPEN}${name}${EXP_CLOSE}`;
      return;
    }
    if (next !== undefined && /[0-9@*#?$!-]/.test(next)) { i += 2; w.text += EXP_UNKNOWN; return; }
    w.text += '$';
    i += 1;
  }

  function readDoubleQuoted(w) {
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') { i += 1; return; }
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === undefined) { i += 1; return; }
        if (next === '\n') { i += 2; continue; }
        if (next === '$' || next === '`' || next === '"' || next === '\\') { w.text += next; i += 2; continue; }
        w.text += ch;
        i += 1;
        continue;
      }
      if (ch === '$') { readDollar(w); continue; }
      if (ch === '`') { i += 1; readBackquote(w); continue; }
      w.text += ch;
      i += 1;
    }
  }

  // `i` points at `<` or `>`; `forced` marks the `&>` form, which writes.
  function readRedirect(forced) {
    const op = text[i];
    i += 1;
    let write = forced || op === '>';
    let heredoc = false;
    if (op === '>') {
      if (text[i] === '>' || text[i] === '|' || text[i] === '&') i += 1;
    } else if (text[i] === '<') {
      heredoc = true;
      i += 1;
      if (text[i] === '<') { heredoc = false; i += 1; } else if (text[i] === '-') i += 1;
    } else if (text[i] === '>') { write = true; i += 1; } else if (text[i] === '&') i += 1;
    pending = { write, heredoc, target: null };
    cmd.redirects.push(pending);
  }

  function consumeHeredocs() {
    while (heredocs.length) {
      const delimiter = heredocs.shift().replace(/['"\\]/g, '').trim();
      for (;;) {
        if (i >= text.length) return;
        const nl = text.indexOf('\n', i);
        const line = nl < 0 ? text.slice(i) : text.slice(i, nl);
        i = nl < 0 ? text.length : nl + 1;
        if (line.trim() === delimiter) break;
        if (nl < 0) return;
      }
    }
  }

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) { i += 1; continue; }
      if (next === '\n') { i += 2; continue; }
      startWord().text += next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      i += 1;
      const end = text.indexOf("'", i);
      startWord().text += end < 0 ? text.slice(i) : text.slice(i, end);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (ch === '"') { i += 1; readDoubleQuoted(startWord()); continue; }
    if (ch === '`') { i += 1; readBackquote(startWord()); continue; }
    if (ch === '$') { readDollar(startWord()); continue; }
    if (ch === '#' && !word) {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') { endWord(); i += 1; continue; }
    if (ch === '\n') { endWord(); i += 1; consumeHeredocs(); endCommand(); continue; }
    if (ch === '&' && text[i + 1] === '>') { endWord(); i += 1; readRedirect(true); continue; }
    if (ch === ';' || ch === '&' || ch === '|') {
      endCommand();
      i += 1;
      if (text[i] === ch || (ch === '|' && text[i] === '&')) i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') { endCommand(); i += 1; continue; }
    if (ch === '<' || ch === '>') {
      if (word && /^[0-9]+$/.test(word.text)) word = null;
      else endWord();
      readRedirect(false);
      continue;
    }
    startWord().text += ch;
    i += 1;
  }
  endWord();
  consumeHeredocs();
  endCommand();
  return commands;
}

function baseNameOf(text) {
  const cut = text.lastIndexOf('/');
  return cut < 0 ? text : text.slice(cut + 1);
}

function substitute(w, values) {
  if (!w.text.includes(EXP_OPEN)) return;
  w.text = w.text.replace(EXP_RE, (all, name) => (name && values.has(name) ? values.get(name) : all));
  w.opaque = w.text.includes(EXP_OPEN);
}

// One word can carry several paths: the word itself, the value of a `k=v`
// argument (`awk -v f=research/canvas.md`), and any slash-bearing run inside a
// quoted program text (`node -e '…("research/canvas.md")'`).
function pathCandidates(text) {
  const out = [text];
  const value = VALUE_RE.exec(text);
  if (value) out.push(value[1]);
  for (const fragment of text.split(FRAGMENT_SPLIT)) {
    if (fragment.includes('/')) out.push(fragment);
  }
  return out;
}

function globToRegExp(component) {
  let source = '';
  for (let k = 0; k < component.length; k += 1) {
    const ch = component[k];
    if (ch === '*') source += '[^/]*';
    else if (ch === '?') source += '[^/]';
    else if (ch === '[') {
      const end = component.indexOf(']', k + 1);
      if (end < 0) source += '\\[';
      else { source += `[${component.slice(k + 1, end).replace(/\\/g, '\\\\')}]`; k = end; }
    } else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function componentMatches(pattern, literal) {
  if (!/[*?[]/.test(pattern)) return pattern === literal;
  try {
    return globToRegExp(pattern).test(literal);
  } catch (_) {
    return true;
  }
}

// True when the path could name the state directory or anything below it. A
// word that is only an ancestor (`.`, `..`) does not count: catching those
// would refuse `git add .`, and this is a promotion guard, not a sandbox
// against a command that destroys the whole project.
function denotesState(candidate, base, stateParts) {
  if (!candidate || candidate.startsWith('~') || candidate.includes(EXP_OPEN)) return false;
  let resolved;
  try {
    resolved = path.resolve(base, candidate);
  } catch (_) {
    return false;
  }
  const parts = resolved.split(path.sep).filter(Boolean);
  if (parts.length < stateParts.length) return false;
  for (let k = 0; k < stateParts.length; k += 1) {
    if (!componentMatches(parts[k], stateParts[k])) return false;
  }
  return true;
}

// A word the guard could not fully expand is judged on the literal parts it
// still has: a path it cannot resolve but that names the state dir or one of
// its files is treated as touching it.
function opaqueNamesState(text, stateNames) {
  for (const fragment of text.replace(EXP_RE, ' ').split(FRAGMENT_SPLIT)) {
    for (const part of fragment.split('/')) {
      if (part && stateNames.has(part)) return true;
    }
  }
  return false;
}

function wordTouchesState(w, base, stateParts, stateNames) {
  if (w.opaque) return opaqueNamesState(w.text, stateNames);
  if (base === null) return false;
  return pathCandidates(w.text).some((candidate) => denotesState(candidate, base, stateParts));
}

// A redirection target built at runtime (`>> "$f.md"`, `>> "$(…)"`) is the
// assemble-the-path family; a bare `> "$LOG"` has no literal path part and is
// left alone.
function assembledTarget(text) {
  const literal = text.replace(EXP_RE, '');
  return literal.includes('/') || /\.[A-Za-z0-9]+$/.test(literal);
}

function harnessInvocation(args) {
  if (!args.length || args[0].opaque) return null;
  const skipFlags = (from) => {
    let k = from;
    while (k < args.length && args[k].text.startsWith('-')) k += 1;
    return k;
  };
  if (CLI_NAMES.has(baseNameOf(args[0].text))) {
    const k = skipFlags(1);
    return { harness: true, sub: k < args.length ? args[k] : null };
  }
  if (!RUNNERS.has(baseNameOf(args[0].text))) return null;
  const scriptAt = skipFlags(1);
  if (scriptAt >= args.length) return null;
  const script = args[scriptAt];
  const subAt = skipFlags(scriptAt + 1);
  return {
    harness: !script.opaque && CLI_NAMES.has(baseNameOf(script.text)),
    sub: subAt < args.length ? args[subAt] : null,
  };
}

// Returns null when the simple command is a named read-only form, or the
// reason it is not.
function readOnlyRefusal(sc, args, base, stateParts, stateNames) {
  for (const redirect of sc.redirects) {
    if (!redirect.write) continue;
    const target = redirect.target;
    if (!target || target.opaque) return 'it redirects into a path assembled at runtime';
    if (base === null && !target.text.startsWith('/')) return 'it redirects into a relative path after a `cd` this guard cannot follow';
    if (wordTouchesState(target, base, stateParts, stateNames)) return 'it redirects into the research state';
  }
  if (!args.length) return null;
  const invocation = harnessInvocation(args);
  if (invocation && invocation.harness) {
    if (!invocation.sub) return null;
    return !invocation.sub.opaque && CLI_READ_SUBS.has(invocation.sub.text) ? null : 'the CLI is being run with a subcommand that is not status, review or init';
  }
  if (args[0].opaque) return 'the command name is assembled at runtime';
  const verb = baseNameOf(args[0].text);
  if (!READ_ONLY.has(verb)) return `\`${verb}\` is not a read-only command`;
  const flags = args.slice(1);
  const hasFlag = (re) => flags.some((w) => re.test(w.text));
  if (hasFlag(WRITE_FLAG_RE)) return `\`${verb}\` was given a flag that writes a file`;
  if (verb === 'sed') {
    const quiet = hasFlag(/^-[A-Za-z]*n/) || flags.some((w) => w.text === '--quiet' || w.text === '--silent');
    if (!quiet) return '`sed` only reads with -n';
    if (hasFlag(/^-[A-Za-z]*i/) || flags.some((w) => w.text === '--in-place')) return '`sed -i` edits in place';
  }
  if (verb === 'sort' && hasFlag(/^-o/)) return '`sort -o` writes a file';
  if (verb === 'uniq' && flags.filter((w) => !w.text.startsWith('-')).length > 1) return '`uniq` with two operands writes the second';
  if (verb === 'find' && hasFlag(/^-(?:delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/)) return '`find` was given an action that writes or runs a command';
  if (verb === 'git') {
    const sub = flags.find((w) => !w.text.startsWith('-'));
    if (!sub || sub.opaque || !GIT_READ_ONLY.has(sub.text)) return 'this is not a read-only git subcommand';
  }
  return null;
}

function bashDenial(why) {
  return `Only read-only shell access to the research state is allowed, and ${why}. Reads that pass: cat, grep, sed -n, git diff/log/show/status, research-harness status/review/init. Use the Edit tool for [proposed] and [tentative] statements; acceptance is the researcher's act via /research-harness:accept.`;
}

// Acceptance is the researcher's act wherever it is invoked from: running it
// from the shell would be the model declaring a commitment (§4.3).
const ACCEPT_DENIAL = 'Accepting a statement is the researcher\'s act, so `research-harness accept` cannot be run from the shell — under any name, quoting, or variable. Leave the statement as it stands and ask the researcher for /research-harness:accept <n.m>.';

function bashVerdict(command, projectRoot) {
  const cmd = String(command || '');
  if (!cmd.trim()) return null;
  const root = projectRoot || project.projectDir({});
  const stateDir = project.stateDir(root);
  const stateParts = stateDir.split(path.sep).filter(Boolean);
  const stateNames = new Set([project.CANVAS_FILE, project.DECISIONS_FILE, path.basename(stateDir)]);

  let commands = null;
  if (cmd.length <= MAX_COMMAND_LENGTH) {
    try {
      commands = lexBash(cmd, 0);
    } catch (_) {
      commands = null;
    }
  }
  if (!commands) {
    // Unreadable is not the same as harmless: judge it if it names the state.
    const names = [...stateNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp(`${names}|research-harness`).test(cmd)
      ? 'research-harness could not read this shell command well enough to judge it, and it names the research state, so it is denied. Split it into separate, simpler commands, or use the Edit tool.'
      : null;
  }

  const values = new Map();
  let base = root;
  let touches = false;
  let acceptAttempt = false;
  let refusal = null;

  for (const sc of commands) {
    for (const w of sc.words) substitute(w, values);
    for (const redirect of sc.redirects) if (redirect.target) substitute(redirect.target, values);
    for (const w of sc.words) {
      const assignment = ASSIGNMENT_RE.exec(w.text);
      if (!assignment) break;
      if (!assignment[2].includes(EXP_OPEN)) values.set(assignment[1], assignment[2]);
    }

    if (base === null) touches = true;
    for (const w of sc.words) {
      if (wordTouchesState(w, base, stateParts, stateNames)) touches = true;
      if (!w.opaque && CLI_NAMES.has(baseNameOf(w.text))) touches = true;
    }
    for (const redirect of sc.redirects) {
      if (!redirect.target || redirect.heredoc) continue;
      if (wordTouchesState(redirect.target, base, stateParts, stateNames)) touches = true;
      if (redirect.write && redirect.target.opaque && assembledTarget(redirect.target.text)) touches = true;
    }

    // Leading `NAME=value` words are assignments, not the command.
    const verbAt = sc.words.findIndex((w) => !ASSIGNMENT_RE.test(w.text));
    const argv = verbAt < 0 ? [] : sc.words.slice(verbAt);
    const invocation = harnessInvocation(argv);
    if (invocation) {
      if (invocation.harness) touches = true;
      if (invocation.sub && !invocation.sub.opaque && invocation.sub.text === 'accept') acceptAttempt = true;
      else if (invocation.harness && invocation.sub && invocation.sub.opaque) acceptAttempt = true;
    }

    if (!refusal) refusal = readOnlyRefusal(sc, argv, base, stateParts, stateNames);

    if (argv.length && !argv[0].opaque && baseNameOf(argv[0].text) === 'cd') {
      const operand = argv.slice(1).find((w) => !w.text.startsWith('-'));
      base = !operand || operand.opaque || operand.text === '-' || base === null
        ? null
        : path.resolve(base, operand.text);
    }
  }

  if (acceptAttempt) return ACCEPT_DENIAL;
  if (!touches || !refusal) return null;
  return bashDenial(refusal);
}

// ---------- path resolution ----------

// Two names reach the same file more often than they look alike: a case
// variant on a case-insensitive volume, a symlinked file, a symlinked parent
// directory, a hard link. Comparing the strings the model typed judges the
// spelling; the guard has to judge the file (§5.3).

const MAX_LINK_HOPS = 32;

function readLink(file) {
  try {
    return fs.readlinkSync(file);
  } catch (_) {
    return null;
  }
}

// What the filesystem calls this path. `realpathSync.native` is libc's
// realpath: it follows symlinks and hands back the spelling that is on disk,
// which is how a case variant is caught without asking the platform what kind
// of volume this is. It needs every component to exist, so a leaf that is not
// there yet — creating the canvas is legitimate — is canonicalised through its
// parent, and a dangling symlink through what it points at.
function canonical(target, hops) {
  const full = path.resolve(target);
  try {
    return fs.realpathSync.native(full);
  } catch (err) {
    // ELOOP, or a parent this process may not traverse: nothing further can be
    // resolved, and the path as written is the best answer there is.
    if (!err || err.code !== 'ENOENT') return full;
  }
  const link = hops < MAX_LINK_HOPS ? readLink(full) : null;
  if (link !== null) return canonical(path.resolve(path.dirname(full), link), hops + 1);
  const parent = path.dirname(full);
  return parent === full ? full : path.join(canonical(parent, hops), path.basename(full));
}

function flipCase(name) {
  return name.replace(/[A-Za-z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
}

// Case sensitivity belongs to the volume, not to the platform, so ask the
// filesystem rather than process.platform: a directory on a case-insensitive
// volume answers to a flipped spelling of its own name. This only decides
// paths that do not exist yet — realpath has already settled the ones that do.
function caseBlind(dir) {
  let at = path.resolve(dir);
  for (;;) {
    const name = path.basename(at);
    const flipped = flipCase(name);
    if (flipped !== name) {
      try {
        return fs.realpathSync.native(path.join(path.dirname(at), flipped)) === fs.realpathSync.native(at);
      } catch (_) {
        return false;
      }
    }
    const parent = path.dirname(at);
    if (parent === at) return false;
    at = parent;
  }
}

function samePath(a, b) {
  return a === b || (a.toLowerCase() === b.toLowerCase() && caseBlind(path.dirname(a)));
}

// Device and inode: one file, however many names lead to it. This is what
// catches a hard link, which realpath cannot — a hard link is not a reference
// to a name, it is a second name for the same file.
function identity(file) {
  try {
    const s = fs.statSync(file);
    return `${s.dev}:${s.ino}`;
  } catch (_) {
    return null;
  }
}

// ---------- what a path leads to ----------

// Where a write to this path would land, under every name the filesystem
// answers to: the resolved path, its canonical spelling, and its identity.
function landingOf(projectRoot, raw) {
  const written = path.resolve(projectRoot, raw);
  return { canonicalPath: canonical(written, 0), id: identity(written) };
}

function stateFiles(projectRoot) {
  return [['canvas', project.canvasPath(projectRoot)], ['decisions', project.decisionsPath(projectRoot)]]
    .map(([kind, statePath]) => ({ kind, file: canonical(statePath, 0), id: identity(statePath) }));
}

function stateFileAt(landing, states) {
  for (const state of states) {
    // The file is named by where the write lands, not by what was typed: a
    // refusal that says canvas.md is more use than one that says link.md.
    if ((state.id !== null && state.id === landing.id) || samePath(landing.canonicalPath, state.file)) return state;
  }
  return null;
}

function targetOf(projectRoot, toolInput) {
  const raw = toolInput.file_path || toolInput.notebook_path || toolInput.path;
  if (typeof raw !== 'string' || !raw) return null;
  return stateFileAt(landingOf(projectRoot, raw), stateFiles(projectRoot));
}

// ---------- tool coverage ----------

// Which tools can write a file is not a list this guard can keep. MultiEdit, an
// MCP filesystem server, whatever the client ships next: a list of the tools it
// knows is a list of yesterday's holes, and lengthening it reproduces the defect
// for tomorrow's tool. So the default is inverted rather than extended. A
// recognised tool is judged by the write it would perform; every other tool is
// judged by where its payload points, and a payload pointing into the research
// state is refused — an unknown tool reaching the canvas is exactly the "cannot
// judge this write" case §5.3 already fails closed on.

// Reading the state is how the harness works, so the tools that only read stay
// open. Everything else, named or not, meets the default.
const READ_TOOLS = new Set(['Read', 'NotebookRead', 'Glob', 'Grep']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

const MAX_CANDIDATES = 256;
const MAX_CANDIDATE_LENGTH = 4096;
const MAX_PAYLOAD_DEPTH = 16;

// Every string in the payload is a candidate path, wherever it sits. Reading
// only the keys this guard has heard of — file_path, path, notebook_path — would
// be the same allowlist one level down: the next tool calls its argument
// `destination` and is through. A key it cannot read is a key it must not trust.
function payloadStrings(value, out, depth) {
  if (out.length >= MAX_CANDIDATES) return out;
  if (typeof value === 'string') {
    // Trimmed, because the filesystem and the guard should disagree about a
    // padded path in the direction of denying it.
    const text = value.trim();
    if (text && text.length <= MAX_CANDIDATE_LENGTH) out.push(text);
    return out;
  }
  if (depth >= MAX_PAYLOAD_DEPTH || !value || typeof value !== 'object') return out;
  for (const inner of Array.isArray(value) ? value : Object.values(value)) payloadStrings(inner, out, depth + 1);
  return out;
}

// The state directory and everything under it, compared the way a single file
// is: by where the path lands, not by how it is spelled.
function underState(target, stateRoot) {
  let at = target;
  for (;;) {
    if (samePath(at, stateRoot)) return true;
    const parent = path.dirname(at);
    if (parent === at) return false;
    at = parent;
  }
}

function shortName(projectRoot, file) {
  const rel = path.relative(projectRoot, file);
  return !rel || rel.startsWith('..') ? path.basename(file) : rel;
}

// A prose string is not a path: only a value that resolves, whole, into the
// state counts. `see research/canvas.md for the wording` resolves to a file of
// that unlikely name beside the project, and is nobody's business.
function unknownToolVerdict(projectRoot, toolName, toolInput) {
  const states = stateFiles(projectRoot);
  const stateRoot = canonical(project.stateDir(projectRoot), 0);
  for (const candidate of payloadStrings(toolInput, [], 0)) {
    const landing = landingOf(projectRoot, candidate);
    const hit = stateFileAt(landing, states);
    if (!hit && !underState(landing.canonicalPath, stateRoot)) continue;
    const label = toolName ? `\`${toolName.slice(0, 40)}\`` : 'an unnamed tool';
    const name = shortName(projectRoot, hit ? hit.file : landing.canonicalPath);
    return `research-harness cannot judge what ${label} would do to ${name}, so it is denied: it reads Edit, Write and Bash well enough to tell a proposal from a promotion, and nothing else. Read the file with Read, cat or grep; change it with the Edit or Write tool. ${NEXT_STEP}`;
  }
  return null;
}

// ---------- main ----------

function fileVerdict(target, toolName, toolInput) {
  const name = path.basename(target.file);
  if (toolName === 'NotebookEdit') {
    return `${name} is Markdown, not a notebook, and a notebook edit cannot be judged here. Use the Edit tool. ${NEXT_STEP}`;
  }
  let before;
  try {
    before = project.readIfExists(target.file) || '';
  } catch (err) {
    // An unreadable file is not an absent one. Reading it as absent would make
    // this a creation rather than a modification, and so permit a write that
    // deletes whatever the researcher had accepted. §5.3 says the guard denies
    // what it cannot judge, and it cannot judge this.
    return `Cannot judge this write: ${target.file} exists but cannot be read (${(err && err.code) || 'unknown error'}). Restore read access to it and retry. ${NEXT_STEP}`;
  }
  let after;
  if (toolName === 'Write') {
    after = typeof toolInput.content === 'string' ? toolInput.content : null;
    if (after === null) return `Cannot judge this write: it carries no content for ${name}. ${NEXT_STEP}`;
  } else {
    after = applyEdit(before, toolInput);
    if (after === null) {
      return `Cannot judge this edit: old_string was not found exactly once in ${name}. Re-read the file and retry with an old_string that appears exactly once.`;
    }
  }
  if (target.kind === 'decisions') {
    return after.startsWith(before)
      ? null
      : 'decisions.md is append-only: existing entries are never edited. Append a new entry that names the one it supersedes.';
  }
  return canvasVerdict(before, after);
}

function main() {
  let reason = null;
  try {
    const data = readStdin();
    const toolName = typeof data.tool_name === 'string' ? data.tool_name : '';
    const toolInput = data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
    const projectRoot = project.projectDir(data);

    if (toolName === 'Bash') {
      reason = bashVerdict(toolInput.command, projectRoot);
    } else if (WRITE_TOOLS.has(toolName)) {
      const target = targetOf(projectRoot, toolInput);
      if (target) reason = fileVerdict(target, toolName, toolInput);
    } else if (!READ_TOOLS.has(toolName)) {
      reason = unknownToolVerdict(projectRoot, toolName, toolInput);
    }
  } catch (err) {
    // Fail closed: a permission guard that lets writes through on error is a
    // hole, which is where this parts company with the fail-open hook (§5.3).
    reason = `research-harness could not evaluate this write (${err && err.message ? err.message : 'unknown error'}); it is denied. ${NEXT_STEP}`;
  }
  if (reason) output.writeDeny(reason);
}

if (require.main === module) main();

module.exports = { canvasVerdict, bashVerdict, applyEdit };
