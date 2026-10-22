// The Claude Code adapter: starts one headless session and reports what its stream says, never what it means.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { constants } from "node:os";
import { createInterface } from "node:readline";

// A session's wall-clock limit and the most tool calls it may make; passing either kills it.
export type Limits = { timeoutMs: number; maxTools: number };

// Aborting `interrupt` kills the session, the way passing a limit does.
export type Session = {
  skill: string;
  args: string;
  cwd: string;
  transcript: string;
  limits: Limits;
  interrupt: AbortSignal;
};

// `killed` names why faber killed the session: a limit it passed, or an interrupt.
export type SessionResult = {
  exit: number;
  tools: number;
  denials: number;
  lastMessage: string;
  killed?: "timeout" | "tools" | "interrupt";
};

// How long a killed session gets to exit on SIGTERM before it gets SIGKILL.
const killGraceMs = 5_000;

// Runs `claude -p "/<skill> <args>"` from PATH with stdin closed, copying its stream-json lines to `transcript`.
export function runSession({ skill, args, cwd, transcript, limits, interrupt }: Session): Promise<SessionResult> {
  const prompt = `/${skill} ${args}`;
  const flags = ["--output-format", "stream-json", "--verbose", "--permission-mode", "auto"];
  const child = spawn("claude", ["-p", prompt, ...flags], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const out = createWriteStream(transcript);
  const result: SessionResult = { exit: 0, tools: 0, denials: 0, lastMessage: "" };
  let stderr = "";
  let grace: NodeJS.Timeout | undefined;
  // Kills the session once, for the first reason; what it streams after that is kept but not counted.
  const kill = (reason: NonNullable<SessionResult["killed"]>) => {
    if (result.killed) return;
    result.killed = reason;
    child.kill("SIGTERM");
    grace = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
  };
  const timer = setTimeout(() => kill("timeout"), limits.timeoutMs);
  const onInterrupt = () => kill("interrupt");
  if (interrupt.aborted) onInterrupt();
  else interrupt.addEventListener("abort", onInterrupt, { once: true });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    out.write(`${line}\n`);
    if (result.killed) return;
    read(line, result);
    if (result.tools > limits.maxTools) kill("tools");
  });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(grace);
      interrupt.removeEventListener("abort", onInterrupt);
      out.end();
      result.exit = code ?? 128 + (signal ? constants.signals[signal] : 0);
      // faber never sends these, so a session they ended was interrupted with faber, as Ctrl-C to the terminal does.
      if (signal === "SIGINT" || signal === "SIGHUP") result.killed ??= "interrupt";
      // A session that died before its result still leaves the owner something to read.
      if (!result.lastMessage) result.lastMessage = stderr.trim();
      resolve(result);
    });
  });
}

// Folds one stream-json event into the result; a line that is not JSON is kept in the transcript and skipped here.
function read(line: string, result: SessionResult): void {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!isRecord(event)) return;
  if (event.type === "assistant" && isRecord(event.message) && Array.isArray(event.message.content)) {
    for (const part of event.message.content) {
      if (!isRecord(part)) continue;
      if (part.type === "tool_use") result.tools++;
      if (part.type === "text" && typeof part.text === "string") result.lastMessage = part.text;
    }
  }
  if (event.type === "result") {
    if (typeof event.result === "string") result.lastMessage = event.result;
    if (Array.isArray(event.permission_denials)) result.denials = event.permission_denials.length;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
