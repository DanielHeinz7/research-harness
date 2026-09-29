"use strict";
// Replays Bash commands from projects that hold no research state through the
// real PreToolUse hook and counts the DENYs. Every DENY here is a candidate
// false positive: with no canvas and no decision log there is nothing for the
// guard to protect. The replayed commands are never executed.
//
//   node verification/probes/probe-benign.js --corpus <file.jsonl>
//   node verification/probes/probe-benign.js --harvest [--projects <dir>]
//
// Corpus rows are {cwd, command} and may carry `expect` (ALLOW|DENY), `known`
// (an open ticket that explains a wrong verdict) and `label`. A row without an
// absolute cwd is replayed in a fresh empty directory. With expectations the
// exit code is 1 when a verdict differs and no `known` ticket accounts for it.
//
// --harvest reads Bash tool_use inputs from ~/.claude/projects/*/*.jsonl and
// ~/.claude/projects/*/*/subagents/*.jsonl and writes the corpus and the
// tab-separated report to verification/local/, which is gitignored: those
// commands come from private sessions and never go into a commit. Its stdout
// carries counts only: per origin (main/subagent) and DENYs per reason prefix.
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const os = require("node:os");

const REPO = path.resolve(__dirname, "..", "..");
const PLUGIN = path.join(REPO, "plugins", "research-harness");
const GUARD = path.join(PLUGIN, "hooks", "guard-promotion.js");
const project = require(path.join(PLUGIN, "hooks", "lib", "project.js"));
const LOCAL = path.join(REPO, "verification", "local");

// The guard's own test (guard-promotion.js statePresent): the canvas or the
// decision log in the state directory. An empty `research/` is not state.
function holdsState(root) {
  const dir = project.stateDir(root);
  return fs.existsSync(path.join(dir, project.CANVAS_FILE)) || fs.existsSync(path.join(dir, project.DECISIONS_FILE));
}

// One hook process per row, as Claude Code runs it: payload on stdin, cwd and
// CLAUDE_PROJECT_DIR set to the row's project. The command is only data here.
function runHook(root, command) {
  const env = Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_PROJECT_DIR: root });
  return new Promise(function (resolve) {
    const child = cp.spawn(process.execPath, [GUARD], { cwd: root, env: env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", function (b) { stdout += b; });
    child.stderr.on("data", function (b) { stderr += b; });
    child.on("error", function (e) { resolve({ decision: "HOOKERR", reason: e.message }); });
    child.on("close", function (code) {
      if (code !== 0) return resolve({ decision: "HOOKERR", reason: stderr.slice(0, 200) });
      if (!stdout) return resolve({ decision: "ALLOW", reason: "" });
      let o;
      try { o = JSON.parse(stdout).hookSpecificOutput; } catch (e) { return resolve({ decision: "HOOKERR", reason: "unparseable: " + stdout.slice(0, 120) }); }
      if (o && o.permissionDecision === "deny") return resolve({ decision: "DENY", reason: o.permissionDecisionReason });
      resolve({ decision: "ALLOW", reason: "" });
    });
    child.stdin.end(JSON.stringify({ cwd: root, session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: command } }));
  });
}

// Runs fn over items with bounded concurrency; results keep the input order.
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function readCorpus(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter(function (l) { return l.trim(); })
    .map(function (l, i) {
      try { return JSON.parse(l); } catch (e) { throw new Error(file + ":" + (i + 1) + ": " + e.message); }
    });
}

function jsonlIn(dir) {
  try { return fs.readdirSync(dir).filter(function (f) { return f.endsWith(".jsonl"); }).map(function (f) { return path.join(dir, f); }); }
  catch (e) { return []; }
}

// Main transcripts are <projects>/<project>/<session>.jsonl; subagent transcripts
// (Sidequest executors run much of the Bash) are <projects>/<project>/<session>/subagents/*.jsonl.
// The cwd comes from each record, since a subagent may run in a worktree of its own.
// A (cwd, command) pair seen in both counts once, under the origin read first (main).
function harvest(projectsDir) {
  const seen = new Set();
  const rows = [];
  const transcripts = { main: 0, subagent: 0 };
  function scan(file, origin) {
    transcripts[origin] += 1;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (line.indexOf('"Bash"') < 0) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (e) { continue; }
      const content = rec && rec.message && Array.isArray(rec.message.content) ? rec.message.content : [];
      for (const c of content) {
        if (!c || c.type !== "tool_use" || c.name !== "Bash" || !c.input || typeof c.input.command !== "string") continue;
        if (typeof rec.cwd !== "string") continue;
        const key = rec.cwd + "\0" + c.input.command;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ cwd: rec.cwd, command: c.input.command, origin: origin });
      }
    }
  }
  const projects = fs.readdirSync(projectsDir).map(function (d) { return path.join(projectsDir, d); });
  for (const dir of projects) for (const f of jsonlIn(dir)) scan(f, "main");
  for (const dir of projects) {
    let sessions;
    try { sessions = fs.readdirSync(dir, { withFileTypes: true }).filter(function (e) { return e.isDirectory(); }); } catch (e) { continue; }
    for (const s of sessions) for (const f of jsonlIn(path.join(dir, s.name, "subagents"))) scan(f, "subagent");
  }
  return { rows: rows, transcripts: transcripts };
}

