'use strict';

// Pins what skill prose cannot enforce by itself: that the skills exist with a
// well-formed header, that the reviewer skill is granted no write tool, that
// `check` writes exactly one kind of entry, and that no model-facing skill
// tells the model to accept or to choose.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillsDir = path.resolve(__dirname, '..', 'skills');

function readSkill(name) {
  const text = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, `${name}: SKILL.md has no frontmatter`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `${name}: unreadable frontmatter line "${line}"`);
    fm[kv[1]] = kv[2];
  }
  return { fm, body: m[2], text };
}

const names = fs.readdirSync(skillsDir).filter((n) => fs.existsSync(path.join(skillsDir, n, 'SKILL.md')));

test('the new skills exist', () => {
  for (const n of ['canvas', 'canvas-review', 'accept', 'check', 'record-review']) {
    assert.ok(names.includes(n), `skills/${n}/SKILL.md is missing`);
  }
});

test('every skill has a name matching its directory and a description', () => {
  for (const n of names) {
    const { fm } = readSkill(n);
    assert.equal(fm.name, n, `${n}: name does not match the directory`);
    assert.ok(fm.description && fm.description.length > 20, `${n}: description missing or too short`);
  }
});

test('record-review grants no Write, Edit or NotebookEdit and no broad Bash', () => {
  const { fm } = readSkill('record-review');
  assert.ok(fm['allowed-tools'], 'record-review declares no allowed-tools');
  const tools = fm['allowed-tools'].split(/,\s*(?![^()]*\))/).map((t) => t.trim());
  for (const t of tools) {
    assert.doesNotMatch(t, /^(Write|Edit|NotebookEdit|MultiEdit)\b/, `record-review grants ${t}`);
    if (/^Bash/.test(t)) {
      assert.notEqual(t, 'Bash', 'bare Bash grants every command');
      assert.doesNotMatch(t, /^Bash\(node:\*\)$/, 'Bash(node:*) would allow log and accept');
      const inner = /^Bash\((.*)\)$/.exec(t)[1];
      assert.match(
        inner,
        /^(git (log|show|diff|blame|status|rev-parse|ls-files|cat-file)|node \*research-harness\.js review):\*$/,
        `record-review grants a Bash command that is not a read verb or review: ${t}`,
      );
    }
  }
});

test('record-review is invoked by the researcher, cites, and says "not in the record"', () => {
  const { fm, body } = readSkill('record-review');
  assert.equal(fm['disable-model-invocation'], 'true');
  assert.match(body, /not in the record/);
  assert.match(body, /overrides the SessionStart rules/);
  assert.match(body, /--key/);
  assert.match(body, /#<seq>/);
});

test('check: its only write instruction is log DISCOVERY "<n.m> check"', () => {
  const { fm, body } = readSkill('check');
  assert.equal(fm['disable-model-invocation'], 'true');
  const cli = body.match(/research-harness\.js"\s+\w+/g) || [];
  const verbs = cli.map((c) => c.split(/\s+/)[1]);
  assert.ok(verbs.length > 0);
  for (const v of verbs) assert.ok(['status', 'log'].includes(v), `check runs the harness verb ${v}`);
  const logs = body.match(/research-harness\.js"\s+log[^\n]*/g) || [];
  assert.equal(logs.length, 1, 'check must have exactly one log instruction');
  assert.match(logs[0], /log DISCOVERY "<n\.m> check" --body "<question>"$/);
  // no instruction to write the canvas
  assert.doesNotMatch(body, /\[(proposed|tentative|stated|accepted)[^\]]*\]\s+paragraph/i);
});

test('canvas multiverse mode uses the variant flags and never chooses', () => {
  const { body } = readSkill('canvas');
  assert.match(body, /init --variant <name> --lens "<text>"/);
  assert.match(body, /review --variant <name>/);
  assert.match(body, /you cannot choose, and will not/);
  assert.match(body, /`\[stated\]` or `\[accepted\]`/);
});

test('no model-facing skill runs accept or choose', () => {
  for (const n of names) {
    if (n === 'accept') continue; // researcher-only: disable-model-invocation, runs the accept it is named for
    const { body } = readSkill(n);
    assert.doesNotMatch(body, /research-harness\.js"\s+(accept|choose)\b/, `${n} runs accept or choose`);
    const lines = body.split('\n');
    lines.forEach((line, i) => {
      // `choose <name>` may appear only where the researcher is told to run it
      if (/\bresearch-harness (accept|choose)\b/.test(line)) {
        const near = `${lines[i - 1] || ''} ${line}`;
        assert.match(near, /researcher|their own|you cannot/i, `${n}: "${line.trim()}" reads as an instruction to the model`);
      }
    });
  }
  assert.equal(readSkill('accept').fm['disable-model-invocation'], 'true');
});
