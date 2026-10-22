# Close the branch

A user runs `faber run <slug>` until every slice is done, and faber runs implement-slice once more in a headless session to close the branch and mark its PR ready.
Then it asks `gh` for the branch's PR: a PR that is no longer a draft ends the run with `done: PR ready <url>` and exit 0, and anything else stops it with one `stopped:` line and a non-zero exit.

## Entry points

- `faber run <slug>` in a git repo whose branch for the run has `spec/features/<slug>/spec.md` and `spec/features/<slug>/slices.json` committed, once every slice it lists has a `Slice:` trailer on `<default>..HEAD`, whether this run added the last one or an earlier run did.

## Steps

Preconditions: for each of the repos `close` and `draft`, run `repo <run> <name>`, `write <run> <name>/.gitignore .scratch/`, `write <run> <name>/spec/features/demo/decisions.md # Decisions`, `write <run> <name>/spec/features/demo/spec.md # Spec`, `write <run> <name>/spec/features/demo/slices.json {"slices": [{"id": "S1", "blocked_by": []}]}`, `commit <run> <name> Plan demo` and `remote <run> <name>`.

- **Close the branch and end on the ready PR.** Run `script <run> gh {"pr": {"url": "https://github.com/owner/demo/pull/7", "isDraft": false}}`, then `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}}, {"write": {"review.txt": "ok"}, "commit": {"message": "Address review"}, "tools": 2}]`, then `faber <run> close run demo`.
  It exits 0.
  Its first stdout line is the run folder, `.scratch/faber/demo/<yyyymmdd-hhmmss>/`.
  Then, one per line: `created slices/demo from main`, `S1: started`, `S1: ended, exit 0, 0 tool calls`, `close-branch: started`, `close-branch: ended, exit 0, 2 tool calls` and `done: PR ready https://github.com/owner/demo/pull/7`; nothing on stderr.
- **Start one closing session and read the PR once.** Run `calls <run> claude`.
  It prints `> claude calls: 2`, the second `2. claude -p '/implement-slice spec/features/demo/slices.json' --output-format stream-json --verbose --permission-mode auto (cwd repos/close, stdin closed, session 1)`, with no slice id in the prompt.
  Then run `calls <run> gh`: it prints `> gh calls: 1`, then `1. gh pr view slices/demo --json url,isDraft (cwd repos/close, stdin closed)`.
- **Close again on a rerun.** Run `script <run> claude [{}]`, then `faber <run> close run demo`.
  It exits 0, nothing on stderr, and its stdout is a new run folder, then `on slices/demo`, `close-branch: started`, `close-branch: ended, exit 0, 0 tool calls` and `done: PR ready https://github.com/owner/demo/pull/7`; no `S1` line.
- **Stop on a draft PR.** Run `script <run> gh {"pr": {"url": "https://github.com/owner/demo/pull/8", "isDraft": true}}`, then `script <run> claude [{"write": {"s1.txt": "S1"}, "commit": {"message": "Build S1", "trailers": ["Slice: S1"]}}, {"message": "Review blocks.\nLeft the PR as a draft."}]`, then `faber <run> draft run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `close-branch: started`, `close-branch: ended, exit 0, 0 tool calls`, `| Review blocks.`, `| Left the PR as a draft.` and `stopped: the PR is still a draft: https://github.com/owner/demo/pull/8`.
- **Stop when gh finds no PR.** Run `script <run> gh {}`, then `script <run> claude [{}]`, then `faber <run> draft run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `close-branch: ended, exit 0, 0 tool calls`, `| Done.` and `stopped: gh pr view failed: no pull requests found for the current branch`.
- **Read no PR when the closing session fails.** Run `script <run> claude [{"message": "Could not push.", "exit": 2}]`, then `faber <run> draft run demo`.
  It exits 1, nothing on stderr, and its stdout ends with `close-branch: ended, exit 2, 0 tool calls`, `| Could not push.` and `stopped: close-branch exited 2`.
  Then run `calls <run> gh`: it prints `> gh calls: 4`, the last one from the run before, since this run read no PR.

## Behind it

Run `log <run> close`: it prints `> git log in repos/close, on slices/demo`, then `<sha> Address review` with the one line `  A review.txt`, then `<sha> Build S1` with the one line `  A s1.txt`, then `<sha> Plan demo`.
Run `show <run> close`: under `.scratch/faber/demo/` it lists two run folders, the first holding exactly `S1.jsonl`, `close-branch.jsonl` and `run.log`, the second `close-branch.jsonl` and `run.log`, and the tree has nothing uncommitted outside them.
Run `show <run> close/<run folder>run.log`, with the folder the first run printed first: it holds exactly the lines that run printed, the last one `done: PR ready https://github.com/owner/demo/pull/7`.

## Gotchas

- The PR's draft flag, read with `gh pr view <branch> --json url,isDraft`, is the only thing faber reads outside git, and only for the run's last line; the closing session's reply never ends the run.
- Every run that finds every slice done starts the closing session, a rerun after a ready PR included; implement-slice decides whether anything is left to close.
- A missing `gh`, a failed `gh pr view` or a draft PR stops the run, after the closing session's last message.
- The closing session is named `close-branch` in its start and end lines, its stop lines and its transcript, and `--timeout`, `--max-tools`, permission denials and interrupts stop it as they stop any session.
