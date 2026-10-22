// Fake `gh`: answers `gh pr view` with the scripted pull request, and refuses every other command.
import { appendFileSync } from "node:fs";
import { type FakeCall, fakeFiles, type GhScript, ghScriptProblem, readScript, stdinState } from "./fakes.ts";

const dir = process.env.FAKE_DIR;
if (!dir) {
  process.stderr.write("fake gh: FAKE_DIR is not set; run it through the bin folder installFakes wrote\n");
  process.exit(2);
}
const argv = process.argv.slice(2);
const call: FakeCall = { argv, cwd: process.cwd(), stdin: await stdinState(), session: null, pid: process.pid };
appendFileSync(fakeFiles(dir, "gh").calls, `${JSON.stringify(call)}\n`);

const script = readScript(dir, "gh");
const problem = ghScriptProblem(script);
if (problem) {
  process.stderr.write(`fake gh: bad script: ${problem}\n`);
  process.exit(2);
}
const { pr } = script as GhScript;
const [group, command, ...rest] = argv;
if (group !== "pr" || command !== "view") {
  process.stderr.write(`fake gh: unsupported command: ${argv.join(" ")}\n`);
  process.exit(1);
}
if (!pr) {
  process.stderr.write("no pull requests found for the current branch\n");
  process.exit(1);
}
const at = rest.indexOf("--json");
if (at === -1) {
  process.stdout.write(`${pr.url}\n`);
} else {
  const fields = (rest[at + 1] ?? "").split(",").filter(Boolean);
  const unknown = fields.filter((field) => !(field in pr));
  if (unknown.length || !fields.length) {
    process.stderr.write(
      `fake gh: unknown JSON fields: ${unknown.join(", ") || "(none given)"}; known: url, isDraft\n`,
    );
    process.exit(1);
  }
  const picked = Object.fromEntries(fields.map((field) => [field, pr[field as keyof typeof pr]]));
  process.stdout.write(`${JSON.stringify(picked)}\n`);
}
