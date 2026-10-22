#!/usr/bin/env node
// Verify helper: runs the faber CLI inside throwaway repos in one run folder,
// with its own home and git config, and logs every call to the run's transcript.log.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type FakeName, fakeNames, installFakes, readCalls, writeScript } from "./fakes/fakes.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const runsRoot = join(repo, ".scratch", "verify");
const cli = join(repo, "src", "cli.ts");
const timeoutMs = 10_000;
const repoName = /^[a-z0-9][a-z0-9-]*$/;

const [command, runArg, ...rest] = process.argv.slice(2);
const usage = `usage:
  verify.ts start
  verify.ts doctor <run>
  verify.ts repo <run> <name> [--no-git]
  verify.ts mkdir <run> <name>/<folder>
  verify.ts write <run> <name>/<file> <text>
  verify.ts faber <run> <name>[/<folder>] [faber args...]
  verify.ts show <run> <name>[/<file>]
  verify.ts commit <run> <name> <message>
  verify.ts remote <run> <name>
  verify.ts script <run> <claude|gh> <json>
  verify.ts call <run> <name>[/<folder>] <claude|gh> [args...]
  verify.ts calls <run> <claude|gh>
  verify.ts stop <run>`;

type Paths = {
  run: string;
  repos: string;
  home: string;
  fakes: string;
  remotes: string;
  state: string;
  transcript: string;
  evidence: string;
  stopped: string;
};

type CodeState = { head: string; branch: string; dirty: boolean; hash: string; status: string };
type RunState = CodeState & { started: string; node: string; pids: number[] };

function quote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

function git(...args: string[]): string {
  return spawnSync("git", args, { cwd: repo, encoding: "utf8" }).stdout.trim();
}

// The build a run proves: the commit plus any uncommitted change to what faber runs.
// `status` covers the rest of the checkout, so a faber run that leaked into it shows up.
function codeState(): CodeState {
  const head = git("rev-parse", "HEAD");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const status = git("status", "--porcelain", "--untracked-files=all");
  const diff = spawnSync(
    "sh",
    [
      "-c",
      "git diff HEAD -- src templates package.json; git ls-files -o --exclude-standard -z -- src templates | xargs -0 cat 2>/dev/null",
    ],
    { cwd: repo, encoding: "utf8" },
  ).stdout;
  const hash = createHash("sha256").update(diff).digest("hex");
  return { head, branch, dirty: status !== "", hash, status };
}

function paths(run: string): Paths {
  return {
    run,
    repos: join(run, "repos"),
    home: join(run, "home"),
    fakes: join(run, "fakes"),
    remotes: join(run, "remotes"),
    state: join(run, "run.json"),
    transcript: join(run, "transcript.log"),
    evidence: join(run, "evidence.md"),
    stopped: join(run, "stopped"),
  };
}

// Every call after start goes through here: it must name a run folder this helper created.
function openRun(arg: string | undefined): Paths {
  if (!arg) fail("refused: name the run folder printed by `start`");
  const run = resolve(arg);
  if (!run.startsWith(runsRoot + sep) || relative(runsRoot, run).includes(sep)) {
    fail(`refused: ${run} is not a run folder under ${runsRoot}`);
  }
  const p = paths(run);
  if (!existsSync(p.state)) fail(`refused: ${run} was not started by this helper (no run.json)`);
  logTo = p.transcript;
  return p;
}

function readState(p: Paths): RunState {
  return JSON.parse(readFileSync(p.state, "utf8"));
}

function writeState(p: Paths, state: RunState): void {
  writeFileSync(p.state, JSON.stringify(state, null, 2));
}

// Resolves `<name>[/<path>]` to a path inside one of this run's repos, refusing anything outside.
function target(p: Paths, arg: string | undefined): { name: string; root: string; path: string; rel: string } {
  if (!arg) fail("refused: name a repo made by `repo`, like `empty` or `empty/sub`");
  if (isAbsolute(arg)) fail(`refused: ${arg} is absolute; name it as <repo>/<path>`);
  const rel = normalize(arg);
  if (rel.startsWith("..")) fail(`refused: ${arg} leaves this run's repos`);
  const [name, ...parts] = rel.split(sep);
  if (name === undefined || !repoName.test(name)) fail(`refused: ${arg} does not start with a repo name`);
  const root = join(p.repos, name);
  if (!existsSync(root)) fail(`refused: no repo named ${name} in this run; make it with \`repo\``);
  return { name, root, path: join(root, ...parts), rel: parts.join("/") };
}

