#!/bin/sh
# Publishes the version in package.json with npm itself, so trusted publishing (OIDC) authenticates it,
# then tags the release. A version already on npm is left alone, so a push with nothing to release passes.
set -eu
version="$(node -p "require('./package.json').version")"
spec="$(node -p "require('./package.json').name")@$version"
if answer="$(npm view "$spec" version 2>&1)"; then
  echo "$spec is already on npm"
  exit 0
fi
# Only a clear "not found" means this version is new; any other failure must not turn into a publish attempt.
case "$answer" in
  *E404*) ;;
  *)
    echo "$answer" >&2
    echo "could not ask npm whether $spec exists; not publishing" >&2
    exit 1
    ;;
esac
# Build first: npm reads the bin path from package.json before its prepack script runs.
pnpm run build
npm publish
git tag "v$version"
git push origin "v$version"
