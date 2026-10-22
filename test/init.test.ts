import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { git, projectFiles, runFaber, tempRepo } from "./faber.ts";

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

test("a second faber init prints only kept lines and leaves every file byte-identical", (t) => {
  const repo = tempRepo(t);
  assert.equal(runFaber(repo, "init").status, 0);
  const before = projectFiles.map((path) => readFileSync(join(repo, path)));
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    ...projectFiles.map((path) => `kept ${path}`),
    "next: fill spec/vision.md and .agents/coding-standards.md, then commit",
  ]);
  projectFiles.forEach((path, i) => {
    assert.ok(readFileSync(join(repo, path)).equals(before[i] ?? Buffer.alloc(0)), `${path} is byte-identical`);
  });
});

test("faber init creates .gitignore holding .scratch/ when it is missing", (t) => {
  const repo = tempRepo(t);
  assert.equal(runFaber(repo, "init").status, 0);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), ".scratch/\n");
});

test("faber init appends .scratch/ to a .gitignore without it and keeps what was there", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, ".gitignore"), "node_modules/\ndist/");
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("appended .scratch/ to .gitignore\n"), result.stdout);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), "node_modules/\ndist/\n.scratch/\n");
});

test("faber init leaves .scratch/ in .gitignore exactly once after repeated runs", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
  for (let run = 0; run < 3; run++) assert.equal(runFaber(repo, "init").status, 0);
  const entries = readFileSync(join(repo, ".gitignore"), "utf8")
    .split("\n")
    .filter((line) => line === ".scratch/");
  assert.equal(entries.length, 1);
});

test("faber init keeps a .gitignore that already ignores .scratch in another spelling", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, ".gitignore"), "/.scratch\n");
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("kept .gitignore\n"), result.stdout);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), "/.scratch\n");
});

test("faber init appends .scratch/ to an empty .gitignore with no blank line before it", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, ".gitignore"), "");
  assert.equal(runFaber(repo, "init").status, 0);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), ".scratch/\n");
});

test("faber init keeps a .gitignore with Windows line endings that already ignores .scratch/", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, ".gitignore"), "node_modules/\r\n.scratch/\r\n");
  const result = runFaber(repo, "init");
  assert.ok(result.stdout.includes("kept .gitignore\n"), result.stdout);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), "node_modules/\r\n.scratch/\r\n");
});

test("faber init keeps CODING_STANDARDS.md as the fallback and creates no .agents/coding-standards.md", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "CODING_STANDARDS.md"), "# Ours\n");
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("\nkept CODING_STANDARDS.md (fallback)\n"), result.stdout);
  assert.ok(!result.stdout.includes(".agents/coding-standards.md\n"), result.stdout);
  assert.ok(!existsSync(join(repo, ".agents")), "no .agents folder");
  assert.equal(readFileSync(join(repo, "CODING_STANDARDS.md"), "utf8"), "# Ours\n");
});

for (const fallback of ["GLOSSARY.md", "CONTEXT.md"]) {
  test(`faber init keeps ${fallback} as the fallback and creates no spec/glossary.md`, (t) => {
    const repo = tempRepo(t);
    writeFileSync(join(repo, fallback), "# Ours\n");
    const result = runFaber(repo, "init");
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes(`\nkept ${fallback} (fallback)\n`), result.stdout);
    assert.ok(!existsSync(join(repo, "spec/glossary.md")), "no spec/glossary.md");
    assert.ok(existsSync(join(repo, "spec/vision.md")), "spec/vision.md is still created");
  });
}

test("faber init keeps an existing home path even when a fallback exists too", (t) => {
  const repo = tempRepo(t);
  mkdirSync(join(repo, "spec"));
  writeFileSync(join(repo, "spec/glossary.md"), "# Home\n");
  writeFileSync(join(repo, "GLOSSARY.md"), "# Fallback\n");
  const result = runFaber(repo, "init");
  assert.ok(result.stdout.includes("\nkept spec/glossary.md\n"), result.stdout);
  assert.ok(!result.stdout.includes("(fallback)"), result.stdout);
});

test("faber init warns about a CLAUDE.md without @AGENTS.md and leaves it unchanged", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "CLAUDE.md"), "# Mine\n");
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("\nkept CLAUDE.md\nwarn CLAUDE.md does not import @AGENTS.md\n"), result.stdout);
  assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), "# Mine\n");
});

test("faber init does not warn about a CLAUDE.md that imports AGENTS.md", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "CLAUDE.md"), "# Mine\n\nSee @AGENTS.md for the rules.\n");
  const result = runFaber(repo, "init");
  assert.ok(result.stdout.includes("\nkept CLAUDE.md\n"), result.stdout);
  assert.ok(!result.stdout.includes("warn"), result.stdout);
});

test("faber init does not warn about a CLAUDE.md that links to AGENTS.md", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "AGENTS.md"), "# Shared\n");
  symlinkSync("AGENTS.md", join(repo, "CLAUDE.md"));
  const result = runFaber(repo, "init");
  assert.ok(result.stdout.includes("\nkept CLAUDE.md\n"), result.stdout);
  assert.ok(!result.stdout.includes("warn"), result.stdout);
});

test("faber init does not warn about a CLAUDE.md that imports ./AGENTS.md on its last line", (t) => {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "CLAUDE.md"), "# Mine\n@./AGENTS.md");
  const result = runFaber(repo, "init");
  assert.ok(result.stdout.includes("\nkept CLAUDE.md\n"), result.stdout);
  assert.ok(!result.stdout.includes("warn"), result.stdout);
});

test("faber init keeps a dangling CLAUDE.md link and warns instead of failing", (t) => {
  const repo = tempRepo(t);
  symlinkSync("missing.md", join(repo, "CLAUDE.md"));
  const result = runFaber(repo, "init");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("\nkept CLAUDE.md\nwarn CLAUDE.md does not import @AGENTS.md\n"), result.stdout);
});
