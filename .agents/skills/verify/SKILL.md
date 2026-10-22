---
name: verify
description: Start the faber CLI in throwaway git repos inside its own run folder, drive it through its real commands, and record whether each check passed in an evidence.md. Use it on your own, without being asked, before calling any change to faber done, and whenever you need to prove a change works in the running product instead of asking the user to check.
---

# verify

Prove a change to faber works by running the real CLI the way a user does, inside repos made for the run, and keeping what it printed and what it left on disk.

faber is a Node CLI with one surface: `node src/cli.ts` (installed as `faber`).
It has no server, no UI and no long-running process.
It acts on the git repo it is run in, so every run gets its own repos and never touches a real one.

What faber does, and what you should see, lives in the feature map at `docs/manual/`.
Read `docs/manual/README.md` first, then the file for the feature you are checking.
This skill tells you how to run a check; the map tells you which checks exist.

Every command below runs from the repository root.
The helper is `.agents/skills/verify/verify.ts`, an executable Node script; call it by that path, with no `node` in front.
It runs `src/cli.ts`, the file the `faber` command runs in development, so driving it through the helper covers `faber`.
The packed npm tarball is a different entry point: the helper does not drive it, so a check on it is `not driven` unless a test covers it.

## Start

```bash
.agents/skills/verify/verify.ts start
```

It prints three lines and exits 0:

```text
run: <repo>/.scratch/verify/<yyyymmdd-hhmmss>-<6 hex>
repos: <run>/repos
commit: <full sha> (<branch>)
```

When anything in faber's checkout is uncommitted, the last line ends with `, with uncommitted changes`; this flag covers the whole working tree, while the hash in `run.json` says whether the code under test itself changed.

The `run:` line is the ready signal.
Copy that absolute path; every later call takes it as `<run>`.

The run folder holds everything the run touches:

- `repos/`: one folder per repo you make with `repo`; faber only ever runs inside one of them.
- `home/`: the `HOME` faber and git see, with a `.gitconfig` naming a throwaway user and `main` as the default branch.
- `fakes/`: the fake `claude` and `gh` in `fakes/bin/`, first on the `PATH` faber sees, with each fake's script and call log (see Fakes).
- `remotes/`: a bare repo per repo given a remote with `remote`, made only when a step asks for one.
- `run.json`: commit, branch, a hash of the uncommitted changes to `src/`, `templates/` and `package.json` (the sha256 of empty input when there are none, and a missing folder counts as unchanged), the checkout's `git status`, node version, and the pid of every faber process the run started, the doctor's probe included.
- `transcript.log`: every helper call, quoted so it can be pasted again from the repository root, with its full output and exit code, refusals included. Each entry starts with a `$ ` line and ends with an `[exit <n>]` line; faber's output can hold blank lines, so split entries on those two lines only, never on blank lines.
- `evidence.md`: started for you with the commit, branch, whether there were uncommitted changes, and the run folder relative to the repository root; you write the rest.

