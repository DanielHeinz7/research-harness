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

function run(projectRoot, toolName, toolInput, env = {}) {
  const { CLAUDE_PROJECT_DIR: _project, RESEARCH_HARNESS_DIR: _dir, ...ambient } = process.env;
  const out = childProcess.spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: { ...ambient, CLAUDE_PLUGIN_ROOT: pluginRoot, ...env },
    input: JSON.stringify({ cwd: projectRoot, session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
}

const ACCEPTED = "When do members' suggestions in organizational meetings receive serious consideration rather than polite acknowledgement? [accepted]";
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

test('transcribing a new [stated] statement is allowed; tagging a proposal is allowed', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: `${STATED}\nThe researcher recorded all twelve meetings personally. [stated]` }), null);
  // A proposal is not a commitment, so its tags stay the model's to set.
  assert.equal(run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: PROPOSED.replace('[proposed]', '[proposed, src: memo-05]') }), null);
});

// The evidence tags belong to the commitment (§4.3.1), so attaching one to a
// statement the researcher stated is not an annotation, it is a claim about
// what backs their words — SQ-21's D4b fabricated a source on the accepted
// statement and thereby dropped it from canvas-review's untagged report, so the
// review stopped flagging the very thing it exists to flag.
test('retagging a committed statement is denied, including attaching a source to it', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const attach = run(root, 'Edit', { file_path: file, old_string: STATED, new_string: STATED.replace('[stated]', '[stated, src: memo-05]') });
  assert.equal(attach.permissionDecision, 'deny');
  assert.match(attach.permissionDecisionReason, /evidence tag/);

  const tagged = 'Under what meeting conditions does a junior member\'s proposal get taken up? [stated, src: memo-03]';
  for (const replacement of ['[stated, src: memo-99 §4]', '[stated]']) {
    const out = run(root, 'Edit', { file_path: file, old_string: tagged, new_string: tagged.replace('[stated, src: memo-03]', replacement) });
    assert.equal(out.permissionDecision, 'deny', replacement);
    assert.match(out.permissionDecisionReason, /evidence tag/);
  }
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

// SQ-21's structural class. Each of these changed the canvas by zero or a
// handful of bytes and left the statement's own text and marker untouched;
// what moved was the element, the question or the frontmatter around it. The
// byte deltas are from the probe run and are the point: a researcher reading
// the transcript would not notice any of them.
const Q11 = '## 1.1 What is the broad question this project speaks to?';
const BLOCK11 = `${Q11}\n\n${ACCEPTED}\n\n`;

test('re-parenting a committed statement to another element is denied (S1, S6)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  // S1, 3157 -> 3157: question 1.1 and its accepted statement moved under
  // element 3. S6, 3157 -> 3157: the statement alone moved to a duplicate 1.1
  // under element 9, which flipped element 9 to `accepted` while element 1 lost
  // the commitment and the file did not change size.
  const s1 = canvasText.replace(BLOCK11, '').replace('# 3 · Research Question\n', `# 3 · Research Question\n\n${Q11}\n\n${ACCEPTED}\n`);
  const s6 = `${canvasText.replace(BLOCK11, '')}\n${Q11}\n\n${ACCEPTED}\n`;
  for (const [name, content] of [['S1', s1], ['S6', s6]]) {
    const out = run(root, 'Write', { file_path: file, content });
    assert.equal(out.permissionDecision, 'deny', name);
    assert.equal(Buffer.byteLength(content), Buffer.byteLength(canvasText), `${name} changes no bytes`);
  }
});

test('a duplicate question heading is denied wherever it is placed (S5, S5b)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const copy = `${ACCEPTED.replace(' [accepted]', '')} [proposed]`;
  // The first implementation matched statements in file order, so the copy was
  // caught after the original and missed before it. A duplicate heading is now
  // unjudgeable either way.
  const before = canvasText.replace(BLOCK11, `${Q11}\n\n${copy}\n\n${BLOCK11}`);
  const after = `${canvasText}\n${Q11}\n\n${copy}\n`;
  for (const [name, content] of [['S5', before], ['S5b', after]]) {
    const out = run(root, 'Write', { file_path: file, content });
    assert.equal(out.permissionDecision, 'deny', name);
    assert.match(out.permissionDecisionReason, /question 1\.1 has 2 headings/, name);
  }
});

