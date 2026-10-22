# Spec: faber coordinator

## Problem

After interview, every feature still costs the owner one hand-typed session per skill: write-spec, write-slices, then one `implement-slice` per slice.
Each one he opens, starts, waits on and checks in git by hand, though nothing in those handoffs needs his judgment.
`init` took about ten such handoffs, all mechanical.
The vision says the owner's attention is the scarce resource, and this is where most of it goes between interview and a PR.

## Solution

One command, `faber run <slug>`, carries a feature from a committed `decisions.md` to a ready PR on Claude Code.
It runs write-spec, write-slices and each ready slice in its own fresh headless session, one at a time, and reads git after each.
It stops on anything it cannot prove from git, prints why, and a rerun resumes from git.
The owner's part is the interview before and the sign-offs and PR review after.

## Current state

- Faber's CLI knows only `init` and prints usage for anything else (`src/cli.ts:5-25`).
- The only git helper finds the work tree root and reports a missing git or a bare repo (`src/git.ts:6-16`); faber has no branch, commit, push or trailer code, and no lookup of the default branch.
- Faber spawns nothing but git today, and has no harness adapter.
- `implement-slice` picks the lowest ready slice from `Slice:` and `Slice-Pending:` trailers on `<default>..HEAD` (`../skills/skills/in-progress/implement-slice/SKILL.md:25-36`), and with every slice done and no `## Branch review` on the PR it closes the branch, runs pr-brief and marks the PR ready (`:80-84`).
- On a failed gate `implement-slice` commits nothing and leaves the diff (`../skills/skills/in-progress/implement-slice/SKILL.md:45-49`).
- `implement-slice` opens the draft PR on its first commit (`../skills/skills/in-progress/implement-slice/SKILL.md:77`); whether the PR is ready lives on GitHub, not in git.
- write-spec checks the seams with the user before writing (`../skills/skills/in-progress/write-spec/SKILL.md:29`), and write-slices shows an outline and waits (`../skills/skills/in-progress/write-slices/SKILL.md:48-56`); neither has an unattended rule yet.
- Both planning skills end by telling the user to commit the feature folder.
- write-spec, write-slices and implement-slice are `disable-model-invocation: true`, so only a slash invocation such as `claude -p "/<skill> <args>"` reaches them.
- The project file contract's `.scratch/` row lists verify runs, explore maps, interview trees and recohere reports as writers, not faber (`../skills/.agents/conventions.md:160`).
- Faber's own `.gitignore` already ignores `.scratch/` (`.gitignore:2`).
- Claude Code 2.1.292 is on `PATH`; with `-p`, `--output-format stream-json` refuses to run without `--verbose`; it has no turn cap flag, so a tool cap must be counted from the stream.
- A headless test run took 28 seconds and $0.20, exited 0, and warned when stdin was left open.
- The verify helper runs faber with an environment of only `PATH`, `HOME`, `TZ`, `LANG` and git isolation (`.agents/skills/verify/verify.ts:139-150`), kills it after 10 seconds (`.agents/skills/verify/verify.ts:13`), and makes repos with no commits and no remote (`.agents/skills/verify/verify.ts:243-257`); it has no way to commit setup files or add a remote.
- The test harness runs the real CLI in a temp repo with the same kind of isolated environment and a 10 second timeout (`test/faber.ts:43-88`).
- The feature map has no entry for `run` (`docs/manual/README.md:35-42`).

## Behaviour

1. `faber run` with no slug exits 1 and prints a usage line naming `faber run <slug>`.
2. `faber run <slug>` outside a git work tree exits non-zero, runs no session, and says so.
3. `faber run <slug>` with a dirty tree exits non-zero, runs no session, and lists the dirty paths.
4. `faber run <slug>` with no `spec/features/<slug>/decisions.md` committed on the default branch exits non-zero, runs no session, and says so.
5. A run switches to `slices/<slug>`, creating it from the default branch when missing, and its first printed line is the path of its run folder, `.scratch/faber/<slug>/<timestamp>/`.
6. Each session prints one line when it starts and one when it ends, and the run folder holds `run.log` with every printed line and one `<phase-or-slice>.jsonl` per session.
7. With no committed `spec.md` on the branch, the run starts a write-spec session; when it wrote `spec.md` and nothing else, faber commits only that file as `Write the spec for <slug>` and pushes.
8. With a committed `spec.md` and no committed `slices.json`, the run starts a write-slices session; when it wrote `slices.json` and nothing else, faber commits only that file as `Cut <slug> into slices` and pushes.
9. A planning session that touched any other path, or wrote nothing, stops the run and leaves the tree as it is.
10. With both planning files committed, the run starts one `implement-slice` session at a time while trailers on `<default>..HEAD` show a ready slice.
11. A session that adds a `Slice:` trailer continues the run.
12. A session that adds a `Slice-Pending:` trailer continues with whatever is still ready, and the run ends listing every slice that waits for sign-off.
13. An `implement-slice` session that adds no trailer stops the run with `stopped: <id> committed nothing`.
14. A session that exits non-zero, reports a permission denial, runs past `--timeout <minutes>` (default 90, decimals allowed), or passes `--max-tools <n>` tool calls (default 900) is killed if still running and stops the run with its own status line.
15. On any stop, faber prints the session's last message, ends with one `stopped: ...` status line, exits non-zero, and leaves the tree as it is.
16. With every slice done, the run starts one closing `implement-slice` session, then reads the PR with `gh`; a PR that is no longer a draft ends the run with `done: PR ready <url>` and exit 0.
17. Ctrl-C or a closed terminal kills the running session, leaves the tree, and prints `stopped: interrupted`.
18. Rerunning `faber run <slug>` after any stop, a kill or a sign-off done by hand resumes from git, without repeating a phase or slice git already records.
19. A run never retries a session.

