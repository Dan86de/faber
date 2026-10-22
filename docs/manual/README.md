# Faber manual

What faber does, feature by feature, and what you should see at each step.
A person reads it as the product's checklist; the verify skill reads it as the recipe for a check.

Faber is a command line tool, `faber`, that a user runs inside a git repo.
In this checkout it runs as `node src/cli.ts`.

## Start from a known state

- Start a run with the verify skill; it prints the run folder and its `repos/` folder.
- Run the doctor right after, and require `fit`.
- A new run has no repos: make each one a feature file asks for with `repo`, as a git repo with no commits unless the step says `--no-git`.

## Driving conventions

- `faber <run> <name> <args>` in a step is the verify helper's `faber` command, never the `faber` binary: it runs faber from the named repo, or a folder in it. `repo`, `write`, `mkdir` and `show` are helper commands too.
- Make the files a step expects to exist with `write`, and the folders with `mkdir`, before running faber.
- Each feature file names a `show` after every step that might write; it lists every file with its hash, the commit count, and what is staged. Run exactly the `show`s the file names.
- Every step and every `Behind it` line is a check; an entry point with no step of its own is not driven.
- Quoted output is how the output starts; `[stderr]` marks a line faber printed to stderr.
- Start a fresh run per feature file.

## Feature file shape

The feature's name, one paragraph on what a user gets, then in order:

1. `Entry points`: every way a user reaches the feature.
2. `Steps`: the user's action, the command that performs it, and what you should see.
3. `Behind it`: the state the steps leave, and how to read it.
4. `Gotchas`: what wastes a run or makes a check lie.

Only user paths, handles, commands, state and what proves it: no implementation details.

## Features

- [Usage](./usage.md): what faber prints with no command, when asked for help, and for a command it does not know.
- [Init](./init.md): the project files `faber init` creates in an empty repo, and that it commits nothing.
- [Run init again](./rerun.md): a second run keeps every file byte for byte, and `.gitignore` gets `.scratch/` once.
- [Respect existing files](./existing-files.md): older standards and glossary files are kept as fallbacks, and a `CLAUDE.md` without `@AGENTS.md` gets a warning.
