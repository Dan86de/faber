import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bareRemote, commitAll, fakes, git, runFaberWithFakes, tempDir, tempRepo } from "./faber.ts";

// Writes `text` at `path` in `repo`, making its folders.
function put(repo: string, path: string, text: string): void {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), text);
}

// What a refused run must leave as it found it: the files git sees, the branches and HEAD.
function state(repo: string): string {
  return ["status --porcelain --untracked-files=all", "branch --all", "rev-parse HEAD"]
    .map((command) => git(repo, ...command.split(" ")).stdout)
    .join("---\n");
}

test("faber run with no slug prints its usage and exits 1", (t) => {
  const f = fakes(t);
  const result = runFaberWithFakes(f, tempRepo(t), "run");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "usage: faber run <slug>\n");
  assert.equal(f.calls("claude").length, 0);
});

test("faber run refuses a slug that is not a folder name", (t) => {
  const f = fakes(t);
  const result = runFaberWithFakes(f, tempRepo(t), "run", "../up");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^faber: "\.\.\/up" is not a feature slug/);
  assert.equal(f.calls("claude").length, 0);
});

test("faber run outside a git repo says so and starts no session", (t) => {
  const f = fakes(t);
  const dir = tempDir(t);
  const result = runFaberWithFakes(f, dir, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "faber: not inside a git repo; run faber run demo in a git work tree\n");
  assert.equal(f.calls("claude").length, 0);
});

test("faber run with a dirty tree lists the dirty paths and starts no session", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  put(repo, "README.md", "demo\n");
  commitAll(repo, "Set up");
  bareRemote(t, repo);
  put(repo, "README.md", "changed\n");
  put(repo, "notes/new.md", "new\n");
  git(repo, "mv", "spec/features/demo/decisions.md", "spec/features/demo/moved.md");
  const before = state(repo);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    [
      "faber: the work tree has uncommitted changes; commit or stash them, then run again:",
      "  README.md",
      "  spec/features/demo/moved.md",
      "  notes/new.md",
      "",
    ].join("\n"),
  );
  assert.equal(state(repo), before);
  assert.equal(f.calls("claude").length, 0);
});

test("faber run with no committed decision record on the default branch says so", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, "README.md", "demo\n");
  commitAll(repo, "Set up");
  bareRemote(t, repo);
  // A record committed only on another branch does not count.
  git(repo, "switch", "-q", "-c", "elsewhere");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record elsewhere");
  const before = state(repo);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "faber: spec/features/demo/decisions.md is not committed on main; commit the decision record there first\n",
  );
  assert.equal(state(repo), before);
  assert.equal(f.calls("claude").length, 0);
});

test("faber run in a repo with no commits finds no default branch", (t) => {
  const f = fakes(t);
  const result = runFaberWithFakes(f, tempRepo(t), "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not committed on the default branch;/);
  assert.equal(f.calls("claude").length, 0);
});

// A repo whose default branch holds the decision record and ignores `.scratch/`, pushed to a bare origin.
function readyRepo(t: Parameters<typeof tempRepo>[0]) {
  const repo = tempRepo(t);
  put(repo, ".gitignore", ".scratch/\n");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record the decisions");
  return { repo, bare: bareRemote(t, repo) };
}

const runFolder = /^\.scratch\/faber\/demo\/\d{8}-\d{6}\/$/;

test("faber run reads the default branch origin names", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, ".gitignore", ".scratch/\n");
  commitAll(repo, "Set up");
  git(repo, "switch", "-q", "-c", "trunk");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record the decisions");
  bareRemote(t, repo);
  git(repo, "remote", "set-head", "origin", "trunk");
  git(repo, "switch", "-q", "main");
  f.script("claude", [{ exit: 1, message: "No." }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /\ncreated slices\/demo from trunk\n/);
  assert.equal(git(repo, "rev-parse", "slices/demo").stdout, git(repo, "rev-parse", "trunk").stdout);
});

test("faber run does not count ignored files as dirty", (t) => {
  const f = fakes(t);
  const { repo } = readyRepo(t);
  put(repo, ".scratch/faber/demo/old/run.log", "earlier run\n");
  f.script("claude", [{ exit: 1 }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.stderr, "");
  assert.match(result.stdout.split("\n")[0] as string, runFolder);
});

test("faber run refuses when git does not ignore its run folder", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record the decisions");
  bareRemote(t, repo);
  const before = state(repo);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "faber: .scratch/faber/demo/ is not ignored by git; add .scratch/ to .gitignore (faber init does), then commit\n",
  );
  assert.equal(state(repo), before);
  assert.equal(f.calls("claude").length, 0);
});

