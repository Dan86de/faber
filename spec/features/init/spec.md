# Spec: faber init

## Problem

The owner now runs several agents across several repos, and each repo needs the same project files before the skills or faber work there.
Today he creates them by hand, copying from whichever repo he touched last, so headings drift and some repos miss files entirely.
Every skill that reads vision, glossary or standards silently gets less context when a file is missing, and the owner only notices when an agent ignores something it was never shown.
Faber's own `CLAUDE.md` already duplicates `AGENTS.md` by hand, the drift this feature is meant to stop.

## Solution

One command, `faber init`, run anywhere inside a git repo, writes the missing project files at the repo root from bare templates.
It never overwrites or edits an existing file, except appending `.scratch/` to `.gitignore`.
It prints one line per path saying what it created or kept, warns when an existing `CLAUDE.md` does not import `AGENTS.md`, and ends with a `next:` line.
Faber ships as a versioned npm package, so `init` is installed like any other CLI.

## Current state

- Faber has no code, no `package.json` and no CI; the repo holds only prose (`README.md`, `AGENTS.md`, `CLAUDE.md`, `spec/`).
- The README names `init` as step 1 and fixes "from templates, never overwriting" (`README.md:37`).
- The skills repo's project file contract lists `spec/vision.md`, `spec/glossary.md` and `.agents/coding-standards.md` with their fallbacks (`../skills/.agents/conventions.md:149-157`), but not `AGENTS.md`, `CLAUDE.md` or the `.gitignore` entry.
- Faber's own rule forbids writing a path the contract does not list (`AGENTS.md:10`).
- Readers try the home path first, then the fallbacks (`../skills/.agents/conventions.md:146`): glossary falls back to `GLOSSARY.md` and `CONTEXT.md` (`:150`), standards to `CODING_STANDARDS.md` (`:154`).
- codify creates `.agents/coding-standards.md` when missing (`../skills/skills/in-progress/codify/SKILL.md:15`) with a skeleton of `# Coding standards`, `## Rules` and `## One-way doors` (`../skills/skills/in-progress/codify/references/new-standards-file.md:5-14`); `init` writes to the same target.
- codify files standards under `## Rules` and one-way doors under `## One-way doors` (`../skills/skills/in-progress/codify/SKILL.md:56-57`).
- pr-brief reads the `## One-way doors` section of the standards file (`../skills/skills/in-progress/pr-brief/SKILL.md:22`).
- review-change reads every root `AGENTS.md` and `CLAUDE.md` (`../skills/skills/in-progress/review-change/SKILL.md:22`).
- interview and write-spec read `spec/vision.md` and `spec/glossary.md` when they exist (`../skills/skills/in-progress/interview/SKILL.md:15`, `../skills/skills/in-progress/write-spec/SKILL.md:14`).
- Faber's `.gitignore` already ignores `.scratch/` (`.gitignore:2`).
- The skills repo versions with changesets through `changesets/action`, tagging but not publishing, on Node 22 (`../skills/.github/workflows/release.yml`).
- This machine runs Node 24.20 and pnpm 12.1, and is not logged in to npm.
- Node refuses to strip types from `.ts` files under `node_modules`, so the published package needs emitted JavaScript.
- No verification skill exists in this repo (no `.agents/skills/`).

## Behaviour

