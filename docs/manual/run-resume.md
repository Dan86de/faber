# Resume a stopped run

A user runs `faber run <slug>` again after a run stopped, was killed, or waited for a sign-off the user then made by hand, and faber picks up from what git records.
It skips every planning file already committed on the branch and every slice with a `Slice:` trailer, starts the step that stopped, and never starts a session twice in one run.

## Entry points

- `faber run <slug>` in a git repo where an earlier `faber run <slug>` already made `slices/<slug>`, whether the run stopped on a session, a limit killed one, or a slice waited for sign-off.

## Steps

Preconditions: run `repo <run> resume`, `write <run> resume/.gitignore .scratch/`, `write <run> resume/spec/features/demo/decisions.md # Decisions`, `commit <run> resume Record demo` and `remote <run> resume`.
Then run `repo <run> signoff`, `write <run> signoff/.gitignore .scratch/`, `write <run> signoff/spec/features/demo/decisions.md # Decisions`, `write <run> signoff/spec/features/demo/spec.md # Spec`, `write <run> signoff/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}, {"id": "S2", "blocked_by": ["S1"]}]}`, `commit <run> signoff Plan demo` and `remote <run> signoff`; then `script <run> gh {}`.

- **Stop at a planning step.** Run `script <run> claude [{"write": {"spec/features/demo/spec.md": "# Spec"}}, {"message": "No slices yet."}]`, then `faber <run> resume run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `committed spec/features/demo/spec.md`, `pushed slices/demo`, `write-slices: started`, `write-slices: ended, exit 0, 0 tool calls`, `| No slices yet.` and `stopped: write-slices wrote nothing`.
- **Resume at the stopped planning step.** Run `script <run> claude [{"write": {"spec/features/demo/slices.json": "{\"slices\": [{\"id\": \"S1\", \"blocked_by\": []}, {\"id\": \"S2\", \"blocked_by\": [\"S1\"]}]}"}}, {"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}}, {"message": "Gate failed."}]`, then `faber <run> resume run demo`.
  It exits 1.
  Its first stdout line is a new run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `on slices/demo`, `write-slices: started`, `write-slices: ended, exit 0, 0 tool calls`, `committed spec/features/demo/slices.json`, `pushed slices/demo`, `S1: started`, `S1: ended, exit 0, 0 tool calls`, `S2: started`, `S2: ended, exit 0, 0 tool calls`, `| Gate failed.` and `stopped: S2 committed nothing`; nothing on stderr, and no `write-spec` line.
- **Resume after a kill.** Run `script <run> claude [{"hang": true}]`, then `faber <run> resume run demo --timeout 0.05`.
  It exits 1, nothing on stderr, and its stdout is a new run folder, then `on slices/demo`, `S2: started`, `S2: ended, exit 143, 0 tool calls` and `stopped: S2 ran past 0.05 minutes`.
  Then run `show <run> resume`: outside `.scratch/` the files are `.gitignore`, `s1.txt` and the three under `spec/features/demo/`, with `(nothing staged)`.
- **Resume at the stopped slice.** Run `script <run> claude [{"write": {"s2.txt": "S2"}, "commit": {"message": "Build S2", "trailers": ["Slice: S2"]}}, {}]`, then `faber <run> resume run demo`.
  It exits 1, nothing on stderr, and its stdout is a new run folder, then `on slices/demo`, `S2: started`, `S2: ended, exit 0, 0 tool calls`, `close-branch: started`, `close-branch: ended, exit 0, 0 tool calls`, `| Done.` and `stopped: gh pr view failed: no pull requests found for the current branch`.
- **Start each session once per run.** Run `calls <run> claude`.
  It prints `> claude calls: 8`: `/write-spec spec/features/demo/decisions.md` with `session 0` and `/write-slices spec/features/demo/spec.md` with `session 1` from the first run; `/write-slices spec/features/demo/spec.md` with `session 0`, then `/implement-slice spec/features/demo/slices.json S1` and `... S2` with `session 1` and `session 2` from the second; then `... S2` with `session 0` from each of the last two, the last followed by `/implement-slice spec/features/demo/slices.json` with `session 1`, every one in `repos/resume` with `stdin closed`.
- **Stop for a sign-off.** Run `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice-Pending: S1"]}}]`, then `faber <run> signoff run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `S1: started`, `S1: ended, exit 0, 0 tool calls` and `stopped: S1 waits for sign-off`.
- **Go on past a sign-off made by hand.** Run `commit <run> signoff "Sign off S1\n\nSlice: S1" --empty`, with the `\n`s as real line breaks; it prints `commit: <sha> Sign off S1 (slices/demo, 0 files)`.
  Then run `script <run> claude [{"write": {"s2.txt": "S2"}, "commit": {"message": "Build S2", "trailers": ["Slice: S2"]}}, {}]`, then `faber <run> signoff run demo`.
  It exits 1, nothing on stderr, and its stdout is a new run folder, then `on slices/demo`, `S2: started`, `S2: ended, exit 0, 0 tool calls`, `close-branch: started`, `close-branch: ended, exit 0, 0 tool calls`, `| Done.` and `stopped: gh pr view failed: no pull requests found for the current branch`; no `S1` line.

## Behind it

Run `log <run> resume`: it prints `> git log in repos/resume, on slices/demo`, then `<sha> Build S2` with `  A s2.txt`, `<sha> Build S1` with `  A s1.txt`, `<sha> Cut demo into slices` with `  A spec/features/demo/slices.json`, `<sha> Write the spec for demo` with `  A spec/features/demo/spec.md`, and `<sha> Record demo`: each step committed once across the four runs.
Run `show <run> resume`: under `.scratch/faber/demo/` it lists four run folders, the first holding `run.log`, `write-slices.jsonl` and `write-spec.jsonl`, the second `S1.jsonl`, `S2.jsonl`, `run.log` and `write-slices.jsonl`, the third `S2.jsonl` and `run.log`, the last `S2.jsonl`, `close-branch.jsonl` and `run.log`; under `> git remote origin:` it lists `main` and `slices/demo` at the `Cut demo into slices` commit, the last one faber pushed itself, since the fake slice sessions do not push.
Run `log <run> signoff`: it prints `<sha> Build S2` with `  A s2.txt`, then `<sha> Sign off S1` with no path lines, then `<sha> Build S1` with `  A s1.txt`, then `<sha> Plan demo`.
Run `calls <run> claude` again: it prints `> claude calls: 11`, the last three `/implement-slice spec/features/demo/slices.json S1` with `session 0`, then `... S2` with `session 0` and `/implement-slice spec/features/demo/slices.json` with `session 1`, each in `repos/signoff`.

## Gotchas

- A rerun reads only git: a committed `spec.md` or `slices.json` on the branch skips its planning session, and a `Slice:` trailer on `<default>..HEAD` skips its slice, whoever made the commit.
- A rerun prints `on slices/<slug>` where the first run printed `created slices/<slug> from <default>`, and each run gets its own run folder.
- faber never retries: a session that stops the run is started once in that run, and only a rerun by the user starts it again.
- A killed session can leave a dirty tree; a rerun then refuses with the dirty paths until the user cleans them, as any run with a dirty tree does.
- The hand sign-off is an empty commit with a `Slice: <id>` trailer, which `/implement-slice --signoff <id>` makes; faber treats it as any other `Slice:` trailer.
