'use strict';

const fs = require('node:fs');

const KINDS = ['DECISION', 'CONSTRAINT', 'DISCOVERY'];
// The heading grammar of §4.7: seq, date, kind, ref, then an optional `text`
// hash (the §4.4 binding of an acceptance) and an optional `seal` (the §4.7
// chain). The two hashes have two jobs and are never folded into one.
const ENTRY_RE = /^## \[#(\d+)\] (\d{4}-\d{2}-\d{2}) · (DECISION|CONSTRAINT|DISCOVERY) · (.+?)(?: · text ([0-9a-f]{8}))?(?: · seal ([0-9a-f]{16}))?$/;

function header(project) {
  return `# Decision log — ${project}\n`;
}

// Every entry carries its body — everything from the line after its heading
// up to the next heading, trimmed — and the character offset of its heading,
// because the seal of the first sealed entry covers every byte before it.
function parseDecisions(text) {
  const entries = [];
  const lines = String(text).split('\n');
  let offset = 0;
  const bodies = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = ENTRY_RE.exec(lines[i]);
    if (m) {
      entries.push({ seq: Number(m[1]), date: m[2], kind: m[3], ref: m[4], hash: m[5] || null, seal: m[6] || null, line: i + 1, offset, body: '' });
      bodies.push([]);
    } else if (bodies.length) {
      bodies[bodies.length - 1].push(lines[i]);
    }
    offset += lines[i].length + 1;
  }
  entries.forEach((e, k) => { e.body = bodies[k].join('\n').trim(); });
  const maxSeq = entries.reduce((max, e) => Math.max(max, e.seq), 0);
  return { entries, maxSeq };
}

function formatEntry({ seq, date, kind, ref, hash, seal, body, why, rejected, supersedes }) {
  if (!KINDS.includes(kind)) throw new Error(`unknown decision kind: ${kind}`);
  const heading = `## [#${seq}] ${date} · ${kind} · ${ref}${hash ? ` · text ${hash}` : ''}${seal ? ` · seal ${seal}` : ''}`;
  const lines = [heading, String(body).trim()];
  if (why) lines.push(`**Why:** ${why}`);
  if (rejected) lines.push(`**Rejected:** ${rejected}`);
  if (supersedes) lines.push(`**Supersedes:** #${supersedes}`);
  return `${lines.join('\n')}\n`;
}

// What appending to `current` puts between it and the new entry: exactly one
// blank line. Exported because the seal of a first sealed entry is computed
// over the file content that precedes it, separator included.
function separatorAfter(current) {
  return current.length === 0 ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
}

// The only write this module performs. Never rewrites what is there.
function appendEntry(filePath, entryText) {
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    current = '';
  }
  fs.appendFileSync(filePath, `${separatorAfter(current)}${entryText}`);
}

module.exports = { KINDS, header, parseDecisions, formatEntry, separatorAfter, appendEntry };
