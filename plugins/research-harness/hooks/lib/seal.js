'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeText } = require('./canvas');
const decisions = require('./decisions');
const { projectStateDir } = require('./ledger');

// The tamper-evident chain over decisions.md (§4.7). This is not the session
// ledger in ledger.js, which is a transient optimization that may fail
// silently; this is durable, part of the paper, and fails closed.
//
// seal(n) = HMAC-SHA-256(key, seal(n-1) ␟ seq ␟ date ␟ kind ␟ ref ␟ text-hash ␟ normalize(body))
//
// truncated to 16 hex. The key is what makes an *append* unforgeable: a plain
// hash chain can be extended by anyone who can read the log. The first sealed
// entry chains onto the SHA-256 of every byte before it, so a legacy block
// without seals cannot be rewritten quietly either.

const KEY_FILE = 'seal.key';
const KEY_BYTES = 32;
const KEY_CHARS = KEY_BYTES * 2;
const SEAL_HEX = 16;
const HEX_KEY = /^[0-9a-f]+$/i;
const UNIT = '';

function keyPath(projectRoot) {
  return path.join(projectStateDir(projectRoot), KEY_FILE);
}

// null means no key on this machine, which is the normal state of a fresh
// clone; anything else that goes wrong reading the key propagates.
function readKey(projectRoot) {
  let hex;
  try {
    hex = fs.readFileSync(keyPath(projectRoot), 'utf8').trim();
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  if (hex.length !== KEY_CHARS || !HEX_KEY.test(hex)) {
    throw new Error(`the key file ${keyPath(projectRoot)} is not a ${KEY_BYTES}-byte key (${KEY_CHARS} hex characters, as ${KEY_FILE} holds it); nothing was verified against it.`);
  }
  return Buffer.from(hex, 'hex');
}

// The key as a released file: `--key <file>` is how a reviewer who never held
// the key confirms the chain (§4.7). The file is the one createKey writes, 64
// hex characters; anything else is refused rather than decoded into a short
// key, which would report a sound log as BROKEN. Both refusals are one line,
// and neither is a reason to judge a chain.
function readKeyFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`the key file ${file} cannot be read (${(err && err.code) || 'unknown error'}); nothing was verified against it.`);
  }
  const hex = text.trim();
  if (hex.length !== KEY_CHARS || !HEX_KEY.test(hex)) {
    throw new Error(`the key file ${file} is not a ${KEY_BYTES}-byte key (${KEY_CHARS} hex characters, as ${KEY_FILE} holds it); nothing was verified against it.`);
  }
  return Buffer.from(hex, 'hex');
}

// Creates the key once. A second call keeps what is there: replacing the key
// would silently break every seal already written with the old one.
function createKey(projectRoot) {
  const file = keyPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, crypto.randomBytes(KEY_BYTES).toString('hex'), { mode: 0o600, flag: 'wx' });
    return { path: file, created: true };
  } catch (err) {
    if (err && err.code === 'EEXIST') return { path: file, created: false };
    throw err;
  }
}

function anchorOf(prefix) {
  return crypto.createHash('sha256').update(prefix, 'utf8').digest('hex');
}

// The head of the record as one line, for the reviewer who compares what they
// received with what the authors published: the last seal, the highest
// sequence number, and the SHA-256 of decisions.md as received. It needs no
// key — it is the fingerprint of the received bytes, and every part of it
// moves when a byte moves. Its worth lies in having been published *earlier*
// (a tag, the submission): an anchor printed now matches a rewritten log too,
// so the copy a third party kept is what catches a rewrite.
function logAnchor(text) {
  const source = String(text || '');
  const { entries, maxSeq } = decisions.parseDecisions(source);
  const sealed = entries.filter((e) => e.seal !== null);
  const lastSeal = sealed.length ? sealed[sealed.length - 1].seal : 'none';
  const digest = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
  return `last seal ${lastSeal}, maxSeq ${maxSeq}, decisions.md sha256 ${digest}`;
}

