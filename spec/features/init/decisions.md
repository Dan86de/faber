## Decision record: faber init

**Pain**: The owner is starting to work with several agents now and wants one entry point that makes any repo ready for the skills and for faber.
**Wedge**: One command that writes the missing project files and wiring, never overwriting, and prints what it created, what it kept and what to do next.
**Premise**: Every later faber command and every skill assumes these files exist, and the owner wants a unified setup to work on by hand first; it holds, and it puts `init` in faber rather than in a skill because it does runtime wiring (ignore entries, the harness bridge), not judgment.

### Settled
- **Scope**: `spec/vision.md`, `spec/glossary.md`, `.agents/coding-standards.md` and `AGENTS.md`, plus `.scratch/` appended to `.gitignore`, a git repo check and a closing `next:` line. Rejected: a state folder, a per-machine project registry and harness hook stubs, because git is the state and nothing needs them yet.
- **Commit**: `init` commits and stages nothing; it prints `next: fill spec/vision.md and .agents/coding-standards.md, then commit`. Rejected: auto-commit, because empty skeletons are history noise and filling them is the human step.
- **Run from a subfolder**: writes at the git root from `git rev-parse --show-toplevel`. Rejected: refusing, because the contract paths live at the root.
- **Template content**: bare skeletons carrying the headings the skills read (`## Product principles`, `## Current direction`, `## Rules`, `## One-way doors`) with `<!-- hint -->` lines. Rejected: faber's own files as filled examples, because they leak faber's intent; interactive filling, because that is a judgment and belongs to a skill.
- **Fallback files**: when a contract fallback exists (`CODING_STANDARDS.md`, `GLOSSARY.md`, `CONTEXT.md`), skip the home path and print `kept <fallback> (fallback)`. Rejected: creating the home path anyway, because skills would read the empty new file first; moving the fallback, because that edits the user's file.
- **AGENTS.md template**: pointers to the vision, glossary and standards, the planning rule (`spec/features/<slug>/`, the vision is the owner's), and an empty `## Rules` for repo conventions. Rejected: empty headings only, because these lines repeat in every repo and make the skills find their files.
- **CLAUDE.md bridge**: the Claude Code adapter creates `CLAUDE.md` holding `@AGENTS.md`. Rejected: `AGENTS.md` alone, because Claude Code would never read it; deferring to the context feature, because the drift starts at init.
- **Existing CLAUDE.md**: kept, with a warning when it does not import `AGENTS.md`. Rejected: appending the import, because it edits the user's file; keeping it silently, because it hides the drift.
- **Contract first**: slice zero, `hitl`, adds `AGENTS.md`, `CLAUDE.md` and the `.gitignore` entry to the skills repo's project file contract before `init` writes them. Rejected: a by-hand precondition outside the feature, because the feature would otherwise break the repo rule.
- **Stack**: TypeScript on Node 24, pnpm, zero runtime dependencies, run directly in development through type stripping. Rejected: Bun, Go and shell, because the skills repo and Claude Code already run on Node and adapters will mostly spawn processes and parse JSON.
- **Checks**: `pnpm check` runs biome (format and lint), `tsc --noEmit` with `@types/node`, and `node --test`, in GitHub Actions on every PR. Rejected: biome and tests alone, because unchecked types would be the first lint debt and later gates lean on CI.
- **Build**: `tsc` emits `dist/` with `rewriteRelativeImportExtensions`, `bin` points at `dist/`, and `templates/` ships through `files`. Rejected: a bundler, because it earns nothing at this size.
- **Package name**: unscoped `faber`, bin `faber`; if npm refuses it, `@dan86de/faber` with the same bin. Rejected: scoped first, because the owner wants the plain name.
- **Release flow**: changesets, with `changesets/action` publishing on merge of the Version PR through npm trusted publishing (GitHub OIDC, no stored token); the first publish is a manual `npm publish` by the owner. Rejected: a stored npm token, because it is a long-lived secret.
- **First version**: `0.1.0`, breaking changes as minor bumps until the coordinator works. Rejected: `1.0.0`, because the shape is unproven.
- **Install**: from npm. Rejected: `pnpm link --global` only, because the owner wants proper versioned releases.
- **Slug**: `init`, folder `spec/features/init/`, branch `slices/init`.

### Found during recon
- The README already names `init` as step 1 and fixes "from templates, never overwriting" (`README.md`, "What it will do, in order").
- The project file contract lists vision, glossary and coding standards with their fallbacks, but not `AGENTS.md`, `CLAUDE.md` or `.gitignore` (`../skills/.agents/conventions.md:147`).
- codify creates `.agents/coding-standards.md` when it is missing, so `init` and codify write the same skeleton target (`../skills/skills/in-progress/codify/SKILL.md:15`).
- `pr-brief` reads the `## One-way doors` section of the standards file, so that heading is a contract (`../skills/skills/in-progress/pr-brief/SKILL.md:22`).
- Every skill that writes run output uses `.scratch/`, and faber's `.gitignore` already ignores it.
- Node refuses to strip types from `.ts` files under `node_modules`, so a published package needs emitted JavaScript.
- The npm name `faber` was unpublished in 2016 and `@dan86de/faber` is free; this machine is not logged in to npm.
- The skills repo already versions with changesets through `changesets/action`, tagging but not publishing (`../skills/.github/workflows/release.yml`).
- This repo's `CLAUDE.md` duplicates `AGENTS.md` by hand, the drift the bridge prevents.

### Not doing
- A state folder or per-machine project registry.
- Harness hook stubs.
- Interactive filling of the created files.
- Auto-commit or staging.
- A `--force` flag or any overwrite.
- Edits to any existing file other than appending `.scratch/` to `.gitignore`.
- Bridges for other harnesses; Codex and OpenCode read `AGENTS.md` natively.
- A bundler.
- A dogfood slice on faber itself; the owner tests on real repos by hand.

### Accepted breakage
- Template headings can drift from what the skills read, with no cross-repo check; the contract row is the single source and drift shows up the first time a skill misses a section.
- Repos on fallback files stay on them; the skills read fallbacks, so nothing stops working.
- Node below 24 is unsupported (`engines >=24`); the owner runs 24.
- Windows is untested; one owner on macOS.
- The first publish is manual; trusted publishing needs the package to exist.

### Done means
- Automated: `pnpm check` passes in CI.
- Automated: in a temp git repo, the first `faber init` prints `created` for every path and each file holds its required headings.
- Automated: a second run prints only `kept` and leaves every file byte-identical.
- Automated: an existing `CODING_STANDARDS.md` is kept as the fallback and no `.agents/coding-standards.md` is created.
- Automated: an existing `CLAUDE.md` without `@AGENTS.md` produces the warning and stays unchanged.
- Automated: a run from a subfolder writes at the git root.
- Automated: a run outside git exits non-zero.
- Automated: `.gitignore` holds `.scratch/` exactly once after repeated runs, created when missing.
- Automated: a tarball from `npm pack`, installed into a scratch folder, runs `faber init` from `node_modules`.
- Manual: the owner merges the contract PR in the skills repo.
- Manual: the owner does the first `npm publish`.
- Manual: the owner runs `faber init` on a real repo of his.

### Reversibility
Everything but the release is a handful of files in a repo and cheap to undo.
The one-way doors are claiming the npm name and each published version, since npm never reuses a version and allows unpublish only within 72 hours; the first publish stays manual so the claim is deliberate.
The signal to revisit: a month in, the owner still hand-edits what `init` created before a repo is usable, which means the templates are wrong.
