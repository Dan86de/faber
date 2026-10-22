## Decision record: faber coordinator

**Pain**: After interview, every feature still costs the owner one hand-typed session per skill: write-spec, write-slices, then one `implement-slice` per slice, each opened, started, waited on and checked in git by hand; `init` took about ten such handoffs, all mechanical.
**Wedge**: `faber run <slug>` carries a feature from a committed `decisions.md` to a ready PR on Claude Code, running write-spec, write-slices and each ready slice in its own fresh headless session, one at a time, and stopping on anything it cannot prove from git.
**Premise**: A skill can run in a headless Claude Code session with no one at the keyboard; it holds: a `disable-model-invocation: true` skill fired from `claude -p "/<skill> <args>"`, wrote its file, committed with a `Slice:` trailer and exited 0, and the JSON result lists permission denials instead of hanging on a prompt.

### Settled
- **Wedge**: unattended starts at `decisions.md`; the coordinator writes the spec and the slices itself, and the owner's part is interview. Rejected: looping `implement-slice` over a hand-made `slices.json` only, because the coordinator should own the spec and the owner's attention belongs in the decision talk, not in planning.
- **Planning questions**: write-spec's seam check and write-slices' outline review get an unattended rule in the skills repo: with no person present, decide from the vision and the decision record, write the choice into the skill's own file, and stop only on a product question. Rejected: faber prose answering the skills' questions, because that puts method in faber; a flag the skills do not know, because it has no contract behind it.
- **Coordinator shape**: `faber run <slug>` is the coordinator, a TypeScript loop on `slices/<slug>` that starts one fresh headless session per step and reads git after each; no model session lives across steps. Rejected: a long-lived coordinator session that takes corrections, because a correction needs a judgment no skill holds yet and a channel to the owner that ping will bring; it layers on these commands later without rework.
- **Phases**: from git on `slices/<slug>`: no committed `spec.md` runs write-spec, no committed `slices.json` runs write-slices, otherwise `implement-slice`. Rejected: a state file, because git is the state.
- **Preconditions**: `decisions.md` committed on the default branch and a clean tree; faber switches to `slices/<slug>`, creating it from the default branch when missing.
- **Planning commits**: after a planning session, faber commits and pushes only the file that skill writes, subject `Write the spec for <slug>` or `Cut <slug> into slices`; a session that touched any other path is a stop. Rejected: leaving the commit to the owner, because both skills ask the user to commit and nobody is there.
- **Resume**: rerunning `faber run <slug>` always resumes from git, after a kill, a stop or a sign-off done by hand.
- **Worker outcome**: trailers on `<default>..HEAD` compared before and after each `implement-slice` session; a new `Slice:` continues, a new `Slice-Pending:` continues with whatever is still ready and is listed at the end; no new trailer, a non-zero exit, a hit limit or a permission denial stops and leaves the tree as it is; every slice done and the PR ready is done. Rejected: reading the agent's reply, because state comes from git.
- **Stop on hitl**: the run does not wait for the owner; it builds what does not depend on a pending slice and ends listing what waits for sign-off, which the owner records with `/implement-slice --signoff <id>` by hand before rerunning.
- **Owner learns of a stop**: `faber run` runs in the foreground, prints one line per step, and ends with one status line (`stopped: S4 waits for sign-off`, `stopped: S3 committed nothing`, `done: PR ready <url>`), exiting non-zero on any stop; on a stop it prints the session's last message for the owner to read, never to decide from. Rejected: a notification, because it belongs to ping.
- **Ping**: out of this feature; it is README step 3.
- **Harness adapter**: the Claude Code adapter spawns `claude -p "/<skill> <args>"` from `PATH` with `--output-format stream-json`, `--permission-mode auto` and stdin closed, and reports exit code, permission denials and the last message. Rejected: `bypassPermissions`, because nobody watches the session; an allowlist in the adapter or in `.claude/settings.json`, because it breaks each time a skill adds a command.
- **Limits**: a 90-minute wall-clock timeout and a cap of 900 tool calls per session, counted from the stream, both overridable; a kill is a stop with no retry. Rejected: a dollar cap, an 80% "commit your work" nudge, because an ungated commit would write a false trailer, and a CPU-idle kill, because a long test run looks idle.
- **Retries**: none; a second try with the same context usually fails the same way, and the vision says stop over guess.
- **Command**: `faber run <slug>` with `--timeout <minutes>` and `--max-tools <n>`; model and effort come from the owner's Claude Code settings. Rejected: model flags, because they thicken the adapter for a choice already made elsewhere.
- **Run output**: `.scratch/faber/<slug>/<timestamp>/` holding `run.log` (the printed lines) and one `<phase-or-slice>.jsonl` per session, its path printed on the first line.
- **Interrupts**: Ctrl-C or a closed terminal kills the running session, leaves the tree, prints `stopped: interrupted`; the next run resumes. Rejected: a lock against two runs on one slug, because one owner runs one slice at a time.
- **Slice zero**: `hitl`, a skills-repo PR holding the unattended rule in write-spec and write-slices and "faber runs" as a `.scratch/` writer in the project file contract. Rejected: the same rule in implement-slice, because its stops are real decisions for the owner and a stop is the right unattended result.
- **Verify**: a scripted fake `claude` in the verify skill folder, put first on `PATH`, commits and exits the way a real session would, so every stop path is a cheap repeatable check; a real run is a manual check. Rejected: real sessions in verify, because they are slow, costly and not repeatable.
- **Slug**: `coordinator`, folder `spec/features/coordinator/`, branch `slices/coordinator`; this record is committed on `main`.

