'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CANVAS_FILE = 'canvas.md';
const DECISIONS_FILE = 'decisions.md';

// The plugin knows no root. Claude Code sets CLAUDE_PROJECT_DIR; hook stdin
// carries cwd; process.cwd() is the last resort for the CLI.
function projectDir(data) {
  return (
    process.env.CLAUDE_PROJECT_DIR ||
    (data && typeof data.cwd === 'string' ? data.cwd : '') ||
    process.cwd()
  );
}

function stateDir(projectRoot) {
  const configured = process.env.RESEARCH_HARNESS_DIR || 'research';
  return path.resolve(projectRoot, configured);
}

function canvasPath(projectRoot) {
  return path.join(stateDir(projectRoot), CANVAS_FILE);
}

function decisionsPath(projectRoot) {
  return path.join(stateDir(projectRoot), DECISIONS_FILE);
}

// "Absent" and "unreadable" are different answers and only the first one is
// safe to read as an empty file. A caller that cannot tell them apart judges an
// overwrite as a creation, which is how a chmod 000 canvas ends up writable.
// ENOENT — including a dangling symlink, which reports the same — is absence;
// EACCES, EPERM, EISDIR, ELOOP and the rest propagate to a caller that must
// decide what an unreadable file means for it.
function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = { CANVAS_FILE, DECISIONS_FILE, projectDir, stateDir, canvasPath, decisionsPath, readIfExists };
