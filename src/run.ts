import { committedAt, defaultBranch, dirtyPaths, gitRoot } from "./git.ts";

export const runUsage = "usage: faber run <slug>";

// What a run prints, to stderr, and exits with.
export type RunOutcome = { lines: string[]; code: number };

// A feature slug, the folder name under `spec/features/`.
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Checks everything a run needs before its first session, from git alone, and changes nothing.
export function run(cwd: string, args: string[]): RunOutcome {
  const [slug, ...rest] = args;
  if (slug === undefined || rest.length > 0) return { lines: [runUsage], code: 1 };
  if (!slugPattern.test(slug)) {
    return { lines: [`faber: "${slug}" is not a feature slug; use lowercase letters, digits and dashes`], code: 1 };
  }
  const repo = gitRoot(cwd);
  if ("error" in repo) return { lines: [`faber: ${repo.error}; run faber run ${slug} in a git work tree`], code: 1 };
  const dirty = dirtyPaths(repo.root);
  if ("error" in dirty) return { lines: [`faber: ${dirty.error}`], code: 1 };
  if (dirty.paths.length > 0) {
    const lines = ["faber: the work tree has uncommitted changes; commit or stash them, then run again:"];
    return { lines: [...lines, ...dirty.paths.map((path) => `  ${path}`)], code: 1 };
  }
  const decisions = `spec/features/${slug}/decisions.md`;
  const base = defaultBranch(repo.root);
  if (base === undefined || !committedAt(repo.root, base.ref, decisions)) {
    const where = base ? base.name : "the default branch";
    return {
      lines: [`faber: ${decisions} is not committed on ${where}; commit the decision record there first`],
      code: 1,
    };
  }
  // The sessions land in later slices; until then a run that passes its checks stops here.
  return { lines: [`faber: ${slug} is ready to run, but faber cannot start its sessions yet`], code: 1 };
}
