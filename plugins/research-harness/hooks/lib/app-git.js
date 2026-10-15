'use strict';
// Git for the desktop app's human steps: set up, share, clone, get updates,
// send. Every failure comes back as a sentence with the next step; git's own
// line follows as a detail, never as the message. Runs the
// git the app bundles (RESEARCH_HARNESS_GIT) or git from PATH, never through
// a shell, and only over the transports in RESEARCH_HARNESS_GIT_PROTOCOLS
// (https and ssh unless a test widens it). Every function resolves.
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
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

// Network steps (ls-remote, clone, pull, push) stop when git has been
// silent this long: a host that never answers would otherwise leave the
// dialog waiting for ever. The clock restarts with every line git writes and
// stands still while the person is asked for a login (see askpassEnv).
// RESEARCH_HARNESS_GIT_TIMEOUT_MS shortens it for the tests.
const NETWORK_TIMEOUT_MS = 120000;
const ASKING = 'research-harness: asking for the login';
const ASKED = 'research-harness: login given';

function networkTimeout() {
  const ms = Number(process.env.RESEARCH_HARNESS_GIT_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : NETWORK_TIMEOUT_MS;
}

// git runs GIT_ASKPASS with its own stderr, which the app reads. A small
// wrapper around the app's helper says on that stderr when the person is
// being asked and when they answered, so the silence in between is theirs,
// not the host's. Written once per process into a private folder; if that
// fails, the helper runs as it is and only the clock is less patient.
let askpassWrapper;

function askpassEnv() {
  const helper = process.env.GIT_ASKPASS;
  if (!helper || process.platform === 'win32') return {};
  if (askpassWrapper === undefined) {
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-askpass-'));
      const file = path.join(dir, 'askpass.sh');
      fs.writeFileSync(file, `#!/bin/sh\necho '${ASKING}' >&2\n"$RESEARCH_HARNESS_ASKPASS" "$@"\nstatus=$?\necho '${ASKED}' >&2\nexit $status\n`, { mode: 0o700 });
      process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
      askpassWrapper = file;
    } catch {
      askpassWrapper = null;
    }
  }
  return askpassWrapper ? { GIT_ASKPASS: askpassWrapper, RESEARCH_HARNESS_ASKPASS: helper } : {};
}

function withoutMarkers(text) {
  return text.split('\n').filter((l) => l.trim() !== ASKING && l.trim() !== ASKED).join('\n');
}

// A network step runs in its own process group, so stopping it also stops
// the helpers git started (git-remote-https, ssh). Where the group cannot be
// reached, git alone is stopped and the app stops reading what a helper may
// still hold open.
function stop(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    childProcess.execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Not the leader of a group of its own.
    }
  }
  child.kill('SIGTERM');
  child.stdout.destroy();
  child.stderr.destroy();
}

function git(cwd, args, { network = false } = {}) {
  return new Promise((resolve) => {
    let child = null;
    let timer = null;
    let asking = false;
    let timedOut = false;
    const wait = () => {
      clearTimeout(timer);
      if (!asking) timer = setTimeout(() => { timedOut = true; stop(child); }, networkTimeout());
    };
    try {
      child = childProcess.execFile(gitBinary(), args, {
        cwd,
        // English messages whatever the system language: the sentences below match them.
        env: { ...process.env, GIT_ALLOW_PROTOCOL: protocols(), GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANGUAGE: 'C', ...(network ? askpassEnv() : {}) },
        maxBuffer: 4 * 1024 * 1024,
        detached: network && process.platform !== 'win32',
      }, (err, stdout, stderr) => {
        clearTimeout(timer);
        if (timedOut) {
          const seconds = Math.max(1, Math.round(networkTimeout() / 1000));
          const span = seconds % 60 === 0 ? `${seconds / 60} minute${seconds === 60 ? '' : 's'}` : `${seconds} seconds`;
          resolve({ ok: false, code: 'timeout', error: `The shared copy did not answer for ${span}, so the app stopped waiting. Check your internet connection and the link, then try again.` });
          return;
        }
        if (err && err.code === 'ENOENT') {
          // Node reports a missing working folder the same way as a missing program.
          resolve(typeof cwd === 'string' && fs.existsSync(cwd)
            ? { ok: false, code: 'git-missing', error: `The program git was not found (${gitBinary()}), and this step needs it. The desktop app brings its own; in a browser, install git first.` }
            : { ok: false, code: 'git', error: `The folder ${cwd} does not exist.` });
          return;
        }
        resolve({ ok: !err, stdout: String(stdout), stderr: network ? withoutMarkers(String(stderr)) : String(stderr) });
      });
    } catch (err) {
      resolve({ ok: false, code: 'git', error: `Git could not be started: ${err.message}` });
      return;
    }
    if (network) {
      const heard = (chunk) => {
        const text = String(chunk);
        const from = text.lastIndexOf(ASKING);
        const to = text.lastIndexOf(ASKED);
        if (from !== -1 || to !== -1) asking = from > to;
        wait();
      };
      child.stdout.on('data', heard);
      child.stderr.on('data', heard);
      wait();
    }
  });
}

