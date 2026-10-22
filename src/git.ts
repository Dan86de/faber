import { spawnSync } from "node:child_process";

export type GitRoot = { root: string } | { error: string };

// Runs git in `cwd` and returns what it printed; callers past `gitRoot` know git is on PATH.
function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

// The top folder of the git work tree holding `cwd`, as git itself finds it.
export function gitRoot(cwd: string): GitRoot {
  const toplevel = git(cwd, "rev-parse", "--show-toplevel");
  if (toplevel.error) {
    const missing = (toplevel.error as NodeJS.ErrnoException).code === "ENOENT";
    return { error: missing ? "git is not installed or not on PATH" : `git could not run: ${toplevel.error.message}` };
  }
  if (toplevel.status === 0) return { root: toplevel.stdout.trim() };
  // A bare repo, or a folder inside `.git`, is a repo with no work tree to write into.
  const gitDir = git(cwd, "rev-parse", "--git-dir");
  return { error: gitDir.status === 0 ? "inside a git repo with no work tree" : "not inside a git repo" };
}

// Every path git reports as changed, staged or untracked in the work tree at `root`, ignored files left out.
export function dirtyPaths(root: string): { paths: string[] } | { error: string } {
  const status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
  if (status.status !== 0) return { error: `git status failed: ${status.stderr.trim()}` };
  const entries = status.stdout.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as string;
    paths.push(entry.slice(3));
    // A rename or copy, in either column, is followed by its old path, which is not a separate change.
    if (/[RC]/.test(entry.slice(0, 2))) i++;
  }
  return { paths };
}

// The default branch as a ref this repo can read: what `origin/HEAD` names, else the first of the configured
// default, `main` and `master` that exists locally or on origin; undefined in a repo with none of them.
export function defaultBranch(root: string): { name: string; ref: string } | undefined {
  const head = git(root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD").stdout.trim();
  const configured = git(root, "config", "init.defaultBranch").stdout.trim();
  const names = [head.replace(/^origin\//, ""), configured, "main", "master"].filter(Boolean);
  for (const name of names) {
    for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) {
      if (git(root, "rev-parse", "--verify", "--quiet", ref).status === 0) return { name, ref };
    }
  }
  return undefined;
}

// Whether `path` is committed at `ref`.
export function committedAt(root: string, ref: string, path: string): boolean {
  return git(root, "cat-file", "-e", `${ref}:${path}`).status === 0;
}

// Whether git ignores `path`, so a run can write there without dirtying the tree.
export function isIgnored(root: string, path: string): boolean {
  return git(root, "check-ignore", "--quiet", "--no-index", path).status === 0;
}

// Switches to `branch`, creating it from `from` when it does not exist yet; returns git's complaint on failure.
export function switchBranch(root: string, branch: string, from: string): { created: boolean } | { error: string } {
  const exists = git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).status === 0;
  const result = exists
    ? git(root, "switch", "--quiet", branch)
    : git(root, "switch", "--quiet", "--no-track", "--create", branch, from);
  if (result.status !== 0) return { error: `git switch failed: ${result.stderr.trim()}` };
  return { created: !exists };
}

// The commit `HEAD` points at.
export function headCommit(root: string): string {
  return git(root, "rev-parse", "HEAD").stdout.trim();
}

// Every path a session touched since `since`: those its commits changed and those left dirty, sorted and unique.
export function touchedSince(root: string, since: string): { paths: string[] } | { error: string } {
  const committed = git(root, "diff", "--name-only", "-z", since, "HEAD");
  if (committed.status !== 0) return { error: `git diff failed: ${committed.stderr.trim()}` };
  const dirty = dirtyPaths(root);
  if ("error" in dirty) return dirty;
  const paths = new Set([...committed.stdout.split("\0").filter(Boolean), ...dirty.paths]);
  return { paths: [...paths].sort() };
}

// Commits only `path` with `message`, whatever else is staged.
export function commitPath(root: string, path: string, message: string): { error: string } | undefined {
  for (const args of [
    ["add", "--", path],
    ["commit", "--quiet", "--message", message, "--", path],
  ]) {
    const result = git(root, ...args);
    if (result.status !== 0) return { error: `git ${args[0]} failed: ${result.stderr.trim()}` };
  }
  return undefined;
}

// Pushes `branch` to origin and sets it as the upstream.
export function pushBranch(root: string, branch: string): { error: string } | undefined {
  const result = git(root, "push", "--quiet", "--set-upstream", "origin", branch);
  return result.status === 0 ? undefined : { error: `git push failed: ${result.stderr.trim()}` };
}

// The text of `path` as committed at `ref`, or undefined when it is not committed there.
export function committedText(root: string, ref: string, path: string): string | undefined {
  const result = git(root, "show", `${ref}:${path}`);
  return result.status === 0 ? result.stdout : undefined;
}

// The slice ids `Slice:` and `Slice-Pending:` trailers name on the commits `HEAD` has and `base` lacks.
export function sliceTrailers(
  root: string,
  base: string,
): { done: Set<string>; pending: Set<string> } | { error: string } {
  const fields = ["Slice", "Slice-Pending"].map((key) => `%(trailers:key=${key},valueonly,separator=%x1f)`);
  const log = git(root, "log", "-z", `--format=${fields.join("%x1e")}`, `${base}..HEAD`);
  if (log.status !== 0) return { error: `git log failed: ${log.stderr.trim()}` };
  const done = new Set<string>();
  const pending = new Set<string>();
  for (const commit of log.stdout.split("\0")) {
    const [slices = "", pendings = ""] = commit.split("\x1e");
    for (const id of slices.split("\x1f")) if (id.trim()) done.add(id.trim());
    for (const id of pendings.split("\x1f")) if (id.trim()) pending.add(id.trim());
  }
  return { done, pending };
}
