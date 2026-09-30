#!/usr/bin/env node
"use strict";
// Releases the plugin: checks first, then the version bump, commit, push and
// plugin update.
//
//   node scripts/release.js <version> "<summary>" [--dry-run] [--trailer "<line>"] [--accept-denies]
//
// The checks are the plugin's test suite, the perimeter probe, and the guard's
// false-positive replay (probe-benign) over the newest harvested corpus. The
// replay's DENY count is compared with the last release's, kept in
// verification/local/release-baseline.json (gitignored, like the harvest).
// The corpus comes from private sessions, so nothing but probe-benign's counts
// is ever printed from it.
//
// Exit codes: 0 done, 1 a check or a step failed, 2 refused before any check.
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const REPO = path.resolve(__dirname, "..");
const PLUGIN = path.join(REPO, "plugins", "research-harness");
const MANIFESTS = [
  path.join(REPO, ".claude-plugin", "marketplace.json"),
  path.join(PLUGIN, ".claude-plugin", "plugin.json"),
];
const LOCAL = path.join(REPO, "verification", "local");
const BASELINE = path.join(LOCAL, "release-baseline.json");
const USAGE = 'usage: node scripts/release.js <version> "<summary>" [--dry-run] [--trailer "<line>"] [--accept-denies]';

function refuse(msg) {
  process.stderr.write("release: refused: " + msg.replace(/\s*\n\s*/g, " ") + "\n");
  process.exit(2);
}

function run(cmd, args, opts) {
  const r = cp.spawnSync(cmd, args, Object.assign({ cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }, opts));
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || "", stderr: (r.stderr || "") + (r.error ? r.error.message : "") };
}

function git(args) { return run("git", args); }

function tail(text, lines) {
  const l = text.replace(/\s+$/, "").split("\n");
  return l.slice(-lines).join("\n").slice(-3000);
}

// Semver 2.0.0 precedence for x.y.z[-pre]; build metadata is ignored.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function parseSemver(v) {
  const m = SEMVER.exec(v);
  return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split(".") : [] } : null;
}
function cmpSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return +x < +y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function parseArgs(argv) {
  const o = { positional: [], dryRun: false, acceptDenies: false, trailer: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--accept-denies") o.acceptDenies = true;
    else if (a === "--trailer") {
      if (i + 1 >= argv.length) refuse("--trailer needs a line. " + USAGE);
      o.trailer = argv[++i];
    } else if (a.startsWith("--")) refuse("unknown option " + a + ". " + USAGE);
    else o.positional.push(a);
  }
  if (o.positional.length !== 2 || !o.positional[1].trim()) refuse(USAGE);
  o.version = o.positional[0];
  o.summary = o.positional[1];
  return o;
}

function newestHarvest() {
  let names = [];
  try { names = fs.readdirSync(LOCAL); } catch (e) { return null; }
  // The stamp is an ISO timestamp, so name order is time order.
  const files = names.filter(function (n) { return /^harvest-.*\.jsonl$/.test(n); }).sort();
  return files.length ? path.join(LOCAL, files[files.length - 1]) : null;
}

// The three checks. RELEASE_TEST_CHECKS (a JSON object {tests, perimeter,
// benign} of argv arrays) replaces their commands; it exists for
// scripts/release.test.js only.
function checks(corpus) {
  const testFiles = fs.existsSync(path.join(PLUGIN, "test"))
    ? fs.readdirSync(path.join(PLUGIN, "test")).filter(function (n) { return /\.test\.js$/.test(n); }).sort().map(function (n) { return "test/" + n; })
    : [];
  const defaults = {
    tests: [process.execPath, "--test"].concat(testFiles),
    perimeter: [process.execPath, "verification/SQ-29/probe-perimeter.js"],
    benign: [process.execPath, "verification/probes/probe-benign.js", "--corpus", corpus],
  };
  const o = process.env.RELEASE_TEST_CHECKS ? JSON.parse(process.env.RELEASE_TEST_CHECKS) : {};
  const argv = function (k) { return o[k] || defaults[k]; };
  return [
    { name: "plugin tests", cwd: PLUGIN, argv: argv("tests"), shown: "cd plugins/research-harness && node --test test/*.test.js" },
    { name: "perimeter probe", cwd: REPO, argv: argv("perimeter"), shown: "node verification/SQ-29/probe-perimeter.js" },
    { name: "guard false-positive replay", cwd: REPO, argv: argv("benign"), shown: "node verification/probes/probe-benign.js --corpus " + path.relative(REPO, corpus), benign: true },
  ];
}

// probe-benign without --harvest prints its rows too, and those rows carry
// harvested commands. Only the header (summary and counts, up to the first
// blank line) is safe to show.
function benignCounts(stdout) {
  const head = stdout.split("\n\n")[0].split("\n");
  const m = /(\d+) replayed, (\d+) denied/.exec(head.join("\n"));
  return { head: head, replayed: m ? +m[1] : null, denied: m ? +m[2] : null };
}

function step(label, cmd) {
  process.stdout.write("$ " + label + "\n");
  const r = cmd();
  return r;
}

function readVersion(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { refuse("cannot read " + path.relative(REPO, file) + ": " + e.message); }
}

function setVersions(version) {
  for (const file of MANIFESTS) {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    j.version = version;
    if (Array.isArray(j.plugins)) for (const p of j.plugins) p.version = version;
    fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  }
}