## Decisions

- **Wedge**: unattended starts at `decisions.md`; the coordinator writes the spec and the slices itself, and the owner's part is interview. Lost: looping `implement-slice` over a hand-made `slices.json` only, because the coordinator should own the spec and the owner's attention belongs in the decision talk, not in planning.
- **Planning questions**: write-spec's seam check and write-slices' outline review get an unattended rule in the skills repo: with no person present, decide from the vision and the decision record, write the choice into the skill's own file, and stop only on a product question. Lost: faber prose answering the skills' questions, because that puts method in faber; a flag the skills do not know, because it has no contract behind it.
- **Coordinator shape**: `faber run <slug>` is a TypeScript loop on `slices/<slug>` that starts one fresh headless session per step and reads git after each; no model session lives across steps. Lost: a long-lived coordinator session that takes corrections, because a correction needs a judgment no skill holds yet and a channel to the owner that ping will bring.
- **Phases from git**: no committed `spec.md` runs write-spec, no committed `slices.json` runs write-slices, otherwise `implement-slice`. Lost: a state file, because git is the state.
- **Preconditions**: `decisions.md` committed on the default branch and a clean tree; faber creates `slices/<slug>` from the default branch when missing.
- **Planning commits**: faber commits and pushes only the file the planning skill writes; any other touched path is a stop. Lost: leaving the commit to the owner, because both skills ask the user to commit and nobody is there.
- **Worker outcome**: trailers on `<default>..HEAD` compared before and after each `implement-slice` session decide continue or stop. Lost: reading the agent's reply, because state comes from git.
- **PR ready**: once every slice has `Slice:`, one more `implement-slice` session closes the branch, then faber asks `gh` for the PR's url and draft flag. Lost: a git-only end with no url, because the done line should hand the owner the PR. This is the one read outside git, and only for the final line.
- **Stop on hitl**: the run does not wait; it builds what does not depend on a pending slice and ends listing what waits, which the owner signs off with `/implement-slice --signoff <id>` by hand before rerunning.
- **Owner learns of a stop**: foreground, one line per step, one closing status line, non-zero exit on any stop, and the session's last message printed for the owner to read, never for faber to decide from. Lost: a notification, because it belongs to ping.
- **Harness adapter**: the Claude Code adapter spawns `claude -p "/<skill> <args>"` from `PATH` with `--output-format stream-json --verbose`, `--permission-mode auto` and stdin closed, and reports exit code, permission denials, tool call count and the last message. Lost: `bypassPermissions`, because nobody watches the session; an allowlist in the adapter or in `.claude/settings.json`, because it breaks each time a skill adds a command.
- **Limits**: a wall-clock timeout and a tool call cap per session, counted from the stream, both overridable; a kill is a stop. `--timeout` takes decimal minutes so a check can trip it in seconds. Lost: a dollar cap; an 80% "commit your work" nudge, because an ungated commit would write a false trailer; a CPU-idle kill, because a long test run looks idle.
- **Retries**: none, because a second try with the same context usually fails the same way and the vision says stop over guess.
- **Command flags**: only `--timeout` and `--max-tools`; model and effort come from the owner's Claude Code settings. Lost: model flags, because they thicken the adapter for a choice already made elsewhere.
- **Interrupts**: Ctrl-C or a closed terminal is a stop. Lost: a lock against two runs on one slug, because one owner runs one slice at a time.
- **Slice zero**: a `hitl` skills-repo PR adds the unattended rule to write-spec and write-slices, and "faber runs" as a `.scratch/` writer in the project file contract. Lost: the same rule in implement-slice, because its stops are real decisions for the owner.
- **Verify**: a scripted fake `claude`, and a fake `gh`, in the verify skill folder, put first on `PATH`, commit and exit the way a real session would, so every stop path is a cheap repeatable check. Lost: real sessions in verify, because they are slow, costly and not repeatable.

