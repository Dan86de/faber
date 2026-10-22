# Build the slices

A user runs `faber run <slug>` once the feature's spec and slices are committed, and faber runs implement-slice in one headless session per ready slice, one at a time, going on while each session adds its `Slice:` trailer.
A session that adds no trailer for its slice stops the run: faber prints the session's last message and one `stopped:` line, exits non-zero, and leaves the tree as it is.

## Entry points

- `faber run <slug>` in a git repo whose branch for the run has `spec/features/<slug>/spec.md` and a `spec/features/<slug>/slices.json` listing slices committed.

## Steps

Preconditions: for each of the repos `build` and `nothing`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `write <run> <name>/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}, {"id": "S2", "blocked_by": ["S1"]}]}`, `commit <run> <name> Plan demo` and `remote <run> <name>`; then `script <run> gh {}`.

- **Build ready slices in turn.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}, "tools": 2}, {"write": {"s2.txt": "S2"}, "commit": {"message": "Build S2", "trailers": ["Slice: S2"]}}]`, then `faber <run> build run demo`.
  It exits 1.
  Its first stdout line is the run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `created slices/demo from main`, `S1: started`, `S1: ended, exit 0, 2 tool calls`, `S2: started`, `S2: ended, exit 0, 0 tool calls`, and `stopped: closing the branch is not built yet`; nothing on stderr.
- **Start one implement-slice session per slice.** Run `calls <run> claude`.
  It prints `> claude calls: 2`, then `1. claude -p '/implement-slice spec/features/demo/slices.json S1' --output-format stream-json --verbose --permission-mode auto (cwd repos/build, stdin closed, session 0)`, then the same line for `S2` as `2.` with `session 1`.
- **Go on after a Slice trailer.** Run `log <run> build`.
  It prints `> git log in repos/build, on slices/demo`, then `<sha> Build S2` with the one line `  A s2.txt`, then `<sha> Build S1` with the one line `  A s1.txt`, then `<sha> Plan demo`.
- **Stop when a slice commits nothing.** Run `script <run> claude [{"write": {"half.txt": "half"}, "message": "The gate failed.\nLeft the diff."}]`, then `show <run> nothing`, then `faber <run> nothing run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 0, 0 tool calls`, `| The gate failed.`, `| Left the diff.` and `stopped: S1 committed nothing`; no `S2` line appears.
  Then run `show <run> nothing`: the listing is the one from before plus `half.txt` and the run folder's files, still with `> git commits: 1`, `(nothing staged)` and only `<sha> main` under the remote.

## Behind it

Run `calls <run> claude`: it prints `> claude calls: 3`, the last `/implement-slice spec/features/demo/slices.json S1` in `repos/nothing` with `session 0`.
Run `calls <run> gh`: it prints `> gh calls: 0`, because building slices reads no PR.
Run `show <run> build`: under `.scratch/faber/demo/<timestamp>/` it lists exactly `S1.jsonl`, `S2.jsonl` and `run.log`.
Run `show <run> build/<run folder>run.log`, with the folder that run printed first: it holds exactly the lines the run printed, and only its last line starts with `stopped: `.

## Gotchas

- faber picks the slice the way implement-slice does: the lowest id with no `Slice:` or `Slice-Pending:` trailer on `<default>..HEAD` whose every `blocked_by` has a `Slice:` trailer, and it names that id in the session's prompt.
- Only a `Slice:` trailer for the slice the session was started for counts; a commit without it, or with another slice's id, is `committed nothing`.
- faber never commits or pushes for a slice; implement-slice does both itself.
- A session that exits non-zero stops the run with `stopped: <id> exited <code>`.
- A session that adds `Slice-Pending:` for its slice goes on to the next ready slice; see [Go on past a sign-off](./run-signoff.md).
- A slices file faber cannot read stops the run before any session with `stopped: spec/features/<slug>/slices.json <problem>`, such as `lists no slices` or `is not JSON`; slices whose blockers never finish stop it with `stopped: no slice is ready`, after one `| <id> waits for <ids>` line each.
- Until faber can close the branch, a run whose every slice is done ends with `stopped: closing the branch is not built yet` and exit 1.
