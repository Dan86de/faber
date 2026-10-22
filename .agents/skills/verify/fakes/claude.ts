// Fake `claude`: runs the next scripted session the way a headless Claude Code session would,
// writing and committing in its working folder and printing a stream-json transcript.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ClaudeSession, claudeScriptProblem, type FakeCall, fakeFiles, readScript, stdinState } from "./fakes.ts";

const dir = process.env.FAKE_DIR;
if (!dir) {
  process.stderr.write("fake claude: FAKE_DIR is not set; run it through the bin folder installFakes wrote\n");
  process.exit(2);
}
const files = fakeFiles(dir, "claude");
const argv = process.argv.slice(2);
const sessionId = "00000000-0000-4000-8000-000000000000";

function emit(event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ ...event, session_id: sessionId })}\n`);
}

function git(...args: string[]): void {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`fake claude: git ${args.join(" ")} failed: ${result.stderr.trim()}\n`);
    process.exit(1);
  }
}

function toolUse(id: string, input: Record<string, unknown>): void {
  emit({
    type: "assistant",
    message: { role: "assistant", model: "fake", content: [{ type: "tool_use", id, name: "Bash", input }] },
  });
}

function toolResult(id: string, content: string, isError: boolean): void {
  emit({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
  });
}

function run(session: ClaudeSession, stream: boolean): void {
  for (const [path, text] of Object.entries(session.write ?? {})) {
    mkdirSync(dirname(join(process.cwd(), path)), { recursive: true });
    writeFileSync(join(process.cwd(), path), text);
  }
  if (session.commit) {
    const { message, trailers = [] } = session.commit;
    git("add", "-A");
    git("commit", "-q", "-m", trailers.length ? `${message}\n\n${trailers.join("\n")}` : message);
  }
  if (session.push) git("push", "-q", "origin", "HEAD");
  const denials: Record<string, unknown>[] = [];
  if (stream) {
    emit({
      type: "system",
      subtype: "init",
      cwd: process.cwd(),
      model: "fake",
      permissionMode: option("--permission-mode"),
    });
    for (let i = 0; i < (session.tools ?? 0); i++) {
      toolUse(`toolu_${i}`, { command: "true" });
      toolResult(`toolu_${i}`, "", false);
    }
    for (let i = 0; i < (session.denials ?? 0); i++) {
      const id = `toolu_denied_${i}`;
      toolUse(id, { command: "git push" });
      toolResult(id, "Permission to use Bash has been denied.", true);
      denials.push({ tool_name: "Bash", tool_use_id: id, tool_input: { command: "git push" } });
    }
  }
  if (session.hang) {
    // Stays alive until killed, like a session stuck past its limits.
    setInterval(() => {}, 1 << 30);
    return;
  }
  const message = session.message ?? "Done.";
  const exit = session.exit ?? 0;
  if (stream) {
    emit({
      type: "assistant",
      message: { role: "assistant", model: "fake", content: [{ type: "text", text: message }] },
    });
    emit({
      type: "result",
      subtype: exit === 0 ? "success" : "error_during_execution",
      is_error: exit !== 0,
      num_turns: (session.tools ?? 0) + (session.denials ?? 0) + 1,
      result: message,
      permission_denials: denials,
    });
  } else {
    process.stdout.write(`${message}\n`);
  }
  process.exitCode = exit;
}

function option(name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

const headless = argv.includes("-p") || argv.includes("--print");
const call: FakeCall = { argv, cwd: process.cwd(), stdin: await stdinState(), session: null };
const script = readScript(dir, "claude");
const problem = claudeScriptProblem(script);
const sessions = (problem ? [] : script) as ClaudeSession[];
const next = existsSync(files.next) ? Number(readFileSync(files.next, "utf8")) : 0;
if (headless) {
  call.session = next;
  writeFileSync(files.next, `${next + 1}\n`);
}
appendFileSync(files.calls, `${JSON.stringify(call)}\n`);

if (call.stdin === "open") process.stderr.write("fake claude: stdin was left open; close it for a headless run\n");
if (problem) {
  process.stderr.write(`fake claude: bad script: ${problem}\n`);
  process.exit(2);
}
if (!headless) {
  process.stderr.write("fake claude: only headless -p sessions are scripted\n");
  process.exit(1);
}
const format = option("--output-format") ?? "text";
if (format === "stream-json" && !argv.includes("--verbose")) {
  process.stderr.write("Error: When using --print, --output-format=stream-json requires --verbose\n");
  process.exit(1);
}
const session = sessions[next];
if (!session) {
  process.stderr.write(`fake claude: no scripted session left (${sessions.length} scripted, this is call ${next})\n`);
  process.exit(1);
}
run(session, format === "stream-json");
