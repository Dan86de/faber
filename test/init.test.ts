import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
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

// Runs init in a fresh repo and returns a reader for the files it created.
function initFiles(t: TestContext): (path: string) => string {
  const repo = tempRepo(t);
  assert.equal(runFaber(repo, "init").status, 0);
  return (path) => readFileSync(join(repo, path), "utf8");
}

test("faber init writes a vision with both headings, each with a hint line", (t) => {
  const vision = initFiles(t)("spec/vision.md");
  for (const heading of ["## Product principles", "## Current direction"]) {
    assert.match(vision, new RegExp(`^${heading}\\n\\n<!-- hint: .+ -->$`, "m"), `${heading} with a hint line`);
  }
});

test("faber init writes coding standards with Rules and One-way doors", (t) => {
  const standards = initFiles(t)(".agents/coding-standards.md");
  assert.match(standards, /^## Rules$/m);
  assert.match(standards, /^## One-way doors$/m);
});

test("faber init writes an AGENTS.md that points at the project files and states the planning rule", (t) => {
  const agents = initFiles(t)("AGENTS.md");
  for (const path of ["spec/vision.md", "spec/glossary.md", ".agents/coding-standards.md"]) {
    assert.ok(agents.includes(`\`${path}\``), `AGENTS.md points at ${path}`);
  }
  assert.ok(agents.includes("`spec/features/<slug>/`"), "AGENTS.md states where planning lives");
  assert.ok(agents.includes("`spec/vision.md` is the owner's"), "AGENTS.md says the vision is the owner's");
  assert.match(agents, /\n## Rules\n$/, "AGENTS.md ends with an empty ## Rules");
});

test("faber init writes a CLAUDE.md that imports AGENTS.md", (t) => {
  assert.equal(initFiles(t)("CLAUDE.md"), "@AGENTS.md\n");
});
