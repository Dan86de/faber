# Git root

A user can run `faber init` from any folder inside a repo and the files land at the repo's top, where the skills look for them; outside a repo, init refuses and writes nothing.

## Entry points

- `faber init` run from a subfolder of a git repo.
- `faber init` run in a folder that is not inside any git repo.

## Steps

Preconditions: run `repo <run> nested`, then `mkdir <run> nested/packages/app`.

- **Write at the root from a subfolder.** Run `faber <run> nested/packages/app init`.
  It exits 0 and prints `created` for all six project files, then the `next:` line.
  Then run `show <run> nested`: it lists `.agents/coding-standards.md`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `spec/glossary.md` and `spec/vision.md`, and nothing under `packages/app`.
- **Refuse outside a repo.** Run `repo <run> outside --no-git`, then `faber <run> outside init`.
  It exits 1 and prints `[stderr] faber: not inside a git repo; run faber init in a git work tree`, and nothing on stdout.
  Then run `show <run> outside`: it prints `(no files)` and `> git: not a repo`.

## Behind it

The two `show` listings above are the whole state: the root of `nested` holds the six files with `> git commits: 0` and `(nothing staged)`, and `outside` holds nothing.

## Gotchas

- `show` lists files, not folders, so the empty `packages/app` folder made by `mkdir` does not appear.
- A refused run prints no `next:` line: it did nothing a user would go on to fill or commit.
- A bare repo, or a folder inside `.git`, is refused with `inside a git repo with no work tree`, and a machine without git with `git is not installed or not on PATH`.