function sealOf(key, previousSeal, entry) {
  const canonical = [
    previousSeal,
    String(entry.seq),
    entry.date,
    entry.kind,
    entry.ref,
    entry.hash || '',
    normalizeText(entry.body || ''),
  ].join(UNIT);
  return crypto.createHmac('sha256', key).update(canonical, 'utf8').digest('hex').slice(0, SEAL_HEX);
}

function result(status, reason, legacy, broken, verified) {
  return { status, reason, legacy, broken, verified };
}

// Three outcomes, kept apart because they mean different things (§4.7):
// verified (every seal recomputes), unverifiable (no key here, or a log that
// predates the seal), broken (a seal does not recompute, or an unsealed entry
// follows a sealed one). `broken` names the first failing entry and why:
// 'unsealed', 'anchor' (the first sealed entry — its own content or the legacy
// block before it changed), 'chain' (entries are missing before it), or
// 'content' (its own heading or body changed). `verified` holds the sequence
// numbers whose seals recomputed, which is what gives an acceptance cover.
function verifyChain(text, key) {
  const source = String(text || '');
  const { entries } = decisions.parseDecisions(source);
  const verified = new Set();
  const firstSealed = entries.findIndex((e) => e.seal !== null);
  const legacy = (firstSealed < 0 ? entries : entries.slice(0, firstSealed)).map((e) => e.seq);
  if (!entries.length) return result('verified', null, [], null, verified);
  if (firstSealed < 0) return result('unverifiable', 'legacy', legacy, null, verified);

  let previous = anchorOf(source.slice(0, entries[firstSealed].offset));
  for (let k = firstSealed; k < entries.length; k += 1) {
    const e = entries[k];
    if (e.seal === null) return result('broken', null, legacy, { seq: e.seq, line: e.line, why: 'unsealed' }, verified);
    if (!key) continue;
    if (sealOf(key, previous, e) !== e.seal) {
      const why = k === firstSealed ? 'anchor' : e.seq !== entries[k - 1].seq + 1 ? 'chain' : 'content';
      return result('broken', null, legacy, { seq: e.seq, line: e.line, why }, verified);
    }
    verified.add(e.seq);
    previous = e.seal;
  }
  if (!key) return result('unverifiable', 'no-key', legacy, null, verified);
  return result('verified', null, legacy, null, verified);
}

// The one append path. It refuses to seal a DECISION unless the caller is the
// approval path, refuses without a key, and refuses to extend a broken chain:
// the harness never repairs a ledger, and appending to a broken one would bury
// the break under entries that verify.
function sealedAppend(filePath, fields, key, { decision = false } = {}) {
  if (fields.kind === 'DECISION' && !decision) {
    throw new Error('the append path does not seal a DECISION: an acceptance is the researcher\'s act, via research-harness accept');
  }
  if (!key) throw new Error('no sealing key for this project on this machine; on a log sealed elsewhere run research-harness join, on a new project research-harness init');
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  const chain = verifyChain(current, key);
  if (chain.status === 'broken') {
    throw new Error(`decisions.md is broken at #${chain.broken.seq} (line ${chain.broken.line}, ${chain.broken.why}); nothing is appended to a broken ledger`);
  }
  const parsed = decisions.parseDecisions(current);
  const sealedBefore = parsed.entries.filter((e) => e.seal !== null);
  const previous = sealedBefore.length
    ? sealedBefore[sealedBefore.length - 1].seal
    : anchorOf(current + decisions.separatorAfter(current));
  const seq = parsed.maxSeq + 1;
  // The body under seal is what the parser will read back, so it is taken
  // from a parse of the formatted entry rather than assembled twice.
  const draft = decisions.formatEntry({ ...fields, seq, seal: undefined });
  const entry = decisions.parseDecisions(draft).entries[0];
  const seal = sealOf(key, previous, entry);
  decisions.appendEntry(filePath, decisions.formatEntry({ ...fields, seq, seal }));
  return { seq, seal };
}

module.exports = { KEY_FILE, keyPath, readKey, readKeyFile, createKey, anchorOf, logAnchor, sealOf, verifyChain, sealedAppend };