1. `faber init` in a git repo with none of the files prints `created` for `spec/vision.md`, `spec/glossary.md`, `.agents/coding-standards.md`, `AGENTS.md`, `CLAUDE.md` and `.gitignore`.
2. The created `spec/vision.md` holds `## Product principles` and `## Current direction`, each with a `<!-- hint -->` line.
3. The created `.agents/coding-standards.md` holds `## Rules` and `## One-way doors`.
4. The created `AGENTS.md` points at the vision, glossary and standards, states the planning rule (`spec/features/<slug>/`, the vision is the owner's), and has an empty `## Rules`.
5. The created `CLAUDE.md` holds `@AGENTS.md`.
6. A second run prints only `kept` lines and leaves every file byte-identical.
7. With `CODING_STANDARDS.md` present, the run prints `kept CODING_STANDARDS.md (fallback)` and creates no `.agents/coding-standards.md`; the same holds for `GLOSSARY.md` or `CONTEXT.md` against `spec/glossary.md`.
8. With a `CLAUDE.md` that lacks `@AGENTS.md`, the run keeps it unchanged and prints a warning naming the missing import.
9. `.gitignore` is created when missing, gets `.scratch/` appended when absent, and holds it exactly once after any number of runs.
10. Run from a subfolder, `init` writes at the git root.
11. Run outside a git repo, `init` writes nothing and exits non-zero with a message saying so.
12. Every run ends with `next: fill spec/vision.md and .agents/coding-standards.md, then commit`.
13. `init` never stages or commits.
14. `faber` installed from a packed tarball runs `init` from `node_modules`.

## Decisions

- **Scope**: the four contract files, `CLAUDE.md`, the `.gitignore` entry, a git repo check and a closing `next:` line. Lost: a state folder, a per-machine project registry and harness hook stubs, because git is the state and nothing needs them yet.
- **No commit**: `init` stages and commits nothing. Lost: auto-commit, because empty skeletons are history noise and filling them is the human step.
- **Subfolder runs**: write at the git root. Lost: refusing, because the contract paths live at the root.
- **Template content**: bare skeletons with the headings the skills read and `<!-- hint -->` lines. Lost: faber's own files as filled examples, because they leak faber's intent; interactive filling, because that is a judgment and belongs to a skill.
- **Fallbacks**: when a contract fallback exists, skip the home path and print `kept <fallback> (fallback)`. Lost: creating the home path anyway, because skills would read the empty new file first; moving the fallback, because that edits the user's file.
- **AGENTS.md content**: pointers to vision, glossary and standards, the planning rule, and an empty `## Rules`. Lost: empty headings only, because these lines repeat in every repo and make the skills find their files.
- **CLAUDE.md bridge**: the Claude Code adapter writes `CLAUDE.md` holding `@AGENTS.md`. Lost: `AGENTS.md` alone, because Claude Code never reads it; deferring to the context feature, because the drift starts at init.
- **Existing CLAUDE.md**: kept, with a warning when it does not import `AGENTS.md`. Lost: appending the import, because it edits the user's file; silence, because it hides the drift.
- **Contract first**: a `hitl` first step adds `AGENTS.md`, `CLAUDE.md` and the `.gitignore` entry to the skills repo's contract before `init` writes them. Lost: a by-hand precondition outside the feature, because the feature would otherwise break the repo rule.
- **Stack**: TypeScript on Node 24, pnpm, zero runtime dependencies, run through type stripping in development. Lost: Bun, Go and shell, because the skills repo and Claude Code already run on Node and adapters will mostly spawn processes and parse JSON.
- **Checks**: `pnpm check` runs biome, `tsc --noEmit` with `@types/node`, and `node --test`, in GitHub Actions on every PR. Lost: biome and tests alone, because unchecked types would be the first lint debt and later gates lean on CI.
- **Build**: `tsc` emits `dist/` with `rewriteRelativeImportExtensions`, `bin` points at `dist/`, and `templates/` ships through `files`. Lost: a bundler, because it earns nothing at this size.
- **Package name**: unscoped `faber`, bin `faber`; `@dan86de/faber` with the same bin if npm refuses. Lost: scoped first, because the owner wants the plain name.
- **Release**: changesets, with `changesets/action` publishing on merge of the Version PR through npm trusted publishing; the first publish is a manual `npm publish` by the owner. Lost: a stored npm token, because it is a long-lived secret.
- **Version**: start at `0.1.0`, breaking changes as minor bumps until the coordinator works. Lost: `1.0.0`, because the shape is unproven.
- **Install**: from npm. Lost: `pnpm link --global` only, because the owner wants versioned releases.

Output shape, one line per path in a fixed order:

```
created spec/vision.md
kept CODING_STANDARDS.md (fallback)
kept CLAUDE.md
warn CLAUDE.md does not import @AGENTS.md
created .gitignore
next: fill spec/vision.md and .agents/coding-standards.md, then commit
```

## Seams

- **CLI in a temp git repo** (new): a `node --test` suite spawns the real `faber` bin inside a fresh temp git repo and asserts on stdout, exit code and the files on disk.
  Nothing exists to reuse, and the process boundary is the highest seam: it covers argument handling, git root detection, templates and output in one place.
  The packed-tarball check is the same seam with the bin taken from `node_modules/.bin/faber` after installing the `npm pack` output into a scratch folder.
- **Skills repo contract table** (existing, `../skills/.agents/conventions.md:149-157`): a person checks the new rows land there before `init` writes those paths.

## Sequence

1. The skills repo's contract lists `AGENTS.md`, `CLAUDE.md` and the `.gitignore` entry.
2. `faber init` in an empty git repo creates every file and prints the `next:` line; a second run keeps everything.
3. Existing files are respected: fallbacks are kept, a `CLAUDE.md` without the import is warned about, subfolder runs write at the root, and runs outside git fail.
4. Every PR to faber runs `pnpm check` in CI.
5. `faber` installs from a packed tarball and runs.
6. The owner publishes `0.1.0`, and later versions publish from the Version PR.

## Out of scope

- A state folder or per-machine project registry.
- Harness hook stubs.
- Interactive filling of the created files.
- Auto-commit or staging.
- A `--force` flag or any overwrite.
- Edits to any existing file other than appending `.scratch/` to `.gitignore`.
- Bridges for other harnesses; Codex and OpenCode read `AGENTS.md` natively.
- A bundler.
- Running `init` on faber itself as part of this feature; the owner tests on real repos by hand.

## Accepted breakage

- Template headings can drift from what the skills read, with no cross-repo check; the contract row is the single source, and drift shows the first time a skill misses a section.
- Repos on fallback files stay on them; the skills read fallbacks, so nothing stops working.
- Node below 24 is unsupported (`engines >=24`); the owner runs 24.
- Windows is untested; one owner on macOS.
- The first publish is manual, because trusted publishing needs the package to exist.

## Done means

- **Automated**:
  - `pnpm check` passes in CI.
  - In a temp git repo, the first `faber init` prints `created` for every path, and each file holds its required headings.
  - A second run prints only `kept` and leaves every file byte-identical.
  - An existing `CODING_STANDARDS.md` is kept as the fallback and no `.agents/coding-standards.md` is created.
  - An existing `CLAUDE.md` without `@AGENTS.md` produces the warning and stays unchanged.
  - A run from a subfolder writes at the git root.
  - A run outside git exits non-zero and writes nothing.
  - `.gitignore` holds `.scratch/` exactly once after repeated runs, and is created when missing.
  - `git status` after a run shows no staged changes.
  - A tarball from `npm pack`, installed into a scratch folder, runs `faber init` from `node_modules`.
- **Manual**:
  - The owner merges the contract PR in the skills repo.
  - The owner does the first `npm publish`.
  - The owner runs `faber init` on a real repo of his and judges whether the templates read well before filling.