test('a second element heading is denied (S15, 3157 -> 3215)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const out = run(root, 'Write', { file_path: file, content: `${canvasText}\n# 1 · Puzzle (working)\n\n## 1.7 Working notes\n\n_(empty)_\n` });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /element 1 has 2 headings/);
});

test('rewriting the question or the element around a commitment is denied (S2, S3)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  // S2, 3157 -> 3150: the question's text rewritten, its id kept, so the
  // accepted statement now answers a different question.
  const s2 = run(root, 'Write', { file_path: file, content: canvasText.replace(Q11, '## 1.1 Which chairing style should the firm adopt?') });
  assert.equal(s2.permissionDecision, 'deny');
  assert.match(s2.permissionDecisionReason, /question rewritten/);
  // S3, 3157 -> 3164: Puzzle retitled Contributions, which turns an accepted
  // puzzle into an accepted contribution.
  const s3 = run(root, 'Write', { file_path: file, content: canvasText.replace('# 1 · Puzzle', '# 1 · Contributions') });
  assert.equal(s3.permissionDecision, 'deny');
  assert.match(s3.permissionDecisionReason, /title of its element/);
});

// The frontmatter is protected state, not decoration (§4.3.1): the whole
// mapping, so that the next key added is protected by default.
test('rewriting any frontmatter key is denied (S12, S12b)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const s12 = run(root, 'Write', {
    file_path: file,
    content: canvasText.replace('project: voice-uptake', 'project: chair-rotation').replace('outlet: Organization Science', 'outlet: Journal of Chairing'),
  });
  assert.equal(s12.permissionDecision, 'deny');
  assert.match(s12.permissionDecisionReason, /frontmatter key "outlet"|frontmatter key "project"/);

  // S12b pointed profile: at an id the plugin does not ship, and dependency
  // checking simply stopped rather than reporting that it could not check.
  const s12b = run(root, 'Write', { file_path: file, content: canvasText.replace('profile: is-qualitative', 'profile: is-experimental') });
  assert.equal(s12b.permissionDecision, 'deny');

  const added = run(root, 'Write', { file_path: file, content: canvasText.replace('canvas-schema: 2', 'canvas-schema: 2\nreviewer: the model') });
  assert.equal(added.permissionDecision, 'deny');
  assert.match(added.permissionDecisionReason, /frontmatter key "reviewer"/);
});

test('a canvas whose profile does not resolve cannot be judged at all', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const broken = canvasText.replace('profile: is-qualitative', 'profile: is-experimental');
  fs.writeFileSync(file, broken);
  // Even a write that touches nothing else: the rules that judge this canvas
  // cannot be loaded, so §5.3's fail-closed clause applies.
  const out = run(root, 'Edit', { file_path: file, old_string: PROPOSED, new_string: '' });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /does not resolve to a profile this harness ships/);
});

test('pushing U+00A0 or U+FEFF into a committed statement is denied (D5b, D5c)', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const code of [0x00a0, 0xfeff]) {
    const injected = ACCEPTED.replace('serious consideration', `serious${String.fromCharCode(code)}consideration`);
    const out = run(root, 'Edit', { file_path: file, old_string: ACCEPTED, new_string: injected });
    assert.equal(out.permissionDecision, 'deny', code.toString(16));
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
  assert.match(notebook.permissionDecisionReason, /not a notebook/);
  // A recognised tool carrying a payload it cannot have written from: no
  // content to compare against, no old_string to apply.
  const contentless = run(root, 'Write', { file_path: file });
  assert.equal(contentless.permissionDecision, 'deny');
  assert.match(contentless.permissionDecisionReason, /carries no content/);
  const stringless = run(root, 'Edit', { file_path: file, new_string: 'x [accepted]' });
  assert.equal(stringless.permissionDecision, 'deny');
  assert.match(stringless.permissionDecisionReason, /old_string/);
});

