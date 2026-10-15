'use strict';
// Git for the desktop app's human steps: clone, get updates, send. Runs the
// git the app bundles (RESEARCH_HARNESS_GIT) or git from PATH, never through
// a shell, and only over the transports in RESEARCH_HARNESS_GIT_PROTOCOLS
// (https and ssh unless a test widens it). Every function resolves.
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LINK_RE = /^(?:https:\/\/|ssh:\/\/|[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*:)[^\s]+$/;
// A user or host that starts with a dash would reach ssh as an option.
const OPTION_HOST_RE = /^(?:https|ssh):\/\/(?:[^\s/@]*@)?-/;
const FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const FALLBACK_EMAIL = 'noreply@research-harness.invalid';

function gitBinary() {
  return process.env.RESEARCH_HARNESS_GIT || 'git';
}

function protocols() {
  return process.env.RESEARCH_HARNESS_GIT_PROTOCOLS || 'https:ssh';
}

function git(cwd, args) {
  return new Promise((resolve) => {
    try {
      childProcess.execFile(gitBinary(), args, {
        cwd,
        env: { ...process.env, GIT_ALLOW_PROTOCOL: protocols(), GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: 4 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') {
          // Node reports a missing working folder the same way as a missing program.
          resolve(typeof cwd === 'string' && fs.existsSync(cwd)
            ? { ok: false, code: 'git-missing', error: `Git was not found (${gitBinary()}).` }
            : { ok: false, code: 'git', error: `The folder ${cwd} does not exist.` });
          return;
        }
        resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr) });
      });
    } catch (err) {
      resolve({ ok: false, code: 'git', error: `Git could not be started: ${err.message}` });
    }
  });
}

function failed(r, what) {
  return r.code ? r : { ok: false, code: 'git', error: r.stderr.trim() || `${what} failed.` };
}

function isLink(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  if (LINK_RE.test(url)) return !OPTION_HOST_RE.test(url);
  return protocols().split(':').includes('file') && /^file:\/\/\/\S+$/.test(url);
}

// A person who never used git has no identity, and git refuses to commit or
// merge without one. Use the project name the person gave the harness.
async function identityArgs(root, name) {
  const r = await git(root, ['config', 'user.email']);
  if (r.ok && r.stdout.trim()) return [];
  const who = typeof name === 'string' && name.trim() ? name.trim() : 'Research Harness user';
  return ['-c', `user.name=${who}`, '-c', `user.email=${FALLBACK_EMAIL}`];
}

function isEmptyFolder(dir) {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

async function clone({ url, parent, folder }) {
  if (!isLink(url)) return { ok: false, code: 'invalid', error: 'Only https:// and ssh links can be cloned.' };
  if (typeof folder !== 'string' || !FOLDER_RE.test(folder)) {
    return { ok: false, code: 'invalid', error: 'The folder name may use letters, digits, dots, hyphens and underscores.' };
  }
  if (typeof parent !== 'string' || !path.isAbsolute(parent) || !fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    return { ok: false, code: 'invalid', error: 'The chosen folder does not exist.' };
  }
  const root = path.join(parent, folder);
  if (fs.existsSync(root) && !isEmptyFolder(root)) {
    return { ok: false, code: 'exists', error: `${root} already exists and is not empty.` };
  }
  const r = await git(parent, ['clone', '--', url, root]);
  return r.ok ? { ok: true, root } : failed(r, 'Cloning');
}

async function merging(root) {
  return (await git(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
}

async function conflictedFiles(root) {
  const r = await git(root, ['diff', '--name-only', '--diff-filter=U']);
  return r.ok ? r.stdout.split('\n').filter(Boolean) : [];
}

async function pull(root, name) {
  const before = await git(root, ['rev-parse', 'HEAD']);
  if (!before.ok) return failed(before, 'Reading the project history');
  const wasMerging = await merging(root);
  const r = await git(root, [...(await identityArgs(root, name)), 'pull', '--no-rebase', '--no-edit']);
  if (r.ok) {
    const count = await git(root, ['rev-list', '--count', `${before.stdout.trim()}..HEAD`]);
    return { ok: true, newCommits: count.ok ? Number(count.stdout.trim()) : 0 };
  }
  if (r.code) return r;
  const files = await conflictedFiles(root);
  if (files.length) return { ok: false, code: 'conflict', files };
  // A merge that stopped for another reason (a hook, a failed commit) is
  // undone here; only a conflict is left for the caller to resolve or abort.
  if (!wasMerging && await merging(root)) await git(root, ['merge', '--abort']);
  return failed(r, 'Getting updates');
}

async function abortMerge(root) {
  const r = await git(root, ['merge', '--abort']);
  return r.ok ? { ok: true } : failed(r, 'Undoing the merge');
}

async function commit(root, paths, message, name) {
  if (!Array.isArray(paths)) return { ok: false, code: 'invalid', error: 'No files were named to send.' };
  const add = await git(root, ['add', '--', ...paths]);
  if (!add.ok) return failed(add, 'Staging the changes');
  const staged = await git(root, ['diff', '--cached', '--quiet']);
  if (staged.ok && !(await merging(root))) return { ok: true, committed: false };
  const r = await git(root, [...(await identityArgs(root, name)), 'commit', '-m', message]);
  return r.ok ? { ok: true, committed: true } : failed(r, 'Committing');
}

async function push(root) {
  const r = await git(root, ['push']);
  if (r.ok) return { ok: true };
  if (r.code) return r;
  if (/\[rejected\]|non-fast-forward|fetch first/.test(r.stderr)) {
    return { ok: false, code: 'rejected', error: 'The shared copy has changes you do not have yet.' };
  }
  return failed(r, 'Sending');
}

module.exports = { isLink, clone, pull, abortMerge, commit, push, gitBinary };
