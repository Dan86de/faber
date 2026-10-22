import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { git, runFaber, tempRepo } from "./faber.ts";

const projectFiles = [
  "spec/vision.md",
  "spec/glossary.md",
  ".agents/coding-standards.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
];

test("faber init in an empty repo creates every project file and ends with the next line", (t) => {
  const repo = tempRepo(t);
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    ...projectFiles.map((path) => `created ${path}`),
    "next: fill spec/vision.md and .agents/coding-standards.md, then commit",
  ]);
  for (const path of projectFiles) assert.ok(existsSync(join(repo, path)), `${path} exists`);
});

test("faber init stages and commits nothing", (t) => {
  const repo = tempRepo(t);
  assert.equal(runFaber(repo, "init").status, 0);
  for (const path of projectFiles) assert.ok(existsSync(join(repo, path)), `${path} exists`);
  assert.equal(git(repo, "diff", "--cached", "--name-only").stdout, "", "nothing staged");
  assert.notEqual(git(repo, "rev-parse", "--verify", "HEAD").status, 0, "still no commits");
});