// ---------- path resolution ----------

// The control payload from SQ-21 (verification/SQ-21/path-and-tool.txt): the
// [accepted] statement of 1.1 deleted and the [stated] statement of 1.2
// reworded. At the canonical path it is denied; every case below is that same
// payload reaching the same file under a different name.
const FORGED = canvasText
  .replace(`${ACCEPTED}\n`, '')
  .replace(STATED, 'Whether a proposal is taken up is well documented. [stated]');

function deniedReason(root, file, env) {
  const out = run(root, 'Write', { file_path: file, content: FORGED }, env);
  assert.equal(out && out.permissionDecision, 'deny', String(file));
  return out.permissionDecisionReason;
}

// Case sensitivity is a property of the volume, so the test asks the volume.
// Where names are case-sensitive these really are different files and the
// guard is right to ignore them.
function caseBlindVolume(root) {
  try {
    fs.accessSync(path.join(root, 'RESEARCH', 'canvas.md'));
    return true;
  } catch (_) {
    return false;
  }
}

function canSymlink(root) {
  const probe = path.join(root, '.symlink-probe');
  try {
    fs.symlinkSync(path.join(root, 'research'), probe);
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

test('the forged canvas is denied at the canonical path', () => {
  const root = makeProject();
  assert.match(deniedReason(root, path.join(root, 'research', 'canvas.md')), /\[accepted\] commitment in question 1\.1/);
});

test('a case variant of the path is the same file and is judged as one', (t) => {
  const root = makeProject();
  if (!caseBlindVolume(root)) return t.skip('case-sensitive volume: these are different files');
  for (const spelling of [['research', 'CANVAS.md'], ['RESEARCH', 'canvas.md'], ['RESEARCH', 'CANVAS.md']]) {
    assert.match(deniedReason(root, path.join(root, ...spelling)), /\[accepted\] commitment in question 1\.1/);
  }
  // With no canvas on disk a case variant still creates one, so the creation
  // rule applies to it too: allowed, unless it carries [accepted].
  fs.unlinkSync(path.join(root, 'research', 'canvas.md'));
  const fresh = path.join(root, 'research', 'CANVAS.md');
  assert.equal(run(root, 'Write', { file_path: fresh, content: canvasText.replace('[accepted]', '[proposed]') }), null);
  assert.equal(run(root, 'Write', { file_path: fresh, content: canvasText }).permissionDecision, 'deny');
  return undefined;
});

test('a symlinked file, a symlinked directory and a hard link all lead back to the canvas', (t) => {
  const root = makeProject();
  if (!canSymlink(root)) return t.skip('this platform does not allow symlinks');
  const canvasFile = path.join(root, 'research', 'canvas.md');
  fs.symlinkSync(canvasFile, path.join(root, 'link.md'));
  fs.symlinkSync(path.join(root, 'research'), path.join(root, 'r'));
  fs.linkSync(canvasFile, path.join(root, 'alt.md'));
  for (const spelling of ['link.md', path.join('r', 'canvas.md'), 'alt.md']) {
    assert.match(deniedReason(root, path.join(root, spelling)), /\[accepted\] commitment in question 1\.1/);
  }
  // A link that points nowhere yet still names where the write would land.
  fs.unlinkSync(canvasFile);
  fs.symlinkSync(canvasFile, path.join(root, 'dangling.md'));
  assert.equal(run(root, 'Write', { file_path: path.join(root, 'dangling.md'), content: canvasText }).permissionDecision, 'deny');
  return undefined;
});

test('an unreadable canvas is unjudgeable, not absent', (t) => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  fs.chmodSync(file, 0o000);
  try {
    fs.readFileSync(file);
    fs.chmodSync(file, 0o644);
    return t.skip('this process reads a mode 000 file, so the fail-open cannot be reproduced');
  } catch (_) {
    // As intended: the guard is about to meet the same EACCES.
  }
  for (const toolInput of [
    { file_path: file, content: FORGED },
    { file_path: file, content: canvasText },
  ]) {
    const out = run(root, 'Write', toolInput);
    assert.equal(out && out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /Cannot judge this write/);
    assert.match(out.permissionDecisionReason, /cannot be read \(EACCES\)/);
    // The refusal names the file it could not read, not what was typed.
    assert.ok(out.permissionDecisionReason.includes(fs.realpathSync.native(file)), out.permissionDecisionReason);
  }
  const edit = run(root, 'Edit', { file_path: file, old_string: STATED, new_string: '' });
  assert.equal(edit.permissionDecision, 'deny');
  assert.match(edit.permissionDecisionReason, /cannot be read \(EACCES\)/);
  fs.chmodSync(file, 0o644);
  return undefined;
});

// Held, and must stay held: the spellings path.resolve already reduced to the
// canonical path. Canonicalising must not lose any of them.
test('relative, dotted, doubled and trailing-slash spellings stay held', () => {
  const root = makeProject();
  for (const spelling of [
    'research/canvas.md',
    './research/canvas.md',
    'research/../research/canvas.md',
    'research//canvas.md',
    `${path.join(root, 'research', 'canvas.md')}${path.sep}`,
    path.join(root, '.', 'research', '..', 'research', 'canvas.md'),
  ]) {
    assert.match(deniedReason(root, spelling), /\[accepted\] commitment in question 1\.1/);
  }
});

test('RESEARCH_HARNESS_DIR stays held in its relative and its absolute form', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  const configuredDir = path.join(root, 'paper', 'state');
  fs.mkdirSync(configuredDir, { recursive: true });
  fs.writeFileSync(path.join(configuredDir, 'canvas.md'), canvasText);
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), canvasText);
  for (const configured of [path.join('paper', 'state'), configuredDir]) {
    const reason = deniedReason(root, path.join(configuredDir, 'canvas.md'), { RESEARCH_HARNESS_DIR: configured });
    assert.match(reason, /\[accepted\] commitment in question 1\.1/);
    // and research/ is then just another directory
    assert.equal(run(root, 'Write', { file_path: path.join(root, 'research', 'canvas.md'), content: FORGED }, { RESEARCH_HARNESS_DIR: configured }), null);
  }
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