let logTo: string | null = null;
const logLines: string[] = [];

function out(line: string, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${line}\n`);
  logLines.push(line);
}

function flush(code: number): void {
  if (!logTo) return;
  const call = [".agents/skills/verify/verify.ts", ...process.argv.slice(2)].map(quote).join(" ");
  appendFileSync(logTo, `$ ${call}\n${logLines.join("\n")}${logLines.length ? "\n" : ""}[exit ${code}]\n\n`);
}

function fail(message: string): never {
  out(message, process.stderr);
  flush(2);
  process.exit(2);
}

function done(code = 0): never {
  flush(code);
  process.exit(code);
}

// Only what faber and git need, with the run's fake `claude` and `gh` first on PATH. The ceiling stops git
// from finding faber's own checkout above the run's repos, so a folder with no `.git` is outside any repo.
function runEnv(p: Paths): NodeJS.ProcessEnv {
  return {
    PATH: `${join(p.fakes, "bin")}:${process.env.PATH}`,
    HOME: p.home,
    TZ: "UTC",
    LANG: "C",
    GIT_CEILING_DIRECTORIES: p.repos,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(p.home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
  };
}

function runGit(p: Paths, cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, env: runEnv(p), encoding: "utf8" });
}

function start(): never {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const run = join(runsRoot, `${stamp}-${randomBytes(3).toString("hex")}`);
  const p = paths(run);
  mkdirSync(p.home, { recursive: true });
  mkdirSync(p.repos, { recursive: true });
  installFakes(p.fakes);
  writeFileSync(
    join(p.home, ".gitconfig"),
    "[user]\n\tname = Verify Run\n\temail = verify@example.invalid\n[init]\n\tdefaultBranch = main\n",
  );
  const code = codeState();
  writeState(p, { started: new Date().toISOString(), node: process.version, pids: [], ...code });
  writeFileSync(
    p.evidence,
    [
      "# Verify evidence",
      "",
      `- Commit: \`${code.head}\` on \`${code.branch}\``,
      `- Uncommitted changes: ${code.dirty ? "yes" : "no"}`,
      `- Run folder: \`${relative(repo, run)}\``,
      "",
      "## Verdict",
      "",
      "TODO",
      "",
    ].join("\n"),
  );
  logTo = p.transcript;
  out(`run: ${run}`);
  out(`repos: ${p.repos}`);
  out(`commit: ${code.head} (${code.branch})${code.dirty ? ", with uncommitted changes" : ""}`);
  done(0);
}

// A pid counts only while it is still this repo's faber CLI, so a recycled pid is never touched.
function isAlive(pid: number): boolean {
  const ps = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).stdout;
  return ps.includes(cli);
}

function doctor(p: Paths): never {
  const state = readState(p);
  const now = codeState();
  const stopped = existsSync(p.stopped);
  const problems: string[] = [];
  if (stopped) problems.push("run is stopped; start a new one");
  if (now.head !== state.head || now.hash !== state.hash) {
    problems.push(
      `code changed since start (started at ${state.head.slice(0, 7)}, now ${now.head.slice(0, 7)}${now.dirty ? " with uncommitted changes" : ""}); start a new run`,
    );
  } else if (now.status !== state.status) {
    problems.push(
      "faber's own checkout changed since start; if no one edited it, a faber run wrote outside its repo, which is a fail",
    );
  }
  if (process.version !== state.node) problems.push(`node changed since start (${state.node} -> ${process.version})`);
  for (const name of fakeNames) {
    const found = which(p, name);
    if (found !== join(p.fakes, "bin", name))
      problems.push(`fake ${name} is not first on PATH (found ${found || "none"})`);
  }
  const alive = state.pids.filter(isAlive);
  if (alive.length) problems.push(`faber processes from this run still running: ${alive.join(", ")}`);
  // A stopped run starts nothing, so the probe only runs on a live one.
  if (!stopped) {
    const probe = spawnSync(process.execPath, [cli], {
      cwd: p.repos,
      env: runEnv(p),
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      input: "",
    });
    state.pids.push(probe.pid ?? 0);
    writeState(p, state);
    if (probe.status !== 0 || !probe.stdout.startsWith("usage: faber")) {
      problems.push(`CLI did not answer: exit ${probe.status}, ${JSON.stringify(probe.stdout + probe.stderr)}`);
    }
  }
  const repos = existsSync(p.repos) ? readdirSync(p.repos) : [];
  out(`run: ${p.run}`);
  out(`repos: ${repos.length ? repos.join(", ") : "none yet"}`);
  out(`code: ${now.head.slice(0, 7)} on ${now.branch}${now.dirty ? ", with uncommitted changes" : ""}`);
  out(`node: ${process.version}`);
  if (problems.length) {
    for (const problem of problems) out(`unfit: ${problem}`);
    done(1);
  }
  out("fit");
  done(0);
}

