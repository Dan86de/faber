# Cut the slices

A user runs `faber run <slug>` once the feature's spec is committed, and faber runs write-slices in a headless session, then commits and pushes only the `slices.json` it wrote.
A planning session that touches any other path or writes nothing stops the run instead: faber prints the session's last message and one `stopped:` line, exits non-zero, commits nothing and leaves the tree as it is.

## Entry points

- `faber run <slug>` in a git repo whose branch for the run has `spec/features/<slug>/spec.md` committed and no `spec/features/<slug>/slices.json`.

## Steps

Preconditions: for each of the repos `ready`, `stray` and `empty`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `commit <run> <name> Plan demo` and `remote <run> <name>`; then `script <run> gh {}`.

- **Cut the slices in a session.** Run `script <run> claude [{"write": {"spec/features/demo/slices.json": "{}"}, "tools": 3, "message": "Cut it."}]`, then `faber <run> ready run demo`.
  It exits 1.
  Its first stdout line is the run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `created slices/demo from main`, `write-slices: started`, `write-slices: ended, exit 0, 3 tool calls`, `committed spec/features/demo/slices.json`, `pushed slices/demo`, and `stopped: implement-slice is not built yet`; nothing on stderr.
- **Start write-slices headless.** Run `calls <run> claude`.
  It prints `> claude calls: 1`, then `1. claude -p '/write-slices spec/features/demo/spec.md' --output-format stream-json --verbose --permission-mode auto (cwd repos/ready, stdin closed, session 0)`.
- **Commit only the slices.** Run `log <run> ready`.
  It prints `> git log in repos/ready, on slices/demo`, then the newest commit `<sha> Cut demo into slices` followed by the one line `  A spec/features/demo/slices.json`, then `<sha> Plan demo`.
- **Push the slices.** Run `show <run> ready`.
  It prints `> git commits: 2` and `(nothing staged)`, and under `> git remote origin:` the line `<sha> main` and the line `<sha> slices/demo`, at the sha `log` printed first.
- **Stop on a stray path.** Run `script <run> claude [{"write": {"spec/features/demo/slices.json": "{}", "notes.md": "stray"}, "message": "Cut it.\nAlso took notes."}]`, then `show <run> stray`, then `faber <run> stray run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `write-slices: ended, exit 0, 0 tool calls`, `| Cut it.`, `| Also took notes.` and `stopped: write-slices touched notes.md`.
  Then run `show <run> stray` and `log <run> stray`: the listing is the one from before plus `notes.md`, `spec/features/demo/slices.json` and the run folder's files, still with `> git commits: 1`, `(nothing staged)` and only `<sha> main` under the remote, and the log is on `slices/demo` with `Plan demo` as its only commit.
- **Stop when nothing is written.** Run `script <run> claude [{"message": "Nothing to cut."}]`, then `show <run> empty`, then `faber <run> empty run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `write-slices: ended, exit 0, 0 tool calls`, `| Nothing to cut.` and `stopped: write-slices wrote nothing`.
  Then run `show <run> empty`: the listing is the one from before plus the run folder's files, still with `> git commits: 1`, `(nothing staged)` and only `<sha> main` under the remote.

## Behind it

Run `calls <run> claude`: it prints `> claude calls: 3`, the last two `/write-slices spec/features/demo/spec.md` in `repos/stray` and `repos/empty`, one session each.
Run `calls <run> gh`: it prints `> gh calls: 0`, because cutting the slices reads no PR.
Run `show <run> stray/<run folder>run.log`, with the folder that run printed first: it holds exactly the lines the run printed, and only its last line starts with `stopped: `.

## Gotchas

- A spec committed on the default branch counts: the run creates `slices/<slug>` from it, skips write-spec, and starts at write-slices.
- faber commits `slices.json` itself; a write-slices session that exits non-zero, writes any other path, commits on its own, or writes nothing stops the run with `stopped: write-slices exited <code>`, `touched <path>`, `committed on its own` or `wrote nothing`, the same stops write-spec has.
- `touched` names the first stray path in sorted order, whether the session added, changed or deleted it.
- A stop leaves what the session wrote for the owner to read, so the next run refuses the dirty tree until the owner cleans it.
- Until faber can build slices, a run with both planning files committed ends with `stopped: implement-slice is not built yet` and exit 1.