// The project's own repository, never one in a folder above it: a project
// folder without .git inside another repository has no history of its own.
function ownGit(root, args) {
  return git(root, ['--git-dir', path.join(root, '.git'), ...args]);
}

// What git says, in words a person can act on. The first pattern that fits
// wins, so the specific ones come before the broad ones.
const REASONS = [
  [/not a git repository/i, 'This folder is not set up for sharing yet. Use Share with co-authors… first.'],
  [/terminal prompts disabled|could not read (?:username|password)|authentication failed|invalid username or password|permission denied|access denied|http basic|error: 40[13]\b/i,
    'The shared copy did not accept your login. Check that you may use this repository, then try again and give the login the app asks for.'],
  [/repository .*not found|does not appear to be a git repository|error: 404\b/i,
    'No repository was found at that link, or you may not use it. Check the link and your access to it.'],
  [/could not resolve host|unable to access|could not read from remote|connection (?:refused|timed out|reset)|network is unreachable|timed out|failed to connect|\bssl\b|\btls\b/i,
    'The app could not reach the shared copy. Check your internet connection and the link, then try again.'],
  [/unrelated histories/i,
    'This project and the shared copy were started separately, so they cannot be combined. Nothing was changed. Use Clone from link… to get the shared copy instead.'],
  [/would be overwritten|your local changes|untracked working tree files/i,
    'Some of your files outside the research folder would be overwritten by the update. Nothing was changed. Move those files elsewhere, then get updates again.'],
  [/no tracking information|no upstream|no configured push destination|no remote repository|does not have any upstream/i,
    'This project is not connected to a shared copy yet. Use Share with co-authors… first.'],
  [/src refspec .* does not match|unknown revision|ambiguous argument 'HEAD'|bad default revision|does not have any commits yet/i,
    'This project has no saved history yet. Use Share with co-authors… to start it.'],
  [/already exists and is not an empty directory/i, 'The target folder already exists and is not empty. Choose another name.'],
];

// The line worth showing after the sentence: git's first fatal or error line, else its first line.
function gitDetail(stderr) {
  const lines = String(stderr).split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => /^(?:fatal|error):/i.test(l)) || lines[0] || '';
  return pick.replace(/^(?:fatal|error):\s*/i, '').slice(0, 300);
}

function explain(stderr, what) {
  const hit = REASONS.find(([re]) => re.test(stderr));
  const sentence = hit ? hit[1] : `${what} did not work. Check your internet connection and the link, then try again.`;
  const detail = gitDetail(stderr);
  return detail ? `${sentence} (Git said: ${detail})` : sentence;
}

function failed(r, what) {
  return r.code ? r : { ok: false, code: 'git', error: explain(r.stderr, what) };
}

// A link as a person may read it: nothing in front of the last @ of its
// host part, whatever the scheme, so no password or token shows.
function displayLink(url) {
  return typeof url === 'string' ? url.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#]*@/, '$1') : null;
}

