'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const seal = require('../hooks/lib/seal');
const { textHash } = require('../hooks/lib/hash');
const { start } = require('../bin/canvas-serve');

const pluginRoot = path.resolve(__dirname, '..');
const cli = path.join(pluginRoot, 'bin', 'research-harness.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');

delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.RESEARCH_HARNESS_DIR;
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
process.env.RESEARCH_HARNESS_STATE_DIR = stateDir;

const SPEAKING = 'Speaking frequency is well documented; whether a proposal is taken up is not.';
const WHY = 'the gap is uptake, not voice';
const roots = [];

function run(root, args) {
  return childProcess.spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    encoding: 'utf8',
  });
}

function copyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-serve-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'research'));
  for (const f of ['canvas.md', 'decisions.md']) fs.copyFileSync(path.join(fixtureDir, f), path.join(root, 'research', f));
  return root;
}

function keyedProject() {
  const root = copyFixture();
  const out = run(root, ['init', '--project', 'voice-uptake', '--mode', 'seed']);
  assert.equal(out.status, 0, out.stdout);
  return root;
}

const read = (root, name) => fs.readFileSync(path.join(root, 'research', name), 'utf8');

function request(port, { method = 'GET', urlPath = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* html */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// `extra` overrides the default headers; a value of undefined leaves one out.
function post(srv, urlPath, payload, extra = {}) {
  const headers = {
    Host: `127.0.0.1:${srv.port}`,
    'Content-Type': 'application/json',
    'X-Harness-Token': srv.token,
    ...extra,
  };
  for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
  return request(srv.port, { method: 'POST', urlPath, headers, body: JSON.stringify(payload) });
}

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

test('the session server serves state, refuses what fails a check, and writes what the CLI writes', async (t) => {
  const root = keyedProject();
  const srv = await start({ root, pluginRoot });
  t.after(() => srv.close());
  assert.match(srv.token, /^[0-9a-f]{64}$/);
  assert.equal(srv.url, `http://127.0.0.1:${srv.port}/#c=${srv.code}`);
  assert.ok(!srv.url.includes(srv.token), 'the URL carries the code, never the token');
  const host = { Host: `127.0.0.1:${srv.port}` };

  // GET /api/state: the elements, each statement with its text hash, the
  // ledger's verified set as an array, and no key.
  const state = await request(srv.port, { urlPath: '/api/state', headers: host });
  assert.equal(state.status, 200);
  assert.equal(state.json.project, 'voice-uptake');
  assert.equal(state.json.elements.length, 9);
  const q12 = state.json.elements[0].questions.find((q) => q.id === '1.2');
  const speaking = q12.statements.find((s) => s.text === SPEAKING);
  assert.equal(speaking.hash, textHash(SPEAKING));
  assert.ok(Array.isArray(state.json.review.ledger.verified));
  assert.ok(Array.isArray(state.json.decisions));
  assert.ok(!('key' in state.json));
  const key = seal.readKey(root).toString('hex');
  assert.ok(!state.text.includes(key), 'the sealing key never leaves the process');

  const root200 = await request(srv.port, { urlPath: '/', headers: host });
  assert.equal(root200.status, 200);

  // Request checks: every refusal is a bare 403.
  const payload = { questionId: '1.2', expectedHash: textHash(SPEAKING) };
  const noToken = await post(srv, '/api/accept', payload, { 'X-Harness-Token': undefined });
  assert.equal(noToken.status, 403);
  assert.deepEqual(noToken.json, { ok: false, error: 'forbidden' });
  assert.equal((await post(srv, '/api/accept', payload, { 'X-Harness-Token': 'a'.repeat(64) })).status, 403);
  assert.equal((await post(srv, '/api/accept', payload, { 'X-Harness-Token': 'short' })).status, 403);
  assert.equal((await post(srv, '/api/accept', payload, { Host: `localhost:${srv.port}` })).status, 403);
  assert.equal((await request(srv.port, { urlPath: '/api/state', headers: { Host: `evil.example:${srv.port}` } })).status, 403);
  assert.equal((await post(srv, '/api/accept', payload, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post(srv, '/api/accept', payload, { Origin: `http://localhost:${srv.port}` })).status, 403);
  assert.equal((await post(srv, '/api/accept', payload, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal(read(root, 'decisions.md'), fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8'), 'no refused request wrote anything');

  // A body over 64 KB is refused before it is parsed.
  const big = await post(srv, '/api/comment', { ref: '1', body: 'x'.repeat(70 * 1024) });
  assert.equal(big.status, 413);

  // A stale hash is 409, another refusal 422.
  const stale = await post(srv, '/api/accept', { questionId: '1.2', expectedHash: '00000000' });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.code, 'stale');
  const bad = await post(srv, '/api/accept', { questionId: '99', expectedHash: textHash(SPEAKING) });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.code, 'invalid');
  // An accept without expectedHash would skip the staleness check; it is 422.
  for (const body of [{ questionId: '1.2', match: 'chairing' }, { questionId: '1.2', expectedHash: '' }]) {
    const noHash = await post(srv, '/api/accept', body);
    assert.equal(noHash.status, 422, noHash.text);
    assert.equal(noHash.json.code, 'invalid');
  }
  assert.equal(read(root, 'decisions.md'), fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8'), 'an accept without expectedHash wrote nothing');

  // Accept through HTTP, with the same Origin a same-origin page sends; then
  // the CLI accepts the same statement on a second copy holding the same key.
  const accepted = await post(srv, '/api/accept', { ...payload, why: WHY }, { Origin: `http://127.0.0.1:${srv.port}` });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.json.ok, true);
  assert.equal(accepted.json.hash, textHash(SPEAKING));

  const second = copyFixture();
  fs.mkdirSync(path.dirname(seal.keyPath(second)), { recursive: true });
  fs.copyFileSync(seal.keyPath(root), seal.keyPath(second));
  const out = run(second, ['accept', '1.2', '--match', 'Speaking frequency', '--why', WHY]);
  assert.equal(out.status, 0, out.stdout);
  assert.equal(read(root, 'decisions.md'), read(second, 'decisions.md'));
  assert.equal(read(root, 'canvas.md'), read(second, 'canvas.md'));

  // A comment is always a sealed DISCOVERY.
  const comment = await post(srv, '/api/comment', { ref: '1.2', body: 'Ask the supervisor about chairing.', kind: 'DECISION' });
  assert.equal(comment.status, 200, comment.text);
  assert.match(read(root, 'decisions.md'), new RegExp(`## \\[#${comment.json.seq}\\] \\d{4}-\\d{2}-\\d{2} · DISCOVERY · 1\\.2 · seal ${comment.json.seal}`));

  // Nothing the server touched holds the token.
  for (const dir of [...roots, stateDir]) {
    for (const f of filesUnder(dir)) assert.ok(!fs.readFileSync(f, 'utf8').includes(srv.token), `${f} contains the token`);
  }
});

test('the single-use code is traded for the token once, and is no token itself', async (t) => {
  const root = keyedProject();
  const logged = [];
  const srv = await start({ root, pluginRoot, log: (line) => logged.push(line) });
  t.after(() => srv.close());
  assert.match(srv.code, /^[0-9a-f]{32}$/);
  const session = (body, extra) => post(srv, '/api/session', body, { 'X-Harness-Token': undefined, ...extra });
  const payload = { questionId: '1.2', expectedHash: textHash(SPEAKING) };

  // The code is not a write token.
  assert.equal((await post(srv, '/api/accept', payload, { 'X-Harness-Token': srv.code })).status, 403);
  // The exchange takes the same Host, Origin and Content-Type checks as every POST.
  assert.equal((await session({ code: srv.code }, { Host: `localhost:${srv.port}` })).status, 403);
  assert.equal((await session({ code: srv.code }, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await session({ code: srv.code }, { 'Content-Type': 'text/plain' })).status, 403);
  // A wrong code is refused and does not burn the right one.
  assert.equal((await session({ code: '0'.repeat(32) })).status, 403);
  assert.equal((await session({})).status, 403);
  assert.deepEqual(logged, []);

  const first = await session({ code: srv.code }, { Origin: `http://127.0.0.1:${srv.port}` });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.json, { ok: true, token: srv.token });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^session code redeemed \d{4}-\d{2}-\d{2}T\S+Z$/);

  // A second redemption is refused, and says nothing about the token.
  const again = await session({ code: srv.code });
  assert.equal(again.status, 403);
  assert.deepEqual(again.json, { ok: false, error: 'forbidden' });
  assert.equal(logged.length, 1);

  // The token it handed out writes; the code still does not.
  assert.equal((await post(srv, '/api/accept', payload, { 'X-Harness-Token': srv.code })).status, 403);
  const accepted = await post(srv, '/api/accept', { ...payload, why: WHY });
  assert.equal(accepted.status, 200, accepted.text);
});

test('an expired code is refused', async (t) => {
  const srv = await start({ root: keyedProject(), pluginRoot, codeTtlMs: -1 });
  t.after(() => srv.close());
  assert.equal((await post(srv, '/api/session', { code: srv.code }, { 'X-Harness-Token': undefined })).status, 403);
});

test('research-harness serve --no-open prints the code URL, never the token, and stops on SIGINT', { skip: process.platform === 'win32' }, async (t) => {
  const root = keyedProject();
  const child = childProcess.spawn(process.execPath, [cli, 'serve', '--no-open'], {
    cwd: root,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // A failed assertion must not leave the server running.
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stdout = '';
  let lines = 1;
  let onLine = null;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => {
    stdout += c;
    if (onLine && stdout.split('\n').length > lines) onLine();
  });
  const nextLine = () => new Promise((resolve, reject) => {
    onLine = () => { onLine = null; lines += 1; resolve(); };
    if (stdout.split('\n').length > lines) onLine();
    child.once('exit', () => reject(new Error(`serve exited early: ${stdout}`)));
  });
  await nextLine();
  const m = /^http:\/\/127\.0\.0\.1:(\d+)\/#c=([0-9a-f]{32})\n$/.exec(stdout);
  assert.ok(m, stdout);

  // Redeem the printed code as the view would; the terminal says so, and the
  // token the server hands back never appears in stdout.
  const port = Number(m[1]);
  const res = await request(port, {
    method: 'POST',
    urlPath: '/api/session',
    headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: m[2] }),
  });
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.token, /^[0-9a-f]{64}$/);
  await nextLine();
  assert.match(stdout.split('\n')[1], /^session code redeemed \d{4}-\d{2}-\d{2}T\S+Z$/);

  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  child.kill('SIGINT');
  assert.equal(await exited, 0);
  assert.equal(stdout.split('\n').filter(Boolean).length, 2);
  assert.ok(!/[0-9a-f]{64}/.test(stdout), 'stdout holds no 64-hex token');
  assert.ok(!stdout.includes(res.json.token));
});

test.after(() => {
  for (const dir of [...roots, stateDir]) fs.rmSync(dir, { recursive: true, force: true });
});
