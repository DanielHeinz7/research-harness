'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('plugin.json declares the fixed identity', () => {
  const plugin = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  assert.equal(plugin.name, 'research-harness');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof plugin.description, 'string');
  assert.equal(plugin.license, 'MIT');
});

test('marketplace.json lists the plugin with the same version and description', () => {
  const marketplace = readJson(path.join(repoRoot, '.claude-plugin', 'marketplace.json'));
  const plugin = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  assert.equal(marketplace.name, 'research-harness');
  const entry = marketplace.plugins.find((p) => p.name === 'research-harness');
  assert.ok(entry, 'marketplace entry missing');
  assert.equal(entry.source, './plugins/research-harness');
  assert.equal(entry.version, plugin.version, 'version drifted between marketplace and plugin');
  assert.equal(entry.description, plugin.description, 'description drifted between marketplace and plugin');
});

test('hooks.json is valid and every command is rooted at CLAUDE_PLUGIN_ROOT', () => {
  const hooks = readJson(path.join(pluginRoot, 'hooks', 'hooks.json'));
  assert.equal(typeof hooks.description, 'string');
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.equal(hook.type, 'command', `${event}: hook type`);
        assert.match(hook.command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[a-z-]+\.js"$/, `${event}: command shape`);
        assert.ok(hook.timeout <= 10, `${event}: timeout too long`);
      }
    }
  }
});

test('there is no commands/ directory', () => {
  assert.equal(fs.existsSync(path.join(pluginRoot, 'commands')), false);
});
