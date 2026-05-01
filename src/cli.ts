#!/usr/bin/env node
import { commitCommand, postCommitCommand } from "./commands/commit.js";
import { contextCommand } from "./commands/context.js";
import { installCommand } from "./commands/install.js";
import { statusCommand } from "./commands/status.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { runStopHook } from "./hooks/stop.js";
import { runUserPromptSubmitHook } from "./hooks/user-prompt-submit.js";

function printHelp(): void {
  console.log(`gle

Usage:
  gle install
  gle uninstall
  gle commit [git flags]
  gle commit --edit [git flags]
  gle status
  gle context [--clear]
  gle --help
  gle --version`);
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const cwd = process.cwd();

  switch (command) {
    case "install":
      return installCommand(cwd);
    case "uninstall":
      return uninstallCommand(cwd);
    case "commit":
      return commitCommand(cwd, args);
    case "status":
      return statusCommand(cwd);
    case "context":
      return contextCommand(cwd, args);
    case "_post-commit":
      return postCommitCommand(cwd);
    case "_user-prompt-submit":
      await runUserPromptSubmitHook();
      return 0;
    case "_stop":
      await runStopHook();
      return 0;
    case "--version":
    case "-v":
      console.log("0.3.1");
      return 0;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
