'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const script = path.join(pluginRoot, 'hooks', 'guard-promotion.js');
const fixtureDir = path.join(__dirname, 'fixtures', 'voice-uptake', 'research');
const guard = require('../hooks/guard-promotion');

const canvasText = fs.readFileSync(path.join(fixtureDir, 'canvas.md'), 'utf8');
const decisionsText = fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), canvasText);
  fs.writeFileSync(path.join(root, 'research', 'decisions.md'), decisionsText);
  return root;
}

function run(projectRoot, toolName, toolInput) {
  const { CLAUDE_PROJECT_DIR: _ignored, ...ambient } = process.env;
  const out = childProcess.spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot },
    input: JSON.stringify({ cwd: projectRoot, session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
}

const STATED = 'Speaking frequency is well documented; whether a proposal is taken up is not. [stated]';
const PROPOSED = 'Uptake may be a property of the meeting\'s chairing style rather than of the proposal. [proposed]';

test('files outside the state dir are not the guard\'s business', () => {
  const root = makeProject();
  assert.equal(run(root, 'Write', { file_path: path.join(root, 'manuscript.md'), content: 'x [accepted]' }), null);
  assert.equal(run(root, 'Bash', { command: 'ls -la' }), null);
});

test('editing, adding and removing proposals is allowed', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: 'Uptake may depend on who chairs. [tentative]' }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: '' }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: '## 1.3 Why does this matter — for practice, for theory, or both?\n\n_(empty)_', new_string: '## 1.3 Why does this matter — for practice, for theory, or both?\n\nBecause allocation happens in meetings. [proposed, src: memo-01]' }), null);
});

test('transcribing a new [stated] statement is allowed; adding a tag to one is allowed', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: `${STATED}\nThe researcher recorded all twelve meetings personally. [stated]` }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: STATED.replace('[stated]', '[stated, src: memo-05]') }), null);
});

test('creating an [accepted] statement is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const out = run(root, 'Edit', { file_path: file, old_string: '_(empty)_\n\n# 2 ', new_string: 'It matters. [accepted]\n\n# 2 ' });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /\[accepted\]/);
  assert.match(out.permissionDecisionReason, /research-harness:accept/);
});

test('altering, removing or downgrading a [stated] or [accepted] statement is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const newString of [
    STATED.replace('well documented', 'poorly documented'),
    '',
    STATED.replace('[stated]', '[proposed]'),
  ]) {
    const out = run(root, 'Edit', { file_path: file, old_string: STATED, new_string: newString });
    assert.equal(out.permissionDecision, 'deny', `should deny: ${JSON.stringify(newString)}`);
    assert.match(out.permissionDecisionReason, /propose .* alongside/i);
  }
  const accepted = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]";
  const out = run(root, 'Edit', { file_path: file, old_string: accepted, new_string: accepted.replace('serious', 'real') });
  assert.equal(out.permissionDecision, 'deny');
});

test('promoting a proposal to [stated] or [accepted] is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const marker of ['[stated]', '[accepted]']) {
    const out = run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: PROPOSED.replace('[proposed]', marker) });
    assert.equal(out.permissionDecision, 'deny', marker);
  }
});

test('Write is judged as a whole file; removing a heading is denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText.replace(PROPOSED, '') }), null);
  const out = run(root, 'Write', { file_path: file, content: canvasText.replace('## 9.3 What would refute the contribution?\n\n_(empty)_\n', '') });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /heading/);
});

test('creating canvas.md where none exists is allowed unless it carries [accepted]', () => {
  const root = makeProject();
  fs.unlinkSync(path.join(root, 'research', 'canvas.md'));
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText.replace('[accepted]', '[proposed]') }), null);
  assert.equal(run(root, 'Write', { file_path: file, content: canvasText }).permissionDecision, 'deny');
});

