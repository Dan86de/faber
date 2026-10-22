import assert from "node:assert/strict";
import { test } from "node:test";
import { runFaber, tempRepo } from "./faber.ts";

test("faber with no command prints its usage and exits 0", (t) => {
  const result = runFaber(tempRepo(t));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^usage: faber <command>\n\ncommands:\n/);
  assert.equal(result.stderr, "");
});

test("faber with an unknown command prints its usage to stderr and exits 1", (t) => {
  const result = runFaber(tempRepo(t), "nope");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^faber: unknown command "nope"\n\nusage: faber <command>\n/);
});
