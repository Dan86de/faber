import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { nextLine, projectFiles, runInstalledFaber, tempDir, tempRepo } from "./faber.ts";

const repoRoot = resolve(import.meta.dirname, "..");

// Runs npm with its cache and config kept in the scratch folder, away from the user's.
function npm(cwd: string, scratch: string, ...args: string[]) {
  const child = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      PATH: process.env.PATH,
      HOME: scratch,
      npm_config_cache: join(scratch, ".npm"),
      npm_config_update_notifier: "false",
    },
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return child;
}

test("faber installed from a packed tarball runs init from node_modules", (t) => {
  const scratch = tempDir(t);
  const [{ filename, files }] = JSON.parse(
    npm(repoRoot, scratch, "pack", "--json", "--pack-destination", scratch).stdout,
  ) as [{ filename: string; files: { path: string }[] }];

  const paths = files.map((file) => file.path);
  for (const path of ["dist/cli.js", "templates/gitignore", "README.md", "LICENSE", "package.json"]) {
    assert.ok(paths.includes(path), `the tarball holds ${path}`);
  }
  assert.deepEqual(
    paths.filter((path) => path.endsWith(".ts")),
    [],
    "the tarball holds no TypeScript sources",
  );

  // npm publish rewrites a package.json it finds invalid, such as a bin path it rejects, and npm pack does not.
  // A throwaway prerelease of the unpacked tarball, offline and with scripts skipped, keeps the registry out of it.
  const unpacked = join(scratch, "unpacked");
  mkdirSync(unpacked);
  const untar = spawnSync("tar", ["-xzf", join(scratch, filename), "-C", unpacked], { encoding: "utf8" });
  assert.equal(untar.status, 0, untar.stderr);
  const pkg = join(unpacked, "package");
  npm(pkg, scratch, "pkg", "set", "version=0.0.0-publish-check");
  const publish = npm(pkg, scratch, "publish", "--dry-run", "--ignore-scripts", "--offline", "--tag", "publish-check");
  assert.ok(!publish.stderr.includes("auto-corrected"), publish.stderr);

  const app = join(scratch, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), '{ "private": true }\n');
  npm(app, scratch, "install", "--no-audit", "--no-fund", "--offline", join(scratch, filename));

  const repo = tempRepo(t);
  const result = runInstalledFaber(join(app, "node_modules", ".bin", "faber"), repo, "init");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [...projectFiles.map((path) => `created ${path}`), nextLine]);
  for (const path of projectFiles) assert.ok(existsSync(join(repo, path)), `${path} exists`);
});
