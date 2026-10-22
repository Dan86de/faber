// The fake `claude` and `gh` a verify run or a test puts first on PATH, and the scripts that pick what they do.
// A fakes folder holds `bin/claude` and `bin/gh`, each fake's script, its call log and the next scripted session.
import { chmodSync, existsSync, fstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isatty } from "node:tty";

export type FakeName = "claude" | "gh";
export const fakeNames: FakeName[] = ["claude", "gh"];

// One headless session, in the order it happens: write files, commit them, push, call tools, then end or hang.
export type ClaudeSession = {
  write?: Record<string, string>;
  commit?: { message: string; trailers?: string[] };
  push?: boolean;
  tools?: number;
  denials?: number;
  message?: string;
  exit?: number;
  hang?: boolean;
};

// The pull request `gh pr view` reports for the current branch; with none, gh finds no PR.
export type GhScript = { pr?: { url: string; isDraft: boolean } };

// One recorded start of a fake: its arguments, working folder, how stdin looked, and which session it ran.
export type FakeCall = { argv: string[]; cwd: string; stdin: "closed" | "open" | "tty"; session: number | null };

const sessionKeys: string[] = [
  "write",
  "commit",
  "push",
  "tools",
  "denials",
  "message",
  "exit",
  "hang",
] satisfies (keyof ClaudeSession)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

// Returns why a claude script is wrong, or null; a script is the list of sessions the fake runs in order.
export function claudeScriptProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return "a claude script is a JSON array of sessions";
  for (const [i, session] of value.entries()) {
    const at = `session ${i}`;
    if (!isRecord(session)) return `${at} is not an object`;
    const unknown = Object.keys(session).filter((key) => !sessionKeys.includes(key));
    if (unknown.length) return `${at} has unknown keys: ${unknown.join(", ")}; known: ${sessionKeys.join(", ")}`;
    const { write, commit, push, tools, denials, message, exit, hang } = session;
    if (write !== undefined && (!isRecord(write) || !Object.values(write).every((text) => typeof text === "string")))
      return `${at}: write maps paths to text`;
    if (commit !== undefined) {
      if (!isRecord(commit) || typeof commit.message !== "string") return `${at}: commit needs a message`;
      const { trailers } = commit;
      if (trailers !== undefined && !(Array.isArray(trailers) && trailers.every((t) => /^[\w-]+: .+$/.test(t))))
        return `${at}: commit trailers are lines like "Slice: S1"`;
    }
    if (push !== undefined && typeof push !== "boolean") return `${at}: push is true or false`;
    if (hang !== undefined && typeof hang !== "boolean") return `${at}: hang is true or false`;
    if (message !== undefined && typeof message !== "string") return `${at}: message is text`;
    for (const [key, count] of Object.entries({ tools, denials, exit }))
      if (count !== undefined && !isCount(count)) return `${at}: ${key} is a whole number of 0 or more`;
  }
  return null;
}

// Returns why a gh script is wrong, or null.
export function ghScriptProblem(value: unknown): string | null {
  if (!isRecord(value)) return "a gh script is a JSON object";
  const unknown = Object.keys(value).filter((key) => key !== "pr");
  if (unknown.length) return `unknown keys: ${unknown.join(", ")}; known: pr`;
  const { pr } = value;
  if (pr !== undefined && !(isRecord(pr) && typeof pr.url === "string" && typeof pr.isDraft === "boolean"))
    return "pr needs a url and an isDraft flag";
  return null;
}

function scriptProblem(name: FakeName, value: unknown): string | null {
  return name === "claude" ? claudeScriptProblem(value) : ghScriptProblem(value);
}

export function fakeFiles(dir: string, name: FakeName) {
  return {
    script: join(dir, `${name}.json`),
    calls: join(dir, `${name}.calls.jsonl`),
    next: join(dir, `${name}.next`),
  };
}

function shellQuote(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

// Writes `bin/claude` and `bin/gh` into `dir`, each running its fake with this node; returns the bin folder.
export function installFakes(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of fakeNames) {
    const source = join(import.meta.dirname, `${name}.ts`);
    const wrapper = join(bin, name);
    writeFileSync(
      wrapper,
      `#!/bin/sh\nFAKE_DIR=${shellQuote(dir)} exec ${shellQuote(process.execPath)} ${shellQuote(source)} "$@"\n`,
    );
    chmodSync(wrapper, 0o755);
  }
  return bin;
}

// Picks what a fake does from now on; a new claude script starts again at its first session.
export function writeScript(dir: string, name: FakeName, value: unknown): void {
  const problem = scriptProblem(name, value);
  if (problem) throw new Error(problem);
  const files = fakeFiles(dir, name);
  writeFileSync(files.script, `${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(files.next, "0\n");
}

export function readScript(dir: string, name: FakeName): unknown {
  const { script } = fakeFiles(dir, name);
  return existsSync(script) ? JSON.parse(readFileSync(script, "utf8")) : name === "claude" ? [] : {};
}

export function readCalls(dir: string, name: FakeName): FakeCall[] {
  const { calls } = fakeFiles(dir, name);
  if (!existsSync(calls)) return [];
  return readFileSync(calls, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// A closed stdin is /dev/null, a missing fd, or a pipe that ends at once; anything else was left open.
export async function stdinState(): Promise<FakeCall["stdin"]> {
  let stat: ReturnType<typeof fstatSync>;
  try {
    stat = fstatSync(0);
  } catch {
    return "closed";
  }
  if (isatty(0)) return "tty";
  if (stat.isCharacterDevice() && stat.rdev === statSync("/dev/null").rdev) return "closed";
  if (stat.isFile()) return "closed";
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      process.stdin.pause();
      process.stdin.unref();
      resolve("open");
    }, 200);
    process.stdin.on("data", () => {});
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve("closed");
    });
  });
}