### Found during recon
- `implement-slice` already picks the lowest ready slice from trailers, gates with the verify skill, runs review-change, commits with `Slice:` or `Slice-Pending:`, opens the draft PR, closes the branch with pr-brief and marks it ready (`../skills/skills/in-progress/implement-slice/SKILL.md`, steps 4 to 9).
- On a failed gate `implement-slice` commits nothing and leaves the diff (`../skills/skills/in-progress/implement-slice/SKILL.md`, step 6).
- write-spec checks the seams with the user before writing (`../skills/skills/in-progress/write-spec/SKILL.md`, step 1), and write-slices asks three outline questions and waits (`../skills/skills/in-progress/write-slices/SKILL.md`, step 4).
- Both planning skills end by telling the user to commit the feature folder.
- write-spec, write-slices and implement-slice are `disable-model-invocation: true`, so only a slash invocation reaches them; `claude -p "/<skill>"` does.
- A headless test run took 28 seconds and $0.20, exited 0, and warned when stdin was left open.
- Claude Code 2.1.292 offers `--permission-mode` choices `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk` and `plan`, and has no turn cap flag, so a tool cap must be counted from the stream.
- The project file contract's `.scratch/` row lists verify runs, explore maps, interview trees and recohere reports as writers, not faber (`../skills/.agents/conventions.md:160`).
- Faber's CLI knows only `init` (`src/cli.ts`).

### Not doing
- Ping.
- Corrections and a long-lived coordinator session.
- The chat agent.
- Parallel slices and worktrees.
- Automatic retries or repair jobs.
- Other harnesses.
- Model or effort flags.
- Merging, shadow or otherwise.
- A dollar cap, an 80% nudge and a CPU-idle kill.
- Tracker mirroring.
- A lock against two runs at once.

### Accepted breakage
- `auto` mode may refuse `git push` or `gh pr create`; that shows as a stop on the first real run and is fixed then.
- Unattended planning may make a choice the owner would not; pr-brief's label and the PR review catch it.
- A killed session leaves a dirty tree for the owner to clean.
- The run is foreground only, so closing the terminal stops it; it resumes from git.
- A repo with no remote stops at the first push.
- Only macOS is tested.

### Done means
- Automated: `pnpm check` passes in CI.
- Automated: verify with the fake `claude` drives each phase transition, from `decisions.md` to write-spec, write-slices and `implement-slice`.
- Automated: after a planning session only that skill's file is committed, and a stray path stops the run.
- Automated: a new `Slice:` continues; a new `Slice-Pending:` continues with independent slices and is listed at the end.
- Automated: no new trailer, a non-zero exit, a timeout, the tool cap and a permission denial each stop with their own status line and a non-zero exit.
- Automated: a rerun after a stop resumes from git.
- Automated: the run folder holds `run.log` and one `.jsonl` per session.
- Automated: a dirty tree, a missing `decisions.md` and a run outside git are refused.
- Manual: the owner merges the skills-repo slice zero PR.
- Manual: the owner runs `faber run` on a small real feature, ping, through to a ready PR.

### Reversibility
Every change can be undone: a new command in a 0.x package, plus a skills-repo PR that can be reverted.
The signal to revisit: the first real runs keep stopping on permissions, or the owner keeps overriding the unattended planning choices at PR review; either argues for attended planning or for the coordinator session.
