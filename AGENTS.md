# Repo conventions

Faber runs Daniel's agent skills unattended.
Read `README.md` for the boundary before changing anything.

## Rules

- Never put a method in this repo: if it would work by hand, it belongs in the skills repo as a skill.
- Prose that drives faber's own commands, like the coordinator's, lives here and calls a skill for every judgment.
- Read and write only paths listed in the skills repo's project file contract; add a path there first.
- Decide state from git, never by parsing an agent's reply.
- Every harness-specific call goes through its adapter.

## Planning

This repo dogfoods the skills: decisions, specs and slices live in `spec/features/<slug>/`.
`spec/vision.md` is the owner's; agents propose changes in their reply.

## Prose

No em-dashes anywhere in this repo's prose.
Write one sentence per line in Markdown files.

## Stack

Not decided yet.
