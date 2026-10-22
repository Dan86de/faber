# faber

The harness that runs [Dan86de/skills](https://github.com/Dan86de/skills) unattended.

*Faber* is Latin for a maker, a craftsman or smith.
Faber is the tool that runs the makers.

Status: concept.
Nothing runs yet.

## Boundary

The skills repo holds methods: each skill works by hand, in any harness, with no harness installed.
Faber holds everything that runs those skills without a person at the keyboard.

- Faber never copies or edits a skill.
- Faber reads and writes only the paths in the skills repo's [project file contract](https://github.com/Dan86de/skills/blob/main/.agents/conventions.md#project-file-contract).
- Git is the state: progress comes from commit trailers, never from what an agent says.

## What it will do, in order

1. `init`: create the project files the skills read but never write (`spec/vision.md`, `spec/glossary.md`, `.agents/coding-standards.md`, `AGENTS.md`), from templates, never overwriting.
2. Loop: run implement-slice on each ready `afk` slice in a fresh headless session, stop on `hitl` or a failed gate.
3. Ping: tell the owner when a slice waits for sign-off, a run stops, or a PR is ready.
4. Context: put the vision and standards into every session.
5. Board: one view of every feature's state, generated from git.
6. Parallel slices in worktrees, then a front desk agent, then a skill auditor.

## Harness neutral

One adapter per harness: start a headless session with a skill and its arguments, return the exit code.
Claude Code first, then Codex, OpenCode and Cursor.

## License

MIT