// Report rows are tab-separated; oneLine folds every whitespace run, tabs included,
// into one space, so a field never carries the separator.
function oneLine(s, n) { return String(s).replace(/\s+/g, " ").slice(0, n); }

// The guard's fixed wording up to the first quote, backtick, path or colon, so an
// interpolated path or command never reaches stdout.
function reasonPrefix(reason) { return oneLine(reason, 200).split(/["'`/:]/)[0].slice(0, 60).trim() || "(empty)"; }

async function main(argv) {
  const iCorpus = argv.indexOf("--corpus");
  const doHarvest = argv.indexOf("--harvest") >= 0;
  if ((iCorpus < 0) === !doHarvest) {
    process.stderr.write("usage: probe-benign.js --corpus <file.jsonl> | --harvest [--projects <dir>]\n");
    return 2;
  }
  let rows;
  const head = [];
  let sink = null;
  if (doHarvest) {
    const iProj = argv.indexOf("--projects");
    const projectsDir = iProj >= 0 ? argv[iProj + 1] : path.join(os.homedir(), ".claude", "projects");
    const h = harvest(projectsDir);
    fs.mkdirSync(LOCAL, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const corpusFile = path.join(LOCAL, "harvest-" + stamp + ".jsonl");
    fs.writeFileSync(corpusFile, h.rows.map(function (r) { return JSON.stringify(r); }).join("\n") + "\n");
    sink = path.join(LOCAL, "harvest-" + stamp + ".report.txt");
    head.push("harvest: " + h.transcripts.main + " main + " + h.transcripts.subagent + " subagent transcripts, "
      + h.rows.length + " distinct (cwd, command) pairs -> " + path.relative(REPO, corpusFile));
    rows = h.rows;
  } else {
    rows = readCorpus(argv[iCorpus + 1]);
  }

  let scratch = null;
  let missing = 0, withState = 0, replayed = 0, denied = 0, hookErr = 0, mismatched = 0, knownWrong = 0;
  const lines = [];
  const todo = [];
  for (const r of rows) {
    let root = r.cwd;
    if (typeof root !== "string" || !path.isAbsolute(root)) {
      if (!scratch) scratch = fs.mkdtempSync(path.join(os.tmpdir(), "rh-benign-"));
      root = fs.mkdtempSync(path.join(scratch, "p-"));
    } else if (!fs.existsSync(root)) { missing += 1; continue; }
    // Classified at replay time: state gained or lost since the command ran counts as it is now.
    if (holdsState(root)) { withState += 1; continue; }
    todo.push({ r: r, root: root });
  }
  const verdicts = await pool(todo, os.availableParallelism ? os.availableParallelism() : os.cpus().length, function (t) {
    return runHook(t.root, t.r.command);
  });
  const byOrigin = {};
  const byReason = {};
  for (const r of rows) {
    const o = byOrigin[r.origin || "corpus"] = byOrigin[r.origin || "corpus"] || { pairs: 0, replayed: 0, denied: 0 };
    o.pairs += 1;
  }
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i].r;
    const v = verdicts[i];
    replayed += 1;
    const o = byOrigin[r.origin || "corpus"];
    o.replayed += 1;
    if (v.decision === "DENY") {
      denied += 1;
      o.denied += 1;
      const p = reasonPrefix(v.reason);
      byReason[p] = (byReason[p] || 0) + 1;
    }
    if (v.decision === "HOOKERR") hookErr += 1;
    let mark = "";
    if (r.expect && r.expect !== v.decision) {
      if (r.known) { knownWrong += 1; mark = " [expected " + r.expect + ", known " + r.known + "]"; }
      else { mismatched += 1; mark = " [MISMATCH: expected " + r.expect + "]"; }
    }
    const where = r.cwd && path.isAbsolute(r.cwd) ? r.cwd : "<empty dir>";
    if (v.decision !== "ALLOW" || mark) {
      lines.push([v.decision + mark, where, oneLine(r.command, 120), oneLine(v.reason, 160)].join("\t"));
    } else if (r.expect) {
      lines.push(["ALLOW", where, oneLine(r.label || r.command, 120), ""].join("\t"));
    }
  }
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });

  const summary = replayed + " replayed, " + denied + " denied"
    + (hookErr ? ", " + hookErr + " hook errors" : "")
    + " (skipped: " + withState + " with research state, " + missing + " cwd missing)"
    + (mismatched || knownWrong ? "; " + mismatched + " unexpected, " + knownWrong + " known" : "");
  const counts = Object.keys(byOrigin).sort().map(function (k) {
    return "  " + k + ": " + byOrigin[k].pairs + " rows, " + byOrigin[k].replayed + " replayed, " + byOrigin[k].denied + " denied";
  }).concat(Object.keys(byReason).sort(function (a, b) { return byReason[b] - byReason[a]; }).map(function (k) {
    return "  DENY " + byReason[k] + "\t" + k;
  }));
  const out = head.concat([summary], counts, ["", "verdict\tcwd\tcommand\treason"], lines).join("\n") + "\n";
  if (sink) {
    fs.writeFileSync(sink, out);
    // Counts only on stdout: the rows carry private commands.
    process.stdout.write(head.concat([summary], counts, ["report: " + path.relative(REPO, sink)]).join("\n") + "\n");
  } else {
    process.stdout.write(out);
  }
  return mismatched || hookErr ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then(function (code) { process.exitCode = code; });