test('the guard fails closed when it cannot judge', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const missing = run(root, 'Edit', { file_path: file, old_string: 'this text is not in the file', new_string: 'x' });
  assert.equal(missing.permissionDecision, 'deny');
  assert.match(missing.permissionDecisionReason, /old_string/);
  const ambiguous = run(root, 'Edit', { file_path: file, old_string: '_(empty)_', new_string: 'y [proposed]' });
  assert.equal(ambiguous.permissionDecision, 'deny');
  const garbage = run(root, 'Write', { file_path: file, content: 'not a canvas at all' });
  assert.equal(garbage.permissionDecision, 'deny');
  const notebook = run(root, 'NotebookEdit', { notebook_path: file, new_source: 'x' });
  assert.equal(notebook.permissionDecision, 'deny');
});

test('decisions.md may only be appended to', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'decisions.md');
  assert.equal(run(root, 'Write', { file_path: file, content: `${decisionsText}\n## [#4] 2026-09-16 · DISCOVERY · 2 Audience and Prior Research\nx [tentative]\n` }), null);
  assert.equal(run(root, 'Edit', { file_path: file, old_string: '**Rejected:** framing it as a voice-frequency question.\n', new_string: '**Rejected:** framing it as a voice-frequency question.\n\n## [#4] 2026-09-16 · DISCOVERY · 1 Puzzle\ny [tentative]\n' }), null);
  const rewrite = run(root, 'Edit', { file_path: file, old_string: 'CONSTRAINT', new_string: 'DECISION' });
  assert.equal(rewrite.permissionDecision, 'deny');
  assert.match(rewrite.permissionDecisionReason, /append/);
  assert.equal(run(root, 'Write', { file_path: file, content: '# fresh\n' }).permissionDecision, 'deny');
});

