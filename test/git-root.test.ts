import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { git, projectFiles, runFaber, runFaberWithoutGit, tempDir, tempRepo } from "./faber.ts";

test("faber init run from a subfolder writes at the git root", (t) => {
  const repo = tempRepo(t);
  const sub = join(repo, "packages", "app");
  mkdirSync(sub, { recursive: true });
  const result = runFaber(sub, "init");
  assert.equal(result.status, 0, result.stderr);
  for (const path of projectFiles) assert.ok(existsSync(join(repo, path)), `${path} at the root`);
  assert.deepEqual(readdirSync(sub), [], "nothing in the subfolder");
});

test("faber init outside a git repo writes nothing and exits non-zero", (t) => {
  const dir = tempDir(t);
  const result = runFaber(dir, "init");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "faber: not inside a git repo; run faber init in a git work tree\n");
  assert.deepEqual(readdirSync(dir), [], "nothing written");
});

test("faber init in a bare repo writes nothing and says it has no work tree", (t) => {
  const dir = tempDir(t);
  assert.equal(git(dir, "init", "-q", "--bare").status, 0);
  const before = readdirSync(dir).sort();
  const result = runFaber(dir, "init");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "faber: inside a git repo with no work tree; run faber init in a git work tree\n");
  assert.deepEqual(readdirSync(dir).sort(), before, "nothing written");
});

test("faber init without git on PATH writes nothing and says so", (t) => {
  const dir = tempDir(t);
  const result = runFaberWithoutGit(dir, "init");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "faber: git is not installed or not on PATH; run faber init in a git work tree\n");
  assert.deepEqual(readdirSync(dir), [], "nothing written");
});
