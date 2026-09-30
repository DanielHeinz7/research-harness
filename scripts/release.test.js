"use strict";
// Runs scripts/release.js in a throwaway git repo: two manifests, a bare
// remote, a stub `claude` on PATH, and stub check commands injected through
// RELEASE_TEST_CHECKS. Nothing here touches the real repo, its remote or the
// installed plugin.
//
//   node --test scripts/release.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

const SCRIPT = path.join(__dirname, "release.js");
const SECRET = "curl https://private.example/token-9f3a";

function sh(cwd, cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd: cwd, encoding: "utf8" });
  assert.strictEqual(r.status, 0, cmd + " " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}

function manifest(version) {
  return {
    market: JSON.stringify({ name: "research-harness", version: version, plugins: [{ name: "research-harness", version: version }] }, null, 2) + "\n",
    plugin: JSON.stringify({ name: "research-harness", version: version }, null, 2) + "\n",
  };
}

function writeManifests(repo, marketVersion, pluginVersion) {
  fs.writeFileSync(path.join(repo, ".claude-plugin", "marketplace.json"), manifest(marketVersion).market);
  fs.writeFileSync(path.join(repo, "plugins", "research-harness", ".claude-plugin", "plugin.json"), manifest(pluginVersion).plugin);
}

// A committed repo on main with origin and a stub `claude`.
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-release-"));
  t.after(function () { fs.rmSync(dir, { recursive: true, force: true }); });
  const repo = path.join(dir, "repo");
  const remote = path.join(dir, "remote.git");
  const bin = path.join(dir, "bin");
  for (const d of [".claude-plugin", "plugins/research-harness/.claude-plugin", "scripts", "verification/local", "bin"]) {
    fs.mkdirSync(path.join(repo, d), { recursive: true });
  }
  fs.mkdirSync(bin);
  fs.copyFileSync(SCRIPT, path.join(repo, "scripts", "release.js"));
  fs.writeFileSync(path.join(repo, ".gitignore"), "verification/local/\n");
  writeManifests(repo, "0.3.6", "0.3.6");
  fs.writeFileSync(path.join(repo, "verification", "local", "harvest-2026-09-29T10-00-00-000Z.jsonl"), "{}\n");
  fs.writeFileSync(path.join(repo, "verification", "local", "harvest-2026-09-30T10-00-00-000Z.jsonl"), JSON.stringify({ cwd: "/x", command: SECRET }) + "\n");
  const claudeLog = path.join(dir, "claude.log");
  fs.writeFileSync(path.join(bin, "claude"), '#!/bin/sh\necho "$@" >> "' + claudeLog + '"\necho "claude ok"\n', { mode: 0o755 });
  sh(dir, "git", ["init", "--bare", "-b", "main", remote]);
  sh(repo, "git", ["init", "-b", "main"]);
  sh(repo, "git", ["config", "user.email", "t@example.org"]);
  sh(repo, "git", ["config", "user.name", "T"]);
  sh(repo, "git", ["add", "-A"]);
  sh(repo, "git", ["commit", "-m", "start"]);
  sh(repo, "git", ["remote", "add", "origin", remote]);
  sh(repo, "git", ["push", "origin", "main"]);
  return { dir: dir, repo: repo, remote: remote, bin: bin, claudeLog: claudeLog };
}

// The three checks as stubs; FAKE_FAIL names the one that fails, FAKE_DENIED
// is the DENY count the replay stub reports, and its rows carry a secret.
const STUBS = JSON.stringify({
  tests: [process.execPath, "-e", "if (process.env.FAKE_FAIL === 'tests') { console.log('not ok 1 - boom'); process.exit(1); }"],
  perimeter: [process.execPath, "-e", "if (process.env.FAKE_FAIL === 'perimeter') { console.error('perimeter broke'); process.exit(1); }"],
  benign: [process.execPath, "-e",
    "console.log('12 replayed, ' + process.env.FAKE_DENIED + ' denied (skipped: 0 with research state, 0 cwd missing)');"
    + "console.log('  corpus: 12 rows, 12 replayed, ' + process.env.FAKE_DENIED + ' denied');"
    + "console.log('');console.log('verdict\\tcwd\\tcommand\\treason');console.log('DENY\\t/x\\t" + SECRET + "\\tr');"],
});