Isolation is complete: two runs side by side never share a file.
faber and git run with an environment of only `PATH` (with `fakes/bin` first), `HOME`, `TZ=UTC`, `LANG=C`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` pointing at the run's `.gitconfig`, `GIT_TERMINAL_PROMPT=0`, and `GIT_CEILING_DIRECTORIES=<run>/repos`.
The ceiling stops git from looking above `repos/`, so a folder made with `--no-git` is outside any repo even though the run folder sits inside faber's own checkout.

What a run cannot reach, and therefore refuses:

- Any real repo, faber's own checkout included. Never run `node src/cli.ts` or `faber` directly; it would write into whatever repo you are in.
- Any path outside the run's `repos/`: `mkdir`, `write`, `faber` and `show` refuse an absolute path, a path with `..` that leaves `repos/`, and a repo name the run never made.
- Writing inside a repo's `.git`.
- Any folder the helper did not create: every command but `start` refuses a path that is not a direct child of `.scratch/verify/` with a `run.json`.
- A stopped run: `repo`, `mkdir`, `write` and `faber` refuse it, and `doctor` calls it unfit. Start a new one.
- The npm registry and the network: nothing in a run publishes or installs.

## Doctor

```bash
.agents/skills/verify/verify.ts doctor <run>
```

It changes nothing faber can see: on a live run it starts `faber` once with no arguments in `repos/` and adds that probe's pid to `run.json`; on a stopped run it starts nothing.
Run it right after `start`, before making any repo, and again whenever an output differs from what the map says.
It prints:

```text
run: <run>
repos: <comma separated names | none yet>
code: <short sha> on <branch>[, with uncommitted changes]
node: <version>
```

then either `fit` (exit 0) or one line per problem starting with `unfit: ` (exit 1).
The problems, each line as printed (`<...>` filled in), and what to do:

- `unfit: run is stopped; start a new one`: start a new run.
- `unfit: code changed since start (started at <sha>, now <sha>[ with uncommitted changes]); start a new run`: `src/`, `templates/` or `package.json` differs from when the run started, so the run would prove an older build. Start a new run after every code edit.
- `unfit: faber's own checkout changed since start; if no one edited it, a faber run wrote outside its repo, which is a fail`: run `git status` in the checkout. A file you or the user edited means start a new run; a file faber wrote, such as a new `spec/` or `AGENTS.md` change, is a `fail` for the check that ran it.
- `unfit: node changed since start (<old> -> <new>)`: start a new run.
- `unfit: fake <claude|gh> is not first on PATH (found <path>)`: something put a real `claude` or `gh` ahead of the run's fakes, so a faber run could start a real session. Start a new run.
- `unfit: faber processes from this run still running: <pids>`: run `stop`, then start a new run.
- `unfit: CLI did not answer: exit <n>, "<output>"`: `faber` with no arguments did not print `usage: faber`. The product does not start; that is a `fail` for every check.

Only drive a run whose doctor says `fit`.
`start`, `doctor` and `stop` are not checks: they stay in `transcript.log` and do not go into `evidence.md`.

## Drive

Make the repos a feature file asks for:

```bash
.agents/skills/verify/verify.ts repo <run> <name>
.agents/skills/verify/verify.ts repo <run> <name> --no-git
```

The first prints `repo: <run>/repos/<name> (git, branch main, no commits)`; with `--no-git` it prints `repo: <run>/repos/<name> (no git)`.
A name is lowercase letters, digits and dashes, used once per run.

Put the files and folders a step expects to exist there before faber runs:

```bash
.agents/skills/verify/verify.ts write <run> <name>/<file> <text>
.agents/skills/verify/verify.ts mkdir <run> <name>/<folder>
```

`write` creates parent folders, writes the text plus one newline, and prints `wrote: <path>`.
Pass the text as one argument; a line break inside it is a real line break in the file.
`mkdir` prints `folder: <path>`.

Run faber:

```bash
.agents/skills/verify/verify.ts faber <run> <name>[/<folder>] <faber args...>
```

It runs `faber <args>` with `<run>/repos/<name>[/<folder>]` as the working directory, a 10 second timeout and an empty stdin.
It echoes `> cd repos/<name>[/<folder>] && faber <args>`, then faber's stdout lines as they are, then each stderr line prefixed with `[stderr] ` (an empty stderr line is logged as `[stderr]` with no trailing space), then `[faber exit <n>]`, and exits with faber's own exit code.
When the map says a line goes to stderr, look for it with the `[stderr] ` prefix.

Commit the files a step expects to be committed, and give a repo a remote to push to:

```bash
.agents/skills/verify/verify.ts commit <run> <name> <message>
.agents/skills/verify/verify.ts remote <run> <name>
```

`commit` stages every file in the repo, commits it with the message, and prints `commit: <short sha> <subject> (<branch>, <n> file[s])`; it refuses a repo with nothing to commit.
`remote` makes the bare repo `<run>/remotes/<name>.git`, adds it as `origin`, pushes every branch the repo has with upstreams set, and prints `remote: origin -> <path>, pushed <branches | nothing yet>`.
Make the setup commits first, then the remote, the way a user's repo already has its default branch on GitHub.