test("faber run writes the spec in a session, then commits and pushes only spec.md", (t) => {
  const f = fakes(t);
  const { repo, bare } = readyRepo(t);
  f.script("claude", [{ write: { "spec/features/demo/spec.md": "# Spec\n" }, tools: 2, message: "Wrote it." }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  const lines = result.stdout.split("\n");
  const folder = lines[0] as string;
  assert.match(folder, runFolder);
  assert.deepEqual(lines.slice(1), [
    "created slices/demo from main",
    "write-spec: started",
    "write-spec: ended, exit 0, 2 tool calls",
    "committed spec/features/demo/spec.md",
    "pushed slices/demo",
    "stopped: write-slices is not built yet",
    "",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");

  const [call, ...more] = f.calls("claude");
  assert.equal(more.length, 0);
  assert.deepEqual(call?.argv, [
    "-p",
    "/write-spec spec/features/demo/decisions.md",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "auto",
  ]);
  assert.equal(call?.stdin, "closed");
  assert.equal(call?.cwd, realpathSync(repo));

  assert.equal(git(repo, "branch", "--show-current").stdout, "slices/demo\n");
  assert.equal(git(repo, "log", "-1", "--format=%s").stdout, "Write the spec for demo\n");
  assert.equal(git(repo, "show", "--name-only", "--format=", "HEAD").stdout, "spec/features/demo/spec.md\n");
  assert.equal(git(bare, "rev-parse", "slices/demo").stdout, git(repo, "rev-parse", "HEAD").stdout);
  assert.equal(git(repo, "status", "--porcelain").stdout, "");

  assert.equal(readFileSync(join(repo, folder, "run.log"), "utf8"), result.stdout);
  const transcript = readFileSync(join(repo, folder, "write-spec.jsonl"), "utf8")
    .trim()
    .split("\n");
  assert.equal(JSON.parse(transcript[0] as string).type, "system");
  assert.equal(JSON.parse(transcript.at(-1) as string).type, "result");
  assert.deepEqual(readdirSync(join(repo, folder)).sort(), ["run.log", "write-spec.jsonl"]);
});

test("faber run switches to an existing slices branch and skips a committed spec", (t) => {
  const f = fakes(t);
  const { repo } = readyRepo(t);
  git(repo, "switch", "-q", "-c", "slices/demo");
  put(repo, "spec/features/demo/spec.md", "# Spec\n");
  commitAll(repo, "Write the spec for demo");
  git(repo, "switch", "-q", "main");
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.deepEqual(result.stdout.split("\n").slice(1), [
    "on slices/demo",
    "stopped: write-slices is not built yet",
    "",
  ]);
  assert.equal(f.calls("claude").length, 0);
  assert.equal(git(repo, "branch", "--show-current").stdout, "slices/demo\n");
});

test("faber run stops when write-spec fails, and commits nothing", (t) => {
  const f = fakes(t);
  const { repo } = readyRepo(t);
  f.script("claude", [{ write: { "spec/features/demo/spec.md": "half\n" }, exit: 3, message: "Gave up." }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\n\| Gave up\.\nstopped: write-spec exited 3\n$/);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, git(repo, "rev-parse", "main").stdout);
  assert.equal(git(repo, "status", "--porcelain").stdout, "?? spec/features/demo/spec.md\n");
});

// Runs one scripted write-spec session in a ready repo and returns the run and the commit it started from.
function stopsAfter(t: Parameters<typeof tempRepo>[0], session: Record<string, unknown>) {
  const f = fakes(t);
  const { repo } = readyRepo(t);
  const before = git(repo, "rev-parse", "HEAD").stdout;
  f.script("claude", [{ message: "Last words.", ...session }]);
  return { repo, before, result: runFaberWithFakes(f, repo, "run", "demo") };
}

test("faber run stops when write-spec writes nothing", (t) => {
  const { repo, before, result } = stopsAfter(t, {});
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\n\| Last words\.\nstopped: write-spec wrote nothing\n$/);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
});

test("faber run stops when write-spec touches another path, and leaves the tree", (t) => {
  const write = { "spec/features/demo/spec.md": "# Spec\n", "notes.md": "stray\n" };
  const { repo, before, result } = stopsAfter(t, { write });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: write-spec touched notes\.md\n$/);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
  assert.equal(
    git(repo, "status", "--porcelain", "--untracked-files=all").stdout,
    "?? notes.md\n?? spec/features/demo/spec.md\n",
  );
});

test("faber run stops when write-spec commits on its own", (t) => {
  const write = { "spec/features/demo/spec.md": "# Spec\n" };
  const { repo, before, result } = stopsAfter(t, { write, commit: { message: "Sneak it in" } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: write-spec committed on its own\n$/);
  assert.notEqual(git(repo, "rev-parse", "HEAD").stdout, before);
});

test("faber run stops at the push when the repo has no remote, keeping the spec commit", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, ".gitignore", ".scratch/\n");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record the decisions");
  f.script("claude", [{ write: { "spec/features/demo/spec.md": "# Spec\n" } }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  const lines = result.stdout.trimEnd().split("\n");
  assert.ok(lines.includes("committed spec/features/demo/spec.md"));
  assert.match(lines.at(-1) as string, /^stopped: git push failed: fatal: /);
  assert.equal(lines.filter((line) => line.startsWith("stopped: ")).length, 1);
  assert.equal(git(repo, "log", "-1", "--format=%s").stdout, "Write the spec for demo\n");
});
