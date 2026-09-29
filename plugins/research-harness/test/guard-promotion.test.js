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
// The exported verdicts resolve the profile through CLAUDE_PLUGIN_ROOT in this
// process. A runner launched from another plugin's process carries that plugin's
// root, so the in-process calls below would load the wrong profile set.
process.env.CLAUDE_PLUGIN_ROOT = pluginRoot;

const canvasText = fs.readFileSync(path.join(fixtureDir, 'canvas.md'), 'utf8');
const decisionsText = fs.readFileSync(path.join(fixtureDir, 'decisions.md'), 'utf8');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'));
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'canvas.md'), canvasText);
  fs.writeFileSync(path.join(root, 'research', 'decisions.md'), decisionsText);
  return root;
}

// A checkout that is not a paper project: nowhere in it is there research state.
function makeBareProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rh-bare-'));
}

// A paper project whose own directory name holds brackets. The guard builds the
// state path out of real directories, and one of them spells a character class.
function makeBracketProject() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-bracket-')), 'paper[2024]');
  fs.mkdirSync(root);
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

// SQ-29 F9. The canonical line joins its seven fields with U+001F, and a field
// holding one reproduces a boundary between them, so a commitment can be re-cut
// with its identity unchanged. A C0 control character in a commitment's field is
// refused at whichever write would leave one, which is the two writes K7/K8
// needed: first the crafted tag, then the re-cut.
test('a control character in a commitment field is denied, at either write', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const sep = String.fromCharCode(0x1f);
  const plant = `${STATED.replace(/ \[stated\]$/, '')} and the planted tag. [stated, alpha${sep}beta]`;

  const first = run(root, 'Edit', { file_path: file, old_string: STATED, new_string: `${STATED}\n\n${plant}` });
  assert.equal(first.permissionDecision, 'deny');
  assert.match(first.permissionDecisionReason, /control character U\+001F in an evidence tag/);

  // The re-cut, on a canvas that already carries the crafted tag: the joined
  // line is identical, and the write is still refused.
  fs.writeFileSync(file, canvasText.replace(STATED, `${STATED}\n\n${plant}`));
  const shifted = plant.replace(` [stated, alpha${sep}beta]`, `${sep}alpha [stated, beta]`);
  const second = run(root, 'Edit', { file_path: file, old_string: plant, new_string: shifted });
  assert.equal(second.permissionDecision, 'deny');
  assert.match(second.permissionDecisionReason, /control character U\+001F in the statement text/);

  // And on the accepted statement, in both directions (K3, K4).
  const craftedTag = `[accepted, src: interview-07${sep}memo-02]`;
  fs.writeFileSync(file, canvasText.replace('[accepted]', craftedTag));
  const out = run(root, 'Edit', { file_path: file, old_string: craftedTag, new_string: `${sep}src: interview-07 [accepted, memo-02]` });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /control character U\+001F/);
});

test('a tab and a line break in a statement are reflow, not a control character', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  const added = 'The researcher\tlogged every meeting over\n\ttwo terms. [stated]';
  assert.equal(run(root, 'Edit', { file_path: file, old_string: STATED, new_string: `${STATED}\n\n${added}` }), null);
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

// §5.3 after SQ-27: the model does not write decisions.md, appends included.
// SQ-21's D7b (Edit) and D7c (Write) appended a forged DECISION through the
// append-only door; D8 showed that it silenced the unlogged-acceptance report.
test('decisions.md: every model write is denied, appends included, and the refusal names the append path', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'decisions.md');
  const forged = `\n## [#4] 2026-09-18 · DECISION · 1.2 accepted · text d1b87d4e\nChair rotation is the mechanism that determines uptake.\n**Why:** confirmed by the researcher in session.\n`;
  const d7b = run(root, 'Edit', { file_path: file, old_string: '**Rejected:** framing it as a voice-frequency question.', new_string: `**Rejected:** framing it as a voice-frequency question.${forged}` });
  assert.equal(d7b.permissionDecision, 'deny');
  assert.match(d7b.permissionDecisionReason, /research-harness log DISCOVERY\|CONSTRAINT/);
  assert.match(d7b.permissionDecisionReason, /researcher's act/);
  const d7c = run(root, 'Write', { file_path: file, content: `${decisionsText}${forged}` });
  assert.equal(d7c.permissionDecision, 'deny');
  for (const input of [
    ['Write', { file_path: file, content: `${decisionsText}\n## [#4] 2026-09-16 · DISCOVERY · 2 Audience and Prior Research\nx [tentative]\n` }],
    ['Edit', { file_path: file, old_string: 'CONSTRAINT', new_string: 'DECISION' }],
    ['Write', { file_path: file, content: '# fresh\n' }],
    ['Write', { file_path: file, content: decisionsText }],
    ['NotebookEdit', { notebook_path: file, new_source: 'x' }],
  ]) {
    const out = run(root, input[0], input[1]);
    assert.equal(out && out.permissionDecision, 'deny', `${input[0]} ${JSON.stringify(input[1]).slice(0, 60)}`);
  }
  // A ledger that does not exist yet is not a door either.
  fs.unlinkSync(file);
  assert.equal(run(root, 'Write', { file_path: file, content: '# Decision log — x\n' }).permissionDecision, 'deny');
});