// Whether a link carries a login. A pasted token would be kept in
// .git/config as part of the link; git asks for it instead. An ssh link may
// name its user (ssh://git@host/…), never a password.
function hasCredentials(url) {
  const m = typeof url === 'string' && /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)@/.exec(url);
  if (!m) return false;
  return m[1].toLowerCase() === 'ssh' ? m[2].includes(':') : true;
}

const CREDENTIALS = 'Paste the link without your password or token; the app asks for your login when the repository needs it.';

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
  if (hasCredentials(url)) return { ok: false, code: 'invalid', error: CREDENTIALS };
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
  const r = await git(parent, ['clone', '--progress', '--', url, root], { network: true });
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
  const r = await git(root, [...(await identityArgs(root, name)), 'pull', '--progress', '--no-rebase', '--no-edit'], { network: true });
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
  const inMerge = await merging(root);
  const staged = await git(root, ['diff', '--cached', '--quiet', '--', ...paths]);
  if (staged.ok && !inMerge) return { ok: true, committed: false };
  // Only the named paths, whatever else the person staged by hand. A merge
  // is committed whole: git takes no part of one.
  const only = inMerge ? [] : ['--', ...paths];
  const r = await git(root, [...(await identityArgs(root, name)), 'commit', '-m', message, ...only]);
  return r.ok ? { ok: true, committed: true } : failed(r, 'Committing');
}

async function push(root, { upstream = false } = {}) {
  let args = ['push', '--progress'];
  if (upstream) {
    const branch = await git(root, ['symbolic-ref', '--short', 'HEAD']);
    if (!branch.ok) return failed(branch, 'Reading the project history');
    args = ['push', '--progress', '-u', 'origin', branch.stdout.trim()];
  }
  const r = await git(root, args, { network: true });
  if (r.ok) return { ok: true };
  if (r.code) return r;
  if (/\[rejected\]|non-fast-forward|fetch first/.test(r.stderr)) {
    return { ok: false, code: 'rejected', error: 'The shared copy has changes you do not have yet.' };
  }
  return failed(r, 'Sending');
}

// A project is a repository from its first day: its own history, one commit
// of the research files, on a branch named main.
async function initRepo(root, paths, message, name) {
  const r = await git(root, ['init', '-b', 'main']);
  if (!r.ok) return failed(r, 'Setting up the project history');
  return commit(root, paths, message, name);
}

function hasRepo(root) {
  return fs.existsSync(path.join(root, '.git'));
}

// The shared copy this project sends to and gets from, or null.
async function originOf(root) {
  const r = await ownGit(root, ['remote', 'get-url', 'origin']);
  return r.ok && r.stdout.trim() ? r.stdout.trim() : null;
}

// Whether the branch tracks a branch of the shared copy: true once a first
// push with upstream went through. An origin without it is a Share that
// stopped half-way, or a link someone added by hand; Share picks it up.
async function hasUpstream(root) {
  const r = await ownGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  return r.ok && r.stdout.trim() !== '';
}

// Whether the repository behind a link holds nothing yet. Sharing into one
// that has commits would mix two histories, so the caller refuses it.
async function remoteIsEmpty(url) {
  const r = await git(os.tmpdir(), ['ls-remote', '--', url], { network: true });
  return r.ok ? { ok: true, empty: r.stdout.trim() === '' } : failed(r, 'Looking at the repository');
}

async function addOrigin(root, url) {
  const r = await git(root, ['remote', 'add', 'origin', url]);
  return r.ok ? { ok: true } : failed(r, 'Connecting the project to the shared copy');
}

async function setOrigin(root, url) {
  const r = await git(root, ['remote', 'set-url', 'origin', url]);
  return r.ok ? { ok: true } : failed(r, 'Connecting the project to the shared copy');
}

async function removeOrigin(root) {
  await git(root, ['remote', 'remove', 'origin']);
}

module.exports = {
  isLink, displayLink, hasCredentials, CREDENTIALS, explain, clone, pull, abortMerge, commit, push, initRepo, hasRepo,
  originOf, hasUpstream, remoteIsEmpty, addOrigin, setOrigin, removeOrigin, gitBinary,
};
