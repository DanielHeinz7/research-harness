'use strict';
// The query options for the agent (spec 5.3) and for the one-turn
// connection test. Pure; the tests pin every field.
const { envFor } = require('./connection');

const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Skill', 'Task', 'WebFetch', 'WebSearch'];
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function baseEnv({ configDir, home, appVersion }) {
  return {
    HOME: home,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_AGENT_SDK_CLIENT_APP: `research-harness-desktop/${appVersion}`,
  };
}

function buildOptions({ conn, secret, cwd, pluginRoot, binary, shimsDir, shimEnv = {}, configDir, home, appVersion, canUseTool, resume }) {
  const { vars, secretNames } = envFor(conn, secret);
  const options = {
    pathToClaudeCodeExecutable: binary,
    plugins: [{ type: 'local', path: pluginRoot }],
    settingSources: [],
    cwd,
    env: { ...shimEnv, PATH: `${shimsDir}:${SYSTEM_PATH}`, ...baseEnv({ configDir, home, appVersion }), ...vars },
    tools: TOOLS,
    permissionMode: 'acceptEdits',
    canUseTool,
    sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, credentials: { envVars: secretNames.map((name) => ({ name, mode: 'deny' })) } },
    model: conn.model,
    includePartialMessages: true,
    includeHookEvents: true,
  };
  if (resume) options.resume = resume;
  return options;
}

function buildTestOptions({ conn, secret, binary, configDir, home, appVersion }) {
  return {
    pathToClaudeCodeExecutable: binary,
    plugins: [],
    settingSources: [],
    env: { PATH: SYSTEM_PATH, ...baseEnv({ configDir, home, appVersion }), ...envFor(conn, secret).vars },
    tools: [],
    maxTurns: 1,
    model: conn.model,
    canUseTool: async () => ({ behavior: 'deny', message: 'No tools in a connection test.' }),
  };
}

module.exports = { TOOLS, buildOptions, buildTestOptions };
