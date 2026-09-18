'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The ledger remembers, per project and per session, the highest decision
// sequence already injected. It is transient, per machine, and never part of
// the paper (§5.2) — so it lives outside the repository. Tests override it.
function stateRoot() {
  return process.env.RESEARCH_HARNESS_STATE_DIR || path.join(os.homedir(), '.claude', 'research-harness');
}

// Project paths and session ids both end up as file names; hashing keeps them
// out of the file system and gives every entry the same shape.
function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function ledgerFile(projectRoot, sessionId) {
  return path.join(stateRoot(), digest(path.resolve(projectRoot)), `${digest(sessionId)}.json`);
}

function readSeen(projectRoot, sessionId) {
  if (!sessionId) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(ledgerFile(projectRoot, sessionId), 'utf8'));
    return Number.isInteger(data.seenSeq) ? data.seenSeq : 0;
  } catch (_) {
    return 0;
  }
}

function writeSeen(projectRoot, sessionId, seenSeq) {
  if (!sessionId || !Number.isInteger(seenSeq)) return;
  try {
    const file = ledgerFile(projectRoot, sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ seenSeq }));
  } catch (_) {
    // The ledger is an optimization. Failing to write it must never affect a
    // hook: the worst case is that a decision is injected twice.
  }
}

module.exports = { stateRoot, readSeen, writeSeen };
