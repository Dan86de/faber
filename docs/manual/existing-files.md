# Respect existing files

A user whose repo already has its own standards, glossary or `CLAUDE.md` runs `faber init` and keeps them: init skips a project file the skills would read from an older name, and points out a `CLAUDE.md` that misses the shared instructions.

## Entry points

- `faber init` in a repo with `CODING_STANDARDS.md`, `GLOSSARY.md` or `CONTEXT.md` at its root.
- `faber init` in a repo with a `CLAUDE.md` that does not import `@AGENTS.md`.

## Steps

Preconditions: run `repo <run> legacy`, then `write <run> legacy/CODING_STANDARDS.md "# Our standards"`, `write <run> legacy/GLOSSARY.md "# Our glossary"` and `write <run> legacy/CLAUDE.md "# Our Claude notes"`.

- **Keep the fallbacks and warn about CLAUDE.md.** Run `faber <run> legacy init`.
  It exits 0 and prints `created spec/vision.md`, `kept GLOSSARY.md (fallback)`, `kept CODING_STANDARDS.md (fallback)`, `created AGENTS.md`, `kept CLAUDE.md`, `warn CLAUDE.md does not import @AGENTS.md`, `created .gitignore`, then the `next:` line.
- **CLAUDE.md is untouched.** Run `show <run> legacy/CLAUDE.md`.
  It prints `# Our Claude notes` and nothing else.
- **CONTEXT.md is a glossary fallback too.** Run `repo <run> context`, `write <run> context/CONTEXT.md "# Our context"`, then `faber <run> context init`.
  It prints `kept CONTEXT.md (fallback)` where the glossary line goes.
  Then run `show <run> context`: it lists `CONTEXT.md` and no `spec/glossary.md`.

## Behind it

Run `show <run> legacy`.
It lists `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `GLOSSARY.md` and `spec/vision.md`, and no `spec/glossary.md` or `.agents/coding-standards.md`.

## Gotchas

- A home path that exists wins over its fallback: `spec/glossary.md` next to `GLOSSARY.md` prints `kept spec/glossary.md`.
- A `CLAUDE.md` that is a symbolic link to `AGENTS.md` gets no warning, so a check expecting one in such a repo would lie.
- The `next:` line is fixed text and still names `.agents/coding-standards.md` when the fallback was kept.
