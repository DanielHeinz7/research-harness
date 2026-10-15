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

// Whether this computer holds the project's key, apart from what the ledger
// says about its entries: an empty decision log has nothing to verify and
// still needs the key before anyone can write to it. A key file that exists
// but cannot be read counts as held; joining would only refuse to replace it.
function holdsKey(root) {
  try {
    return seal.readKey(root) !== null;
  } catch {
    return true;
  }
}

// The commands the terminal would name are no help in a window. A failure
// from the command line loses the sentences that tell the person to run one.
function withoutCommands(r) {
  if (r.ok || typeof r.error !== 'string' || !/research-harness [a-z]/.test(r.error)) return r;
  const kept = r.error.split(/(?<=[.!?])\s+/).filter((sentence) => !/research-harness [a-z]/.test(sentence));
  return { ...r, error: kept.join(' ').trim() || 'That was refused, and nothing was changed.' };
}

async function cli(root, args) {
  return withoutCommands(await runCli(root, args));
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
  // its key. The ledger status is a different question.
  status: async (b, ctx) => {
    const root = ctx.getRoot();
    const out = { ok: true, name: personName(root) };
    if (!root) return out;
    const origin = await appGit.originOf(root);
    return { ...out, hasKey: holdsKey(root), shared: origin !== null, origin: appGit.displayLink(origin) };
  },

  // Gives a project a shared copy: an empty repository the person made on a
  // host. Nothing changes until the repository is known to be empty and
  // reachable; a failed upload takes the link away again, so the next try
  // starts from the same place.
  share: (b, ctx) => withProject(ctx, async (root) => {
    if (!appGit.isLink(b.url)) return invalid('Paste the https link of the empty repository, for example https://github.com/your-name/your-paper.git.', 'url');
    const had = await appGit.originOf(root);
    if (had) return { ok: false, code: 'shared', error: `This project already has a shared copy (${appGit.displayLink(had)}).` };
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
    const added = await appGit.addOrigin(root, b.url);
    if (!added.ok) return added;
    const pushed = await appGit.push(root, { upstream: true });
    if (pushed.ok) return { ok: true, origin: appGit.displayLink(b.url) };
    await appGit.removeOrigin(root);
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
    if (!holdsKey(root)) return Promise.resolve({ ok: false, code: 'no-key', error: `This computer has no key for the project, so there is nothing to give a co-author. ${JOIN_FIRST}` });
    return cli(root, ['key', 'export', '--out', b.out]);
  }),

  join: (b, ctx) => withProject(ctx, (root) => {
    if (!isAbsoluteFile(b.keyFile, '.seal.key')) return Promise.resolve(invalid('Choose the key file you received (it ends in .seal.key).'));
    if (!isLine(b.name, 80)) return Promise.resolve(invalid('Enter your name as co-authors should see it.'));
    return cli(root, ['join', '--key-file', b.keyFile, '--name', b.name.trim()]);
  }),

  session: (b, ctx) => withProject(ctx, async (root) => {
    if (b.action === 'start') {
      if (!isLine(b.occasion, 200)) return invalid('Name the occasion in one line.', 'occasion');
      const badName = nameRefusal(b);
      if (badName) return invalid(badName, 'name');
      // Before the key, nothing is written: a new key would make the other
      // people's entries read as broken.
      if (!holdsKey(root)) return { ok: false, code: 'no-key', error: JOIN_FIRST };
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

module.exports = { routes, isProject };
