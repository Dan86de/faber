# Run

A user runs `faber run <slug>` in a repo whose default branch holds the feature's decision record, and faber carries the feature to a ready PR; a run that cannot start refuses before any session, says why, and changes nothing.

## Entry points

- `faber run` with no slug.
- `faber run <slug>` in a folder that is not inside any git repo.
- `faber run <slug>` in a git repo with uncommitted changes.
- `faber run <slug>` in a git repo whose default branch has no `spec/features/<slug>/decisions.md`.

## Steps

Preconditions: run `repo <run> plain`, then `script <run> claude []` and `script <run> gh {}`, so any session faber starts fails and shows up in `calls`.

- **No slug.** Run `faber <run> plain run`.
  It exits 1 and prints `[stderr] usage: faber run <slug>`, and nothing on stdout.
- **Refuse outside a repo.** Run `repo <run> outside --no-git`, then `show <run> outside`, then `faber <run> outside run demo`.
  It exits 1 and prints `[stderr] faber: not inside a git repo; run faber run demo in a git work tree`.
  Then run `show <run> outside` and `calls <run> claude`: the listing is the same as before, and `> claude calls: 0`.
- **Refuse a dirty tree.** Run `repo <run> dirty`, `write <run> dirty/spec/features/demo/decisions.md # Decisions`, `commit <run> dirty Record the decisions` and `remote <run> dirty`, then `write <run> dirty/notes.md draft`, then `show <run> dirty`, then `faber <run> dirty run demo`.
  It exits 1 and prints `[stderr] faber: the work tree has uncommitted changes; commit or stash them, then run again:`, then `[stderr]   notes.md`.
  Then run `show <run> dirty` and `calls <run> claude`: the listing is the same as before, and `> claude calls: 0`.
- **Refuse a missing decision record.** Run `repo <run> nodecisions`, `write <run> nodecisions/README.md demo`, `commit <run> nodecisions Set up` and `remote <run> nodecisions`, then `show <run> nodecisions`, then `faber <run> nodecisions run demo`.
  It exits 1 and prints `[stderr] faber: spec/features/demo/decisions.md is not committed on main; commit the decision record there first`.
  Then run `show <run> nodecisions` and `calls <run> claude`: the listing is the same as before, and `> claude calls: 0`.

## Behind it

Run `calls <run> claude` and `calls <run> gh`: both print `> <fake> calls: 0`, because no refused run starts a session or reads a PR.
Each step's two `show` listings match line for line: a refused run writes, stages, commits and pushes nothing.

## Gotchas

- Every refusal goes to stderr with exit 1; stdout stays empty.
- The default branch is what `origin/HEAD` names, else the first of git's `init.defaultBranch`, `main` and `master` that exists; a record committed only on another branch does not count.
- The dirty list includes untracked files one by one, but never files `.gitignore` covers, so a `.scratch/` folder an ignored run left does not block the next run.
- A slug is a folder name of lowercase letters, digits and dashes; anything else is refused before git is read.
- A run also refuses, before switching branch, when git does not ignore `.scratch/faber/<slug>/`, since its own run folder would dirty the tree.
- A run that passes every check goes on as [Write the spec](./run-spec.md) describes.