// ---------- tool coverage ----------

// The probe set from SQ-21 (verification/SQ-21/path-and-tool.txt) reached the
// canvas under tool names the guard had never heard of. It cannot keep a list of
// the tools that can write a file, so a tool it does not recognise is judged by
// where its payload points — whatever the key is called, and however deep in the
// payload it sits.
const unrecognised = (file) => [
  ['MultiEdit', { file_path: file, edits: [{ old_string: ACCEPTED, new_string: '' }] }],
  ['mcp__filesystem__write_file', { path: file, content: FORGED }],
  ['create_file', { filename: file, contents: FORGED }],
  ['Scrivener', { target: file }],
  ['mcp__anvil__apply_patch', { patch: { hunks: [{ where: { document: file } }] } }],
  ['', { file_path: file }],
];

test('a tool the guard does not recognise may not reach the research state', () => {
  const root = makeProject();
  for (const [toolName, toolInput] of unrecognised(path.join(root, 'research', 'canvas.md'))) {
    const label = toolName || '(no tool name)';
    const out = run(root, toolName, toolInput);
    assert.equal(out && out.permissionDecision, 'deny', label);
    assert.match(out.permissionDecisionReason, /cannot judge/, label);
    assert.match(out.permissionDecisionReason, /canvas\.md/, label);
  }
  // decisions.md, the directory itself and anything in it are state as much as
  // the canvas is: what an unknown tool would do to them is equally unreadable.
  for (const target of [
    path.join(root, 'research', 'decisions.md'),
    path.join(root, 'research'),
    path.join(root, 'research', 'notes.md'),
  ]) {
    const out = run(root, 'mcp__filesystem__move_file', { source: target, destination: path.join(root, 'elsewhere') });
    assert.equal(out && out.permissionDecision, 'deny', target);
  }
});