// What a command by this name resolves to on the run's PATH, the way faber would find it.
function which(p: Paths, name: string): string {
  return spawnSync("sh", ["-c", 'command -v "$1"', "sh", name], { env: runEnv(p), encoding: "utf8" }).stdout.trim();
}

function makeRepo(p: Paths, name: string | undefined, flags: string[]): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  if (!name || !repoName.test(name)) fail("refused: a repo name is lowercase letters, digits and dashes");
  const root = join(p.repos, name);
  if (existsSync(root)) fail(`refused: repo ${name} already exists in this run`);
  mkdirSync(root);
  if (flags.includes("--no-git")) {
    out(`repo: ${root} (no git)`);
    done(0);
  }
  const init = runGit(p, root, "init", "-q");
  if (init.status !== 0) fail(`git init failed: ${init.stderr.trim()}`);
  out(`repo: ${root} (git, branch main, no commits)`);
  done(0);
}

function makeFolder(p: Paths, arg: string | undefined): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, arg);
  if (!t.rel) fail("refused: name a folder inside the repo, like empty/sub");
  mkdirSync(t.path, { recursive: true });
  out(`folder: ${t.path}`);
  done(0);
}

function writeFile(p: Paths, arg: string | undefined, text: string | undefined): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, arg);
  if (!t.rel) fail("refused: name a file inside the repo, like empty/CLAUDE.md");
  if (text === undefined) fail("refused: give the file's text as one argument");
  if (t.rel === ".git" || t.rel.startsWith(".git/")) fail("refused: never write inside .git");
  mkdirSync(dirname(t.path), { recursive: true });
  writeFileSync(t.path, `${text}\n`);
  out(`wrote: ${t.path}`);
  done(0);
}

function faber(p: Paths, arg: string | undefined, args: string[]): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, arg);
  if (!existsSync(t.path) || !statSync(t.path).isDirectory())
    fail(`refused: ${t.path} is not a folder; make it with \`mkdir\``);
  const child = spawnSync(process.execPath, [cli, ...args], {
    cwd: t.path,
    env: runEnv(p),
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    input: "",
  });
  const state = readState(p);
  state.pids.push(child.pid ?? 0);
  writeState(p, state);
  out(`> cd ${relative(p.run, t.path)} && faber ${args.map(quote).join(" ")}`.trimEnd());
  echoOutput(child);
  out(`[faber exit ${child.status ?? child.signal}]`);
  done(child.status ?? 1);
}

// A child's stdout lines as they are, its stderr lines marked `[stderr] `, and any spawn error.
function echoOutput(child: { stdout: string; stderr: string; error?: Error }): void {
  for (const line of child.stdout.split("\n").slice(0, -1)) out(line);
  for (const line of child.stderr.split("\n").slice(0, -1)) out(`[stderr] ${line}`.trimEnd(), process.stderr);
  if (child.error) out(`helper: ${child.error.message}`, process.stderr);
}

function listFiles(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === ".git" && dir === root) return [];
      const full = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(root, full) : [relative(root, full).split(sep).join("/")];
    })
    .sort();
}

