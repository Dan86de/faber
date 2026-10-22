#!/usr/bin/env node
const usage = `usage: faber <command>

commands:
  (none yet)`;

const [command] = process.argv.slice(2);

if (command === undefined || command === "help" || command === "--help" || command === "-h") {
  console.log(usage);
} else {
  console.error(`faber: unknown command "${command}"\n\n${usage}`);
  process.exitCode = 1;
}
