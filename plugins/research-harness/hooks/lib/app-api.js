'use strict';
// Routes of the desktop app's human steps, mounted by canvas-serve.js in app
// mode under /api/app/<name>. Each takes the parsed body and the app context
// and resolves to { ok: true, ... } or { ok: false, code, error }.
const fs = require('node:fs');
const path = require('node:path');
const project = require('./project');
const identity = require('./identity');
const seal = require('./seal');
const appGit = require('./app-git');
const store = require('./app-store');
const { runCli } = require('./app-cli');

const MODES = ['brainstorming', 'seed', 'import'];
const FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SEND_PATHS = ['research'];

// `field` names the form field the shell should mark; without it the
// shell falls back on the words of the message.
function invalid(error, field) {
  return field ? { ok: false, code: 'invalid', field, error } : { ok: false, code: 'invalid', error };
}

const JOIN_FIRST = 'Join this project first. The key file comes from the co-author who created the project: they save it with Invite co-author… and give it to you by mail or on a USB stick.';
const NAME_NEEDED = 'Enter your name as co-authors should see it.';
// The key's place under the state folder is the app's business, not the
// person's: no message names it.
const KEY_UNREADABLE = 'This computer\'s key for the project cannot be read, so nothing was written. Use Join this project… with the key file from the co-author who created the project.';

function isProject(root) {
  return typeof root === 'string' && path.isAbsolute(root) && fs.existsSync(project.canvasPath(root));
}

function isLine(text, max) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= max && !/[\r\n]/.test(text);
}

function isAbsoluteFile(p, suffix) {
  return typeof p === 'string' && path.isAbsolute(p) && p.endsWith(suffix);
}

function withProject(ctx, fn) {
  const root = ctx.getRoot();
  if (!root) return Promise.resolve({ ok: false, code: 'no-project', error: 'No project is open.' });
  return fn(root);
}

// The name the person gave the harness, for git's identity when git has
// none. readName returns { name } or { name: null, error }.
function personName(root) {
  try {
    return identity.readName(root).name || null;
  } catch {
    return null;
  }
}

// Whether this computer holds the project's key ('held'), has none
// ('missing') or has a key file it cannot read ('unreadable'), apart from
// what the ledger says about its entries: an empty decision log has nothing
// to verify and still needs the key before anyone can write to it.
function keyState(root) {
  try {
    return seal.readKey(root) !== null ? 'held' : 'missing';
  } catch {
    return 'unreadable';
  }
}

function holdsKey(root) {
  return keyState(root) === 'held';
}

// The commands the terminal would name are no help in a window. A failure
// from the command line loses the sentences that tell the person to run one.
function withoutCommands(r) {
  if (r.ok || typeof r.error !== 'string' || !/research-harness [a-z]/.test(r.error)) return r;
  const kept = r.error.split(/(?<=[.!?])\s+/).filter((sentence) => !/research-harness [a-z]/.test(sentence));
  return { ...r, error: kept.join(' ').trim() || 'That was refused, and nothing was changed.' };
}

// The command line names the key file by its path under the state folder.
function withoutKeyPath(r, root) {
  const file = seal.keyPath(root);
  if (r.ok || typeof r.error !== 'string' || !r.error.includes(file)) return r;
  if (keyState(root) === 'unreadable') return { ...r, error: KEY_UNREADABLE };
  return { ...r, error: r.error.split(` at ${file}`).join(' on this computer').split(file).join('this computer\'s key for the project') };
}

async function cli(root, args) {
  return withoutCommands(withoutKeyPath(await runCli(root, args), root));
}

// The view's own write routes (accept, choose, stated, comment) refuse through
// the ledger, whose sentences tell the person to run a command — the one thing
// a window cannot do. In app mode those two refusals are answered in the app's
// words instead: the Join the app's own routes use, and the name the person
// has to give. Everything else is left as it stands — a broken chain or a key
// that cannot be read is no window's to fix, and the sentence says what
// happened.
function appRefusal(result, root) {
  if (!result || result.ok) return result;
  if (result.code === 'ledger' && keyState(root) === 'missing') return { ok: false, code: 'no-key', error: JOIN_FIRST };
  if (result.code === 'ledger' && keyState(root) === 'unreadable') return { ok: false, code: 'no-key', error: KEY_UNREADABLE };
  if (result.code === 'name') return { ok: false, code: 'name', error: NAME_NEEDED };
  return result;
}

// The `name` field of a dialog. Absent leaves the name this computer has;
// present is checked first (so a refusal writes nothing) and stored the way
// `research-harness name` stores it.
function nameRefusal(b) {
  if (b.name === undefined || b.name === null || b.name === '') return null;
  return typeof b.name === 'string' ? identity.nameRefusal(b.name) : NAME_NEEDED;
}

function storeName(b, root) {
  if (typeof b.name !== 'string' || !b.name.trim()) return;
  if (b.name.trim() !== personName(root)) identity.writeName(b.name);
}

