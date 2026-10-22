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
  f.script("claude", [
    { write: { "spec/features/demo/spec.md": "# Spec\n" }, tools: 2, message: "Wrote it." },
    { write: { "spec/features/demo/slices.json": "{}\n" }, tools: 1, message: "Cut it." },
  ]);
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
    "write-slices: started",
    "write-slices: ended, exit 0, 1 tool call",
    "committed spec/features/demo/slices.json",
    "pushed slices/demo",
    "stopped: spec/features/demo/slices.json lists no slices",
    "",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");

  const flags = ["--output-format", "stream-json", "--verbose", "--permission-mode", "auto"];
  const calls = f.calls("claude");
  assert.deepEqual(
    calls.map((call) => call.argv),
    [
      ["-p", "/write-spec spec/features/demo/decisions.md", ...flags],
      ["-p", "/write-slices spec/features/demo/spec.md", ...flags],
    ],
  );
  for (const call of calls) {
    assert.equal(call.stdin, "closed");
    assert.equal(call.cwd, realpathSync(repo));
  }

  assert.equal(git(repo, "branch", "--show-current").stdout, "slices/demo\n");
  assert.equal(
    git(repo, "log", "--format=%s", "--name-only", "main..HEAD").stdout,
    "Cut demo into slices\n\nspec/features/demo/slices.json\nWrite the spec for demo\n\nspec/features/demo/spec.md\n",
  );
  assert.equal(git(bare, "rev-parse", "slices/demo").stdout, git(repo, "rev-parse", "HEAD").stdout);
  assert.equal(git(repo, "status", "--porcelain").stdout, "");

  assert.equal(readFileSync(join(repo, folder, "run.log"), "utf8"), result.stdout);
  const transcript = readFileSync(join(repo, folder, "write-spec.jsonl"), "utf8")
    .trim()
    .split("\n");
  assert.equal(JSON.parse(transcript[0] as string).type, "system");
  assert.equal(JSON.parse(transcript.at(-1) as string).type, "result");
  assert.deepEqual(readdirSync(join(repo, folder)).sort(), ["run.log", "write-slices.jsonl", "write-spec.jsonl"]);
});

