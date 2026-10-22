import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  commitPath,
  committedAt,
  defaultBranch,
  dirtyPaths,
  gitRoot,
  headCommit,
  isIgnored,
  pushBranch,
  switchBranch,
  touchedSince,
} from "./git.ts";
import { runSession } from "./harness/claude.ts";

export const runUsage = "usage: faber run <slug>";

// Where a run's lines go: a refusal before the run folder exists goes to stderr, everything after to stdout and run.log.
export type RunOutput = { refuse(line: string): void; print(line: string): void };

// A feature slug, the folder name under `spec/features/`.
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Carries the feature `args[0]` names from its committed decision record as far as faber can take it, and returns
// the exit code. Every refusal reads git alone and changes nothing; only a run that passes them switches branch.
export async function run(cwd: string, args: string[], output: RunOutput): Promise<number> {
  const refuse = (...lines: string[]) => {
    for (const line of lines) output.refuse(line);
    return 1;
  };
  const [slug, ...rest] = args;
  if (slug === undefined || rest.length > 0) return refuse(runUsage);
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

  const spec = `${feature}/spec.md`;
  if (!committedAt(root, "HEAD", spec)) {
    const phase = "write-spec";
    const before = headCommit(root);
    say(`${phase}: started`);
    const session = await runSession({
      skill: phase,
      args: `${feature}/decisions.md`,
      cwd: root,
      transcript: join(root, folder, `${phase}.jsonl`),
    });
    say(`${phase}: ended, exit ${session.exit}, ${session.tools} tool call${session.tools === 1 ? "" : "s"}`);
    if (session.exit !== 0) return stop(`${phase} exited ${session.exit}`, session.lastMessage);
    const touched = touchedSince(root, before);
    if ("error" in touched) return stop(touched.error, session.lastMessage);
    if (touched.paths.length === 0) return stop(`${phase} wrote nothing`, session.lastMessage);
    // The session may write the spec but never commit it: faber makes the one commit it can prove.
    const stray = touched.paths.find((path) => path !== spec);
    if (stray !== undefined) return stop(`${phase} touched ${stray}`, session.lastMessage);
    if (headCommit(root) !== before) return stop(`${phase} committed on its own`, session.lastMessage);
    const committed = commitPath(root, spec, `Write the spec for ${slug}`);
    if (committed) return stop(committed.error);
    say(`committed ${spec}`);
    const pushed = pushBranch(root, branch);
    if (pushed) return stop(pushed.error);
    say(`pushed ${branch}`);
  }
  // Cutting the slices lands in the next slice; until then a run with a committed spec stops here.
  return stop("write-slices is not built yet");
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
