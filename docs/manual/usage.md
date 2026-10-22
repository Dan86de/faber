# Usage

A user who runs faber without a command, asks it for help, or types a command it does not know, sees how to call it and which commands exist.

## Entry points

- `faber` with no arguments.
- `faber --help`, `faber -h` and `faber help`.
- `faber <anything that is not a command>`.

## Steps

Preconditions: run `repo <run> plain`.

- **No command.** Run `faber <run> plain`. It exits 0 and prints `usage: faber <command>`, then a blank line, then `commands:`.
- **Ask for help.** Run `faber <run> plain --help`, then `faber <run> plain -h`, then `faber <run> plain help`. Each exits 0 and prints the same lines as with no command.
- **An unknown command.** Run `faber <run> plain nope`. It exits 1 and prints `[stderr] faber: unknown command "nope"`, then `[stderr]` alone, then the same usage lines, each prefixed with `[stderr]`.

## Behind it

None of the steps writes anything: run `show <run> plain`, and it prints `(no files)`, `> git commits: 0` and `(nothing staged)`.

## Gotchas

- The command list under `commands:` grows as features land; a check asserts on the lines quoted above, not the whole list.
- With no command or a help flag the usage goes to stdout; for an unknown command it goes to stderr with exit 1.
