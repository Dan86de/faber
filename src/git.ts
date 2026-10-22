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
