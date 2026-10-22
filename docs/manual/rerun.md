# Run init again

A user can run `faber init` as often as they like: it keeps every file that exists, byte for byte, and makes sure `.gitignore` ignores `.scratch/` once.

## Entry points

- `faber init` run again in a repo it already set up.
- `faber init` run in a repo whose `.gitignore` exists but does not ignore `.scratch/`.

## Steps

Preconditions: run `repo <run> twice`, then `faber <run> twice init`, then `show <run> twice` and keep its listing.

- **Keep everything on a second run.** Run `faber <run> twice init`.
  It exits 0 and prints `kept spec/vision.md`, `kept spec/glossary.md`, `kept .agents/coding-standards.md`, `kept AGENTS.md`, `kept CLAUDE.md`, `kept .gitignore`, then `next: fill spec/vision.md and .agents/coding-standards.md, then commit`.
  Then run `show <run> twice`: every line matches the listing kept before, hashes and sizes included.
- **Add .scratch/ to an existing .gitignore.** Run `repo <run> ignored`, `write <run> ignored/.gitignore node_modules/`, then `faber <run> ignored init`.
  It exits 0 and prints `appended .scratch/ to .gitignore` where the `.gitignore` line goes, and `created` for the other five files.
  Then run `show <run> ignored/.gitignore`: it prints `node_modules/` then `.scratch/`.
- **Add it only once.** Run `faber <run> ignored init` again.
  It prints `kept .gitignore`.
  Then run `show <run> ignored/.gitignore`: it still prints only `node_modules/` and `.scratch/`.

## Behind it

The two `show <run> twice` listings are identical, and both end with `> git commits: 0` and `(nothing staged)`.

## Gotchas

- A `.gitignore` that already ignores the folder as `.scratch`, `.scratch/`, `.scratch/*` or `.scratch/**`, with or without a leading `/`, is kept as it is.
- A `.gitignore` with no newline at its end gets one before `.scratch/`.
