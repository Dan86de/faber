#!/usr/bin/env node
import { init } from "./init.ts";

const usage = `usage: faber <command>

commands:
  init  create the project files the skills read, keeping any that exist`;

const [command] = process.argv.slice(2);

if (command === undefined || command === "help" || command === "--help" || command === "-h") {
  console.log(usage);
} else if (command === "init") {
  for (const line of init(process.cwd())) console.log(line);
} else {
  console.error(`faber: unknown command "${command}"\n\n${usage}`);
  process.exitCode = 1;
}
