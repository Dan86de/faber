import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
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

test("faber run reads the default branch origin names", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, "README.md", "demo\n");
  commitAll(repo, "Set up");
  git(repo, "switch", "-q", "-c", "trunk");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Record the decisions");
  bareRemote(t, repo);
  git(repo, "remote", "set-head", "origin", "trunk");
  git(repo, "switch", "-q", "main");
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "faber: demo is ready to run, but faber cannot start its sessions yet\n");
  assert.equal(f.calls("claude").length, 0);
});

test("faber run does not count ignored files as dirty", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  put(repo, ".gitignore", ".scratch/\n");
  put(repo, "spec/features/demo/decisions.md", "# Decisions\n");
  commitAll(repo, "Set up");
  bareRemote(t, repo);
  put(repo, ".scratch/faber/demo/run.log", "earlier run\n");
  const result = runFaberWithFakes(f, repo, "run", "demo");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "faber: demo is ready to run, but faber cannot start its sessions yet\n");
  assert.equal(f.calls("claude").length, 0);
});
