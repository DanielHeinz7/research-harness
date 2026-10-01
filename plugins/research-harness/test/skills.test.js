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
        /^(git (log|show|diff|blame|status|rev-parse|ls-files|cat-file)|research-harness (review|status)):\*$/,
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

test('record-review cites a statement without a hash the harness never prints', () => {
  const { body } = readSkill('record-review');
  assert.match(body, /question id `n\.m`, its marker, and its exact words/);
  assert.match(body, /recorded hash/, 'the hash the log records must stay citable');
  assert.match(body, /never compute\s+one, never invent one/);
  // the old demand for a per-statement hash no allowed tool prints
  assert.doesNotMatch(body, /text hash the harness/);
  assert.doesNotMatch(body, /hashes differ and show both/);
});

test('check: its only write instruction is log DISCOVERY "<n.m> check"', () => {
  const { fm, body } = readSkill('check');
  assert.equal(fm['disable-model-invocation'], 'true');
  const cli = body.match(/(?:^|[\s`])research-harness (?=status|log|init|review|accept|choose)\w+/gm) || [];
  const verbs = cli.map((c) => c.trim().split(/\s+/)[1]);
  assert.ok(verbs.length > 0);
  for (const v of verbs) assert.ok(['status', 'log'].includes(v), `check runs the harness verb ${v}`);
  const logs = body.match(/research-harness log[^\n]*/g) || [];
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

test('every /research-harness:accept shown in a skill carries --explained', () => {
  let seen = 0;
  for (const n of names) {
    const { text } = readSkill(n);
    for (const line of text.split('\n')) {
      if (!line.includes('/research-harness:accept')) continue;
      seen += 1;
      assert.match(line, /--explained/, `${n}: accept without --explained: ${line.trim()}`);
    }
  }
  assert.ok(seen > 0, 'no skill shows the researcher how to accept');
});

function allowedTools(name) {
  const v = readSkill(name).fm['allowed-tools'];
  return v ? v.split(/,\s*(?![^()]*\))/).map((x) => x.trim()) : [];
}

test('no skill pre-approves a node route or a wildcard-led Bash rule (SQ-132 F5)', () => {
  for (const n of names) {
    for (const t of allowedTools(n)) {
      if (!/^Bash/.test(t)) continue;
      assert.doesNotMatch(t, /^Bash\(node/, `${n} pre-approves node: ${t}`);
      const inner = /^Bash\((.*)\)$/.exec(t);
      assert.ok(inner, `${n}: Bash rule has no pattern: ${t}`);
      assert.doesNotMatch(inner[1], /^\*/, `${n}: leading wildcard in ${t}`);
      assert.doesNotMatch(inner[1], / \*/, `${n}: wildcard before the subcommand in ${t}`);
    }
  }
});

test('check allows exactly status and log DISCOVERY through the bare command', () => {
  assert.deepEqual(allowedTools('check'), [
    'Read', 'Grep', 'Glob',
    'Bash(research-harness status:*)',
    'Bash(research-harness log DISCOVERY:*)',
  ]);
});

test('record-review allows only review, status and git read verbs', () => {
  const bash = allowedTools('record-review').filter((t) => /^Bash/.test(t));
  assert.ok(bash.includes('Bash(research-harness review:*)'));
  assert.ok(bash.includes('Bash(research-harness status:*)'));
  for (const t of bash) {
    assert.match(t, /^Bash\((research-harness (review|status)|git (log|show|diff|blame|status|rev-parse|ls-files|cat-file)):\*\)$/, t);
  }
});

test('accept declares no allowed-tools: its ! line runs outside the model', () => {
  assert.equal(readSkill('accept').fm['allowed-tools'], undefined);
});

test('the README and the technical appendix describe record-review citing words, not a hash of a current statement', () => {
  const docs = [path.resolve(__dirname, '..', 'README.md'), path.resolve(__dirname, '..', '..', '..', 'docs', 'technical-appendix.md')];
  for (const file of docs) {
    const text = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /`n\.m` with the text hash|statement number plus hash/, file);
  }
});
