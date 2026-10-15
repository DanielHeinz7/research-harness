'use strict';
// Runs the plugin's own command line for the desktop app's human steps, so
// the app takes the same checks and writes the same files as the terminal.
// No shell: node gets the arguments as an array. Inside Electron,
// process.execPath is the app binary, which ELECTRON_RUN_AS_NODE turns into
// plain node; outside Electron the variable does nothing.
const childProcess = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', 'bin', 'research-harness.js');

function runCli(root, args) {
  return new Promise((resolve) => {
    childProcess.execFile(process.execPath, [CLI, ...args], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, ELECTRON_RUN_AS_NODE: '1' },
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      const output = String(stdout).trim();
      if (!err) {
        resolve({ ok: true, output });
        return;
      }
      resolve({ ok: false, code: err.code === 2 ? 'invalid' : 'refused', error: output || err.message });
    });
  });
}

module.exports = { runCli, CLI };