test("faber run switches to an existing slices branch and skips committed planning files", (t) => {
  const f = fakes(t);
  const { repo } = readyRepo(t);
  git(repo, "switch", "-q", "-c", "slices/demo");
  put(repo, "spec/features/demo/spec.md", "# Spec\n");
  commitAll(repo, "Write the spec for demo");
  put(repo, "spec/features/demo/slices.json", "{}\n");
  commitAll(repo, "Cut demo into slices");
  git(repo, "switch", "-q", "main");
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.deepEqual(result.stdout.split("\n").slice(1), [
    "on slices/demo",
    "stopped: spec/features/demo/slices.json lists no slices",
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

// Runs one scripted session in the repo `setup` makes, a ready repo by default, and returns the run and the commit
// it started from.
function stopsAfter(t: Parameters<typeof tempRepo>[0], session: Record<string, unknown>, setup = readyRepo) {
  const f = fakes(t);
  const { repo } = setup(t);
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

// A ready repo whose default branch also holds the spec, so the next run starts at write-slices.
function specRepo(t: Parameters<typeof tempRepo>[0]) {
  const ready = readyRepo(t);
  put(ready.repo, "spec/features/demo/spec.md", "# Spec\n");
  commitAll(ready.repo, "Write the spec for demo");
  git(ready.repo, "push", "-q", "origin", "main");
  return ready;
}

test("faber run cuts the slices from a committed spec, then commits and pushes only slices.json", (t) => {
  const f = fakes(t);
  const { repo, bare } = specRepo(t);
  const before = git(repo, "rev-parse", "HEAD").stdout;
  f.script("claude", [{ write: { "spec/features/demo/slices.json": "{}\n" }, tools: 3 }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout.split("\n").slice(1), [
    "created slices/demo from main",
    "write-slices: started",
    "write-slices: ended, exit 0, 3 tool calls",
    "committed spec/features/demo/slices.json",
    "pushed slices/demo",
    "stopped: spec/features/demo/slices.json lists no slices",
    "",
  ]);
  assert.deepEqual(
    f.calls("claude").map((call) => call.argv[1]),
    ["/write-slices spec/features/demo/spec.md"],
  );
  assert.equal(git(repo, "rev-parse", "HEAD~1").stdout, before);
  assert.equal(git(repo, "log", "-1", "--format=%s").stdout, "Cut demo into slices\n");
  assert.equal(git(repo, "show", "--name-only", "--format=", "HEAD").stdout, "spec/features/demo/slices.json\n");
  assert.equal(git(bare, "rev-parse", "slices/demo").stdout, git(repo, "rev-parse", "HEAD").stdout);
});

// Runs one scripted write-slices session after a committed spec, with a two-line last message.
function slicesStopAfter(t: Parameters<typeof tempRepo>[0], session: Record<string, unknown>) {
  return stopsAfter(t, { message: "Last words.\nSecond line.", ...session }, specRepo);
}

test("faber run stops when write-slices touches another path, and leaves the tree", (t) => {
  const write = { "spec/features/demo/slices.json": "{}\n", "spec/features/demo/spec.md": "# Changed\n" };
  const { repo, before, result } = slicesStopAfter(t, { write });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /\n\| Last words\.\n\| Second line\.\nstopped: write-slices touched spec\/features\/demo\/spec\.md\n$/,
  );
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
  assert.equal(
    git(repo, "status", "--porcelain", "--untracked-files=all").stdout,
    " M spec/features/demo/spec.md\n?? spec/features/demo/slices.json\n",
  );
});

test("faber run stops when write-slices writes nothing", (t) => {
  const { repo, before, result } = slicesStopAfter(t, {});
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\n\| Second line\.\nstopped: write-slices wrote nothing\n$/);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
  assert.equal(git(repo, "status", "--porcelain", "--untracked-files=all").stdout, "");
});

test("faber run stops when write-slices exits non-zero, with one status line", (t) => {
  const { repo, before, result } = slicesStopAfter(t, { exit: 2 });
  assert.equal(result.status, 1);
  const lines = result.stdout.trimEnd().split("\n");
  assert.deepEqual(lines.slice(-3), ["| Last words.", "| Second line.", "stopped: write-slices exited 2"]);
  assert.equal(lines.filter((line) => line.startsWith("stopped: ")).length, 1);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
});

test("faber run stops when write-slices commits on its own", (t) => {
  const write = { "spec/features/demo/slices.json": "{}\n" };
  const { repo, before, result } = slicesStopAfter(t, { write, commit: { message: "Sneak it in" } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: write-slices committed on its own\n$/);
  assert.notEqual(git(repo, "rev-parse", "HEAD").stdout, before);
});

// Three slices: S2 waits for S1, S10 for nothing, so the run builds S1, S2, then S10.
const threeSlices = JSON.stringify({
  slices: [
    { id: "S1", blocked_by: [] },
    { id: "S2", blocked_by: ["S1"] },
    { id: "S10", blocked_by: [] },
  ],
});

// A ready repo on `slices/demo` with the spec and `slices` committed, pushed, so the next run builds slices.
function builtRepo(t: Parameters<typeof tempRepo>[0], slices = threeSlices) {
  const ready = readyRepo(t);
  git(ready.repo, "switch", "-q", "-c", "slices/demo");
  put(ready.repo, "spec/features/demo/spec.md", "# Spec\n");
  commitAll(ready.repo, "Write the spec for demo");
  put(ready.repo, "spec/features/demo/slices.json", `${slices}\n`);
  commitAll(ready.repo, "Cut demo into slices");
  git(ready.repo, "push", "-q", "-u", "origin", "slices/demo");
  return ready;
}

// A fake implement-slice session that builds `id` and commits it with `trailer`.
function builds(id: string, trailer = `Slice: ${id}`) {
  return { write: { [`${id}.txt`]: `${id}\n` }, commit: { message: `Build ${id}`, trailers: [trailer] }, tools: 1 };
}

test("faber run builds each ready slice in its own session while a Slice trailer lands", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [builds("S1"), builds("S2"), builds("S10")]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.stderr, "");
  const lines = result.stdout.split("\n");
  const folder = lines[0] as string;
  assert.deepEqual(lines.slice(1), [
    "on slices/demo",
    "S1: started",
    "S1: ended, exit 0, 1 tool call",
    "S2: started",
    "S2: ended, exit 0, 1 tool call",
    "S10: started",
    "S10: ended, exit 0, 1 tool call",
    "stopped: closing the branch is not built yet",
    "",
  ]);
  assert.equal(result.status, 1);
  const calls = f.calls("claude");
  assert.deepEqual(
    calls.map((call) => call.argv[1]),
    ["S1", "S2", "S10"].map((id) => `/implement-slice spec/features/demo/slices.json ${id}`),
  );
  for (const call of calls) assert.equal(call.stdin, "closed");
  assert.equal(git(repo, "log", "--format=%s", "-3").stdout, "Build S10\nBuild S2\nBuild S1\n");
  assert.deepEqual(readdirSync(join(repo, folder)).sort(), ["S1.jsonl", "S10.jsonl", "S2.jsonl", "run.log"]);
  assert.equal(readFileSync(join(repo, folder, "run.log"), "utf8"), result.stdout);
});

test("faber run stops when a slice session adds no trailer, and starts no other slice", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  const before = git(repo, "rev-parse", "HEAD").stdout;
  f.script("claude", [{ write: { "half.txt": "half\n" }, message: "The gate failed.\nLeft the diff." }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  const lines = result.stdout.trimEnd().split("\n");
  assert.deepEqual(lines.slice(-3), ["| The gate failed.", "| Left the diff.", "stopped: S1 committed nothing"]);
  assert.equal(lines.filter((line) => line.startsWith("stopped: ")).length, 1);
  assert.equal(f.calls("claude").length, 1);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, before);
  assert.equal(git(repo, "status", "--porcelain").stdout, "?? half.txt\n");
});

test("faber run counts a commit with no Slice trailer as committing nothing", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [{ ...builds("S1"), commit: { message: "Untagged" } }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: S1 committed nothing\n$/);
  assert.equal(git(repo, "log", "-1", "--format=%s").stdout, "Untagged\n");
});

test("faber run counts only the trailer for the slice it started", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [builds("S10")]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: S1 committed nothing\n$/);
});

