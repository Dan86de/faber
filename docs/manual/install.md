# Install

A user installs faber from npm and runs `faber init` from their own shell, with no checkout of this repo.

## Entry points

- `npm install --global @dan86de/faber`, then `faber` on the PATH.
- `@dan86de/faber` installed as a project dependency and run from `node_modules/.bin/faber`.

## Steps

- **Run init from an installed package.** From this repo's root run `npm pack --pack-destination <folder>`, install the tarball it names into an empty project with `npm install <tarball>`, then run that project's `node_modules/.bin/faber init` inside a fresh git repo.
  It exits 0 and prints the same `created` lines and `next:` line as [Init](./init.md).

## Behind it

The tarball holds `dist/`, `templates/`, `README.md`, `LICENSE` and `package.json`, and no `.ts` file: run `tar -tzf <tarball>` to list it.

## Gotchas

- The verify helper runs `src/cli.ts` and cannot drive an installed package; `test/package.test.ts` performs these steps in `pnpm check`, so a verify run reports this feature as not driven.
- `npm pack` builds `dist/` first, so it needs this repo's dependencies installed.
