# Stop on an interrupt

A user who presses Ctrl-C during `faber run <slug>`, or closes its terminal, stops the run cleanly: faber kills the session it started, leaves the tree as it is, and ends with `stopped: interrupted`.
A rerun resumes from git.

## Entry points

- Ctrl-C in the terminal running `faber run <slug>`, which sends SIGINT.
- Closing that terminal, which sends SIGHUP.

## Steps

Preconditions: for each of the repos `ctrl-c` and `hangup`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `write <run> <name>/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}, {"id": "S2", "blocked_by": []}]}`, `commit <run> <name> Plan demo` and `remote <run> <name>`; then `script <run> gh {}`.

- **Stop on Ctrl-C.** Run `script <run> claude [{"write": {"half.txt": "half"}, "tools": 1, "hang": true}]`, then `show <run> ctrl-c`, then `interrupt <run> ctrl-c INT run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 143, <n> tool call(s)` and `stopped: interrupted`, then `> sent SIGINT once claude call 1 started`; no `S2` line appears.
  Then run `show <run> ctrl-c`: the listing is the one from before plus `half.txt` and the run folder's files, still with `> git commits: 1` and `(nothing staged)`.
- **Stop on a closed terminal.** Run `script <run> claude [{"tools": 1, "hang": true}]`, then `interrupt <run> hangup HUP run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 143, <n> tool call(s)` and `stopped: interrupted`, then `> sent SIGHUP once claude call 2 started`; no `S2` line appears.

## Behind it

Run `calls <run> claude`: it prints `> claude calls: 2`, one `/implement-slice spec/features/demo/slices.json S1` start in each of `repos/ctrl-c` and `repos/hangup`, each with `stdin closed` and `session 0`, so no interrupted run started another session.
Run `show <run> hangup`: under `.scratch/faber/demo/<timestamp>/` it lists exactly `S1.jsonl` and `run.log`, and `show <run> hangup/<that folder>run.log` ends with `stopped: interrupted`.

## Gotchas

- `interrupt` is a helper command: it runs faber like `faber`, waits for the fake `claude` to record a start, then sends the signal to faber alone, so the fake's `exit 143`, SIGTERM's exit code, proves faber killed it; the `hang`ing fake never ends on its own.
- A real Ctrl-C reaches the session too, which may end it first with `exit 130`; faber still stops with `stopped: interrupted`.
- The tool call count depends on how much of the stream faber read before the signal, so read it as `0` or `1`.
- The same stop applies to the write-spec and write-slices sessions.
- A rerun after an interrupt finds the session's files uncommitted and refuses the dirty tree until the owner cleans it.
