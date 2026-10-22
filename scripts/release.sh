#!/bin/sh
# Publishes the version in package.json with npm itself, so trusted publishing (OIDC) authenticates it,
# then tags the release. A version already on npm is left alone, so a push with nothing to release passes.
set -eu
version="$(node -p "require('./package.json').version")"
spec="$(node -p "require('./package.json').name")@$version"
if npm view "$spec" version >/dev/null 2>&1; then
  echo "$spec is already on npm"
  exit 0
fi
npm publish
git tag "v$version"
git push origin "v$version"
