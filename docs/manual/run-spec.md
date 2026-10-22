# Write the spec

A user runs `faber run <slug>` in a repo whose default branch holds the feature's decision record and ignores `.scratch/`, and faber switches to `slices/<slug>`, runs write-spec in a headless session, then commits and pushes only the spec it wrote, keeping a run folder with every printed line and each session's stream.

## Entry points

- `faber run <slug>` in a git repo whose default branch has `spec/features/<slug>/decisions.md` and a `.gitignore` with `.scratch/`, and no `slices/<slug>` branch yet.

## Steps

Preconditions: run `repo <run> ready`, `write <run> ready/.gitignore .scratch/`, `write <run> ready/spec/features/demo/decisions.md # Decisions`, `commit <run> ready Record the decisions` and `remote <run> ready`, then `script <run> gh {}`.

- **Write the spec in a session.** Run `script <run> claude [{"write": {"spec/features/demo/spec.md": "# Spec"}, "tools": 2, "message": "Wrote the spec."}, {"message": "Not cutting yet."}]`, then `faber <run> ready run demo`.
  Its first stdout line is the run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `created slices/demo from main`, `write-spec: started`, `write-spec: ended, exit 0, 2 tool calls`, `committed spec/features/demo/spec.md`, `pushed slices/demo`, `write-slices: started`, `write-slices: ended, exit 0, 0 tool calls`, `| Not cutting yet.` and `stopped: write-slices wrote nothing`; nothing on stderr.
- **Start write-spec headless.** Run `calls <run> claude`.
  It prints `> claude calls: 2`, then `1. claude -p '/write-spec spec/features/demo/decisions.md' --output-format stream-json --verbose --permission-mode auto (cwd repos/ready, stdin closed, session 0)`, then the write-slices start that [Cut the slices](./run-slices.md) checks.
- **Commit only the spec.** Run `log <run> ready`.
  It prints `> git log in repos/ready, on slices/demo`, then the newest commit `<sha> Write the spec for demo` followed by the one line `  A spec/features/demo/spec.md`, then `<sha> Record the decisions`.
- **Push the spec.** Run `show <run> ready`.
  It prints `> git commits: 2` and `(nothing staged)`, and under `> git remote origin:` the line `<sha> main` and the line `<sha> slices/demo`, at the sha `log` printed first.
- **Keep a run folder.** Run `show <run> ready/<run folder>run.log`, with the folder the run printed first.
  It holds exactly the lines the run printed to stdout, in order.
  Then run `show <run> ready/<run folder>write-spec.jsonl`: its first line is a `"type":"system"` event and its last a `"type":"result"` event.

## Behind it

The `show <run> ready` listing from **Push the spec** lists, under `.scratch/faber/demo/<timestamp>/`, exactly `run.log`, `write-slices.jsonl` and `write-spec.jsonl`, next to `.gitignore`, `spec/features/demo/decisions.md` and `spec/features/demo/spec.md`.
Run `calls <run> gh`: it prints `> gh calls: 0`, because writing the spec reads no PR.

## Gotchas

- Once a run has its folder, every line goes to stdout and into the folder's `run.log`; only refusals before it go to stderr.
- `show` lists ignored files too, so the run folder appears in the listing even though git never sees it.
- faber commits the spec itself; a write-spec session that exits non-zero, writes any other path, commits on its own, or writes nothing stops the run with `stopped: write-spec exited <code>`, `touched <path>`, `committed on its own` or `wrote nothing`, and leaves the tree as it is.
- A stop prints the session's last message, each line prefixed with `| `, before the `stopped:` line.
- Once the spec is pushed, the run goes on to cut the slices, as [Cut the slices](./run-slices.md) describes.
- A rerun on an existing `slices/<slug>` prints `on slices/<slug>` instead of `created`, and skips write-spec once `spec.md` is committed there.
- The run folder's timestamp is UTC; a second run started in the same second gets `-2`, then `-3`.
