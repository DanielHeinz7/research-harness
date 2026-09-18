'use strict';

const fs = require('node:fs');

const KINDS = ['DECISION', 'CONSTRAINT', 'DISCOVERY'];
const ENTRY_RE = /^## \[#(\d+)\] (\d{4}-\d{2}-\d{2}) · (DECISION|CONSTRAINT|DISCOVERY) · (.+?)(?: · text ([0-9a-f]{8}))?$/;

function header(project) {
  return `# Decision log — ${project}\n`;
}

function parseDecisions(text) {
  const entries = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = ENTRY_RE.exec(lines[i]);
    if (!m) continue;
    entries.push({ seq: Number(m[1]), date: m[2], kind: m[3], ref: m[4], hash: m[5] || null, line: i + 1 });
  }
  const maxSeq = entries.reduce((max, e) => Math.max(max, e.seq), 0);
  return { entries, maxSeq };
}

function formatEntry({ seq, date, kind, ref, hash, body, why, rejected, supersedes }) {
  if (!KINDS.includes(kind)) throw new Error(`unknown decision kind: ${kind}`);
  const heading = `## [#${seq}] ${date} · ${kind} · ${ref}${hash ? ` · text ${hash}` : ''}`;
  const lines = [heading, String(body).trim()];
  if (why) lines.push(`**Why:** ${why}`);
  if (rejected) lines.push(`**Rejected:** ${rejected}`);
  if (supersedes) lines.push(`**Supersedes:** #${supersedes}`);
  return `${lines.join('\n')}\n`;
}

// The only write this module performs. Never rewrites what is there.
function appendEntry(filePath, entryText) {
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    current = '';
  }
  const separator = current.length === 0 ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(filePath, `${separator}${entryText}`);
}

module.exports = { KINDS, header, parseDecisions, formatEntry, appendEntry };
