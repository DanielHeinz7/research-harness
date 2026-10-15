'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Playwright comes through NODE_PATH, as in the plugin's rendered tests; the
// app does not depend on it. Without it the test is skipped, not failed.
let electron;
try { ({ _electron: electron } = require('playwright')); } catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}
const skip = electron ? false : 'Playwright is not installed; run with NODE_PATH pointing at a node_modules that has it.';

test('the app opens, shows the first-start page and keeps the token off disk', { skip, timeout: 120000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-desktop-'));
  // Playwright looks for Electron next to itself; this package has its own.
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..')], env: { ...process.env, RESEARCH_HARNESS_TEST_USER_DATA: userData } });
  try {
    const win = await app.firstWindow();
    await win.getByRole('button', { name: 'New project…' }).waitFor();
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