function makeCurrent(ctx, root) {
  ctx.setRoot(root);
  return { ok: true, current: root, recent: store.remember(ctx.dataDir, root) };
}

const routes = {
  projects: async (b, ctx) => ({
    ok: true,
    current: ctx.getRoot(),
    recent: store.readStore(ctx.dataDir).recent.filter(isProject),
  }),

  open: async (b, ctx) => {
    if (!isProject(b.root)) return { ok: false, code: 'not-project', error: 'This folder has no research canvas (research/canvas.md).' };
    return makeCurrent(ctx, b.root);
  },

  init: async (b, ctx) => {
    if (typeof b.parent !== 'string' || !path.isAbsolute(b.parent) || !fs.existsSync(b.parent)) return invalid('The chosen folder does not exist.');
    if (typeof b.folder !== 'string' || !FOLDER_RE.test(b.folder)) return invalid('The folder name may use letters, digits, dots, hyphens and underscores.');
    if (!MODES.includes(b.mode)) return invalid(`Choose one of: ${MODES.join(', ')}.`);
    const badName = nameRefusal(b);
    if (badName) return invalid(badName, 'name');
    const root = path.join(b.parent, b.folder);
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) return { ok: false, code: 'exists', error: `${root} already exists and is not empty.` };
    fs.mkdirSync(root, { recursive: true });
    const args = ['init', '--project', b.folder, '--mode', b.mode];
    if (isLine(b.title, 200)) args.push('--title', b.title.trim());
    const r = await cli(root, args);
    if (!r.ok) return r;
    storeName(b, root);
    // The project is a repository from the start. If git cannot do that now
    // the project still exists; Share with co-authors… tries again.
    const repo = await appGit.initRepo(root, SEND_PATHS, 'Start the project', personName(root));
    const made = makeCurrent(ctx, root);
    return repo.ok ? made : { ...made, repoError: repo.error };
  },

  clone: async (b, ctx) => {
    const r = await appGit.clone({ url: b.url, parent: b.parent, folder: b.folder });
    if (!r.ok) return r;
    if (!isProject(r.root)) return { ok: false, code: 'not-project', error: 'The cloned folder has no research canvas (research/canvas.md).', root: r.root };
    return makeCurrent(ctx, r.root);
  },

  // What the sidebar needs to know beyond the decision log: the name this
  // computer has (also with no project open, for New project…), and for the
  // open project whether it has a shared copy and whether this computer holds
  // its key. The ledger status is a different question. Shared means an
  // origin the branch tracks: an origin alone is a Share that stopped before
  // its first push went through, and Share picks it up again. A key that
  // cannot be read is no key here, so the sidebar offers Join.
  status: async (b, ctx) => {
    const root = ctx.getRoot();
    const out = { ok: true, name: personName(root) };
    if (!root) return out;
    const origin = await appGit.originOf(root);
    const shared = origin !== null && await appGit.hasUpstream(root);
    return { ...out, hasKey: holdsKey(root), shared, origin: shared ? appGit.displayLink(origin) : null };
  },

  // Gives a project a shared copy: an empty repository the person made on a
  // host. Nothing changes until the repository is known to be empty and
  // reachable; a failed upload puts the link back as it was, so the next try
  // starts from the same place. An origin without a first push (a Share that
  // stopped half-way, or a repository opened with a link but never pushed)
  // is not a shared copy yet: the link given now replaces it if it is empty.
  // What goes up is the project's history as it is, with one more commit of
  // the research folder.
  share: (b, ctx) => withProject(ctx, async (root) => {
    if (!appGit.isLink(b.url)) return invalid('Paste the https link of the empty repository, for example https://github.com/your-name/your-paper.git.', 'url');
    if (appGit.hasCredentials(b.url)) return invalid(appGit.CREDENTIALS, 'url');
    const had = await appGit.originOf(root);
    if (had && await appGit.hasUpstream(root)) return { ok: false, code: 'shared', error: `This project already has a shared copy (${appGit.displayLink(had)}).` };
    const remote = await appGit.remoteIsEmpty(b.url);
    if (!remote.ok) return { ...remote, field: 'url' };
    if (!remote.empty) {
      return {
        ok: false,
        code: 'not-empty',
        field: 'url',
        error: 'That repository already holds files, so nothing was uploaded and nothing was changed. Create a new, empty repository (without a README or licence file) and paste its link instead.',
      };
    }
    const name = personName(root);
    const history = appGit.hasRepo(root)
      ? await appGit.commit(root, SEND_PATHS, 'Research canvas changes', name)
      : await appGit.initRepo(root, SEND_PATHS, 'Start the project', name);
    if (!history.ok) return history;
    const added = had ? await appGit.setOrigin(root, b.url) : await appGit.addOrigin(root, b.url);
    if (!added.ok) return added;
    const pushed = await appGit.push(root, { upstream: true });
    if (pushed.ok) return { ok: true, origin: appGit.displayLink(b.url) };
    if (had) await appGit.setOrigin(root, had);
    else await appGit.removeOrigin(root);
    return pushed.code === 'rejected'
      ? { ok: false, code: 'not-empty', field: 'url', error: 'Someone put files into that repository while the project was uploading, so the upload was refused. Create a new, empty repository and paste its link instead.' }
      : pushed;
  }),

  update: (b, ctx) => withProject(ctx, async (root) => {
    const name = personName(root);
    // git refuses to merge into files with uncommitted changes, and a person
    // who just logged a decision has exactly that. Commit them first, as send
    // does; a conflict is then a merge that can be aborted without loss.
    const own = await appGit.commit(root, SEND_PATHS, 'Research canvas changes', name);
    if (!own.ok) return own;
    const r = await appGit.pull(root, name);
    if (r.ok || r.code !== 'conflict') return r;
    const log = path.relative(root, project.decisionsPath(root));
    if (r.files.length === 1 && r.files[0] === log) {
      const merged = await cli(root, ['merge-log']);
      if (merged.ok) {
        const c = await appGit.commit(root, [log], 'Merge the shared decision log', name);
        if (c.ok) return { ok: true, merged: true };
      }
      await appGit.abortMerge(root);
      return { ok: false, code: 'merge-failed', error: 'The two decision logs could not be merged so that the seal verifies. Nothing was changed.' };
    }
    await appGit.abortMerge(root);
    return {
      ok: false,
      code: 'conflict',
      files: r.files,
      error: `You and a co-author both changed ${r.files.join(', ')}. Nothing was changed. Compare the file with the co-author who sent these changes, then get updates again.`,
    };
  }),

  send: (b, ctx) => withProject(ctx, async (root) => {
    const name = personName(root);
    const c = await appGit.commit(root, SEND_PATHS, 'Research canvas changes', name);
    if (!c.ok) return c;
    let p = await appGit.push(root);
    if (p.ok) return { ok: true, committed: c.committed };
    if (p.code !== 'rejected') return p;
    const u = await routes.update({}, ctx);
    if (!u.ok) return u;
    p = await appGit.push(root);
    return p.ok ? { ok: true, committed: c.committed, updated: true } : p;
  }),

  invite: (b, ctx) => withProject(ctx, (root) => {
    if (!isAbsoluteFile(b.out, '.seal.key')) return Promise.resolve(invalid('Choose where to save the key file (a name ending in .seal.key).', 'out'));
    const key = keyState(root);
    if (key === 'unreadable') return Promise.resolve({ ok: false, code: 'no-key', error: KEY_UNREADABLE });
    if (key === 'missing') return Promise.resolve({ ok: false, code: 'no-key', error: `This computer has no key for the project, so there is nothing to give a co-author. ${JOIN_FIRST}` });
    return cli(root, ['key', 'export', '--out', b.out]);
  }),

  // A key file this computer cannot read is set aside next to itself, never
  // deleted, so the key the person received can take its place; join checks
  // that key against the decision log first. If joining fails, the old file
  // goes back.
  join: (b, ctx) => withProject(ctx, async (root) => {
    if (!isAbsoluteFile(b.keyFile, '.seal.key')) return invalid('Choose the key file you received (it ends in .seal.key).');
    if (!isLine(b.name, 80)) return invalid('Enter your name as co-authors should see it.');
    const file = seal.keyPath(root);
    let aside = null;
    if (keyState(root) === 'unreadable') {
      aside = `${file}.unreadable-${Date.now()}`;
      try {
        fs.renameSync(file, aside);
      } catch {
        return { ok: false, code: 'no-key', error: 'This computer\'s key for the project cannot be read, and the app cannot set it aside. Nothing was changed.' };
      }
    }
    const r = await cli(root, ['join', '--key-file', b.keyFile, '--name', b.name.trim()]);
    if (!r.ok && aside && !fs.existsSync(file)) {
      try {
        fs.renameSync(aside, file);
      } catch {
        // The file stays beside, under its new name; it could not be read anyway.
      }
    }
    return r;
  }),

  session: (b, ctx) => withProject(ctx, async (root) => {
    if (b.action === 'start') {
      if (!isLine(b.occasion, 200)) return invalid('Name the occasion in one line.', 'occasion');
      const badName = nameRefusal(b);
      if (badName) return invalid(badName, 'name');
      // Before the key, nothing is written: a new key would make the other
      // people's entries read as broken.
      const key = keyState(root);
      if (key !== 'held') return { ok: false, code: 'no-key', error: key === 'unreadable' ? KEY_UNREADABLE : JOIN_FIRST };
      if (!personName(root) && !(typeof b.name === 'string' && b.name.trim())) return invalid(NAME_NEEDED, 'name');
      storeName(b, root);
      return cli(root, ['session', 'start', b.occasion.trim()]);
    }
    if (b.action === 'minutes') {
      return isAbsoluteFile(b.out, '.md') ? cli(root, ['session', 'protocol', '--out', b.out]) : invalid('Choose where to save the minutes (a .md file).', 'out');
    }
    return invalid('Unknown session action.');
  }),
};

module.exports = { routes, isProject, appRefusal };
