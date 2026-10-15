'use strict';
// Routes of the desktop app's human steps, mounted by canvas-serve.js in app
// mode under /api/app/<name>. Each takes the parsed body and the app context
// and resolves to { ok: true, ... } or { ok: false, code, error }.
const fs = require('node:fs');
const path = require('node:path');
const project = require('./project');
const identity = require('./identity');
const appGit = require('./app-git');
const store = require('./app-store');
const { runCli } = require('./app-cli');

const MODES = ['brainstorming', 'seed', 'import'];
const FOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SEND_PATHS = ['research'];

function invalid(error) {
  return { ok: false, code: 'invalid', error };
}

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
    const root = path.join(b.parent, b.folder);
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) return { ok: false, code: 'exists', error: `${root} already exists and is not empty.` };
    fs.mkdirSync(root, { recursive: true });
    const args = ['init', '--project', b.folder, '--mode', b.mode];
    if (isLine(b.title, 200)) args.push('--title', b.title.trim());
    const r = await runCli(root, args);
    return r.ok ? makeCurrent(ctx, root) : r;
  },

  clone: async (b, ctx) => {
    const r = await appGit.clone({ url: b.url, parent: b.parent, folder: b.folder });
    if (!r.ok) return r;
    if (!isProject(r.root)) return { ok: false, code: 'not-project', error: 'The cloned folder has no research canvas (research/canvas.md).', root: r.root };
    return makeCurrent(ctx, r.root);
  },

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
      const merged = await runCli(root, ['merge-log']);
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

  invite: (b, ctx) => withProject(ctx, (root) => (
    isAbsoluteFile(b.out, '.seal.key') ? runCli(root, ['key', 'export', '--out', b.out]) : Promise.resolve(invalid('Choose where to save the key file (a name ending in .seal.key).'))
  )),

  join: (b, ctx) => withProject(ctx, (root) => {
    if (!isAbsoluteFile(b.keyFile, '.seal.key')) return Promise.resolve(invalid('Choose the key file you received (it ends in .seal.key).'));
    if (!isLine(b.name, 80)) return Promise.resolve(invalid('Enter your name as co-authors should see it.'));
    return runCli(root, ['join', '--key-file', b.keyFile, '--name', b.name.trim()]);
  }),

  session: (b, ctx) => withProject(ctx, (root) => {
    if (b.action === 'start') {
      return isLine(b.occasion, 200) ? runCli(root, ['session', 'start', b.occasion.trim()]) : Promise.resolve(invalid('Name the occasion in one line.'));
    }
    if (b.action === 'minutes') {
      return isAbsoluteFile(b.out, '.md') ? runCli(root, ['session', 'protocol', '--out', b.out]) : Promise.resolve(invalid('Choose where to save the minutes (a .md file).'));
    }
    return Promise.resolve(invalid('Unknown session action.'));
  }),
};

module.exports = { routes, isProject };