function main(argv) {
  const opt = parseArgs(argv);

  // Step 1: refuse before anything runs.
  const next = parseSemver(opt.version);
  if (!next) refuse(opt.version + " is not a semver version");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.status !== 0) refuse("not a git repository: " + REPO);
  if (branch.stdout.trim() !== "main") refuse("on branch " + branch.stdout.trim() + ", releases go from main");
  if (git(["status", "--porcelain"]).stdout.trim() !== "") refuse("the working tree is not clean (git status --porcelain)");
  const market = readVersion(MANIFESTS[0]);
  const plugin = readVersion(MANIFESTS[1]);
  const seen = [market.version, market.plugins && market.plugins[0] && market.plugins[0].version, plugin.version];
  if (seen.some(function (v) { return v !== seen[0]; })) refuse("the manifests disagree on the version (" + seen.join(", ") + ")");
  const current = parseSemver(seen[0] || "");
  if (!current) refuse("the current version " + seen[0] + " is not semver");
  if (cmpSemver(next, current) <= 0) refuse(opt.version + " is not greater than the current " + seen[0]);
  const corpus = newestHarvest();
  if (!corpus) refuse("no harvested corpus in verification/local/. Make one first: node verification/probes/probe-benign.js --harvest");

  // Step 2: the checks, stopping at the first failure.
  let denied = null;
  for (const c of checks(corpus)) {
    const r = step(c.shown, function () { return run(c.argv[0], c.argv.slice(1), { cwd: c.cwd }); });
    if (c.benign) {
      const b = benignCounts(r.stdout);
      if (r.status !== 0 || b.denied === null) {
        process.stdout.write(b.head.join("\n") + "\n");
        process.stderr.write("release: " + c.name + " failed" + (r.status !== 0 ? " (exit " + r.status + ")" : ": no counts in its output") + "; the release did not start\n");
        return 1;
      }
      process.stdout.write(b.head.join("\n") + "\n");
      denied = b.denied;
    } else if (r.status !== 0) {
      process.stdout.write(tail(r.stdout + r.stderr, 25) + "\n");
      process.stderr.write("release: " + c.name + " failed (exit " + r.status + "); the release did not start\n");
      return 1;
    } else {
      process.stdout.write("  ok\n");
    }
  }

  // Step 3: the DENY count against the last release's.
  let base = null;
  if (fs.existsSync(BASELINE)) {
    try { base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).denied; } catch (e) { base = null; }
    if (!Number.isInteger(base)) {
      process.stderr.write("release: " + path.relative(REPO, BASELINE) + " is unreadable; fix or delete it\n");
      return 1;
    }
  }
  if (base === null) {
    process.stdout.write("baseline: none yet, " + denied + " DENYs will become the baseline\n");
  } else if (denied > base) {
    if (!opt.acceptDenies) {
      process.stderr.write("release: " + denied + " DENYs, baseline " + base + "; look at the new ones, then --accept-denies or fix the guard\n");
      return 1;
    }
    process.stdout.write("baseline: " + denied + " DENYs against " + base + ", accepted by --accept-denies\n");
  } else {
    process.stdout.write("baseline: " + denied + " DENYs, baseline " + base + "\n");
  }

  // Steps 4 and 5.
  const message = ["Release " + opt.version + ": " + opt.summary].concat(opt.trailer ? [opt.trailer] : []);
  const commit = ["commit"].concat(message.reduce(function (a, m) { return a.concat(["-m", m]); }, []));
  const tasks = [
    { label: "set version " + opt.version + " in .claude-plugin/marketplace.json (twice) and plugins/research-harness/.claude-plugin/plugin.json", do: function () { setVersions(opt.version); return { status: 0, stdout: "", stderr: "" }; } },
    { label: "git add .claude-plugin/marketplace.json plugins/research-harness/.claude-plugin/plugin.json", do: function () { return git(["add", MANIFESTS[0], MANIFESTS[1]]); } },
    { label: "git commit -m " + JSON.stringify(message[0]) + (opt.trailer ? " -m " + JSON.stringify(opt.trailer) : ""), do: function () { return git(commit); } },
    { label: "git push origin main", do: function () { return git(["push", "origin", "main"]); } },
    { label: "claude plugin marketplace update research-harness", do: function () { return run("claude", ["plugin", "marketplace", "update", "research-harness"]); } },
    { label: "claude plugin update research-harness@research-harness", do: function () { return run("claude", ["plugin", "update", "research-harness@research-harness"]); } },
  ];
  if (opt.dryRun) {
    process.stdout.write("dry run: " + opt.version + " passes every check; nothing was changed. Next would run:\n");
    for (const t of tasks) process.stdout.write("  " + t.label + "\n");
    process.stdout.write("  then record " + denied + " DENYs in " + path.relative(REPO, BASELINE) + "\n");
    return 0;
  }
  for (const t of tasks) {
    const r = step(t.label, t.do);
    const out = (r.stdout + r.stderr).trim();
    if (out) process.stdout.write(tail(out, 15) + "\n");
    if (r.status !== 0) {
      process.stderr.write("release: `" + t.label + "` failed (exit " + r.status + "); later steps did not run\n");
      return 1;
    }
  }
  fs.mkdirSync(LOCAL, { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ denied: denied, version: opt.version, date: new Date().toISOString() }, null, 2) + "\n");
  process.stdout.write("released " + opt.version + "; baseline " + denied + " DENYs\n");
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