To read what a step left behind:

```bash
.agents/skills/verify/verify.ts show <run> <name>
.agents/skills/verify/verify.ts show <run> <name>/<file>
```

With a repo name it prints `> files in repos/<name>, with sha256 (first 12) and bytes`, then one line per file outside `.git` as `<hash> <bytes> <path>` sorted by path, or `(no files)`.
For a git repo it then prints `> git commits: <n>` and `> git staged:` followed by the staged paths or `(nothing staged)`; for a `--no-git` folder it prints `> git: not a repo`.
For a repo with a remote it ends with `> git remote origin:` and one `<short sha> <branch>` line per branch the bare repo holds, or `(no branches)`, so a push is evidence too.
Two `show` listings with the same lines prove the files are byte-identical.
With a file it prints `> cat repos/<name>/<file>`, then the file, or `(no such file)`, and `(no newline at end of file)` when the file does not end in one.
`show` only reads, so it also works on a stopped run, and it is logged like every other call, so the stored state becomes evidence rather than a claim.

In a feature file, `faber <run> <name> <args>`, `repo <run> <name>`, `write ...`, `mkdir ...` and `show ...` are this helper's commands: prefix each with `.agents/skills/verify/verify.ts`.
Follow the feature file's `Preconditions` and `Steps` in order, one helper call per command, then its `Behind it`.
Each feature file assumes a fresh run.

### Proof bar

- Drive the user's real path: the `faber` command only. Never import from `src/`, never write a file faber should have written, never call a test in place of a step.
- Capture the action and the state it led to, not only the last output: run every `show` the map names, where it names it.
- Check side effects as well as what is printed: the files and their hashes, the commit count, what is staged, and that a refused command left the repo unchanged.
- Cover every entry point the map lists for the feature. One not driven is reported as `not driven`, never as verified through another.
- Claude Code and GitHub are the only external systems, and a run reaches each only through its fake; never put a real `claude` or `gh` in a run.

## Fakes

`fakes/bin/claude` and `fakes/bin/gh` stand in for Claude Code and GitHub, so a faber run that starts a session or reads a PR gets a scripted answer, the same on every run.
Pick what each does before the faber step that reaches it:

```bash
.agents/skills/verify/verify.ts script <run> claude <json>
.agents/skills/verify/verify.ts script <run> gh <json>
```

A claude script is a JSON array of sessions; each headless start (`-p` or `--print`) runs the next one, and a new script starts again at its first.
It prints `script: claude, <n> sessions, next is session 0`.
A session is an object with any of these keys, applied in this order in the folder the fake was started in:

- `write`: an object mapping paths to their full text, written as given.
- `commit`: `{"message": "<subject>", "trailers": ["Slice: S1"]}`, which stages every file and commits; trailers are optional `Key: value` lines.
- `push`: `true` pushes `HEAD` to `origin`.
- `tools`: how many tool calls to stream, each a `tool_use` and its `tool_result`.
- `denials`: how many denied tool calls to stream, also listed in the result's `permission_denials`.
- `hang`: `true` stays alive after the tool calls, with no result, until something kills it.
- `message`: the last assistant message and the result's `result` (default `Done.`).
- `exit`: the exit code (default 0).

With `--output-format stream-json --verbose` it prints one JSON event per line, a `system` init first and a `result` last, as Claude Code does; stream-json without `--verbose` fails the way the real one does.
A start with no session left exits 1 with `fake claude: no scripted session left`, so an unplanned session shows up as a failure.
A gh script is `{"pr": {"url": "<url>", "isDraft": false}}`, or `{}` for no PR; `gh pr view --json url,isDraft` prints those fields, and any other gh command exits 1.
It prints `script: gh, pr <url> (draft | ready)` or `script: gh, no pr`.
`script` refuses anything that is not such a script, naming the wrong key.