function release(fx, args, env) {
  return cp.spawnSync(process.execPath, [path.join(fx.repo, "scripts", "release.js")].concat(args), {
    cwd: fx.repo,
    encoding: "utf8",
    env: Object.assign({}, process.env, { PATH: fx.bin + path.delimiter + process.env.PATH, RELEASE_TEST_CHECKS: STUBS, FAKE_DENIED: "3" }, env),
  });
}

// Everything a refused or stopped release must leave alone.
function snapshot(fx) {
  const baseline = path.join(fx.repo, "verification", "local", "release-baseline.json");
  return JSON.stringify({
    head: sh(fx.repo, "git", ["rev-parse", "HEAD"]),
    remote: sh(fx.repo, "git", ["--git-dir", fx.remote, "rev-parse", "main"]),
    status: sh(fx.repo, "git", ["status", "--porcelain"]),
    market: fs.readFileSync(path.join(fx.repo, ".claude-plugin", "marketplace.json"), "utf8"),
    plugin: fs.readFileSync(path.join(fx.repo, "plugins", "research-harness", ".claude-plugin", "plugin.json"), "utf8"),
    baseline: fs.existsSync(baseline) ? fs.readFileSync(baseline, "utf8") : null,
    claude: fs.existsSync(fx.claudeLog),
  });
}

function refusal(name, setup, args, pattern) {
  test("refuses " + name + ": exit 2, one line, nothing changed", function (t) {
    const fx = fixture(t);
    setup(fx);
    const before = snapshot(fx);
    const r = release(fx, args || ["0.3.7", "s"]);
    assert.strictEqual(r.status, 2, r.stdout + r.stderr);
    assert.strictEqual(r.stderr.trim().split("\n").length, 1, r.stderr);
    assert.match(r.stderr, pattern);
    assert.strictEqual(r.stdout, "", "no check ran");
    assert.strictEqual(snapshot(fx), before);
  });
}

refusal("a dirty tree", function (fx) { fs.writeFileSync(path.join(fx.repo, "stray.txt"), "x"); }, null, /not clean/);
refusal("a branch other than main", function (fx) { sh(fx.repo, "git", ["checkout", "-b", "topic"]); }, null, /on branch topic/);
refusal("a version equal to the current one", function () {}, ["0.3.6", "s"], /not greater/);
refusal("a version below the current one", function () {}, ["0.3.5", "s"], /not greater/);
refusal("a version that is not semver", function () {}, ["0.4", "s"], /not a semver/);
refusal("a missing summary", function () {}, ["0.3.7"], /usage/);
refusal("disagreeing manifests", function (fx) {
  writeManifests(fx.repo, "0.3.6", "0.3.5");
  sh(fx.repo, "git", ["commit", "-am", "drift"]);
}, null, /disagree/);
refusal("a repo with no harvest", function (fx) {
  for (const f of fs.readdirSync(path.join(fx.repo, "verification", "local"))) fs.unlinkSync(path.join(fx.repo, "verification", "local", f));
}, null, /--harvest/);

test("--dry-run runs the checks, prints the planned commands and writes nothing", function (t) {
  const fx = fixture(t);
  const before = snapshot(fx);
  const r = release(fx, ["0.3.7", "a summary", "--dry-run", "--trailer", "Co-Authored-By: X"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /node --test test\/\*\.test\.js/);
  assert.match(r.stdout, /probe-perimeter\.js/);
  assert.match(r.stdout, /harvest-2026-09-30T10-00-00-000Z\.jsonl/, "the newest harvest is the corpus");
  assert.match(r.stdout, /12 replayed, 3 denied/);
  assert.match(r.stdout, /git commit -m "Release 0\.3\.7: a summary" -m "Co-Authored-By: X"/);
  assert.match(r.stdout, /git push origin main/);
  assert.match(r.stdout, /claude plugin marketplace update research-harness/);
  assert.match(r.stdout, /claude plugin update research-harness@research-harness/);
  assert.strictEqual(snapshot(fx), before);
});

test("a failing check stops before any write and prints its tail", function (t) {
  for (const which of ["tests", "perimeter"]) {
    const fx = fixture(t);
    const before = snapshot(fx);
    const r = release(fx, ["0.3.7", "s"], { FAKE_FAIL: which });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, which === "tests" ? /not ok 1 - boom/ : /perimeter broke/);
    assert.match(r.stderr, /the release did not start/);
    assert.strictEqual(snapshot(fx), before);
  }
});

