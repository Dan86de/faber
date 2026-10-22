import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { claudeScriptProblem } from "../.agents/skills/verify/fakes/fakes.ts";
import { bareRemote, commitAll, fakes, git, runOnPath, tempRepo } from "./faber.ts";

const headless = [
  "-p",
  "/implement-slice demo",
  "--output-format",
  "stream-json",
  "--verbose",
  "--permission-mode",
  "auto",
];

function events(stdout: string): Record<string, unknown>[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// A repo with one setup commit and a bare origin, the state a run starts from.
function startedRepo(t: Parameters<typeof tempRepo>[0]) {
  const repo = tempRepo(t);
  writeFileSync(join(repo, "README.md"), "demo\n");
  commitAll(repo, "Set up");
  return { repo, bare: bareRemote(t, repo) };
}

test("the fakes are found first on PATH", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  for (const name of ["claude", "gh"]) {
    const found = runOnPath(f, repo, "sh", ["-c", `command -v ${name}`]);
    assert.equal(found.stdout.trim(), join(f.bin, name));
  }
});

test("a setup commit is pushed to the bare remote", (t) => {
  const { repo, bare } = startedRepo(t);
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, git(bare, "rev-parse", "main").stdout);
});

test("fake claude writes, commits with trailers and pushes, then ends with a stream-json result", (t) => {
  const f = fakes(t);
  const { repo, bare } = startedRepo(t);
  f.script("claude", [
    {
      write: { "src/slice.txt": "built\n" },
      commit: { message: "Build the slice", trailers: ["Slice: S1"] },
      push: true,
      tools: 2,
      message: "S1 is done.",
    },
  ]);
  const result = runOnPath(f, repo, "claude", headless);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const stream = events(result.stdout);
  assert.deepEqual(stream[0]?.type, "system");
  assert.equal(stream.filter((e) => JSON.stringify(e).includes('"tool_use"')).length, 2);
  assert.deepEqual(stream.at(-1), {
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 3,
    result: "S1 is done.",
    permission_denials: [],
    session_id: "00000000-0000-4000-8000-000000000000",
  });
  assert.equal(git(repo, "log", "-1", "--format=%(trailers:key=Slice,valueonly)").stdout.trim(), "S1");
  assert.equal(git(repo, "status", "--porcelain").stdout, "");
  assert.equal(git(repo, "rev-parse", "HEAD").stdout, git(bare, "rev-parse", "main").stdout);
  assert.deepEqual(f.calls("claude"), [{ argv: headless, cwd: repo, stdin: "closed", session: 0 }]);
});

test("fake claude runs its sessions in order and fails once they run out", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{ message: "first" }, { message: "second" }]);
  assert.equal(events(runOnPath(f, repo, "claude", headless).stdout).at(-1)?.result, "first");
  assert.equal(events(runOnPath(f, repo, "claude", headless).stdout).at(-1)?.result, "second");
  const third = runOnPath(f, repo, "claude", headless);
  assert.equal(third.status, 1);
  assert.match(third.stderr, /no scripted session left \(2 scripted, this is call 2\)/);
  assert.deepEqual(
    f.calls("claude").map((call) => call.session),
    [0, 1, 2],
  );
});

test("a new claude script starts again at its first session", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{ message: "old" }]);
  runOnPath(f, repo, "claude", headless);
  f.script("claude", [{ message: "new" }]);
  assert.equal(events(runOnPath(f, repo, "claude", headless).stdout).at(-1)?.result, "new");
});

test("fake claude reports an exit code and permission denials", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{ exit: 3, denials: 1, message: "Could not push." }]);
  const result = runOnPath(f, repo, "claude", headless);
  assert.equal(result.status, 3);
  const last = events(result.stdout).at(-1);
  assert.equal(last?.is_error, true);
  assert.equal(last?.result, "Could not push.");
  assert.equal((last?.permission_denials as unknown[] | undefined)?.length, 1);
});

test("a hanging fake claude streams its tool calls and stays alive until killed", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{ tools: 4, hang: true }]);
  const result = runOnPath(f, repo, "claude", headless, 1_000);
  assert.equal(result.status, null);
  const stream = events(result.stdout);
  assert.equal(stream.filter((e) => JSON.stringify(e).includes('"tool_use"')).length, 4);
  assert.equal(
    stream.some((e) => e.type === "result"),
    false,
  );
});

test("fake claude refuses stream-json without --verbose, like the real one", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{}]);
  const result = runOnPath(f, repo, "claude", ["-p", "/write-spec demo", "--output-format", "stream-json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stream-json requires --verbose/);
});

test("fake claude records a stdin left open", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  f.script("claude", [{}]);
  // `yes` holds the pipe open until the fake exits, however long the fake takes to start.
  runOnPath(f, repo, "sh", ["-c", `yes | claude ${headless.map((word) => `'${word}'`).join(" ")}`]);
  assert.equal(f.calls("claude")[0]?.stdin, "open");
});

test("a claude script with an unknown key is refused", () => {
  assert.match(claudeScriptProblem([{ comit: {} }]) ?? "", /session 0 has unknown keys: comit/);
  assert.match(claudeScriptProblem([{ commit: { message: "x", trailers: ["no colon"] } }]) ?? "", /trailers/);
  assert.equal(claudeScriptProblem([{ commit: { message: "x", trailers: ["Slice-Pending: S2"] } }]), null);
});

test("fake gh reports the scripted pull request and finds none without one", (t) => {
  const f = fakes(t);
  const repo = tempRepo(t);
  const missing = runOnPath(f, repo, "gh", ["pr", "view", "--json", "url,isDraft"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no pull requests found/);
  f.script("gh", { pr: { url: "https://github.com/o/r/pull/7", isDraft: false } });
  const ready = runOnPath(f, repo, "gh", ["pr", "view", "--json", "url,isDraft"]);
  assert.equal(ready.status, 0);
  assert.deepEqual(JSON.parse(ready.stdout), { url: "https://github.com/o/r/pull/7", isDraft: false });
  assert.equal(runOnPath(f, repo, "gh", ["pr", "merge"]).status, 1);
  assert.equal(f.calls("gh").length, 3);
  assert.equal(existsSync(join(repo, "gh.calls.jsonl")), false);
});
