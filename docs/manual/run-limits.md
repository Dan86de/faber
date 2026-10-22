# Stop on a failed session

A user runs `faber run <slug>` and leaves it, and faber stops the run when a session exits non-zero, hits a permission denial, runs past its time limit or passes its tool call cap, even when the session committed its trailer.
faber kills a session still running when it passes a limit, prints the session's last message and one `stopped:` line naming why, exits non-zero, and leaves the tree as it is.

## Entry points

- `faber run <slug>`, with each session limited to 90 minutes and 900 tool calls.
- `faber run <slug> --timeout <minutes>`, with decimal minutes such as `0.05`.
- `faber run <slug> --max-tools <n>`.

## Steps

Preconditions: for each of the repos `crash`, `denied`, `slow` and `busy`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `write <run> <name>/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}, {"id": "S2", "blocked_by": []}]}`, `commit <run> <name> Plan demo` and `remote <run> <name>`; then `script <run> gh {}`.

- **Stop on a non-zero exit.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}, "exit": 2, "message": "Crashed.\nSee the log."}]`, then `faber <run> crash run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 2, 0 tool calls`, `| Crashed.`, `| See the log.` and `stopped: S1 exited 2`; no `S2` line appears.
- **Stop on a permission denial.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}, "denials": 1, "message": "Could not push."}]`, then `faber <run> denied run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 0, 1 tool call`, `| Could not push.` and `stopped: S1 hit a permission denial`; no `S2` line appears.
- **Kill a session that runs past the timeout.** Run `script <run> claude [{"write": {"half.txt": "half"}, "tools": 1, "hang": true}]`, then `show <run> slow`, then `faber <run> slow run demo --timeout 0.05`.
  It exits 1 after about three seconds, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 143, 1 tool call` and `stopped: S1 ran past 0.05 minutes`.
  Then run `show <run> slow`: the listing is the one from before plus `half.txt` and the run folder's files, still with `> git commits: 1` and `(nothing staged)`.
- **Kill a session that passes the tool cap.** Run `script <run> claude [{"tools": 5, "hang": true}]`, then `faber <run> busy run demo --max-tools 3`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 143, 4 tool calls` and `stopped: S1 passed 3 tool calls`.

## Behind it

Run `calls <run> claude`: it prints `> claude calls: 4`, one `/implement-slice spec/features/demo/slices.json S1` start in each of `repos/crash`, `repos/denied`, `repos/slow` and `repos/busy`, each with `stdin closed` and `session 0`, so no stopped run started another session.
Run `log <run> denied`: it prints `<sha> Build S1` with the one line `  A s1.txt`, then `<sha> Plan demo`, so the trailer the session committed did not carry the run on.
Run `show <run> busy`: under `.scratch/faber/demo/<timestamp>/` it lists exactly `S1.jsonl` and `run.log`.

## Gotchas

- The fake that `hang`s never ends on its own, so a run that returns at all, with `exit 143`, proves faber killed it; 143 is SIGTERM's exit code.
- `--max-tools <n>` allows exactly `n` tool calls; the call after it kills the session, so the end line counts `n + 1`.
- A limit faber killed the session for wins over a denial, and a denial over a non-zero exit, so each stop has one reason.
- The same stops apply to the write-spec and write-slices sessions, named by their phase, such as `stopped: write-spec hit a permission denial`.
- `--timeout` takes plain decimal minutes above 0 and up to 35000, and `--max-tools` a whole number above 0; anything else is refused on stderr before any session, as are a flag with no value and a flag faber does not know, which print the usage line.
- The verify helper kills faber after 10 seconds, so keep `--timeout` below `0.15` in a check.
