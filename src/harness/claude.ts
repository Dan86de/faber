// The Claude Code adapter: starts one headless session and reports what its stream says, never what it means.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";

export type Session = { skill: string; args: string; cwd: string; transcript: string };

export type SessionResult = { exit: number; tools: number; denials: number; lastMessage: string };

// Runs `claude -p "/<skill> <args>"` from PATH with stdin closed, copying its stream-json lines to `transcript`.
export function runSession({ skill, args, cwd, transcript }: Session): Promise<SessionResult> {
  const prompt = `/${skill} ${args}`;
  const flags = ["--output-format", "stream-json", "--verbose", "--permission-mode", "auto"];
  const child = spawn("claude", ["-p", prompt, ...flags], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const out = createWriteStream(transcript);
  const result: SessionResult = { exit: 0, tools: 0, denials: 0, lastMessage: "" };
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    out.write(`${line}\n`);
    read(line, result);
  });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (code, signal) => {
      out.end();
      result.exit = code ?? (signal ? 128 : 1);
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
