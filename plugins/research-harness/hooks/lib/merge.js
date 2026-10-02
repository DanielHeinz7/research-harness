'use strict';

const decisions = require('./decisions');
const seal = require('./seal');

// Two clones that both appended after #n each hold a #n+1 on the same chain
// (spec §2). Equal seq and equal seal means the same entry, because a seal
// chains over everything before it, so the shared prefix is found by
// comparing seals, without git's merge base. Theirs stays byte for byte; our
// entries after the prefix are renumbered and re-sealed after it. Nothing is
// deleted: an entry left out with `skip` stays in git history.

function refuse(code, error) {
  return { ok: false, code, error };
}

// Legacy entries carry no seal; they are the same entry when every parsed
// part is the same. The first sealed entry's anchor covers them anyway.
function sameEntry(a, b) {
  if (a.seq !== b.seq) return false;
  if (a.seal !== null || b.seal !== null) return a.seal === b.seal;
  return a.date === b.date && a.kind === b.kind && a.ref === b.ref && a.body === b.body;
}

const ACCEPT_REF = /^([1-9]\.\d+) accepted$/;
const REF_LINE = /^\*\*(Supersedes|Open at acceptance):\*\* ?(.*)$/;

// Only the field lines that name entries by number move with the map; the
// first line is the entry's text and is never read as a field.
function rewriteRefs(body, map) {
  const lines = body.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const m = REF_LINE.exec(lines[i]);
    if (m) lines[i] = `**${m[1]}:** ${m[2].replace(/#(\d+)/g, (all, n) => (map.has(Number(n)) ? `#${map.get(Number(n))}` : all))}`;
  }
  return lines.join('\n');
}

function refsOf(entry) {
  return [...(entry.supersedes ? [entry.supersedes] : []), ...entry.openAtAccept];
}

function mergeLogs(ours, theirs, key, { by, theirsCommit, skip = [] } = {}) {
  if (!key) return refuse('ledger', 'No sealing key for this project on this machine; nothing is merged.');
  for (const [side, text] of [['ours', ours], ['theirs', theirs]]) {
    const chain = seal.verifyChain(text, key);
    if (chain.status === 'broken') {
      return refuse('broken', `${side} is broken at #${chain.broken.seq} (line ${chain.broken.line}, ${chain.broken.why}); nothing is merged. The harness never repairs a ledger.`);
    }
  }
  const a = decisions.parseDecisions(ours).entries;
  const b = decisions.parseDecisions(theirs).entries;
  let n = 0;
  while (n < a.length && n < b.length && sameEntry(a[n], b[n])) n += 1;
  if (n === a.length) return { ok: true, text: theirs, merged: false, kept: 'theirs' };
  if (n === b.length) return { ok: true, text: ours, merged: false, kept: 'ours' };
  if (n === 0) return refuse('no-prefix', 'The two logs share no entry; they are not two copies of one log. Nothing is merged.');

  const mine = a.slice(n);
  const other = b.slice(n);
  if (mine.some((e) => e.seal === null)) return refuse('broken', 'ours has unsealed entries after the shared part; nothing is merged.');
  for (const s of skip) {
    if (!mine.some((e) => e.seq === s && e.kind === 'DECISION')) {
      return refuse('skip', `--skip-decision ${s}: our side has no DECISION #${s} after the shared part (#${a[n - 1].seq}); nothing is merged.`);
    }
  }
  const kept = mine.filter((e) => !skip.includes(e.seq));
  for (const e of kept) {
    const hit = refsOf(e).find((r) => skip.includes(r));
    if (hit) return refuse('dangling', `Our #${e.seq} refers to #${hit}, which --skip-decision leaves out; nothing is merged. Merge without the skip, or leave both out by accepting again after the merge.`);
  }
  for (const e of kept) {
    const q = e.kind === 'DECISION' && ACCEPT_REF.exec(e.ref);
    if (!q) continue;
    const check = other.find((t) => t.kind === 'DISCOVERY' && t.ref.trim() === `${q[1]} check`);
    if (check) {
      return refuse('check', `Our acceptance #${e.seq} of ${q[1]} would be placed after their check question #${check.seq} on ${q[1]}, which we never saw, and would read as having closed it. Nothing is merged. Run git merge --abort, then git pull --no-rebase again and run research-harness merge-log --skip-decision ${e.seq}; accept ${q[1]} again after the merge.`);
    }
  }

  const theirMax = decisions.parseDecisions(theirs).maxSeq;
  const map = new Map();
  kept.forEach((e, i) => map.set(e.seq, theirMax + 1 + i));
  let text = theirs;
  let previous = seal.lastSealOf(theirs);
  for (const e of kept) {
    const fields = { seq: map.get(e.seq), date: e.date, kind: e.kind, ref: e.ref, hash: e.hash, body: rewriteRefs(e.body, map) };
    const sealed = seal.sealEntry(previous, fields, key);
    text += decisions.separatorAfter(text) + sealed.text;
    previous = sealed.seal;
  }
  const moved = kept.map((e) => [e.seq, map.get(e.seq)]);
  const range = (xs) => (xs.length === 1 ? `#${xs[0]}` : `#${xs[0]}–#${xs[xs.length - 1]}`);
  const parts = [`Taken up to #${theirMax} from ${theirsCommit}.`];
  if (moved.length) parts.push(`Own ${range(moved.map((m) => m[0]))} moved to ${range(moved.map((m) => m[1]))}.`);
  if (skip.length) parts.push(`${skip.map((s) => `#${s}`).join(', ')} dropped, to be accepted again.`);
  const mergeSeq = theirMax + kept.length + 1;
  const entry = seal.sealEntry(previous, { seq: mergeSeq, date: new Date().toISOString().slice(0, 10), kind: 'MERGE', ref: `from ${theirsCommit}`, body: parts.join(' '), by }, key);
  text += decisions.separatorAfter(text) + entry.text;
  if (seal.verifyChain(text, key).status !== 'verified') return refuse('broken', 'The merged log does not verify; nothing is written. This is a bug in merge-log.');
  return { ok: true, text, merged: true, moved, dropped: [...skip], mergeSeq };
}

module.exports = { mergeLogs };
