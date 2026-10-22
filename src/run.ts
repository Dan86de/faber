import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  commitPath,
  committedAt,
  committedText,
  defaultBranch,
  dirtyPaths,
  gitRoot,
  headCommit,
  isIgnored,
  pushBranch,
  sliceTrailers,
  switchBranch,
  touchedSince,
} from "./git.ts";
import { type Limits, runSession, type SessionResult } from "./harness/claude.ts";
import { nextReady, parseSlices, waiting } from "./slices.ts";

export const runUsage = "usage: faber run <slug> [--timeout <minutes>] [--max-tools <n>]";

// Each session's limits unless the command line overrides them: 90 minutes and 900 tool calls.
const defaultTimeout = "90";
const defaultMaxTools = "900";
// Node fires a timer longer than 2^31 - 1 ms, about 35791 minutes, at once, so a longer limit is refused.
const maxTimeout = 35_000;
const flags = { timeout: { type: "string" }, "max-tools": { type: "string" } } as const;

// Where a run's lines go: a refusal before the run folder exists goes to stderr, everything after to stdout and run.log.
export type RunOutput = { refuse(line: string): void; print(line: string): void };

// A feature slug, the folder name under `spec/features/`.
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Carries the feature `args` names from its committed decision record as far as faber can take it, and returns
// the exit code. Every refusal reads git alone and changes nothing; only a run that passes them switches branch.
// Aborting `interrupt` kills the running session and stops the run once it has ended.
export async function run(cwd: string, args: string[], output: RunOutput, interrupt: AbortSignal): Promise<number> {
  const refuse = (...lines: string[]) => {
    for (const line of lines) output.refuse(line);
    return 1;
  };
  const options = readArgs(args);
  if ("problem" in options) return refuse(options.problem);
  const { slug, timeout, maxTools, limits } = options;
  if (!slugPattern.test(slug)) {
    return refuse(`faber: "${slug}" is not a feature slug; use lowercase letters, digits and dashes`);
  }
  const repo = gitRoot(cwd);
  if ("error" in repo) return refuse(`faber: ${repo.error}; run faber run ${slug} in a git work tree`);
  const root = repo.root;
  const dirty = dirtyPaths(root);
  if ("error" in dirty) return refuse(`faber: ${dirty.error}`);
  if (dirty.paths.length > 0) {
    const lines = dirty.paths.map((path) => `  ${path}`);
    return refuse("faber: the work tree has uncommitted changes; commit or stash them, then run again:", ...lines);
  }
  const feature = `spec/features/${slug}`;
  const base = defaultBranch(root);
  if (base === undefined || !committedAt(root, base.ref, `${feature}/decisions.md`)) {
    const where = base ? base.name : "the default branch";
    return refuse(
      `faber: ${feature}/decisions.md is not committed on ${where}; commit the decision record there first`,
    );
  }
  // The run folder must stay out of git, or the run would dirty the tree it reads its state from.
  const runs = `.scratch/faber/${slug}/`;
  if (!isIgnored(root, runs)) {
    return refuse(`faber: ${runs} is not ignored by git; add .scratch/ to .gitignore (faber init does), then commit`);
  }
  const branch = `slices/${slug}`;
  const switched = switchBranch(root, branch, base.ref);
  if ("error" in switched) return refuse(`faber: ${switched.error}`);

  const folder = makeRunFolder(root, runs);
  const say = (line: string) => {
    output.print(line);
    appendFileSync(join(root, folder, "run.log"), `${line}\n`);
  };
  say(folder);
  say(switched.created ? `created ${branch} from ${base.name}` : `on ${branch}`);
  // A stop ends with one status line; the session's last message and any further lines of the reason come first.
  const stop = (reason: string, lastMessage?: string) => {
    const [status, ...detail] = reason.split("\n");
    const lines = [...(lastMessage ? lastMessage.split("\n") : []), ...detail];
    for (const line of lines) say(`| ${line}`);
    say(`stopped: ${status}`);
    return 1;
  };

  // Runs one headless session named `name`, printing its start and end lines and keeping its stream as `<name>.jsonl`.
  // An interrupt that came while faber ran git reaches its handler only once the event loop turns, so the loop turns
  // first and an interrupted run starts no session.
  const start = async (name: string, skill: string, input: string): Promise<SessionResult> => {
    await new Promise((resolve) => setImmediate(resolve));
    if (interrupt.aborted) return { exit: 0, tools: 0, denials: 0, lastMessage: "", killed: "interrupt" };
    say(`${name}: started`);
    const session = await runSession({
      skill,
      args: input,
      cwd: root,
      transcript: join(root, folder, `${name}.jsonl`),
      limits,
      interrupt,
    });
    say(`${name}: ended, exit ${session.exit}, ${session.tools} tool call${session.tools === 1 ? "" : "s"}`);
    return session;
  };
  // Why a session that ended stops the run whatever it left in git, or undefined; an interrupt comes first, since
  // the owner asked for the stop, then a limit faber killed it for, then a denial, which a non-zero exit may only
  // follow from.
  const failed = (name: string, session: SessionResult) => {
    if (interrupt.aborted || session.killed === "interrupt") return "interrupted";
    if (session.killed === "timeout") return `${name} ran past ${timeout} minutes`;
    if (session.killed === "tools") return `${name} passed ${maxTools} tool calls`;
    if (session.denials > 0) return `${name} hit a permission denial`;
    if (session.exit !== 0) return `${name} exited ${session.exit}`;
    return undefined;
  };

  // A planning phase runs while its file is not committed on the branch; faber commits only that file, since the
  // skill leaves the commit to a user who is not there, and stops on anything else the session touched. It returns
  // the stop's exit code, or undefined when the run goes on, whether the phase ran or git already records it.
  const plan = async (phase: string, input: string, file: string, subject: string) => {
    if (committedAt(root, "HEAD", file)) return undefined;
    const before = headCommit(root);
    const session = await start(phase, phase, input);
    const phaseFailed = failed(phase, session);
    if (phaseFailed) return stop(phaseFailed, session.lastMessage);
    const touched = touchedSince(root, before);
    if ("error" in touched) return stop(touched.error, session.lastMessage);
    if (touched.paths.length === 0) return stop(`${phase} wrote nothing`, session.lastMessage);
    const stray = touched.paths.find((path) => path !== file);
    if (stray !== undefined) return stop(`${phase} touched ${stray}`, session.lastMessage);
    if (headCommit(root) !== before) return stop(`${phase} committed on its own`, session.lastMessage);
    const committed = commitPath(root, file, subject);
    if (committed) return stop(committed.error);
    say(`committed ${file}`);
    const pushed = pushBranch(root, branch);
    if (pushed) return stop(pushed.error);
    say(`pushed ${branch}`);
    return undefined;
  };

  const spec = `${feature}/spec.md`;
  const stopped =
    (await plan("write-spec", `${feature}/decisions.md`, spec, `Write the spec for ${slug}`)) ??
    (await plan("write-slices", spec, `${feature}/slices.json`, `Cut ${slug} into slices`));
  if (stopped !== undefined) return stopped;

  // Each slice runs in its own implement-slice session, picked from the trailers on the branch the way the skill
  // picks it; the trailers it adds, never its reply, decide whether the run goes on. A slice that waits for sign-off
  // goes on too, with whatever does not depend on it, and the run ends listing it.
  const slicesFile = `${feature}/slices.json`;
  const parsed = parseSlices(committedText(root, "HEAD", slicesFile) ?? "");
  if ("problem" in parsed) return stop(`${slicesFile} ${parsed.problem}`);
  let trailers = sliceTrailers(root, base.ref);
  if ("error" in trailers) return stop(trailers.error);
  for (
    let id = nextReady(parsed.slices, trailers.done, trailers.pending);
    id !== undefined;
    id = nextReady(parsed.slices, trailers.done, trailers.pending)
  ) {
    const session = await start(id, "implement-slice", `${slicesFile} ${id}`);
    const sliceFailed = failed(id, session);
    if (sliceFailed) return stop(sliceFailed, session.lastMessage);
    const after = sliceTrailers(root, base.ref);
    if ("error" in after) return stop(after.error, session.lastMessage);
    if (!after.done.has(id) && !after.pending.has(id)) return stop(`${id} committed nothing`, session.lastMessage);
    trailers = after;
  }
  const left = waiting(parsed.slices, trailers.done, trailers.pending);
  const pending = left.filter(({ pending }) => pending).map(({ id }) => id);
  if (pending.length > 0) {
    return stop(`${pending.join(", ")} ${pending.length === 1 ? "waits" : "wait"} for sign-off`);
  }
  if (left.length > 0) {
    const blocked = left.map(({ id, openBlockers }) => `${id} waits for ${openBlockers.join(", ")}`);
    return stop(["no slice is ready", ...blocked].join("\n"));
  }
  // Closing the branch lands in a later slice; until then a run with every slice done stops here.
  return stop("closing the branch is not built yet");
}