test("faber run starts at the lowest ready slice the branch's trailers leave", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  put(repo, "S1.txt", "S1\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "Build S1\n\nSlice: S1");
  f.script("claude", [{}]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.match(result.stdout, /\nS2: started\n/);
  assert.match(result.stdout, /\nstopped: S2 committed nothing\n$/);
  assert.deepEqual(
    f.calls("claude").map((call) => call.argv[1]),
    ["/implement-slice spec/features/demo/slices.json S2"],
  );
});

test("faber run stops when a slice session exits non-zero", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [{ ...builds("S1"), exit: 2, message: "Crashed." }]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\n\| Crashed\.\nstopped: S1 exited 2\n$/);
  assert.equal(f.calls("claude").length, 1);
});

test("faber run goes on past a slice that waits for sign-off with what does not depend on it", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [builds("S1", "Slice-Pending: S1"), builds("S10")]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout.split("\n").slice(2), [
    "S1: started",
    "S1: ended, exit 0, 1 tool call",
    "S10: started",
    "S10: ended, exit 0, 1 tool call",
    "stopped: S1 waits for sign-off",
    "",
  ]);
  assert.equal(result.status, 1);
  assert.deepEqual(
    f.calls("claude").map((call) => call.argv[1]),
    ["S1", "S10"].map((id) => `/implement-slice spec/features/demo/slices.json ${id}`),
  );
});

test("faber run ends listing every slice the run left waiting for sign-off", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [builds("S1", "Slice-Pending: S1"), builds("S10", "Slice-Pending: S10")]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nS10: ended, exit 0, 1 tool call\nstopped: S1, S10 wait for sign-off\n$/);
  assert.equal(f.calls("claude").length, 2);
});

test("faber run counts a sign-off trailer for another slice as committing nothing", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  f.script("claude", [builds("S1", "Slice-Pending: S10")]);
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: S1 committed nothing\n$/);
  assert.equal(f.calls("claude").length, 1);
});

test("faber run stops on a slices file it cannot build from, and starts no session", (t) => {
  for (const [slices, problem] of [
    ["not json", "is not JSON"],
    ['{"slices": []}', "lists no slices"],
    ['{"slices": [{"title": "x"}]}', "has a slice with no id, at index 0"],
    ['{"slices": [{"id": "S1", "blocked_by": "S0"}]}', "has a blocked_by in S1 that is not a list of ids"],
    ['{"slices": [{"id": "S1"}, {"id": "S1"}]}', "lists S1 twice"],
    ['{"slices": [{"id": "../S1"}]}', "has a slice id that is not letters, digits and dashes: \\.\\./S1"],
  ]) {
    const f = fakes(t);
    const { repo } = builtRepo(t, slices);
    const result = runFaberWithFakes(f, repo, "run", "demo");
    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(`\\nstopped: spec/features/demo/slices\\.json ${problem}\\n$`));
    assert.equal(f.calls("claude").length, 0);
  }
});

test("faber run stops when no slice is ready, naming what each waits for", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t, JSON.stringify({ slices: [{ id: "S1", blocked_by: ["S9"] }] }));
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\n\| S1 waits for S9\nstopped: no slice is ready\n$/);
  assert.equal(f.calls("claude").length, 0);
});

test("faber run ends listing the slices already waiting for sign-off when nothing else is ready", (t) => {
  const f = fakes(t);
  const { repo } = builtRepo(t);
  for (const [id, trailer] of [
    ["S1", "Slice: S1"],
    ["S2", "Slice-Pending: S2"],
    ["S10", "Slice-Pending: S10"],
  ]) {
    put(repo, `${id}.txt`, `${id}\n`);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", `Build ${id}\n\n${trailer}`);
  }
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\nstopped: S2, S10 wait for sign-off\n$/);
  assert.equal(f.calls("claude").length, 0);
});
