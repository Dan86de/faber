// Runs the real faber CLI as a child process in a fresh temp folder or git repo, the way a user would.
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TestContext } from "node:test";

const cli = resolve(import.meta.dirname, "../src/cli.ts");

// The project files init writes, in the order it reports them.
export const projectFiles = [
  "spec/vision.md",
  "spec/glossary.md",
  ".agents/coding-standards.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
];

export type RunResult = { status: number | null; stdout: string; stderr: string };

// Git never looks at or above the system temp folder, so a temp folder is outside any repo wherever it lives.
const ceiling = realpathSync(tmpdir());

// A temp folder outside any repo, removed when the test ends.
export function tempDir(t: TestContext): string {
  const root = mkdtempSync(join(ceiling, "faber-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// A git repo with no commits in a temp folder, removed when the test ends.
export function tempRepo(t: TestContext): string {
  const root = tempDir(t);
  const init = git(root, "init", "-q", "-b", "main");
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  return root;
}

export function runFaber(cwd: string, ...args: string[]): RunResult {
  return spawnFaber(cwd, isolatedEnv(cwd), args);
}

// Runs faber with no git on PATH; node itself is found by its absolute path.
export function runFaberWithoutGit(cwd: string, ...args: string[]): RunResult {
  return spawnFaber(cwd, { ...isolatedEnv(cwd), PATH: "" }, args);
}

function spawnFaber(cwd: string, env: NodeJS.ProcessEnv, args: string[]): RunResult {
  const child = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGKILL",
    input: "",
  });
  if (child.error) throw child.error;
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

// Runs git in a temp repo with the same isolated environment the CLI gets.
export function git(repo: string, ...args: string[]): RunResult {
  const child = spawnSync("git", args, { cwd: repo, env: isolatedEnv(repo), encoding: "utf8" });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

// Keeps the user's git config and environment away from the CLI under test.
function isolatedEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: cwd,
    LANG: "C",
    TZ: "UTC",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CEILING_DIRECTORIES: ceiling,
  };
}
