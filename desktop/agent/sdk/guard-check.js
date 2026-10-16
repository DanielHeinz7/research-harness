'use strict';
// Has the guard been seen to start (spec 5.6)? Fed the SDK messages in order.
// The decision of 2026-10-15: the guard counts as started once a SessionStart
// hook_response with outcome success arrives whose context comes from
// research-harness, and query.initializationResult() lists at least one
// research-harness: command. `init` is not required before the first message;
// if it arrives later without the plugin, that is a guard failure.
// The version for the header line comes from the bundled manifest, not from
// reloadPlugins().
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_CAUSE = 'The research-harness plugin did not load.';
const HOOK_CAUSE = 'The guard’s start hook did not run. Settings installed on this Mac by your organisation may turn hooks off.';

function fromOurHook(output) {
  try { return /^research-harness\b/.test(JSON.parse(output).hookSpecificOutput.additionalContext); } catch { return false; }
}

function manifestVersion(pluginRoot) {
  for (const candidate of [path.join(pluginRoot, '.claude-plugin', 'plugin.json'), path.join(pluginRoot, 'plugin.json')]) {
    try {
      const version = JSON.parse(fs.readFileSync(candidate, 'utf8')).version;
      if (typeof version === 'string' && version.trim()) return version.trim();
    } catch { /* try the next place the manifest may sit */ }
  }
  return null;
}

function hasOurCommands(commands) {
  return (commands || []).some((command) => command && typeof command.name === 'string' && command.name.startsWith('research-harness:'));
}

function createGuardCheck({ pluginRoot, commands = [] }) {
  const ourCommands = hasOurCommands(commands);
  const version = manifestVersion(pluginRoot);
  let hookRan = false;
  let hookFailed = false;
  let initSeen = false;
  let initLists = false;

  function decide() {
    if (initSeen && !initLists) return { state: 'off', cause: PLUGIN_CAUSE };
    if (hookFailed) return { state: 'off', cause: HOOK_CAUSE };
    if (hookRan) return ourCommands && version ? { state: 'on', version } : { state: 'off', cause: PLUGIN_CAUSE };
    if (initSeen) return { state: 'off', cause: HOOK_CAUSE };
    return null;
  }

  return function feed(msg) {
    if (msg.type === 'system') {
      if (msg.subtype === 'hook_response' && msg.hook_event === 'SessionStart') {
        if (msg.outcome === 'success' && fromOurHook(msg.output)) hookRan = true;
        else hookFailed = true;
      }
      if (msg.subtype === 'init') {
        initSeen = true;
        initLists = (msg.plugins || []).some((plugin) => plugin && plugin.name === 'research-harness');
      }
    }
    return decide();
  };
}

module.exports = { createGuardCheck };
