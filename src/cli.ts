#!/usr/bin/env node
import { gitRoot } from "./git.ts";
import { init } from "./init.ts";
import { run } from "./run.ts";

const usage = `usage: faber <command>

commands:
  init         create the project files the skills read, keeping any that exist
  run <slug>   carry a feature from its committed decision record to a ready PR`;

const [command, ...args] = process.argv.slice(2);

if (command === undefined || command === "help" || command === "--help" || command === "-h") {
  console.log(usage);
} else if (command === "init") {
  const repo = gitRoot(process.cwd());
  if ("error" in repo) {
    console.error(`faber: ${repo.error}; run faber init in a git work tree`);
    process.exitCode = 1;
  } else {
    for (const line of init(repo.root)) console.log(line);
  }
} else if (command === "run") {
  // Ctrl-C or a closed terminal stops the run through faber, which kills the session it started first.
  const interrupt = new AbortController();
  const onSignal = () => interrupt.abort();
  process.on("SIGINT", onSignal).on("SIGHUP", onSignal);
  const output = { refuse: (line: string) => console.error(line), print: (line: string) => console.log(line) };
  process.exitCode = await run(process.cwd(), args, output, interrupt.signal);
} else {
  console.error(`faber: unknown command "${command}"\n\n${usage}`);
  process.exitCode = 1;
}
