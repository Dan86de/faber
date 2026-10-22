# Vision

> Owner-written. Agents read it before choosing work and propose changes, never rewrite it.

## Product principles

- **Who**: one owner, Daniel, running his own skills on his own repos; other users are welcome but never shape a decision.
- **Value**: a short message in, a PR with proof out; engineering time is cheap and the owner's attention is not.
- **Two layers**: the owner talks to one conversation; each feature gets a coordinator session that owns its spec, branch and result, and sends each slice to a fresh worker session.
- **Intent in files**: vision, glossary and standards ride every session, so the owner's messages stay short.
- **Mechanism, not method**: faber starts, tracks and stops sessions, and its prose only drives faber's own commands; every judgment lives in a skill.
- **Git is the state**: progress comes from commit trailers, never from an agent's reply.
- **Trackers mirror, never own**: Linear, GitHub Issues and the like each get one adapter; faber pushes state to them on each state change in git, and they may start work, but faber never reads their status to decide anything.
- **Evidence before done**: a clean exit is not proof; a slice is done when its gate passed and git records it.
- **Fresh review where a mistake is expensive**: a reviewer in a new context, with a ceiling on rounds.
- **Stop over guess**: on a hitl slice, a failed gate or unclear state, the coordinator stops and pings the owner.
- **The label decides the merge**: pr-brief's attention label is the merge call; `skim` may merge itself, `spot-check` and `read` wait for the owner.
- **Deploy stays human**: merging is not shipping; in a repo where `main` deploys on push, nothing merges itself.
- **Fix the cause**: an agent failure becomes a change to a skill or a standard, not a one-off correction.
- **Harness neutral**: every harness call goes through an adapter; Claude Code is the first harness, not the only one.

## Current direction

- **Outcome**: faber builds faber; after the owner runs interview by hand, one command starts a coordinator that carries the feature to a ready PR on Claude Code and pings him when a slice waits, a run stops or the PR is ready.
- **Why now**: the skills already carry a feature from interview to pr-brief by hand, and every handoff between them still costs the owner's attention.
- **Constraint**: Claude Code only, one slice at a time, no worktrees or parallel runs until the sequential coordinator is reliable.
- **Shadow merge**: the coordinator records the merge it would make and the owner merges; auto-merge on `skim` turns on once its calls match the owner's.
- **Not yet**: the chat agent, voice input, mixed-model groups and research, and the board wait until the coordinator works.
