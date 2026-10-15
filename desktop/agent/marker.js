'use strict';
// The plugin's SessionStart hook writes a marker when the app asks for one
// (RESEARCH_HARNESS_APP_MARKER). It shows that the plugin's hooks are loaded
// and not switched off in this session; it does not test the guard itself
// (spec §5.4). pid in the marker is informational and not compared.
const fs = require('node:fs');

function readMarker(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j || typeof j.pluginRoot !== 'string') return null;
    return { pluginRoot: j.pluginRoot, version: typeof j.version === 'string' ? j.version : null };
  } catch (_) {
    return null;
  }
}

function real(p) {
  try { return fs.realpathSync(p); } catch (_) { return p; }
}

function classify(marker, { bundledRoot }) {
  if (!marker) return { kind: 'missing', version: null };
  return { kind: real(marker.pluginRoot) === real(bundledRoot) ? 'bundled' : 'other', version: marker.version };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForMarker(file, { timeoutMs = 15000, intervalMs = 250, exited = () => false } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const marker = readMarker(file);
    if (marker) return marker;
    if (exited() || Date.now() >= until) return null;
    await sleep(intervalMs);
  }
}

function guardLine(result, { exited = false } = {}) {
  if (result.kind === 'bundled') return { text: `Guard on · research-harness ${result.version}`, detail: null, warn: false };
  if (result.kind === 'other') return { text: `Guard on · research-harness ${result.version} from your Claude Code settings`, detail: null, warn: false };
  return {
    text: "Guard not confirmed. The agent's writes may not be checked in this session.",
    detail: exited
      ? 'The session did not start.'
      : "Claude Code did not report the research-harness hooks. Your organisation's settings may turn hooks off. The app cannot stop Claude Code.",
    warn: true,
  };
}

module.exports = { readMarker, classify, waitForMarker, guardLine };
