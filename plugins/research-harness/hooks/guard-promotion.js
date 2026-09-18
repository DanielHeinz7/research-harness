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

const READ_ONLY_RE = /^\s*(?:cat|head|tail|less|more|wc|grep|rg|diff|stat|ls|file|md5sum|shasum|sed\s+-n|awk|git\s+(?:diff|log|show|status|blame))\b/;
// A redirection into one of the two files, or tee anywhere in the pipeline.
const REDIRECT_RE = /(?:>>?|\|)\s*\S*(?:canvas|decisions)\.md|\btee\b/;
// `-i` edits in place for sed and perl; for grep it only means ignore-case, so
// the hint is bound to the commands that can actually write.
const IN_PLACE_RE = /\b(?:sed|perl|ruby)\b[^;|&]*\s-i\b|\s--in-place\b/;
const CLI_READ_RE = /research-harness\.js"?\s+(?:status|review|init)\b/;
const CLI_ACCEPT_RE = /research-harness(?:\.js)?["']?\s+accept\b/;

function bashVerdict(command) {
  const cmd = String(command || '');
  // Acceptance is the researcher's act wherever it is invoked from: running it
  // from the shell would be the model declaring a commitment (§4.3).
  if (CLI_ACCEPT_RE.test(cmd)) {
    return `Accepting a statement is the researcher's act, so \`research-harness accept\` cannot be run from the shell. Leave the statement as it stands and ask the researcher for /research-harness:accept <n.m>.`;
  }
  if (!/(?:canvas|decisions)\.md/.test(cmd)) return null;
  if (CLI_READ_RE.test(cmd)) return null;
  if (READ_ONLY_RE.test(cmd) && !REDIRECT_RE.test(cmd) && !IN_PLACE_RE.test(cmd)) return null;
  return `Only read-only shell access to canvas.md and decisions.md is allowed here (cat, grep, sed -n, git diff, or research-harness status/review/init). Use the Edit tool for [proposed] and [tentative] statements; acceptance is the researcher's act via /research-harness:accept.`;
}

// ---------- main ----------

function targetOf(projectRoot, toolInput) {
  const raw = toolInput.file_path || toolInput.notebook_path || toolInput.path;
  if (typeof raw !== 'string' || !raw) return null;
  const resolved = path.resolve(projectRoot, raw);
  if (resolved === path.resolve(project.canvasPath(projectRoot))) return { kind: 'canvas', file: resolved };
  if (resolved === path.resolve(project.decisionsPath(projectRoot))) return { kind: 'decisions', file: resolved };
  return null;
}

function fileVerdict(target, toolName, toolInput) {
  const name = path.basename(target.file);
  if (toolName === 'NotebookEdit') {
    return `${name} is Markdown, not a notebook, and a notebook edit cannot be judged here. Use the Edit tool. ${NEXT_STEP}`;
  }
  const before = project.readIfExists(target.file) || '';
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
      reason = bashVerdict(toolInput.command);
    } else if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
      const target = targetOf(projectRoot, toolInput);
      if (target) reason = fileVerdict(target, toolName, toolInput);
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
