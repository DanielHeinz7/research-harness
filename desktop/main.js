'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require('electron');
const path = require('node:path');
const { gitPath } = require('./git-path');
const { setUpAgent } = require('./agent');

if (process.env.RESEARCH_HARNESS_TEST_USER_DATA) app.setPath('userData', process.env.RESEARCH_HARNESS_TEST_USER_DATA);

const pluginRoot = app.isPackaged ? path.join(process.resourcesPath, 'plugin') : path.join(__dirname, '..', 'plugins', 'research-harness');
const askpass = app.isPackaged ? path.join(process.resourcesPath, 'askpass.sh') : path.join(__dirname, 'askpass.sh');
const shimsDir = app.isPackaged ? path.join(process.resourcesPath, 'shims') : path.join(__dirname, 'agent', 'shims');

function pluginVersion() {
  try { return JSON.parse(require('node:fs').readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version || null; } catch (_) { return null; }
}

// The bundled git only finds its helpers (https transport, credential
// manager) with the environment dugite would give it. In the built app it is
// run from the unpacked copy beside app.asar.
function gitEnv() {
  const bin = gitPath().replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const dir = path.resolve(bin, '..', '..');
  return {
    RESEARCH_HARNESS_GIT: bin,
    GIT_EXEC_PATH: path.join(dir, 'libexec', 'git-core'),
    GIT_CONFIG_SYSTEM: path.join(dir, 'etc', 'gitconfig'),
    GIT_TEMPLATE_DIR: path.join(dir, 'share', 'git-core', 'templates'),
    // Credentials go to the macOS Keychain through the Git Credential Manager
    // that ships with the bundled git. It must not prompt itself (it waits
    // with no window); git then asks through GIT_ASKPASS and hands the answer
    // to the manager to keep.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: 'manager',
    GCM_INTERACTIVE: 'never',
  };
}

function startServer() {
  const child = utilityProcess.fork(path.join(__dirname, 'server.js'), [], {
    env: {
      ...process.env,
      ...gitEnv(),
      RESEARCH_HARNESS_PLUGIN: pluginRoot,
      RESEARCH_HARNESS_APP_DATA: app.getPath('userData'),
      GIT_ASKPASS: askpass,
    },
  });
  return new Promise((resolve, reject) => {
    child.once('message', (msg) => (msg && msg.url ? resolve({ child, url: msg.url }) : reject(new Error((msg && msg.error) || 'The server did not start.'))));
    child.once('exit', (code) => reject(new Error(`The server stopped (exit ${code}).`)));
  });
}

function window(url) {
  const origin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1440,
    minWidth: 960,
    height: 900,
    title: 'research-harness',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.loadURL(url);
  return win;
}

ipcMain.handle('host:pick-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('host:pick-file', async (e, opts) => {
  const suffix = opts && typeof opts.suffix === 'string' ? opts.suffix.replace(/^\./, '') : null;
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: suffix ? [{ name: suffix, extensions: [suffix.split('.').pop()] }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('host:save-file', async (e, opts) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: opts && typeof opts.suggestedName === 'string' ? opts.suggestedName : undefined });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('host:reveal', (e, p) => { if (typeof p === 'string' && path.isAbsolute(p)) shell.showItemInFolder(p); });
ipcMain.handle('host:open-external', (e, url) => { if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url); });

app.whenReady().then(async () => {
  try {
    const { child, url } = await startServer();
    const win = window(url);
    setUpAgent({ win, pluginRoot, pluginVersion: pluginVersion(), gitEnv, dataDir: app.getPath('userData'), shimsDir });
    app.on('before-quit', () => child.kill());
  } catch (err) {
    dialog.showErrorBox('research-harness could not start', err.message);
    app.quit();
  }
});
app.on('window-all-closed', () => app.quit());