function show(p: Paths, arg: string | undefined): never {
  const t = target(p, arg);
  if (t.rel) {
    out(`> cat ${relative(p.run, t.path)}`);
    if (!existsSync(t.path)) {
      out("(no such file)");
      done(0);
    }
    const text = readFileSync(t.path, "utf8");
    for (const line of (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")) out(line);
    if (!text.endsWith("\n")) out("(no newline at end of file)");
    done(0);
  }
  out(`> files in ${relative(p.run, t.root)}, with sha256 (first 12) and bytes`);
  const files = listFiles(t.root);
  if (!files.length) out("(no files)");
  for (const file of files) {
    const bytes = readFileSync(join(t.root, file));
    out(`${createHash("sha256").update(bytes).digest("hex").slice(0, 12)} ${String(bytes.length).padStart(6)} ${file}`);
  }
  if (!existsSync(join(t.root, ".git"))) {
    out("> git: not a repo");
    done(0);
  }
  const commits = runGit(p, t.root, "rev-list", "--count", "--all").stdout.trim() || "0";
  out(`> git commits: ${commits}`);
  out("> git staged:");
  const staged = runGit(p, t.root, "diff", "--cached", "--name-only").stdout.trim();
  out(staged || "(nothing staged)");
  // Only a repo given a remote by `remote` has one, so older listings keep their exact lines.
  if (runGit(p, t.root, "remote").stdout.trim()) {
    out("> git remote origin:");
    const refs = runGit(p, t.root, "ls-remote", "--heads", "origin").stdout.trim();
    for (const line of refs ? refs.split("\n") : []) {
      const [sha = "", ref = ""] = line.split("\t");
      out(`${sha.slice(0, 7)} ${ref.replace("refs/heads/", "")}`);
    }
    if (!refs) out("(no branches)");
  }
  done(0);
}

function commitAll(p: Paths, name: string | undefined, message: string | undefined): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, name);
  if (t.rel) fail("refused: commit takes a repo name, not a path inside it");
  if (!existsSync(join(t.root, ".git"))) fail(`refused: ${t.name} is not a git repo`);
  if (!message) fail("refused: give the commit message as one argument");
  runGit(p, t.root, "add", "-A");
  const files = runGit(p, t.root, "diff", "--cached", "--name-only").stdout.trim();
  if (!files) fail(`refused: nothing to commit in ${t.name}`);
  const commit = runGit(p, t.root, "commit", "-q", "-m", message);
  if (commit.status !== 0) fail(`git commit failed: ${commit.stderr.trim()}`);
  const sha = runGit(p, t.root, "rev-parse", "--short", "HEAD").stdout.trim();
  const branch = runGit(p, t.root, "branch", "--show-current").stdout.trim();
  const count = files.split("\n").length;
  out(`commit: ${sha} ${message.split("\n")[0]} (${branch}, ${count} ${count === 1 ? "file" : "files"})`);
  done(0);
}

// A bare repo outside `repos/` as the repo's origin, with every branch it has pushed, like a fresh GitHub clone.
function addRemote(p: Paths, name: string | undefined): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, name);
  if (t.rel) fail("refused: remote takes a repo name, not a path inside it");
  if (!existsSync(join(t.root, ".git"))) fail(`refused: ${t.name} is not a git repo`);
  if (runGit(p, t.root, "remote").stdout.trim()) fail(`refused: ${t.name} already has a remote`);
  const bare = join(p.remotes, `${t.name}.git`);
  mkdirSync(p.remotes, { recursive: true });
  const init = runGit(p, p.remotes, "init", "-q", "--bare", bare);
  if (init.status !== 0) fail(`git init --bare failed: ${init.stderr.trim()}`);
  runGit(p, t.root, "remote", "add", "origin", bare);
  const branches = runGit(p, t.root, "branch", "--format=%(refname:short)").stdout.trim();
  if (branches) {
    const push = runGit(p, t.root, "push", "-q", "-u", "origin", "--all");
    if (push.status !== 0) fail(`git push failed: ${push.stderr.trim()}`);
  }
  out(`remote: origin -> ${bare}, pushed ${branches ? branches.split("\n").join(", ") : "nothing yet"}`);
  done(0);
}