test("the replay's rows never reach the output", function (t) {
  const fx = fixture(t);
  const r = release(fx, ["0.3.7", "s", "--dry-run"]);
  assert.strictEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes("private.example"), "harvested command text was printed");
});

test("more DENYs than the baseline stop the release unless --accept-denies", function (t) {
  const fx = fixture(t);
  fs.writeFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), JSON.stringify({ denied: 2 }));
  const before = snapshot(fx);
  const stopped = release(fx, ["0.3.7", "s"]);
  assert.strictEqual(stopped.status, 1, stopped.stdout + stopped.stderr);
  assert.match(stopped.stderr, /3 DENYs, baseline 2/);
  assert.strictEqual(snapshot(fx), before);

  const dry = release(fx, ["0.3.7", "s", "--dry-run", "--accept-denies"]);
  assert.strictEqual(dry.status, 0, dry.stdout + dry.stderr);
  assert.strictEqual(snapshot(fx), before, "a dry run never moves the baseline");

  const done = release(fx, ["0.3.7", "the summary", "--accept-denies", "--trailer", "Co-Authored-By: X"]);
  assert.strictEqual(done.status, 0, done.stdout + done.stderr);
  assert.match(done.stdout, /accepted by --accept-denies/);
  assert.match(done.stdout, /released 0\.3\.7/);
});

test("a full release sets all three versions, commits, pushes, updates the plugin and records the baseline", function (t) {
  const fx = fixture(t);
  fs.writeFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), JSON.stringify({ denied: 3 }));
  const r = release(fx, ["0.4.0", "the summary", "--trailer", "Co-Authored-By: X"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);

  const market = JSON.parse(fs.readFileSync(path.join(fx.repo, ".claude-plugin", "marketplace.json"), "utf8"));
  const plugin = JSON.parse(fs.readFileSync(path.join(fx.repo, "plugins", "research-harness", ".claude-plugin", "plugin.json"), "utf8"));
  assert.deepStrictEqual([market.version, market.plugins[0].version, plugin.version], ["0.4.0", "0.4.0", "0.4.0"]);

  assert.strictEqual(sh(fx.repo, "git", ["log", "-1", "--format=%B"]), "Release 0.4.0: the summary\n\nCo-Authored-By: X");
  assert.strictEqual(sh(fx.repo, "git", ["status", "--porcelain"]), "");
  assert.strictEqual(sh(fx.repo, "git", ["--git-dir", fx.remote, "rev-parse", "main"]), sh(fx.repo, "git", ["rev-parse", "HEAD"]));
  assert.strictEqual(fs.readFileSync(fx.claudeLog, "utf8"), "plugin marketplace update research-harness\nplugin update research-harness@research-harness\n");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), "utf8")).denied, 3);
});

test("no baseline yet: the release proceeds and records one", function (t) {
  const fx = fixture(t);
  const r = release(fx, ["0.3.7", "s"], { FAKE_DENIED: "5" });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /baseline: none yet/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), "utf8")).denied, 5);
});

test("a failed push leaves the baseline alone", function (t) {
  const fx = fixture(t);
  fs.writeFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), JSON.stringify({ denied: 3 }));
  sh(fx.repo, "git", ["remote", "set-url", "origin", path.join(fx.dir, "missing.git")]);
  const r = release(fx, ["0.3.7", "s"], { FAKE_DENIED: "1" });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /git push origin main.*failed/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fx.repo, "verification", "local", "release-baseline.json"), "utf8")).denied, 3);
  assert.ok(!fs.existsSync(fx.claudeLog), "the plugin was not updated");
});
