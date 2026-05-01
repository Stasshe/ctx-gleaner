import { postCommitCommand } from "../commands/commit.js";

postCommitCommand(process.cwd()).catch((error) => {
  console.error(`gle post-commit error: ${(error as Error).message}`);
  process.exit(0);
});
