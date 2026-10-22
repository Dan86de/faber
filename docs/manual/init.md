# Init

A user runs `faber init` in a git repo and gets every project file the skills read, ready to fill, without faber committing anything.

## Entry points

- `faber init` run in a git repo.

## Steps

Preconditions: run `repo <run> empty`.

- **Create every project file.** Run `faber <run> empty init`. It exits 0 and prints, one per line, `created spec/vision.md`, `created spec/glossary.md`, `created .agents/coding-standards.md`, `created AGENTS.md`, `created CLAUDE.md`, `created .gitignore`, then `next: fill spec/vision.md and .agents/coding-standards.md, then commit`.
- **The vision has its headings.** Run `show <run> empty/spec/vision.md`. It holds `## Product principles` and `## Current direction`, each followed by a blank line and a line starting `<!-- hint: `.
- **The standards have their headings.** Run `show <run> empty/.agents/coding-standards.md`. It holds `## Rules` and `## One-way doors`.
- **AGENTS.md points the way.** Run `show <run> empty/AGENTS.md`. It names `spec/vision.md`, `spec/glossary.md` and `.agents/coding-standards.md`, says decisions, specs and slices live in `spec/features/<slug>/`, says `spec/vision.md` is the owner's, and ends with `## Rules` and nothing under it.
- **CLAUDE.md imports AGENTS.md.** Run `show <run> empty/CLAUDE.md`. It prints `@AGENTS.md` and nothing else.

## Behind it

Run `show <run> empty`.
It lists `.agents/coding-standards.md`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `spec/glossary.md` and `spec/vision.md`, and no other file.
It prints `> git commits: 0` and `(nothing staged)`: init never stages or commits.

## Gotchas

- The `created` lines come in the fixed order above, not the alphabetical order `show` lists files in.
- The `next:` line ends every run, whatever init created or kept.
- The templates are bare skeletons for a person to fill: a check asserts on the headings and lines quoted above, not on the hint wording.