test('an unrecognised tool is judged by where the path lands, not how it is spelled', (t) => {
  const root = makeProject();
  for (const spelling of ['research/canvas.md', './research/../research/canvas.md']) {
    const out = run(root, 'MultiEdit', { file_path: spelling, edits: [] });
    assert.equal(out && out.permissionDecision, 'deny', spelling);
  }
  if (!canSymlink(root)) return t.skip('this platform does not allow symlinks');
  const canvasFile = path.join(root, 'research', 'canvas.md');
  fs.symlinkSync(canvasFile, path.join(root, 'link.md'));
  fs.symlinkSync(path.join(root, 'research'), path.join(root, 'r'));
  fs.linkSync(canvasFile, path.join(root, 'alt.md'));
  for (const spelling of ['link.md', path.join('r', 'canvas.md'), 'alt.md']) {
    const out = run(root, 'mcp__filesystem__write_file', { path: path.join(root, spelling), content: FORGED });
    assert.equal(out && out.permissionDecision, 'deny', spelling);
    assert.match(out.permissionDecisionReason, /canvas\.md/, spelling);
  }
  return undefined;
});

// The other half of the acceptance: a default of deny must not make the guard a
// general write block. Everything here is either outside the state or a read,
// and none of it is the guard's business.
test('an unrecognised tool is left alone everywhere else', () => {
  const root = makeProject();
  const outside = path.join(root, 'manuscript.md');
  for (const [toolName, toolInput] of [
    ['MultiEdit', { file_path: outside, edits: [{ old_string: 'x', new_string: 'y [accepted]' }] }],
    ['mcp__filesystem__write_file', { path: outside, content: FORGED }],
    ['create_file', { filename: path.join(root, 'docs', 'research-notes.md'), contents: 'x' }],
    ['Scrivener', { note: 'see research/canvas.md for the accepted wording' }],
    ['TodoWrite', { todos: [{ content: 'Ask the researcher to accept 1.2', status: 'pending' }] }],
    ['WebFetch', { url: 'https://example.org/research/canvas.md', prompt: 'summarise it' }],
    ['Read', { file_path: path.join(root, 'research', 'canvas.md') }],
    ['Grep', { pattern: 'accepted', path: path.join(root, 'research') }],
    ['Glob', { pattern: 'research/*.md' }],
  ]) {
    assert.equal(run(root, toolName, toolInput), null, toolName);
  }
});

// A hook that never fires is a guard that never decides, so the matcher is the
// other half of the perimeter. It carries none: every tool reaches the guard,
// and which of them it can judge is decided in the guard alone.
test('every tool reaches the guard', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
  for (const group of hooks.hooks.PreToolUse) {
    const matcher = Object.prototype.hasOwnProperty.call(group, 'matcher') ? group.matcher : null;
    assert.ok(
      matcher === null || matcher === '' || matcher === '*',
      `PreToolUse matcher ${JSON.stringify(matcher)} decides in config what belongs to the guard`,
    );
  }
});

test('canvasVerdict and bashVerdict are exported for reuse', () => {
  assert.equal(guard.canvasVerdict(canvasText, canvasText), null);
  assert.match(guard.canvasVerdict(canvasText, canvasText.replace('[stated, src: memo-03]', '[accepted, src: memo-03]')), /\[accepted\]/);
  assert.equal(guard.bashVerdict('wc -l research/canvas.md'), null);
  assert.match(guard.bashVerdict('rm research/canvas.md'), /read-only/);
});
