'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const identity = require('../hooks/lib/identity');

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

// A git repo whose user.name is set locally, with global and system config cut off.
function repo(userName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-id-'));
  childProcess.spawnSync('git', ['init', '-q'], { cwd: dir });
  if (userName) childProcess.spawnSync('git', ['config', 'user.name', userName], { cwd: dir });
  return dir;
}
const NO_GLOBAL = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

test('nameRefusal: one trimmed line, at most 60 characters, no #, no heading, no field label', () => {
  assert.equal(identity.nameRefusal('A. Researcher'), null);
  assert.equal(identity.nameRefusal('  B. Supervisor  '), null);
  assert.match(identity.nameRefusal(''), /empty/);
  assert.match(identity.nameRefusal('   '), /empty/);
  assert.match(identity.nameRefusal('A\nB'), /one line/);
  assert.match(identity.nameRefusal('x'.repeat(61)), /60/);
  assert.equal(identity.nameRefusal('x'.repeat(60)), null);
  assert.match(identity.nameRefusal('A #2'), /#/);
  assert.match(identity.nameRefusal('**Why:** x'), /field label/);
});

test('readName: the file first, then git config user.name, then a refusal naming the command', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const dir = repo('Git Person');
  withEnv({ RESEARCH_HARNESS_STATE_DIR: state, ...NO_GLOBAL }, () => {
    assert.deepEqual(identity.readName(dir), { name: 'Git Person', source: 'git' });
    identity.writeName('  A. Researcher ');
    assert.deepEqual(identity.readName(dir), { name: 'A. Researcher', source: 'file' });
    assert.equal(fs.readFileSync(identity.namePath(), 'utf8'), 'A. Researcher\n');
  });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  withEnv({ RESEARCH_HARNESS_STATE_DIR: empty, ...NO_GLOBAL }, () => {
    const none = identity.readName(repo(null));
    assert.equal(none.name, null);
    assert.match(none.error, /research-harness name "<your name>"/);
  });
});

test('readName: an unusable name in the file is reported, not replaced by git', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  fs.writeFileSync(path.join(state, 'name'), 'bad # name\n');
  withEnv({ RESEARCH_HARNESS_STATE_DIR: state, ...NO_GLOBAL }, () => {
    const got = identity.readName(repo('Git Person'));
    assert.equal(got.name, null);
    assert.match(got.error, /not usable/);
  });
});
