// Runs the real faber CLI as a child process in a fresh temp folder or git repo, the way a user would.
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TestContext } from "node:test";
import {
  type FakeCall,
  type FakeName,
  installFakes,
  readCalls,
  writeScript,
} from "../.agents/skills/verify/fakes/fakes.ts";

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

// The line that ends every init run that got as far as writing.
export const nextLine = "next: fill spec/vision.md and .agents/coding-standards.md, then commit";

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
  return spawnIsolated(process.execPath, [cli, ...args], cwd, isolatedEnv(cwd));
}

// The verify skill's fake `claude` and `gh`, installed in a temp folder outside any repo.
export type Fakes = {
  bin: string;
  script(name: FakeName, value: unknown): void;
  calls(name: FakeName): FakeCall[];
};

export function fakes(t: TestContext): Fakes {
  const dir = tempDir(t);
  const bin = installFakes(dir);
  return {
    bin,
    script: (name, value) => writeScript(dir, name, value),
    calls: (name) => readCalls(dir, name),
  };
}

// Runs a command found by name on PATH with the fakes first and stdin closed, the way faber starts a session.
export function runOnPath(f: Fakes, cwd: string, command: string, args: string[], timeout = 10_000): RunResult {
  const child = spawnSync(command, args, {
    cwd,
    env: withFakes(f, isolatedEnv(cwd)),
    encoding: "utf8",
    timeout,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.error && !child.signal) throw child.error;
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

// Runs faber with the fakes first on PATH, so any session or PR read it starts reaches a fake.
export function runFaberWithFakes(f: Fakes, cwd: string, ...args: string[]): RunResult {
  return spawnIsolated(process.execPath, [cli, ...args], cwd, withFakes(f, isolatedEnv(cwd)));
}

function withFakes(f: Fakes, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, PATH: `${f.bin}:${env.PATH}` };
}

// Runs faber with no git on PATH; node itself is found by its absolute path.
export function runFaberWithoutGit(cwd: string, ...args: string[]): RunResult {
  return spawnIsolated(process.execPath, [cli, ...args], cwd, { ...isolatedEnv(cwd), PATH: "" });
}

// Runs an installed faber executable, such as `node_modules/.bin/faber`, with the same isolation.
export function runInstalledFaber(bin: string, cwd: string, ...args: string[]): RunResult {
  return spawnIsolated(bin, args, cwd, isolatedEnv(cwd));
}

function spawnIsolated(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): RunResult {
  const child = spawnSync(command, args, {
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

// Commits every file in the repo, as setup before faber runs.
export function commitAll(repo: string, message: string): void {
  for (const args of [
    ["add", "-A"],
    ["commit", "-q", "-m", message],
  ]) {
    const result = git(repo, ...args);
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

// A bare repo in its own temp folder as the repo's origin, with every branch pushed; returns its path.
export function bareRemote(t: TestContext, repo: string): string {
  const bare = join(tempDir(t), "origin.git");
  for (const [cwd, args] of [
    [repo, ["init", "-q", "--bare", bare]],
    [repo, ["remote", "add", "origin", bare]],
    [repo, ["push", "-q", "-u", "origin", "--all"]],
  ] as const) {
    const result = git(cwd, ...args);
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return bare;
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
    GIT_AUTHOR_NAME: "Faber Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Faber Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
}
