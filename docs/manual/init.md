# Init

A user runs `faber init` in a git repo and gets every project file the skills read, ready to fill, without faber committing anything.

## Entry points

- `faber init` run in a git repo.

## Steps

Preconditions: run `repo <run> empty`.

- **Create every project file.** Run `faber <run> empty init`. It exits 0 and prints, one per line, `created spec/vision.md`, `created spec/glossary.md`, `created .agents/coding-standards.md`, `created AGENTS.md`, `created CLAUDE.md`, `created .gitignore`, then `next: fill spec/vision.md and .agents/coding-standards.md, then commit`.

## Behind it

Run `show <run> empty`.
It lists `.agents/coding-standards.md`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `spec/glossary.md` and `spec/vision.md`, and no other file.
It prints `> git commits: 0` and `(nothing staged)`: init never stages or commits.

## Gotchas

- The `created` lines come in the fixed order above, not the alphabetical order `show` lists files in.
- The `next:` line ends every run, whatever init created or kept.