// The slug and limits `args` give, each limit as typed for the status line, or the line that refuses them.
function readArgs(
  args: string[],
): { slug: string; timeout: string; maxTools: string; limits: Limits } | { problem: string } {
  const config = { args, options: flags, allowPositionals: true, strict: true } as const;
  let parsed: ReturnType<typeof parseArgs<typeof config>>;
  try {
    parsed = parseArgs(config);
  } catch {
    return { problem: runUsage };
  }
  const [slug, ...rest] = parsed.positionals;
  if (slug === undefined || rest.length > 0) return { problem: runUsage };
  const { timeout = defaultTimeout, "max-tools": maxTools = defaultMaxTools } = parsed.values;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(timeout) || Number(timeout) === 0 || Number(timeout) > maxTimeout) {
    return {
      problem: `faber: --timeout takes minutes above 0 and up to ${maxTimeout}, such as 90 or 0.5, not "${timeout}"`,
    };
  }
  if (!/^\d+$/.test(maxTools) || Number(maxTools) === 0) {
    return { problem: `faber: --max-tools takes a whole number of tool calls above 0, such as 900, not "${maxTools}"` };
  }
  const limits = { timeoutMs: Number(timeout) * 60_000, maxTools: Number(maxTools) };
  return { slug, timeout, maxTools, limits };
}

// Makes `<runs><timestamp>/` in UTC, with a counter when two runs start in the same second, and returns it.
function makeRunFolder(root: string, runs: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  mkdirSync(join(root, runs), { recursive: true });
  for (let n = 1; ; n++) {
    const folder = `${runs}${stamp}${n === 1 ? "" : `-${n}`}/`;
    try {
      mkdirSync(join(root, folder));
      return folder;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}
