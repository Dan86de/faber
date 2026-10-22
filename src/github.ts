// GitHub, read through `gh` from PATH: faber asks it only whether a branch's PR is ready, for a run's last line.
import { spawnSync } from "node:child_process";

export type PullRequest = { url: string; isDraft: boolean };

// The PR `gh` finds for `branch`, or why it could not say.
export function pullRequest(root: string, branch: string): PullRequest | { error: string } {
  const view = spawnSync("gh", ["pr", "view", branch, "--json", "url,isDraft"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (view.error) {
    const missing = (view.error as NodeJS.ErrnoException).code === "ENOENT";
    return { error: missing ? "gh is not installed or not on PATH" : `gh could not run: ${view.error.message}` };
  }
  if (view.status !== 0) return { error: `gh pr view failed: ${view.stderr.trim()}` };
  let pr: unknown;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    return { error: `gh pr view printed no JSON: ${view.stdout.trim()}` };
  }
  if (!isRecord(pr) || typeof pr.url !== "string" || typeof pr.isDraft !== "boolean") {
    return { error: `gh pr view printed no url and draft flag: ${view.stdout.trim()}` };
  }
  return { url: pr.url, isDraft: pr.isDraft };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
