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

// A stand-in git: it records that it ran and answers the one question readName
// asks. On a Mac without the developer tools the real git at /usr/bin opens
// the system installer instead of answering, which is what SQ-282 is about.
function gitStub(file, who, name) {
  fs.writeFileSync(file, `#!/bin/sh\necho ${who} >> "${file}.ran"\necho "${name}"\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

test('readName: the git the app named, never the git from PATH', { skip: process.platform === 'win32' }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-bin-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const onPath = gitStub(path.join(bin, 'git'), 'path', 'Path Person');
  const bundled = gitStub(path.join(bin, 'bundled-git'), 'app', 'App Person');
  const saved = {
    PATH: process.env.PATH,
    state: process.env.RESEARCH_HARNESS_STATE_DIR,
    git: process.env.RESEARCH_HARNESS_GIT,
  };
  try {
    // PATH holds only the stand-in named `git`, so a fallback to PATH shows.
    process.env.PATH = bin;
    process.env.RESEARCH_HARNESS_STATE_DIR = state;
    process.env.RESEARCH_HARNESS_GIT = bundled;
    assert.deepEqual(identity.readName(bin), { name: 'App Person', source: 'git' });
    assert.equal(fs.readFileSync(`${bundled}.ran`, 'utf8'), 'app\n', 'the app\'s git ran');
    assert.equal(fs.existsSync(`${onPath}.ran`), false, 'the git from PATH never ran');
    // Without the variable, PATH answers as it did before.
    delete process.env.RESEARCH_HARNESS_GIT;
    assert.deepEqual(identity.readName(bin), { name: 'Path Person', source: 'git' });
    assert.equal(fs.readFileSync(`${onPath}.ran`, 'utf8'), 'path\n');
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.state === undefined) delete process.env.RESEARCH_HARNESS_STATE_DIR; else process.env.RESEARCH_HARNESS_STATE_DIR = saved.state;
    if (saved.git === undefined) delete process.env.RESEARCH_HARNESS_GIT; else process.env.RESEARCH_HARNESS_GIT = saved.git;
  }
});