Every start of a fake is recorded, sessions or not:

```bash
.agents/skills/verify/verify.ts calls <run> claude
.agents/skills/verify/verify.ts calls <run> gh
```

It prints `> <fake> calls: <n>`, then one `<i>. <fake> <args> (cwd <folder>, stdin <closed | open | tty>[, session <n>])` line per start, oldest first.
`stdin open` means the caller left stdin open; a headless session needs it closed.
A check that says faber started no session is `> claude calls: 0`.
`calls` only reads, so it also works on a stopped run.

To check a fake on its own, start it by name from a repo folder, found on the run's `PATH` with stdin closed, as faber starts it:

```bash
.agents/skills/verify/verify.ts call <run> <name>[/<folder>] <claude|gh> <args...>
```

It echoes `> cd repos/<name>[/<folder>] && <fake> <args>`, then `> found: <path>`, the fake's stdout and `[stderr] ` lines as `faber` does, then `[<fake> exit <n>]`; a hanging fake is killed after 10 seconds.
It proves the fakes, never faber: a check on faber drives `faber`.

## Evidence

Every check writes into `<run>/evidence.md`, below the header `start` wrote.
Copy commands and output from `<run>/transcript.log`; never retype or paraphrase them.

Replace the `TODO` under `## Verdict` with exactly one of these lines, bold included:

- **Done**
- **Done, with n not driven**: followed on the same line by the names of the checks not driven, comma separated
- **Not done**: followed on the same line by the names of the failed checks, comma separated
- **Done once the map changes in this PR**: use it when any check is `manual` and none is `fail`

Then one section per check, in map order.
Each bold step name in `Steps` is one check, and the whole `Behind it` section is one more, named `Behind it`.
The feature name is the feature file's `#` heading; drop the step name's trailing period.

````markdown
## <feature name>: <bold step name, or Behind it>

- Verdict: pass | fail | manual | not driven
- Note: <one or two sentences; for pass, what you saw; for fail, what happened instead; for manual, why the map is wrong; for not driven, what it needs>
- Captured: <what proves it, such as the output line, the exit code, and the show listing; short inline quotes are fine here, the block below is the verbatim copy>

```text
$ .agents/skills/verify/verify.ts faber /abs/path/.scratch/verify/20261022-103245-69f80d plain
> cd repos/plain && faber
usage: faber <command>
...
[faber exit 0]
[exit 0]
```
````

The block holds every transcript entry the check ran, in order, copied whole from its `$ ` line to its `[exit <n>]` line, with one blank line between entries: absolute run paths stay as logged.
Setup calls (`repo`, `write`, `mkdir`), including a feature file's `Preconditions`, go in the first check.
When one `show` proves several checks, put it in the check the map names it under, and point to that section from the others' `Captured` line.

Finish `evidence.md` before you stop the run; `stop` never touches it.

A check is one of:

- `pass`: the product does what the check says.
- `fail`: it does not, and the code is wrong. The note says what happened instead.
- `manual`: it does not, and the map is wrong, because the change meant this. The note says why, and `docs/manual/` changes in the same PR.
- `not driven`: it needs something a run cannot reach. The note names it, and that check stays with the user.

## Stop

```bash
.agents/skills/verify/verify.ts stop <run>
```

faber exits after every call, so there is normally nothing left to stop.
`stop` checks each pid in `run.json`, and kills one only while `ps` still shows it as this repo's `src/cli.ts`; it never matches by process name.
It prints a `killed <pid>` line for each kill, then marks the run stopped and prints `stopped: <n> faber processes, none still running; evidence stays in <run>`, where `<n>` counts every faber process the run started, not the ones it killed.
Run `doctor <run>` afterwards: it must exit 1 with a line `unfit: run is stopped; start a new one`.

The run folder stays, with `evidence.md`, `transcript.log` and the repos; never delete it.
Point the user at `<run>/evidence.md` when you report.
