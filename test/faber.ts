// Runs the real faber CLI as a child process inside a fresh temp git repo, the way a user would.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { TestContext } from "node:test";

const cli = resolve(import.meta.dirname, "../src/cli.ts");

export type FaberResult = { status: number | null; stdout: string; stderr: string };

// A git repo with no commits in a temp folder, removed when the test ends.
export function tempRepo(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "faber-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const init = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root, env: isolatedEnv(root), encoding: "utf8" });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  return root;
}

export function runFaber(cwd: string, ...args: string[]): FaberResult {
  const child = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: isolatedEnv(cwd),
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGKILL",
    input: "",
  });
  if (child.error) throw child.error;
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

// Keeps the user's git config and environment away from the CLI under test.
// The ceiling stops git from finding a repo above the temp folder, wherever the system keeps temp files.
function isolatedEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: cwd,
    LANG: "C",
    TZ: "UTC",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CEILING_DIRECTORIES: dirname(cwd),
  };
}
