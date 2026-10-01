'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { stateRoot } = require('./ledger');
const { fieldLabelIn } = require('./decisions');

// The name an entry's `By` carries (spec §3). It belongs to a person, not to a
// clone, so it lives once under the user-wide state root, beside the per-project
// directories. A statement, not proof: whoever holds the key can write any name;
// the seal only keeps it from changing afterwards.
const NAME_FILE = 'name';
const MAX_NAME = 60;
const ENTRY_HEADING = /^## \[#/m;

function namePath() {
  return path.join(stateRoot(), NAME_FILE);
}

// Why a name cannot be written as it stands, or null. One line, trimmed, at
// most 60 characters, no `#`: the name becomes a field line in a sealed body
// and travels through a shell, and both break on a second line or a comment.
// The heading and label refusals are the same two the entry text takes, so a
// name can never read back as the start of an entry or of one of its fields.
function nameRefusal(name) {
  if (typeof name !== 'string' || !name.trim()) return 'A name may not be empty.';
  const t = name.trim();
  if (/[\r\n]/.test(t)) return 'A name is one line.';
  if (t.length > MAX_NAME) return `A name has at most ${MAX_NAME} characters.`;
  if (t.includes('#')) return 'A name may not contain #.';
  if (ENTRY_HEADING.test(t)) return 'A name may not start like an entry heading.';
  if (fieldLabelIn(t)) return 'A name may not start like a field label.';
  return null;
}

const UNSET = 'no name is set for the decision log on this machine; run research-harness name "<your name>" once';

// The one reading of where the name comes from: the file under the state root
// first, then `git config user.name` in the project — the name the person
// already carries in git. A name in the file that no longer validates is
// reported rather than silently replaced by the git fallback: the researcher
// set it, and a write under a different name is their decision, not this
// function's.
function readName(root) {
  let raw = null;
  try {
    raw = fs.readFileSync(namePath(), 'utf8').trim();
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  if (raw) {
    const bad = nameRefusal(raw);
    return bad ? { name: null, error: `the name in ${namePath()} is not usable (${bad}); run research-harness name "<your name>"` } : { name: raw, source: 'file' };
  }
  const git = childProcess.spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  const fromGit = git.status === 0 ? String(git.stdout).trim() : '';
  if (fromGit && !nameRefusal(fromGit)) return { name: fromGit, source: 'git' };
  return { name: null, error: UNSET };
}

function writeName(name) {
  fs.mkdirSync(stateRoot(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(namePath(), `${name.trim()}\n`, { mode: 0o600 });
}

module.exports = { namePath, nameRefusal, readName, writeName, MAX_NAME };