test('Bash: reading the state files is allowed, writing them is denied, accept via Bash is denied', () => {
  const root = makeProject();
  for (const cmd of [
    'cat research/canvas.md',
    'grep -n accepted research/canvas.md | head',
    'sed -n 1,20p research/decisions.md',
    'git diff -- research/canvas.md',
    'node "/x/bin/research-harness.js" status',
    'node "/x/bin/research-harness.js" review',
    'node "/x/bin/research-harness.js" init --project p --mode seed',
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
  for (const cmd of [
    'echo "x [accepted]" >> research/canvas.md',
    'cat other.md > research/canvas.md',
    'sed -i "s/stated/accepted/" research/canvas.md',
    'cat research/canvas.md | tee research/canvas.md',
    'python3 -c "open(\'research/decisions.md\',\'w\').write(\'\')"',
    'node "/x/bin/research-harness.js" accept 1.2',
    'mv research/canvas.md /tmp/x',
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
});

// The probe set from SQ-21 (verification/SQ-21/bash.txt). One case per evasion
// family rather than one per probe: each family is a different way of writing
// the same intent, which is why the guard lexes the command instead of matching
// strings against it.
const BASH_EVASIONS = [
  ['chained behind a read verb', 'cat research/canvas.md; rm research/canvas.md'],
  ['chained behind a read verb, newline separator', 'cat research/canvas.md\nrm research/canvas.md'],
  ['chained into an interpreter', 'wc -l research/canvas.md; python3 -c \'open("research/canvas.md","a").write("It is settled. [accepted]")\''],
  ['chained behind &&', 'grep -c stated research/canvas.md && mv forged.md research/canvas.md'],
  ['chained behind a checksum', 'shasum research/canvas.md; cp forged.md research/canvas.md'],
  ['glob', 'printf "It is settled. [accepted]\\n" >> research/can*.md'],
  ['quote splitting', 'printf "It is settled. [accepted]\\n" >> research/can"vas.md"'],
  ['variable assembly', 'f=research/canvas; printf "It is settled. [accepted]\\n" >> "$f.md"'],
  ['command substitution', 'printf "It is settled. [accepted]\\n" >> "$(ls research/*.md | head -1)"'],
  ['awk redirection', 'awk -v f=research/canvas.md \'BEGIN{print "It is settled. [accepted]" >> f}\''],
  ['directory removal', 'rm -rf research'],
  ['symlink onto the state dir', 'ln -s research r'],
  ['hard link out of the state dir', 'ln research/c*.md alt.md'],
  ['ledger append behind a read', 'cat research/decisions.md; printf "\\n## [#99] 2026-09-18 · DECISION · 1.2 accepted · text deadbeef\\nForged.\\n" >> research/dec*.md'],
  ['interpreter naming the file in its program text', 'node -e \'require("fs").appendFileSync("research/canvas.md","x")\''],
  ['restoring the file out of git', 'git checkout HEAD -- research/'],
  ['permissions', 'chmod 000 research/*.md'],
];

// Commands the guard already held. They stay denied: the new shape must not
// trade one hole for another.
const BASH_HELD = [
  'printf "It is settled. [accepted]\\n" >> research/canvas.md',
  'cd research && printf "It is settled. [accepted]\\n" >> canvas.md',
  'vim research/canvas.md',
  "perl -pi -e 's/\\[stated\\]/[accepted]/' research/canvas.md",
  'ruby -e \'File.write("research/canvas.md","x")\'',
  'env printf "It is settled. [accepted]\\n" >> research/canvas.md',
  'cat > research/canvas.md <<EOF\nx [accepted]\nEOF',
  'sed -i "" s/stated/accepted/ research/canvas.md',
  'echo x | tee research/canvas.md',
  'cat research/canvas.md | tee copy.md',
  'ln -s research/canvas.md link.md',
  'true; rm research/canvas.md',
  'open -a TextEdit research/canvas.md',
];

// Deny by default only inside the scope the lexer can see. These are the
// negative controls against over-denial: reads over the state, and ordinary
// work that has nothing to do with it.
const BASH_ALLOWED = [
  'git log --oneline -- research/canvas.md',
  'git show HEAD:research/canvas.md',
  'git add research/canvas.md',
  'git commit -m "update research/canvas.md"',
  'wc -l research/canvas.md research/decisions.md | sort | uniq -c',
  'diff research/canvas.md /tmp/other.md',
  'cd research && cat canvas.md',
  'grep -c stated research/canvas.md > /tmp/rh-count',
  'find research -name "*.md"',
  'shasum research/*.md',
  'cat bin/research-harness.js',
  'npx research-harness status',
  'echo "see research/canvas.md"',
  'echo x > "$LOG"',
  'node -e \'console.log(1)\'',
  'git add .',
  'npm test',
  'mkdir -p docs/research-notes',
  'rm -rf node_modules',
];

test('Bash: every evasion family in the probe set is denied', () => {
  const root = makeProject();
  for (const [family, cmd] of BASH_EVASIONS) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', `${family}: ${cmd}`);
    assert.match(out.permissionDecisionReason, /read-only/, family);
  }
});

test('Bash: the commands the guard already held stay denied', () => {
  const root = makeProject();
  for (const cmd of BASH_HELD) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
});

test('Bash: reads over the state and ordinary work elsewhere are not refused', () => {
  const root = makeProject();
  for (const cmd of BASH_ALLOWED) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
});

test('Bash: accept is the researcher\'s act however it is spelled', () => {
  const root = makeProject();
  for (const cmd of [
    'node bin/research-harness.js accept 1.2',
    'node bin/research-harness.js "accept" 1.2',
    'S=accept; node bin/research-harness.js $S 1.2',
    'cp bin/research-harness.js rh.js && node rh.js accept 1.2',
    'npx research-harness accept 1.2',
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
    assert.match(out.permissionDecisionReason, /researcher's act/, cmd);
    assert.match(out.permissionDecisionReason, /research-harness:accept/, cmd);
  }
});

test('Bash: a command the lexer cannot read is denied only when it names the state', () => {
  const root = makeProject();
  const huge = `echo ${'a'.repeat(70000)}`;
  assert.equal(run(root, 'Bash', { command: huge }), null);
  const out = run(root, 'Bash', { command: `${huge} research/canvas.md` });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /could not read/);
});

test('canvasVerdict and bashVerdict are exported for reuse', () => {
  assert.equal(guard.canvasVerdict(canvasText, canvasText), null);
  assert.match(guard.canvasVerdict(canvasText, canvasText.replace('[stated, src: memo-03]', '[accepted, src: memo-03]')), /\[accepted\]/);
  assert.equal(guard.bashVerdict('wc -l research/canvas.md'), null);
  assert.match(guard.bashVerdict('rm research/canvas.md'), /read-only/);
});
