'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Playwright is a devDependency of the repository root, as for the plugin's
// rendered tests; the app itself does not depend on it. Without it the test is
// skipped, not failed.
let electron;
try { ({ _electron: electron } = require('playwright')); } catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}
const skip = electron ? false : 'Playwright is not installed; run `npm install && npm run setup:browsers` at the repository root.';

test('the app opens, shows the first-start page and keeps the token off disk', { skip, timeout: 120000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-desktop-'));
  // Playwright looks for Electron next to itself; this package has its own.
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..')], env: { ...process.env, RESEARCH_HARNESS_TEST_USER_DATA: userData } });
  try {
    const win = await shellPage(app);
    await win.getByRole('button', { name: 'New project…' }).waitFor({ timeout: 90000 });
    assert.equal(new URL(win.url()).hash, '');
    const token = await win.evaluate(() => fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"x"}' }).then((r) => r.status));
    assert.equal(token, 403);                                     // the code was already redeemed by the shell
    for (const file of fs.readdirSync(userData, { recursive: true })) {
      const full = path.join(userData, String(file));
      if (fs.statSync(full).isFile()) assert.doesNotMatch(fs.readFileSync(full, 'latin1'), /[0-9a-f]{64}/, full);
    }
  } finally {
    await app.close();
  }
});

// The shell page, not the agent column's page: since the column became a
// WebContentsView created with the window, app.firstWindow() can return
// either, whichever loads first.
async function shellPage(app) {
  for (let i = 0; i < 900; i++) {
    const page = app.windows().find((p) => p.url().startsWith('http://127.0.0.1:'));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('shell page not found among app.windows(): ' + app.windows().map((p) => p.url()).join(', '));
}
