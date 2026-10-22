# Go on past a sign-off

A user runs `faber run <slug>` on a feature with a slice that needs a person to sign it off, and faber does not wait for them.
When a session adds a `Slice-Pending:` trailer for its slice, the run goes on with every slice that does not depend on it, then ends listing every slice that waits for sign-off with one `stopped:` line and a non-zero exit.

## Entry points

- `faber run <slug>` in a git repo whose branch for the run has `spec/features/<slug>/spec.md` and a `spec/features/<slug>/slices.json` listing slices committed, when an implement-slice session adds `Slice-Pending: <id>` for its slice.

## Steps

Preconditions: for each of the repos `pend` and `both`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `write <run> <name>/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}, {"id": "S2", "blocked_by": ["S1"]}, {"id": "S3", "blocked_by": []}]}`, `commit <run> <name> Plan demo` and `remote <run> <name>`; then `script <run> gh {}`.

- **Go on with an independent slice.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice-Pending: S1"]}}, {"write": {"s3.txt": "S3"}, "commit": {"message": "Build S3", "trailers": ["Slice: S3"]}}]`, then `faber <run> pend run demo`.
  It exits 1.
  Its first stdout line is the run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `created slices/demo from main`, `S1: started`, `S1: ended, exit 0, 0 tool calls`, `S3: started`, `S3: ended, exit 0, 0 tool calls`, and `stopped: S1 waits for sign-off`; nothing on stderr, and no `S2` line, since S2 waits for S1.
- **Start no session for a slice that depends on a pending one.** Run `calls <run> claude`.
  It prints `> claude calls: 2`, then `1. claude -p '/implement-slice spec/features/demo/slices.json S1' --output-format stream-json --verbose --permission-mode auto (cwd repos/pend, stdin closed, session 0)`, then the same line for `S3` as `2.` with `session 1`.
- **List every slice that waits.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice-Pending: S1"]}}, {"write": {"s3.txt": "S3"}, "commit": {"message": "Build S3", "trailers": ["Slice-Pending: S3"]}}]`, then `faber <run> both run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S3: started`, `S3: ended, exit 0, 0 tool calls` and `stopped: S1, S3 wait for sign-off`.

## Behind it

Run `log <run> pend`: it prints `> git log in repos/pend, on slices/demo`, then `<sha> Build S3` with the one line `  A s3.txt`, then `<sha> Build S1` with the one line `  A s1.txt`, then `<sha> Plan demo`.
Run `show <run> pend`: under `.scratch/faber/demo/<timestamp>/` it lists exactly `S1.jsonl`, `S3.jsonl` and `run.log`, and the tree has nothing uncommitted outside the run folder.

## Gotchas

- Only a `Slice-Pending:` trailer for the slice the session was started for goes on; one naming another slice is `committed nothing`.
- A slice whose blocker waits for sign-off is not ready, so the run starts no session for it.
- The status line names every pending slice in id order, with `waits` for one and `wait` for more, including slices already pending when the run started.
- faber never signs a slice off; the owner runs `/implement-slice --signoff <id>` by hand, then runs `faber run <slug>` again.