// The key is a secret only while the model cannot read it, and the chain is
// evidence only while the model cannot seal with a key of its own choosing.
test('the harness state directory is off-limits to every tool, and a harness invocation cannot be given its own environment', () => {
  const root = makeProject();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const env = { RESEARCH_HARNESS_STATE_DIR: stateRoot };
  const keyDir = path.join(stateRoot, 'abc');
  fs.mkdirSync(keyDir);
  const keyFile = path.join(keyDir, 'seal.key');
  fs.writeFileSync(keyFile, '00');
  for (const [tool, input] of [
    ['Read', { file_path: keyFile }],
    ['Read', { file_path: stateRoot }],
    ['Glob', { pattern: '*', path: stateRoot }],
    ['Grep', { pattern: 'x', path: keyDir }],
    ['Write', { file_path: keyFile, content: '00' }],
    ['Edit', { file_path: keyFile, old_string: '00', new_string: '11' }],
    ['mcp__filesystem__read_file', { path: keyFile }],
  ]) {
    const out = run(root, tool, input, env);
    assert.equal(out && out.permissionDecision, 'deny', `${tool} ${JSON.stringify(input)}`);
    assert.match(out.permissionDecisionReason, /harness state directory/, tool);
  }
  for (const cmd of [
    `cat ${keyFile}`,
    `cat "${keyDir}"/seal.key`,
    `ls ${stateRoot}`,
    `cp ${keyFile} /tmp/k`,
    `RESEARCH_HARNESS_STATE_DIR=/tmp/x node "/x/bin/research-harness.js" log DISCOVERY 1 --body x`,
    `HOME=/tmp/h node "/x/bin/research-harness.js" log DISCOVERY 1 --body x`,
    `RESEARCH_HARNESS_STATE_DIR=/tmp/x node "/x/bin/research-harness.js" init --project p --mode seed`,
    `export RESEARCH_HARNESS_STATE_DIR=/tmp/x; node "/x/bin/research-harness.js" log DISCOVERY 1 --body x`,
    `k=${stateRoot}; cat "$k/abc/seal.key"`,
  ]) {
    const out = run(root, 'Bash', { command: cmd }, env);
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
  // Ordinary work next to it stays open, and so does reading the state root's
  // parent, which is the user's own home.
  for (const cmd of [`ls ${path.dirname(stateRoot)}`, 'cat ~/.zshrc', 'node "/x/bin/research-harness.js" status']) {
    assert.equal(run(root, 'Bash', { command: cmd }, env), null, cmd);
  }
  assert.equal(run(root, 'Read', { file_path: path.join(root, 'research', 'canvas.md') }, env), null);
});

test('Bash: a symlinked ancestor of the state root, on disk or made by an earlier statement, is still denied', (t) => {
  const root = makeProject();
  if (!canSymlink(root)) return t.skip('this platform does not allow symlinks');
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-state-'));
  const env = { RESEARCH_HARNESS_STATE_DIR: stateRoot };
  const keyDir = path.join(stateRoot, 'abc');
  fs.mkdirSync(keyDir);
  fs.writeFileSync(path.join(keyDir, 'seal.key'), '00');

  // A symlink that already exists on disk and only spells the state root
  // through an ancestor: the Bash closure has to resolve it, not just
  // compare spellings, the same way the file-tool path already does.
  const link = path.join(root, 'shortcut');
  fs.symlinkSync(stateRoot, link);
  assert.equal(run(root, 'Bash', { command: `cat ${link}/*/seal.key` }, env).permissionDecision, 'deny');

  // A symlink the command itself creates, earlier in the same compound
  // command, before the shell has run anything: the guard has to track it
  // the way it already tracks `cd` across statements.
  const madeCmd = `ln -sfn ${path.dirname(stateRoot)} h && cat h/${path.basename(stateRoot)}/*/seal.key`;
  assert.equal(run(root, 'Bash', { command: madeCmd }, env).permissionDecision, 'deny');

  // Control: the same made-in-command link pointed at ordinary project
  // files stays open, so the new check does not widen the closure.
  assert.equal(run(root, 'Bash', { command: 'ln -sfn . h && cat h/research/canvas.md' }, env), null);
});

test('the default harness state directory under the home directory is protected without any environment set', () => {
  const root = makeProject();
  const { RESEARCH_HARNESS_STATE_DIR: _state, ...rest } = process.env;
  const home = os.homedir();
  for (const cmd of [
    `cat ${home}/.claude/research-harness/abc/seal.key`,
    'cat ~/.claude/research-harness/abc/seal.key',
    'cat "$HOME/.claude/research-harness/abc/seal.key"',
    'find ~/.claude/research-harness -name seal.key',
  ]) {
    const out = childProcess.spawnSync(process.execPath, [script], {
      cwd: root,
      env: { ...rest, CLAUDE_PLUGIN_ROOT: pluginRoot },
      input: JSON.stringify({ cwd: root, session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } }),
      encoding: 'utf8',
    });
    const parsed = out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
    assert.equal(parsed && parsed.permissionDecision, 'deny', cmd);
  }
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
    'node "/x/bin/research-harness.js" log DISCOVERY "2 Prior Research" --body "Two studies contradict each other. [tentative, src: ref-11]"',
    'node "/x/bin/research-harness.js" log CONSTRAINT 5 --body "No further fieldwork. [stated]" --why "the committee said so"',
    'research-harness log DISCOVERY 1.2 --body x',
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
  for (const cmd of [
    'node "/x/bin/research-harness.js" log DECISION "1.2 accepted" --body "x [accepted]"',
    'node "/x/bin/research-harness.js" log "$KIND" 1 --body x',
    'k=DECISION; node "/x/bin/research-harness.js" log $k 1 --body x',
    'node "/x/bin/research-harness.js" log',
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
  ['command substitution, no literal part survives either substitution', 'rm "$(printf %s resear)$(printf %s ch/canvas.md)"'],
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
  'research-harness doctor',
  'echo "see research/canvas.md"',
  'echo x > "$LOG"',
  'node -e \'console.log(1)\'',
  'git add .',
  'npm test',
  'mkdir -p docs/research-notes',
  'rm -rf node_modules',
  'cat "$(printf %s resear)$(printf %s ch/canvas.md)"',
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

// SQ-68. SQ-57's fail-closed reading of an unresolved substitution in argument
// position was asked of every verb, so it refused ordinary work in a paper
// project: `mkdir -p "build/$(date +%F)"` and `[ "$(sysctl -n vm.loadavg)" = x ]`
// were denied because the substitution could not be resolved, not because
// either command names the state. The reading belongs to a verb whose operand
// is the file it writes; `NON_FILE_VERBS` names the verbs whose operand is only
// ever a value, and only there is it lifted. Every other verb keeps it, so the
// write shapes in the second case still deny.
test('SQ-68: an unresolved substitution in a non-file operand is not a write target', () => {
  const root = makeProject();
  for (const command of [
    '[ "$(sysctl -n vm.loadavg)" = x ]',
    'test "$(cat t)" = x',
    'mkdir -p "build/$(date +%F)"',
    'echo "$(date)" > out.log',
    'printf "%s\\n" "$(date)"',
    'true "$(cat t)"',
    'false "$(cat t)"',
    'date -r "$(cat t)"',
    'sleep "$(cat t)"',
    'git commit -m "$(cat msg.txt)"',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
});

test('SQ-68: the same substitution stays denied where the verb writes its operand', () => {
  const root = makeProject();
  for (const command of [
    'node script.js "$(git rev-parse HEAD)"',
    'vim "$(cat t)"',
    'chmod 000 "$(cat t)"',
    'cp notes.md "backup/$(date +%s).md"',
    'rm "$(cat target.txt)"',
    'mv research/canvas.md "$(cat t)"',
    'ln -s x "$(cat t)"',
    'touch "$(cat t)"',
    'truncate -s 0 "$(cat t)"',
    'tee "$(cat t)"',
    'dd of="$(cat t)"',
    'sed -i "s/a/b/" "$(cat t)"',
    'sort -o "$(cat t)" research/canvas.md',
    'cat foo > "$(cat t)"',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-65. A word with no path separator is a name, not a location. The bare
// `research` was resolved against the project root, landed on the state
// directory and denied every tool whose payload carried the word — a profile
// id, a topic, a title — in a vault or a skills checkout exactly as in a paper
// project, and the shell path read `python3 x.py research` the same way. The
// name no longer counts as the directory; every spelling that does carry a
// location still counts, and the guard is inert for the bare word only where
// there is no state directory to name.
test('SQ-65: a bare state-directory name in a payload is a name, not the state directory', () => {
  const root = makeProject();
  assert.equal(run(root, 'mcp__plugin_sidequest_board__profile_get', { profile: 'research' }), null);
  // The same word in every spelling that spells a location is still the state.
  for (const spelling of ['./research', 'research/', 'research/canvas.md', path.join(root, 'research')]) {
    const out = run(root, 'MultiEdit', { file_path: spelling, edits: [] });
    assert.equal(out && out.permissionDecision, 'deny', spelling);
  }
});

test('SQ-65: without research state the bare word is left alone, a spelled path is not', () => {
  const bare = makeBareProject();
  for (const command of ['python3 x.py research', 'node research', 'rm -rf research', 'ln -s research r']) {
    assert.equal(run(bare, 'Bash', { command }), null, command);
  }
  assert.equal(run(bare, 'mcp__plugin_sidequest_board__profile_get', { profile: 'research' }), null);
  const write = run(bare, 'MultiEdit', { file_path: 'research/canvas.md', edits: [] });
  assert.equal(write && write.permissionDecision, 'deny');
  // A command that creates the state is still judged: the path it spells is a
  // location whether or not there is anything there yet.
  for (const command of ['cat > research/canvas.md', 'git checkout HEAD -- research/']) {
    const out = run(bare, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-71: a command cannot touch research state that is not there. The state is
// the canvas and the decision log, so a project whose state directory holds
// neither has nothing to refuse: an ordinary line — a loop whose body reads a
// substitution, an `rm "$x"` whose value the guard never read — is speculation
// about where the state might be, and there is nowhere for it to land. The
// words that spell a location are still judged (SQ-65), the harness state
// directory is still off-limits (SQ-27), and the CLI's own refusals do not
// depend on state at all.
test('SQ-71: without research state ordinary shell commands are not the guard\'s business', () => {
  const bare = makeBareProject();
  for (const command of [
    'for d in */; do echo "$d"; done',
    'while true; do l=$(sysctl -n vm.loadavg); echo "$l"; sleep 30; done',
    'x=$(cat a); rm "$x"',
    'l=$(sysctl -n vm.loadavg); echo "$l"',
    'VAR=x node --test t.mjs > /private/tmp/sq71/log 2>&1',
    // A pattern the guard cannot compute is refused because it can land on the
    // state; with no state there is nothing for it to land on.
    'rm -rf resea[r]ch',
    // The state is read once, where the command stands: a line that creates it
    // and removes it in the same breath is judged on entry, and is left alone.
    'mkdir research && rm -rf */',
    // SQ-72, folded in: the same speculation one statement later — a `cd` the
    // guard cannot follow makes `base` null, and every word after it counted as
    // touching a state that is not there. Ordinary build and tool lines were
    // denied this way in a repo that never had a `research/`.
    'docker stop x',
    'for p in 3100 3111; do lsof -i :$p; done',
    'npm run gates > gate.log 2>&1',
    'cd "$HOME/x" && docker stop x',
    'cd "$HOME/x" && for p in 3100 3111; do lsof -i :$p; done',
    'cd "$HOME/x" && npm run build > build.log 2>&1',
  ]) {
    assert.equal(run(bare, 'Bash', { command }), null, command);
  }
  // Creating the state stays allowed — the guard watches creation, it does not
  // forbid it.
  assert.equal(run(bare, 'Bash', { command: 'research-harness init' }), null);
  assert.equal(run(bare, 'Bash', { command: 'mkdir -p research' }), null);
  // What still holds: a path that spells the location (SQ-65), the harness
  // state directory (SQ-27), and accepting a statement, which is the
  // researcher's act whether or not there is state to accept into.
  for (const command of ['cat > research/canvas.md', 'git checkout HEAD -- research/']) {
    const out = run(bare, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  const harnessRead = run(bare, 'Bash', { command: 'cat ~/.claude/research-harness/abc/seal.key' });
  assert.equal(harnessRead && harnessRead.permissionDecision, 'deny');
  for (const command of ['research-harness accept 1.2', `node "${path.join(pluginRoot, 'bin', 'research-harness.js')}" accept 1.2`]) {
    const out = run(bare, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  assert.equal(run(bare, 'Bash', { command: `node "${path.join(pluginRoot, 'bin', 'research-harness.js')}" status` }), null);
});

// An empty state directory holds neither the canvas nor the decision log, so it
// is no state either (SQ-71). The bare name and the glob are let go; the
// spelled path is still judged, because that is the word that would create the
// state SQ-65 keeps watching.
test('SQ-71: an empty state directory is no state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-empty-'));
  fs.mkdirSync(path.join(root, 'research'));
  for (const command of ['rm -rf research', 'for d in */; do echo "$d"; done']) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
  const write = run(root, 'Bash', { command: 'cat > research/canvas.md' });
  assert.equal(write && write.permissionDecision, 'deny');
});

// The control for the narrowing above: the same rows still deny in a project
// that holds state, which is the rule SQ-71 narrowed and did not remove.
test('SQ-71: with research state the same rows still deny', () => {
  const root = makeProject();
  for (const command of [
    'for d in */; do echo "$d"; done',
    'while true; do l=$(sysctl -n vm.loadavg); echo "$l"; sleep 30; done',
    'x=$(cat a); rm "$x"',
    'rm -rf resea[r]ch',
    // A `cd` the guard cannot follow still counts here: with state present the
    // words after it can land on it, which is what SQ-71 narrowed, not removed.
    'cd "$HOME/x" && docker stop x',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-76: a glob expands only onto files that exist, so where the state is
// absent a pattern cannot land on it at any depth. SQ-71 let the pattern go
// when it stood for the state directory itself, but a deeper one — the `find
// -path '*/20*/*'` of a mail-mirror count — still resolved its leading `*`
// onto `research` and denied the `du` beside it in a repo with no research
// state. The three kit-bridge lines are the rows below, with the scratchpad
// path shortened; the spelled path and the stateful control still deny.
test('SQ-76: without research state a pattern below the state directory is not the state', () => {
  const bare = makeBareProject();
  const S = '/private/tmp/claude-501/-Users-x-kit-bridge/0a1b/scratchpad';
  for (const command of [
    `S=${S}; head -3 $S/inbox_imap.log; for k in a b; do d=mirror/$k/history/inbox; [ -d $d ] && echo "$k: $(ls $d | grep -v '\\.md$' | head -1), $(find $d -name '*.md' -path '*/20*/*' | wc -l) Dateien" || echo "$k: kein Archiv"; done; .venv/bin/python --version`,
    `S=${S}; grep -c "Eingangsarchiv 20" $S/inbox_kit.log; tail -1 $S/inbox_kit.log; cd ${bare} && find mirror/history/inbox -name '*.md' -path '*/20*/*' | wc -l; du -sh mirror/history/inbox mirror/*/history/inbox`,
    `cd ${bare} && find mirror/history/inbox -name '*.md' -path '*/20*/*' | wc -l && ls mirror/history/inbox | head -1 && du -sh mirror/history/inbox mirror/a/history/inbox`,
    'rm -rf */20*/*',
  ]) {
    assert.equal(run(bare, 'Bash', { command }), null, command);
  }
  // A pattern that can stand for a state file is still judged: a line that
  // first creates the state with a bare name would have the glob land on it.
  for (const command of [
    'cat > research/canvas.md',
    'cp x.md research/canvas.md',
    'git checkout HEAD -- research && cp x.md research/canva?.md',
    'git checkout HEAD -- research && sed -i s/a/b/ */canvas.md',
    'rm -rf research/*',
  ]) {
    const out = run(bare, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-empty-'));
  fs.mkdirSync(path.join(empty, 'research'));
  assert.equal(run(empty, 'Bash', { command: "find . -path '*/20*/*' | wc -l && du -sh research" }), null);
  const root = makeProject();
  for (const command of ["find m -path '*/20*/*' | wc -l && du -sh m", 'rm -rf research/*', 'rm -rf */20*/*']) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

test('SQ-65: with the state directory there the same words still deny', () => {
  const root = makeProject();
  for (const command of [
    'python3 x.py research',
    'rm -rf research',
    'ln -s research r',
    'git checkout HEAD -- research',
    'cd research && rm -rf notes.md',
    // A pattern is not a name the shell fails to find: the glob expands onto
    // the state directory that is right there. SQ-54 keeps this true by
    // compiling the class before it calls a word a pattern at all.
    'rm -rf resea[r]ch',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-75: bash expands braces before anything else, so `rm -rf {research,tmp}`
// removes the state directory. The lexer split the word on its braces and never
// saw `research`. Every expansion is now judged; a quoted or escaped brace does
// not expand and is judged as the name it spells.
test('SQ-75: a brace expansion is judged on every word it expands to', () => {
  const root = makeProject();
  for (const command of [
    'cp a.md research/canvas.md',
    'rm -rf {research,tmp}',
    'cp a.md {research,x}/canvas.md',
    'cp a.md rese{arch,x}/canvas.md',
    'cp a.md research/{canvas,x}.md',
    'sed -i s/a/b/ {research,x}/canvas.md',
    'cp a.md rese{a..c}rch/canvas.md',
    'for n in research tmp; do rm -rf $n; done',
    'for n in {research,tmp}; do rm -rf $n; done',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  for (const command of [
    "cp a.md '{research,x}'/canvas.md",
    'cp a.md \\{research,x\\}/canvas.md',
    'cat {research,x}/canvas.md',
    'find . -name x -exec grep y {} +',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
  // Too many words to compute is a word the guard cannot judge.
  const huge = run(root, 'Bash', { command: `cp a.md ${'{a,b}'.repeat(10)}` });
  assert.equal(huge && huge.permissionDecision, 'deny');
});

// SQ-75: in a vault whose `research/` is a notes folder, moving a note and a
// loop over literal names were denied. A word below the state directory now
// lands on the state only if the component where the state files stand can be
// one of them; a loop over literal words is judged once per value.
test('SQ-75: without research state a word below the state directory is judged on the state file position', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-vault-'));
  fs.mkdirSync(path.join(vault, 'research'));
  fs.writeFileSync(path.join(vault, 'research', 'a.md'), 'note');
  const B = 'for n in sichtbarkeit kit-ki; do echo "$n: $(ls -d {areas,projects,research,appdev}/$n{.md,} 2>/dev/null)"; done';
  for (const command of [
    'git mv research/a.md research/b.md',
    'mv research/x.md projects/x.md',
    'for n in a b; do ls -d research/$n; done',
    B,
    'cp x.md "$d/research/x.md"',
  ]) {
    assert.equal(run(vault, 'Bash', { command }), null, command);
  }
  const bare = makeBareProject();
  assert.equal(run(bare, 'Bash', { command: `cd ${vault}; ${B}` }), null);
  for (const [where, command] of [
    [bare, 'cat > research/canvas.md'],
    [bare, 'git checkout HEAD -- research/'],
    [bare, 'cp x.md "research/$f"'],
    [bare, 'git checkout HEAD -- research && cp x.md research/canva?.md'],
    [bare, 'rm -rf research/*'],
    [bare, 'cp x.md {research,x}/canvas.md'],
    [bare, 'cp x.md research/Canvas.md'],
    [bare, 'cp x.md research/sub/../canvas.md'],
    [bare, 'cp x.md "$d/research/sub/$f"'],
    [bare, 'cp -r src "$d/research"'],
    [vault, 'for f in canvas.md x; do cp a research/$f; done'],
    [vault, 'for n in $(ls); do cp x research/$n; done'],
    [vault, 'cat ~/.claude/{research-harness,x}/abc/seal.key'],
    [vault, 'research-harness accept 1.2'],
  ]) {
    const out = run(where, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-86: a loop body that rebinds its variable (`do f=…`, `export f=…`,
// `read f`, `printf -v f`, `declare f=…`) makes `$f` something other than the
// loop's literal words, so the loop values no longer count.
test('SQ-86: a loop variable rebound inside the loop is unknown again', () => {
  const bare = makeBareProject();
  for (const command of [
    'for f in x y; do f=canvas.md; cp a.md research/$f; done',
    'for f in x; do export f=canvas.md; cp a.md research/$f; done',
    'for f in x; do read f < n.txt; cp a.md research/$f; done',
    'for f in x; do printf -v f canvas.md; cp a.md research/$f; done',
    'for f in x; do declare f=canvas.md; cp a.md research/$f; done',
  ]) {
    const out = run(bare, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// SQ-29 finding F5, first face (verification/SQ-29/lex.txt L30, L26). A `[…]`
// run in a word made every word a glob, and a pattern the regex engine refused
// was answered "matches": an ordinary `node -e` whose JavaScript held an array
// literal named the state directory and was denied for the verb, not for
// anything it did. A bracket body that does not compile as a class is not a
// class — the word is the literal it spells, and a literal that names no
// location is none of the guard's business.
test('SQ-54: a bracketed literal in a word is a literal, not a glob onto the state', () => {
  const root = makeProject();
  for (const command of [
    `node -e 'const r=["SQ-28","SQ-30"];console.log(r)'`,
    `curl -d '[sidequest-route model=a effort=high]' http://127.0.0.1/`,
    `node -e 'const t={files:["a"],readonly:["b"]};console.log(t)'`,
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
  // The read-only verb that made the same word visible in the first place is
  // unaffected: it never refused anything.
  assert.equal(run(root, 'Bash', { command: 'grep -n "[Qa-]" README.md' }), null);
});

// SQ-29 finding F5, second face (verification/SQ-29/lex.txt L33,
// perimeter.txt M10). The comparison read the candidate as a pattern and the
// state's own component as the literal, so a project (or state root) whose name
// holds brackets never matched itself: the guard stopped recognising its own
// state directory and a removal inside it was allowed. The name spelled exactly
// is that name, whatever brackets are in it.
test('SQ-54: a state directory whose own name holds brackets is still the state', () => {
  const root = makeBracketProject();
  const removal = run(root, 'Bash', { command: 'rm research/canvas.md' });
  assert.equal(removal && removal.permissionDecision, 'deny');
  // Not a blanket refusal: the same project, read-only.
  assert.equal(run(root, 'Bash', { command: 'cat research/canvas.md' }), null);
  assert.equal(run(root, 'Bash', { command: 'sed -n 1,2p research/canvas.md' }), null);
});

// SQ-29 finding F5, the part neither face above fixes: a word that really is a
// pattern (`*` or `?`) whose class the engine refuses says nothing about what
// the shell expands it onto. Where there is a write to refuse, that unknown is
// denied rather than read as a match or a miss; under a read-only verb nothing
// is written, so the same word stays the name it spells.
test('SQ-54: a pattern the guard cannot compute is refused where there is a write', () => {
  const root = makeProject();
  for (const command of [
    `node -e 'a[Q-2]*'`,
    `cat notes.txt > 'a[Q-2]*'`,
    `rm 'a[Q-2]*'`,
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
    assert.match(out.permissionDecisionReason, /cannot compute/, command);
  }
  // A read position writes nothing, so the word is read as the name it spells.
  assert.equal(run(root, 'Bash', { command: `grep -n 'a[Q-2]*' README.md` }), null);
  // And a class that does compile is still a glob onto the state (SQ-65).
  const glob = run(root, 'Bash', { command: 'rm -rf resea[r]ch' });
  assert.equal(glob && glob.permissionDecision, 'deny');
});

// SQ-29 finding "two rows that are neither" (verification/SQ-29/lex.txt L17,
// L19, L20; probes at b4a7066). `[N]>&M` and `[N]<&M` duplicate a descriptor:
// the word after `&` is an fd number or `-`, never a path. The lexer took `1`
// as the redirect's file target, so a pure read — `cd "$HOME/…" && cat … 2>&1`
// (L19) — was refused for redirecting into a relative path after a `cd` the
// guard cannot follow, and `cd research && cat canvas.md 2>&1` (L20, a read
// inside the state) for redirecting into the research state. There is no path
// in either, so neither refusal has anything to stand on.
test('SQ-60: a descriptor duplication is not a file redirection', () => {
  const root = makeProject();
  for (const command of [
    'cd "$HOME/no-such-dir-sq60" && cat notes.txt 2>&1',
    'cd "$HOME/no-such-dir-sq60" && grep -n x notes.txt 2>&1 | sort | uniq -c',
    'cd research && cat canvas.md 2>&1',
    'cd research && wc -l canvas.md 1>&2',
    'cd "$HOME/no-such-dir-sq60" && cat notes.txt 1>&-',
    'cd "$HOME/no-such-dir-sq60" && cat notes.txt 3<&0',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
});

// The other direction, bounded so the fix is not a hole: a `>&`/`&>` target that
// is not a digit or `-` is the file redirection bash makes of it, and a target
// the guard cannot read (a substitution in the fd position) stays one too.
test('SQ-60: a non-numeric `>&` target is still a file redirection', () => {
  const root = makeProject();
  for (const command of [
    'echo x >& research/canvas.md',
    'cd research && echo x >& canvas.md',
    'cd research && cat canvas.md &>notes.md',
    'cd "$HOME/no-such-dir-sq60" && echo x 2>&$fd',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
});

// L17 and L18 are the same pipeline with and without the `2>&1`: both carry a
// verb the guard does not read as read-only, so both stay denied — and now for
// that reason, not for a redirect that has no path. (The ticket read the L17
// refusal as the whole denial; it was the first refusal in the chain.)
test('SQ-60: the `2>&1` does not excuse a verb the guard otherwise holds', () => {
  const root = makeProject();
  for (const command of [
    'cd "$HOME/no-such-dir-sq60" && node bin/tool.js help 2>&1 | grep -n x',
    'cd "$HOME/no-such-dir-sq60" && node bin/tool.js help | grep -n x',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
    assert.match(out.permissionDecisionReason, /`node` is not a read-only command/, command);
  }
});

// SQ-29 finding F6 (verification/SQ-29/lex.txt L1/L3, probes at b4a7066). The
// lexer skipped a heredoc body wholesale, which is right for a quoted delimiter
// and wrong for an unquoted one: bash expands `$(...)` and backticks in that
// body before the command runs, so the removal written inside it was never
// judged. The rest of the body is stdin data and is still not read as a command
// line — `rm research/canvas.md` on a line of its own removes nothing.
test('Bash: a substitution in an unquoted heredoc body is judged, a quoted one is data', () => {
  const root = makeProject();
  for (const [form, cmd] of [
    ['unquoted delimiter, command substitution', 'cat <<EOF\n$(rm research/canvas.md)\nEOF\n'],
    ['unquoted delimiter, backquote', 'cat <<EOF\n`rm research/canvas.md`\nEOF\n'],
    ['unquoted delimiter, substitution on a later line', 'cat <<EOF\nfirst line\n$(rm research/canvas.md)\nEOF\n'],
    ['unquoted delimiter, a body that never reaches it', 'cat <<EOF\n$(rm research/canvas.md)\n'],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
    assert.match(out.permissionDecisionReason, /read-only/, form);
  }
  for (const [form, cmd] of [
    ['quoted delimiter, the same body', "cat <<'EOF'\n$(rm research/canvas.md)\nEOF\n"],
    ['double-quoted delimiter, the same body', 'cat <<"EOF"\n$(rm research/canvas.md)\nEOF\n'],
    ['escaped delimiter, the same body', 'cat <<\\EOF\n$(rm research/canvas.md)\nEOF\n'],
    ['plain body text is data, not a command', 'cat <<EOF\nrm research/canvas.md\nEOF\n'],
    ['unquoted delimiter, a read-only substitution', 'cat <<EOF\n$(date)\nEOF\n'],
    ['unquoted body naming the state under a read verb', 'cat <<EOF\nsee research/canvas.md\nEOF\n'],
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, form);
  }
  // A body the scan cannot finish — an unclosed `$(`, or nesting past
  // MAX_SUBSTITUTION_DEPTH — is opaque: it is judged on the names it still
  // spells out, which denies it under a verb that is not read-only.
  const unread = run(root, 'Bash', { command: 'tee /dev/null <<EOF\n$(cat research/canvas.md\nEOF\n' });
  assert.equal(unread && unread.permissionDecision, 'deny');
  assert.match(unread.permissionDecisionReason, /read-only/);
});

// SQ-67. SQ-55 reads a heredoc body as stdin data, which is right when the
// receiving command is `cat` and wrong when it is a shell or interpreter that
// reads its program from stdin: `bash <<EOF … EOF` runs the body, and quoting
// the delimiter does not change that. The body is now lexed as the script it is
// — the nesting an unquoted body's substitutions already get — and the receiving
// command is read as a launcher rather than a verb that refuses for not being
// read-only, so a body that only reads the state still reads.
test('SQ-67: a heredoc fed to a shell or interpreter is program text, not stdin data', () => {
  const root = makeProject();
  for (const [form, cmd] of [
    ['bash', 'bash <<EOF\nrm research/canvas.md\nEOF'],
    ['quoted delimiter behaves the same', "bash <<'EOF'\nrm research/canvas.md\nEOF"],
    ['bash -s', 'bash -s <<EOF\nrm research/canvas.md\nEOF'],
    ['explicit stdin `-`', 'bash - <<EOF\nrm research/canvas.md\nEOF'],
    ['sh', 'sh <<EOF\nrm research/canvas.md\nEOF'],
    ['zsh', 'zsh <<EOF\nrm research/canvas.md\nEOF'],
    ['dash', 'dash <<EOF\nrm research/canvas.md\nEOF'],
    ['a wrapper in front of the shell', 'env bash <<EOF\nrm research/canvas.md\nEOF'],
    ['the shell\'s own redirect still writes the state', 'bash > research/canvas.md <<EOF\ncat notes.md\nEOF'],
    ['node', 'node <<EOF\nrequire("fs").unlinkSync("research/canvas.md")\nEOF'],
    ['python3', 'python3 <<EOF\nimport os; os.remove("research/canvas.md")\nEOF'],
    ['perl', 'perl <<EOF\nunlink "research/canvas.md";\nEOF'],
    ['ruby', 'ruby <<EOF\nFile.delete("research/canvas.md")\nEOF'],
    ['the body names accept', 'bash <<EOF\nnode bin/research-harness.js accept 1.2\nEOF'],
    ['a substitution in the body', 'bash <<EOF\n$(rm research/canvas.md)\nEOF'],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
  }
  // The here-string and the pipe hand the state name to the receiving shell as
  // an operand word, so SQ-52's opaque-word rule already held both.
  for (const cmd of ["bash <<< 'rm research/canvas.md'", "echo 'rm research/canvas.md' | bash"]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
  // The body is judged as the script it is, so a body that only reads the state
  // reads: the receiving shell is a launcher, not a verb of its own.
  for (const cmd of [
    'bash <<EOF\ncat research/canvas.md\nEOF',
    'python3 <<EOF\nprint("hello")\nEOF',
    "sh -c 'ls research'",
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
  // SQ-55's control: with a data receiver the same text is body text and reads.
  assert.equal(run(root, 'Bash', { command: 'cat <<EOF\nrm research/canvas.md\nEOF\n' }), null);
  assert.equal(run(root, 'Bash', { command: "cat <<'EOF'\nrm research/canvas.md\nEOF\n" }), null);
});

// SQ-69. SQ-67 left one word unread: a flag that takes a value. The receiver was
// recognised as reading its program from stdin unless a script file operand
// stood in front of the heredoc — and a flag's value (`errexit`, `ignore`,
// `dev/null`, `fs`) is a bare word, so it was taken for that operand and the body
// was read as its stdin data. Telling a flag's value from a script file takes a
// per-interpreter table of value-taking flags that fails open for every flag it
// misses, so the operand is gone: a shell or interpreter that receives a heredoc
// reads its program from stdin unless an inline-program flag carries it.
test('SQ-69: a flag\'s value is not a script file operand, so the heredoc body is still the program', () => {
  const root = makeProject();
  for (const [form, cmd] of [
    ['shell -o', "bash -o errexit <<'EOF'\nrm research/canvas.md\nEOF"],
    ['shell --rcfile', "bash --rcfile /dev/null <<'EOF'\nrm research/canvas.md\nEOF"],
    ['python3 -W', "python3 -W ignore <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -X', "python3 -X utf8 <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['node -r', "node -r fs <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
    ['the cost: a script file operand proves nothing', 'bash script.sh <<EOF\nrm research/canvas.md\nEOF'],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
  }
  // The inline-program spellings still make the body stdin data: a bundle with
  // the program in the next word (`node -pe PROG`), a program attached to the
  // flag letter (`python3 -c'PROG'`), and a shell's `-c` not last in the bundle.
  for (const cmd of [
    "python3 -c'print(1)' <<'EOF'\nrm research/canvas.md\nEOF",
    "python3 -c 'print(1)' <<'EOF'\nrm research/canvas.md\nEOF",
    "perl -e'print 1' <<'EOF'\nrm research/canvas.md\nEOF",
    "node -pe '1+1' <<'EOF'\nrm research/canvas.md\nEOF",
    "perl -ne 'print' <<'EOF'\nrm research/canvas.md\nEOF",
    "bash -ce 'ls research' <<'EOF'\nrm research/canvas.md\nEOF",
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
  // A flag whose value the guard cannot see is not read as a program flag: the
  // body stays the program it may be.
  for (const cmd of [
    "python3 -Wdev <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF",
    "python3 -Xdev <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF",
    "python3 -m json.tool <<'EOF'\nrm research/canvas.md\nEOF",
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
  }
  // The data receiver of SQ-55 and the read controls of SQ-67 are unchanged.
  for (const cmd of [
    "cat <<'EOF'\nrm research/canvas.md\nEOF\n",
    "python3 <<EOF\nprint('hi')\nEOF\n",
    'bash <<EOF\ncat research/canvas.md\nEOF\n',
    "sh -c 'ls research' <<EOF\nrm research/canvas.md\nEOF\n",
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, cmd);
  }
});

// SQ-70. SQ-69 gave every interpreter the same inline-program letters, and the
// letters are not shared: python3's `-E` ignores PYTHON* environment variables and
// it has no `-e`, ruby's `-E` takes an encoding, and node's `-c` is `--check`, a
// syntax check that runs nothing. Only perl carries a program on `-E`. A flag
// outside an interpreter's own row leaves the body judged as the program it may
// be, which is the fail-closed answer.
test('SQ-70: the inline-program letters belong to one interpreter, not to all of them', () => {
  const root = makeProject();
  // The reported rows: the flag is not this interpreter's program spelling, so the
  // heredoc body is the program it may be.
  for (const [form, cmd] of [
    ['python3 -E', "python3 -E <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -Es', "python3 -Es <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['ruby -E takes an encoding', "ruby -E UTF-8 <<'EOF'\nFile.delete('research/canvas.md')\nEOF"],
    ['ruby -E with the encoding attached', "ruby -EUTF-8 <<'EOF'\nFile.delete('research/canvas.md')\nEOF"],
    ['python3 -W (SQ-69, unchanged)', "python3 -W ignore <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['node -c is --check', "node -c <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
    ['ruby -w carries no program', "ruby -w <<'EOF'\nFile.delete('research/canvas.md')\nEOF"],
    // A value-taking letter swallows the `c` that follows it, so the cluster does
    // not carry a program: `python3 -Wc` is a warning filter, not `-W` plus `-c`.
    ['python3 -Wc is one flag, not a bundle', "python3 -Wc <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -Xc is one flag, not a bundle', "python3 -Xc <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    // Perl's `-i` takes a backup suffix, so `-ie` leaves the next word as a script
    // file name rather than a program.
    ['perl -ie is not a bundle', "perl -ie 'print 1' <<'EOF'\nunlink 'research/canvas.md';\nEOF"],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
  }
  // The spelling each interpreter really accepts still makes the body stdin data.
  for (const [form, cmd] of [
    ['perl -E carries the program', "perl -E 'say 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -e attached', "perl -e'print 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -ne bundle', "perl -ne 'print' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -lne bundle', "perl -lne 'print' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -ce compiles the program from -e', "perl -ce 'print 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['python3 -c', "python3 -c 'print(1)' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['python3 -c attached', "python3 -c'print(1)' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['python3 -Ic, program in the next word', "python3 -Ic 'print(1)' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['node -pe', "node -pe 1 <<'EOF'\nrm research/canvas.md\nEOF"],
    ['node --eval', "node --eval 'console.log(1)' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['node --print', "node --print 1 <<'EOF'\nrm research/canvas.md\nEOF"],
    ['ruby -ne', "ruby -ne 'p 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['ruby -e attached', "ruby -e'puts 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['a shell cluster is unchanged', "bash -ce 'ls research' <<'EOF'\nrm research/canvas.md\nEOF"],
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, form);
  }
  // SQ-70 rework. An interactive flag makes the interpreter read standard input as
  // code once the inline program has run, so an inline flag no longer makes the
  // body data. Probed on the binaries: `python3 -i -c 'pass'`, `python3 -ic 'pass'`
  // and `node -i -e 1` each ran the heredoc body.
  for (const [form, cmd] of [
    ['python3 -i -c', "python3 -i -c 'pass' <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -ic', "python3 -ic 'pass' <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -Ii -c', "python3 -Ii -c 'pass' <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -uic', "python3 -uic 'pass' <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -Ei has no program of its own', "python3 -Ei <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -iE', "python3 -iE <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['python3 -i alone', "python3 -i <<'EOF'\nimport os; os.remove('research/canvas.md')\nEOF"],
    ['node -i -e', "node -i -e 1 <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
    ['node -e then -i', "node -e 1 -i <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
    ['node --interactive -e', "node --interactive -e 1 <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
    ['node -p then -i', "node -p 1 -i <<'EOF'\nrequire('fs').rmSync('research/canvas.md')\nEOF"],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
  }
  // The other order follows the binary. Python takes the program out of `-c`'s
  // next word and stops reading options, so `python3 -c PROG -i` passes `-i` as an
  // argument the program never sees and the body stays data. Perl's and ruby's `-i`
  // is in-place editing and never reads stdin as code after `-e`.
  for (const [form, cmd] of [
    ['python3 -c then -i is the program\'s argument', "python3 -c 'pass' -i <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -i after -e is in-place editing', "perl -e 'print 1' -i <<'EOF'\nrm research/canvas.md\nEOF"],
    ['perl -i before -e', "perl -i -e 'print 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['ruby -i before -e', "ruby -i -e 'puts 1' <<'EOF'\nrm research/canvas.md\nEOF"],
    ['ruby -ni bundle', "ruby -ni -e 'puts 1' <<'EOF'\nrm research/canvas.md\nEOF"],
  ]) {
    assert.equal(run(root, 'Bash', { command: cmd }), null, form);
  }
});

// SQ-101. SQ-67 lexed every stdin program as bash, which is right for a shell and
// wrong for python, node, perl and ruby: their source was read as shell words, and
// a string like `'*/*.md'` became a glob onto the state. The body of an
// interpreter is now program text the guard cannot read, judged the way the same
// text is under `python3 -c` or `node -e`.
test('SQ-101: an interpreter\'s heredoc program is judged as program text, not as bash', () => {
  const bare = makeBareProject();
  const root = makeProject();
  // Lexed as bash, the template literal was a backquote substitution the guard
  // could not compute, and that denied the program where state is present.
  const lexedAsBash = "node - <<'EOF'\nconst x = `${1}`;\nconsole.log(x)\nEOF";
  for (const cmd of [
    "python3 - <<'EOF'\nimport os, tempfile\nd = tempfile.mkdtemp()\nos.mkdir(os.path.join(d, \"out\"))\nprint(d)\nEOF",
    "node - <<'EOF'\nconst r = require('fs').readdirSync('.');\nfor (const f of r) console.log(f > '')\nEOF",
    "perl <<'EOF'\nopen(my $f, '>', 'out.txt') or die; print $f 1;\nEOF",
    lexedAsBash,
  ]) {
    assert.equal(run(bare, 'Bash', { command: cmd }), null, cmd);
  }
  assert.equal(run(root, 'Bash', { command: lexedAsBash }), null);
  // What the body spells still counts: a state path, and a substitution bash
  // runs first under an unquoted delimiter.
  for (const [form, cmd] of [
    ['a state write', "python3 - <<'EOF'\nopen('research/canvas.md','w').write('x')\nEOF"],
    ['a substitution bash runs', "python3 <<EOF\nprint('$(rm research/canvas.md)')\nEOF"],
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', form);
  }
  // A shell as the reader keeps SQ-67: its body is lexed as the script it is.
  assert.equal(run(root, 'Bash', { command: 'bash <<EOF\ncat research/canvas.md\nEOF' }), null);
  const shell = run(root, 'Bash', { command: "bash <<'EOF'\nrm research/canvas.md\nEOF" });
  assert.equal(shell && shell.permissionDecision, 'deny');
});

test('Bash: a CLI-named path operand does not imply harness invocation', () => {
  const root = makeProject();
  const pathOperand = path.join(path.dirname(root), 'research-harness');
  assert.equal(run(root, 'Bash', { command: `mkdir -p ${pathOperand}` }), null);
});

test('Bash: accept is the researcher\'s act however it is spelled', () => {
  const root = makeProject();
  for (const cmd of [
    'node bin/research-harness.js accept 1.2',
    'node bin/research-harness.js "accept" 1.2',
    'S=accept; node bin/research-harness.js $S 1.2',
    'cp bin/research-harness.js rh.js && node rh.js accept 1.2',
    'npx research-harness accept 1.2',
    'xargs research-harness accept 1.2',
    'xargs -n 1 research-harness accept 1.2',
    'xargs --max-args 1 research-harness accept 1.2',
  ]) {
    const out = run(root, 'Bash', { command: cmd });
    assert.equal(out && out.permissionDecision, 'deny', cmd);
    assert.match(out.permissionDecisionReason, /researcher's act/, cmd);
    assert.match(out.permissionDecisionReason, /research-harness:accept/, cmd);
  }
});

// The probe set from SQ-29 (verification/SQ-29/cli.txt B1–B9, B13–B14 and
// perimeter.txt M14–M15). The inference read three launcher shapes and nothing
// else, so `accept` reached the CLI in silence behind any other one. Two routes
// close that: a wrapper is followed to the command it launches, and a program
// text, which no lexer here can read, is judged by what it names. Each row
// carries the negative control that keeps the route from denying ordinary work.
const LAUNCHERS = [
  ['env', 'env node bin/research-harness.js accept 1.2', 'env FOO=1 npm test'],
  ['env with an option that takes a value', 'env -u FOO node bin/research-harness.js accept 1.2', 'env -u FOO npm test'],
  ['command', 'command node bin/research-harness.js accept 1.2', 'command npm test'],
  ['exec', 'exec node bin/research-harness.js accept 1.2', 'exec npm test'],
  ['nice', 'nice -n 10 node bin/research-harness.js accept 1.2', 'nice -n 10 npm test'],
  ['time', 'time node bin/research-harness.js accept 1.2', 'time npm test'],
  ['nohup', 'nohup node bin/research-harness.js accept 1.2', 'nohup npm test'],
  ['sudo', 'sudo node bin/research-harness.js accept 1.2', 'sudo npm test'],
  ['wrappers in front of each other', 'env exec nice node bin/research-harness.js accept 1.2', 'env exec nice npm test'],
  ['xargs with a runner in the command slot', 'printf x | xargs node bin/research-harness.js accept 1.2', 'printf x | xargs npm test'],
  ['xargs after --', 'printf x | xargs -- node bin/research-harness.js accept 1.2', 'printf x | xargs -- npm test'],
  ['find -exec', 'find . -maxdepth 0 -exec node bin/research-harness.js accept 1.2 \\;', 'find . -maxdepth 1 -exec grep -l stated {} \\;'],
  ['find -execdir', 'find . -maxdepth 0 -execdir research-harness accept 1.2 +', 'find . -maxdepth 1 -execdir grep -l stated {} +'],
];

const PROGRAM_TEXTS = [
  ['sh -c', 'sh -c \'node bin/research-harness.js accept 1.2\'', 'sh -c \'ls research\''],
  ['bash -c', 'bash -c "research-harness accept 1.2"', 'bash -c "git status"'],
  ['zsh -c', 'zsh -lc \'node bin/research-harness.js accept 1.2\'', 'zsh -lc \'npm test\''],
  ['eval', 'eval \'node bin/research-harness.js accept 1.2\'', 'eval \'npm test\''],
  ['node -e', 'node -e \'require("./bin/research-harness.js").main(["accept","1.2"])\'', 'node -e \'console.log(1)\''],
  ['node --eval', 'node --eval \'require("./bin/research-harness.js").main(["accept","1.2"])\'', 'node --eval \'console.log(1)\''],
  ['node --eval=', 'node --eval=\'require("./bin/research-harness.js").main(["accept","1.2"])\'', 'node --eval=\'console.log(1)\''],
  ['node -p', 'node -p \'require("./bin/research-harness.js").main(["accept","1.2"])\'', 'node -p \'1 + 1\''],
];

test('Bash: a wrapper is followed to the command it launches', () => {
  const root = makeProject();
  for (const [launcher, denied] of LAUNCHERS) {
    const out = run(root, 'Bash', { command: denied });
    assert.equal(out && out.permissionDecision, 'deny', `${launcher}: ${denied}`);
    assert.match(out.permissionDecisionReason, /researcher's act/, launcher);
  }
});

test('Bash: a program text that names the CLI or accept is a harness invocation', () => {
  const root = makeProject();
  for (const [form, denied] of PROGRAM_TEXTS) {
    const out = run(root, 'Bash', { command: denied });
    assert.equal(out && out.permissionDecision, 'deny', `${form}: ${denied}`);
    assert.match(out.permissionDecisionReason, /researcher's act/, form);
  }
  // The read-only form is no different: inside a program text the guard cannot
  // see which subcommand runs, and an unreadable subcommand is judged as an
  // acceptance, the same way `research-harness "$SUB"` is.
  const out = run(root, 'Bash', { command: 'sh -c \'research-harness status\'' });
  assert.equal(out && out.permissionDecision, 'deny');
});

test('Bash: neither route denies ordinary work', () => {
  const root = makeProject();
  for (const [launcher, , allowed] of [...LAUNCHERS, ...PROGRAM_TEXTS]) {
    assert.equal(run(root, 'Bash', { command: allowed }), null, `${launcher}: ${allowed}`);
  }
  // SQ-32's contract: a bare word whose basename is a CLI name is an operand,
  // not an invocation, and the two routes above do not bring that inference back.
  assert.equal(run(root, 'Bash', { command: 'cd research-harness && npm test' }), null);
});

// US-2 P4. The session server takes approvals from the browser, so only the
// researcher starts it: `research-harness serve` and the server script, on
// either route, with or without research state in the project.
test('Bash: the model cannot start the session server', () => {
  for (const root of [makeProject(), makeBareProject()]) {
    for (const command of [
      'research-harness serve',
      'nohup research-harness serve &',
      'node plugins/research-harness/bin/canvas-serve.js',
      'env node bin/canvas-serve.js --no-open',
      'sh -c "node plugins/research-harness/bin/canvas-serve.js"',
      'sh -c "node ./canvas-serve.js"',
      'node -e \'require("./bin/canvas-serve")\'',
    ]) {
      const out = run(root, 'Bash', { command });
      assert.equal(out && out.permissionDecision, 'deny', command);
    }
    const direct = run(root, 'Bash', { command: 'node plugins/research-harness/bin/canvas-serve.js' });
    assert.match(direct.permissionDecisionReason, /starts the session server/);
    // Reading the server's source is not starting it.
    assert.equal(run(root, 'Bash', { command: 'grep -n serve plugins/research-harness/bin/canvas-serve.js' }), null);
  }
});

// SQ-99 (P6 F2). Unlisted wrappers, other interpreters' inline programs,
// terminal launchers and quote-split names reached `accept` and `serve`. In a
// project with state, a line naming the CLI with either verb, or naming
// canvas-serve, is refused unless every command in it is read-only.
const SQ99_CLI = '/Users/x/.claude/plugins/cache/eigenwise/research-harness/1.0/bin/research-harness.js';
const SQ99_SPLIT = "/Users/x/.claude/plugins/cache/eigenwise/research-harn''ess/1.0/bin/research-harn''ess.js";
const SQ99_FORMS = (verb) => [
  `timeout 600 node ${SQ99_CLI} ${verb}`,
  `caffeinate -i node ${SQ99_CLI} ${verb}`,
  `script -q /dev/null node ${SQ99_CLI} ${verb}`,
  `arch -arm64 node ${SQ99_CLI} ${verb}`,
  `stdbuf -o0 node ${SQ99_CLI} ${verb}`,
  `watch -n 999 node ${SQ99_CLI} ${verb}`,
  `flock /tmp/l node ${SQ99_CLI} ${verb}`,
  `doas node ${SQ99_CLI} ${verb}`,
  `setsid node ${SQ99_CLI} ${verb}`,
  `python3 -c "import subprocess; subprocess.run(['node','${SQ99_CLI}','${verb.split(' ').join("','")}'])"`,
  `perl -e "system(q{node ${SQ99_CLI} ${verb}})"`,
  `osascript -e "do shell script \\"node ${SQ99_CLI} ${verb}\\""`,
  `bash -c "node ${SQ99_SPLIT} ${verb.replace(/^accept/, "acc''ept")}"`,
  `cmux workspace create --cwd /tmp --name x --command "node ${SQ99_CLI} ${verb}"`,
  `cmux send --surface surface:2 "node ${SQ99_CLI} ${verb}"`,
  `tmux new -d "node ${SQ99_CLI} ${verb}"`,
  `screen -dm node ${SQ99_CLI} ${verb}`,
  `ln -s ${SQ99_CLI} /tmp/rh.js && node /tmp/rh.js ${verb}`,
  `python3 <<'EOF'\nimport subprocess; subprocess.run(['node', '${SQ99_CLI}', '${verb.split(' ')[0]}'])\nEOF`,
];

test('SQ-99: a line naming the CLI with accept or serve is denied whatever wraps it', () => {
  const root = makeProject();
  for (const command of [...SQ99_FORMS('serve --no-open'), 'bash -c "research-harn\'\'ess serve"']) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
    assert.match(out.permissionDecisionReason, /session server/, command);
  }
  for (const command of SQ99_FORMS('accept 1.2')) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
    assert.match(out.permissionDecisionReason, /Accepting a statement is the researcher's act/, command);
  }
  const server = run(root, 'Bash', { command: 'caffeinate -i node plugins/research-harness/bin/canvas-serve.js' });
  assert.equal(server && server.permissionDecision, 'deny');
});

test('SQ-99: reading the plugin and wrapping unrelated commands stay allowed', () => {
  const root = makeProject();
  for (const command of [
    'grep -n accept plugins/research-harness/bin/research-harness.js',
    'grep "research-harness accept" README.md',
    'grep -rn serve plugins/research-harness/bin/canvas-serve.js | head -5',
    'git commit -m "research-harness serve: document the token"',
    'caffeinate -i make test',
    'timeout 5 node x.js',
    'cd plugins/research-harness && node --test test/serve.test.js',
    'research-harness status',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
});

test('SQ-99: without research state the name rule does not engage', () => {
  const root = makeBareProject();
  for (const command of [`caffeinate -i node ${SQ99_CLI} accept 1.2`, `tmux new -d "node ${SQ99_CLI} serve"`]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
});

// SQ-61, cli.txt B10. The inference read the command word first, and an opaque
// one ended the walk there: the CLI name and `accept` behind it were never
// looked at, so the invocation ran unseen. An opaque word is read the way an
// unknown wrapper is — its command slot is walked, and what stands there is
// judged as the invocation it would have been. `$(echo node)` beside it is
// already denied since SQ-57 resolved it to the literal `node`.
test('SQ-61: an opaque command word does not hide the invocation behind it', () => {
  const root = makeProject();
  for (const command of [
    'R=$(cat x); $R bin/research-harness.js accept 1.2',
    'R=$(date +%s); $R bin/research-harness.js accept 1.2',
    '$R bin/research-harness.js accept 1.2',
    '$R --no-warnings bin/research-harness.js accept 1.2',
    'R=$(cat x); $R bin/research-harness.js log DECISION 1.2 --body x',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  // No CLI name and no `accept` behind the opaque word: there is nothing here
  // for the inference to find, and an unknown wrapper stays ordinary work.
  for (const command of [
    '$CMD --version',
    '$R echo hi',
    'R=$(date +%s); ls research',
    '$R npm test',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
  }
});

// SQ-102 (SQ-97 shape 3). A variable's value is spliced into the command word
// unsplit, so the whole `git -C …/research-harness` read as one path whose last
// component is the CLI's name. Bash splits the unquoted value and runs git; the
// CLI's name is only the directory of `-C`. A value that does start the CLI
// keeps its denial, and so does SQ-61's opaque command word.
test('SQ-102: the CLI name as a directory in a variable\'s flag argument is not a harness call', () => {
  const allowed = [
    'G="git -C /home/u/src/research-harness"; $G status --short',
    'G="git -C /home/u/src/research-harness"; $G log -3',
    'G="git -C /home/u/src/research-harness"; $G add -A',
  ];
  const denied = [
    '$R bin/research-harness.js accept 1.2',
    'G="node bin/research-harness.js"; $G accept 1.2',
    'G="npx research-harness"; $G accept 1.2',
    'G="/opt/x/bin/research-harness.js accept"; $G 1.2',
    // A changed IFS decides how bash splits the value, so the guard does not
    // split it: with IFS=: the program is the whole path, the CLI.
    'IFS=:; G="/tmp/a b/research-harness.js"; $G accept 1.2',
    'export IFS=:; G="/tmp/a b/research-harness.js"; $G accept 1.2',
    "IFS=$'\\n'; G=\"/tmp/a b/research-harness.js\"; $G accept 1.2",
    '(IFS=:; G="/tmp/a b/research-harness.js"; $G accept 1.2)',
    // Only space, tab and newline split under the default IFS; a carriage
    // return stays inside the program name.
    'G="/tmp/a\rb/research-harness.js"; $G accept 1.2',
  ];
  // The probe corpus replays in a project without research state, where no
  // state path can deny for a reason of its own; a paper project must agree.
  for (const root of [makeBareProject(), makeProject()]) {
    for (const command of allowed) assert.equal(run(root, 'Bash', { command }), null, command);
    for (const command of denied) {
      const out = run(root, 'Bash', { command });
      assert.equal(out && out.permissionDecision, 'deny', command);
    }
  }
});

// SQ-61, the argument-position sibling (SQ-57's reading, closed here). An
// assignment whose value carries a substitution the guard cannot resolve makes
// the variable unknown, so `$x` is an unknown target where it stands: denied
// under a verb whose operand is the file it writes, exactly as SQ-68 denies the
// substitution written out in the argument, and still read under a read-only
// verb. The cost, stated in the release note: `$(mktemp)` is unknown too, so
// that one is denied inside a research project.
test('SQ-61: an unknown variable is a write target like the substitution written out', () => {
  const root = makeProject();
  for (const command of [
    'x=$(cat p.txt); rm "$x"',
    'x=$(cat p.txt); rm "$x.md"',
    'tmp=$(mktemp); rm "$tmp"',
    'x=$(cat p.txt); mv notes.md "$x"',
    'x=$(cat p.txt); touch "$x"',
  ]) {
    const out = run(root, 'Bash', { command });
    assert.equal(out && out.permissionDecision, 'deny', command);
  }
  for (const command of [
    'x=$(cat p.txt); cat "$x"',
    'x=$(pwd); ls "$x"',
    'x=$(cat p.txt); grep -c x "$x"',
  ]) {
    assert.equal(run(root, 'Bash', { command }), null, command);
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

// SQ-29 F7 (lex.txt L8): nine nested substitutions put the body — and the `rm`
// in it — past MAX_SUBSTITUTION_DEPTH, so nothing below the limit was ever
// lexed. A line whose nesting is that deep is unreadable in full, not a line
// the guard read and judged harmless.
test('Bash: nesting past the substitution depth limit makes the command unreadable', () => {
  const root = makeProject();
  const nest = (levels) => {
    let inner = 'rm research/canvas.md';
    for (let k = 0; k < levels; k += 1) inner = `echo $(${inner})`;
    return inner;
  };
  // Seven and eight levels stay within the limit, so the `rm` at the bottom is
  // a real command the guard reads and refuses as one.
  for (const levels of [7, 8]) {
    const out = run(root, 'Bash', { command: nest(levels) });
    assert.equal(out && out.permissionDecision, 'deny', `${levels} levels`);
    assert.match(out.permissionDecisionReason, /read-only/, `${levels} levels`);
  }
  const deep = run(root, 'Bash', { command: nest(9) });
  assert.equal(deep && deep.permissionDecision, 'deny');
  assert.match(deep.permissionDecisionReason, /could not read/);
  assert.match(deep.permissionDecisionReason, /8-deep/);
  // The rule is the same one an unreadable line already follows: it is refused
  // for naming the state, and left alone when it names nothing there.
  let benign = 'echo hi';
  for (let k = 0; k < 9; k += 1) benign = `echo $(${benign})`;
  assert.equal(run(root, 'Bash', { command: benign }), null);
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

// SQ-20, decided: the guard does not judge visibility. Wrapping a committed
// statement in an HTML comment (S10) or indenting it into a code block (S8)
// leaves the commitment intact — same element, question, marker, text, tags —
// so the set rule has nothing to object to, and it stays permitted. The review
// reports the divergence instead. Making the parser strip comments would close
// S10, leave S8 open, and put a statement the researcher commented out
// themselves outside the guard's reach; that trade was refused.
test('hiding a committed statement from the rendered view is permitted and reported, not denied', () => {
  const root = makeProject();
  const file = path.join(root, 'research', 'canvas.md');
  for (const [what, replacement] of [
    ['an HTML comment', `<!--\n\n${ACCEPTED}\n\n-->`],
    ['an indented code block', `    ${ACCEPTED}`],
  ]) {
    assert.equal(run(root, 'Edit', { file_path: file, old_string: ACCEPTED, new_string: replacement }), null, what);
  }
  // Same markers on one line are a different statement, because they become
  // part of its text — that one the set rule does catch.
  const inline = run(root, 'Edit', { file_path: file, old_string: ACCEPTED, new_string: `<!-- ${ACCEPTED} -->` });
  assert.equal(inline.permissionDecision, 'deny');
  assert.match(inline.permissionDecisionReason, /commitment in question 1\.1/);
});
