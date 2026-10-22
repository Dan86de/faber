# faber

The harness that runs [Dan86de/skills](https://github.com/Dan86de/skills) unattended.

*Faber* is Latin for a maker, a craftsman or smith.
Faber is the tool that runs the makers.

Status: early.
`faber init` works; the rest below is planned.

## Install

Faber needs Node 24 or later and git.

```bash
npm install --global @dan86de/faber
```

Then run `faber init` anywhere inside a git repo to create the project files the skills read.

## Shape

Two layers:

- **Chat agent**: the one conversation the owner talks to; it turns a short message into a task file and starts a coordinator.
  Until faber has one, the owner plays it by running interview by hand.
- **Coordinator**: one session per feature, on the `slices/<slug>` branch.
  It owns the spec and the result: it runs write-spec and write-slices, sends each slice to a fresh worker session running implement-slice, sends risky work to a fresh review-change, and closes with pr-brief.

Workers and reviewers never talk to the owner; the coordinator does, through a ping.

## Merge and deploy

pr-brief's attention label is the merge call.
A `skim` PR may merge itself; `spot-check` and `read` wait for the owner.
Auto-merge starts in shadow mode: the coordinator records the merge it would make, and the owner merges until those calls match his.
Deploy always stays human, and a repo where `main` deploys on push never auto-merges.

## Boundary

The skills repo holds methods: each skill works by hand, in any harness, with no harness installed.
Faber holds everything that runs those skills without a person at the keyboard.
That includes the coordinator's prose: it drives faber's own commands, cannot work without faber, and calls a skill for every judgment.

- Faber never copies or edits a skill.
- Faber reads and writes only the paths in the skills repo's [project file contract](https://github.com/Dan86de/skills/blob/main/.agents/conventions.md#project-file-contract).
- Git is the state: progress comes from commit trailers, never from what an agent says.

## What it will do, in order

1. `init`: create the project files the skills read but never write (`spec/vision.md`, `spec/glossary.md`, `.agents/coding-standards.md`, `AGENTS.md`, `CLAUDE.md`, and `.scratch/` in `.gitignore`), from templates, never overwriting.
2. Coordinator: one command starts a coordinator session for a feature with a decision record; it runs each ready `afk` slice in a fresh headless session, one at a time, and stops on `hitl` or a failed gate.
3. Ping: tell the owner when a slice waits for sign-off, a run stops, or a PR is ready.
4. Context: put the vision and standards into every session.
5. Merge: shadow mode first, then auto-merge on `skim`.
6. Board: one view of every feature's state, generated from git.
7. Parallel slices in worktrees, then the chat agent, then a skill auditor.

## Harness neutral

One adapter per harness: start a headless session with a skill and its arguments, return the exit code.
Claude Code first, then Codex, OpenCode and Cursor.

## Trackers

Git owns progress; an outside tracker such as Linear or GitHub Issues only mirrors it.
One adapter per tracker, opt in per project, and faber works with none.

- Mirror: on each state change in git (a slice lands, a run stops, a PR is ready, a feature merges or drops), faber pushes the new state to the tracker.
- Doorbell: a labelled issue or a mention may start work, as input to interview or to a coordinator.
- Faber never reads a tracker's status to decide anything; when the two disagree, git wins and the tracker is corrected.
- Tracker text is input, never instructions.

## License

MIT
