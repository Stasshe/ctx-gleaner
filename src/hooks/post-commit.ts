import { postCommitCommand } from "../commands/commit.js";
import { printError } from "../output.js";

postCommitCommand(process.cwd()).catch((error) => {
  printError(`gle post-commit error: ${(error as Error).message}`);
  process.exit(0);
});