function fakeName(arg: string | undefined): FakeName {
  const name = fakeNames.find((fake) => fake === arg);
  if (!name) fail(`refused: name a fake: ${fakeNames.join(" or ")}`);
  return name;
}

function script(p: Paths, nameArg: string | undefined, json: string | undefined): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const name = fakeName(nameArg);
  if (json === undefined) fail("refused: give the script as one JSON argument");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    fail(`refused: the script is not JSON: ${(error as Error).message}`);
  }
  try {
    writeScript(p.fakes, name, value);
  } catch (error) {
    fail(`refused: ${(error as Error).message}`);
  }
  if (name === "claude") out(`script: claude, ${(value as unknown[]).length} sessions, next is session 0`);
  else {
    const { pr } = value as { pr?: { url: string; isDraft: boolean } };
    out(`script: gh, ${pr ? `pr ${pr.url} (${pr.isDraft ? "draft" : "ready"})` : "no pr"}`);
  }
  done(0);
}

// Runs a fake by name from a repo folder, found on the run's PATH with stdin closed, the way faber starts it.
function callFake(p: Paths, arg: string | undefined, nameArg: string | undefined, args: string[]): never {
  if (existsSync(p.stopped)) fail("refused: run is stopped; start a new one");
  const t = target(p, arg);
  const name = fakeName(nameArg);
  if (!existsSync(t.path) || !statSync(t.path).isDirectory())
    fail(`refused: ${t.path} is not a folder; make it with \`mkdir\``);
  out(`> cd ${relative(p.run, t.path)} && ${[name, ...args].map(quote).join(" ")}`);
  out(`> found: ${which(p, name) || "(not on PATH)"}`);
  const child = spawnSync(name, args, {
    cwd: t.path,
    env: runEnv(p),
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  echoOutput(child);
  out(`[${name} exit ${child.status ?? child.signal}]`);
  done(child.status ?? 1);
}

function calls(p: Paths, nameArg: string | undefined): never {
  const name = fakeName(nameArg);
  const all = readCalls(p.fakes, name);
  out(`> ${name} calls: ${all.length}`);
  for (const [i, call] of all.entries()) {
    const session = call.session === null ? "" : `, session ${call.session}`;
    out(
      `${i + 1}. ${[name, ...call.argv].map(quote).join(" ")} (cwd ${relative(p.run, call.cwd)}, stdin ${call.stdin}${session})`,
    );
  }
  done(0);
}

function stop(p: Paths): never {
  const state = readState(p);
  // faber never outlives a call, so stopping kills only a straggler this run started, by pid.
  for (const pid of state.pids.filter(isAlive)) {
    process.kill(pid, "SIGTERM");
    out(`killed ${pid}`);
  }
  const alive = state.pids.filter(isAlive);
  if (alive.length) fail(`still running after SIGTERM: ${alive.join(", ")}`);
  writeFileSync(p.stopped, `${new Date().toISOString()}\n`);
  out(`stopped: ${state.pids.length} faber processes, none still running; evidence stays in ${p.run}`);
  done(0);
}

switch (command) {
  case "start":
    start();
    break;
  case "doctor":
    doctor(openRun(runArg));
    break;
  case "repo":
    makeRepo(openRun(runArg), rest[0], rest.slice(1));
    break;
  case "mkdir":
    makeFolder(openRun(runArg), rest[0]);
    break;
  case "write":
    writeFile(openRun(runArg), rest[0], rest[1]);
    break;
  case "faber":
    faber(openRun(runArg), rest[0], rest.slice(1));
    break;
  case "show":
    show(openRun(runArg), rest[0]);
    break;
  case "commit":
    commitAll(openRun(runArg), rest[0], rest[1]);
    break;
  case "remote":
    addRemote(openRun(runArg), rest[0]);
    break;
  case "script":
    script(openRun(runArg), rest[0], rest[1]);
    break;
  case "call":
    callFake(openRun(runArg), rest[0], rest[1], rest.slice(2));
    break;
  case "calls":
    calls(openRun(runArg), rest[0]);
    break;
  case "stop":
    stop(openRun(runArg));
    break;
  default:
    console.error(usage);
    process.exit(2);
}