Status lines the run ends with, one per outcome:

```
done: PR ready <url>
stopped: S4 waits for sign-off
stopped: S3 committed nothing
stopped: write-spec touched <path>
stopped: <session> exited <code>
stopped: <session> hit a permission denial
stopped: <session> ran past <n> minutes
stopped: <session> passed <n> tool calls
stopped: interrupted
```

## Seams

One seam: the faber process, run in a throwaway repo with a scripted fake `claude` and fake `gh` first on `PATH`.

- **Verify helper** (existing, `.agents/skills/verify/verify.ts:280`): drives `faber run` the way the owner does.
  It gains the fakes on `PATH` with a way to pick each fake's scripted behaviour, a way to commit setup files and to add a bare remote, because today's repos have no commits and no remote (`.agents/skills/verify/verify.ts:243-257`), and `decisions.md` must be committed before a run.
- **Node test harness** (existing, `test/faber.ts:43`): the same fakes on `PATH` for the stop paths and refusals in `pnpm check`.
- **The fake `claude` and `gh`** (new): no existing seam stands in for a headless Claude Code session or GitHub, and a real session is slow, costly and not repeatable.

## Sequence

1. The skills repo holds the unattended rule in write-spec and write-slices and lists faber runs under `.scratch/`.
2. `faber run <slug>` refuses a run outside git, a dirty tree and a missing `decisions.md`, and prints its usage.
3. From a committed `decisions.md`, a run writes, commits and pushes the spec, then the slices, and keeps a run folder.
4. The run builds ready slices one at a time, continuing on `Slice:` and `Slice-Pending:` and stopping when a slice commits nothing.
5. Timeouts, the tool cap, permission denials, non-zero exits and Ctrl-C each stop the run with their own line, and a rerun resumes from git.
6. With every slice done, the run closes the branch and ends with `done: PR ready <url>`.

## Out of scope

- Ping.
- Corrections and a long-lived coordinator session.
- The chat agent.
- Parallel slices and worktrees.
- Automatic retries or repair jobs.
- Harnesses other than Claude Code.
- Model or effort flags.
- Merging, shadow or otherwise.
- A dollar cap, an 80% nudge and a CPU-idle kill.
- Tracker mirroring.
- A lock against two runs at once.

## Accepted breakage

- `auto` mode may refuse `git push` or `gh pr create`; that shows as a stop on the first real run and is fixed then.
- Unattended planning may make a choice the owner would not; pr-brief's label and the PR review catch it.
- A killed session leaves a dirty tree for the owner to clean.
- The run is foreground only, so closing the terminal stops it; it resumes from git.
- A repo with no remote stops at the first push.
- Only macOS is tested.

## Done means

- **Automated**:
  - `pnpm check` passes in CI.
  - verify: `faber run` with no slug prints the usage line and exits 1.
  - verify: a run outside git, with a dirty tree, and with no committed `decisions.md` each exits non-zero, starts no fake session, and leaves the repo unchanged.
  - verify: from a committed `decisions.md`, a run with the fake `claude` starts write-spec, commits only `spec.md` as `Write the spec for <slug>`, then write-slices, commits only `slices.json` as `Cut <slug> into slices`, pushes both to the bare remote, then starts `implement-slice`.
  - verify: a fake planning session that also writes a stray file stops the run, and nothing new is committed.
  - verify: a fake session adding `Slice:` continues; one adding `Slice-Pending:` continues with an independent slice, and the run ends listing the pending slice with a non-zero exit.
  - verify: a fake session adding no trailer, exiting non-zero, reporting a permission denial, outliving `--timeout 0.05`, and passing `--max-tools 3` each stops with its own status line, the fake's last message, and a non-zero exit.
  - verify: after a stop, a rerun with a fake that now commits resumes at the stopped step and repeats nothing git records.
  - verify: with every slice done, a closing fake session runs, the fake `gh` reports a ready PR, and the run ends with `done: PR ready <url>` and exit 0.
  - verify: the run folder holds `run.log` matching the printed lines and one `.jsonl` per session.
  - verify: interrupting a run kills the fake session and prints `stopped: interrupted`.
  - `docs/manual/` has a `run` feature file describing these steps, and the verify run's `evidence.md` has no failed check.
- **Manual**:
  - The owner merges the skills-repo slice zero PR.
  - The owner runs `faber run` on a small real feature, such as ping, through to a ready PR.
