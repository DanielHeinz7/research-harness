"use strict";
// node --test verification/probe-benign.test.js
//
// The replay's counts are what scripts/release.js reads, so a run that
// replayed nothing must not read as a pass. Each case writes a synthetic
// corpus into a throwaway directory and replays it through the real hook:
// an empty corpus and a corpus whose every row is skipped fail, and one row
// that is ALLOWed passes. Nothing here holds session data.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROBE = path.join(__dirname, "probes", "probe-benign.js");

// The probe hands its own environment to the hook; CLAUDE_PROJECT_DIR and
// RESEARCH_HARNESS_DIR would point the replay at this session's project
// instead of the corpus rows.
const ENV = (function () {
  const env = Object.assign({}, process.env);
  delete env.CLAUDE_PROJECT_DIR;
  delete env.RESEARCH_HARNESS_DIR;
  return env;
})();

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-benign-"));
  t.after(function () { fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

function writeCorpus(root, name, rows) {
  const file = path.join(root, name);
  const body = rows.map(function (r) { return JSON.stringify(r); }).join("\n");
  fs.writeFileSync(file, body ? body + "\n" : "");
  return file;
}

function replay(file) {
  const run = spawnSync(process.execPath, [PROBE, "--corpus", file], { encoding: "utf8", env: ENV });
  return { status: run.status, stdout: run.stdout || "", stderr: run.stderr || "" };
}

test("an empty corpus fails: nothing was replayed", function (t) {
  const root = fixture(t);
  const run = replay(writeCorpus(root, "empty.jsonl", []));
  assert.strictEqual(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /nothing was replayed/);
  assert.match(run.stdout, /0 replayed, 0 denied/);
});

test("a corpus whose every row is skipped fails", function (t) {
  const root = fixture(t);
  const withState = path.join(root, "with-state");
  fs.mkdirSync(path.join(withState, "research"), { recursive: true });
  fs.writeFileSync(path.join(withState, "research", "canvas.md"), "# canvas\n");
  const run = replay(writeCorpus(root, "skipped.jsonl", [
    { cwd: withState, command: "git status" },
    { cwd: path.join(root, "gone"), command: "git status" }
  ]));
  assert.strictEqual(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /nothing was replayed/);
  assert.match(run.stdout, /0 replayed, 0 denied/);
  assert.match(run.stdout, /skipped: 1 with research state, 1 cwd missing/);
});

test("one benign row that is ALLOWed passes", function (t) {
  const root = fixture(t);
  const run = replay(writeCorpus(root, "benign.jsonl", [
    { label: "plain read", command: "git status --short", expect: "ALLOW" }
  ]));
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /1 replayed, 0 denied/);
  assert.doesNotMatch(run.stderr, /nothing was replayed/);
});
