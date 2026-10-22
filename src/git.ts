import { spawnSync } from "node:child_process";

export type GitRoot = { root: string } | { error: string };

// The top folder of the git work tree holding `cwd`, as git itself finds it.
export function gitRoot(cwd: string): GitRoot {
  const toplevel = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (toplevel.error) {
    const missing = (toplevel.error as NodeJS.ErrnoException).code === "ENOENT";
    return { error: missing ? "git is not installed or not on PATH" : `git could not run: ${toplevel.error.message}` };
  }
  if (toplevel.status === 0) return { root: toplevel.stdout.trim() };
  // A bare repo, or a folder inside `.git`, is a repo with no work tree to write into.
  const gitDir = spawnSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf8" });
  return { error: gitDir.status === 0 ? "inside a git repo with no work tree" : "not inside a git repo" };
}
