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

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
}

module.exports = { CANVAS_FILE, DECISIONS_FILE, projectDir, stateDir, canvasPath, decisionsPath, readIfExists };
