import { getContextFilePath } from "../git.js";
import {
  isContextEffectivelyEmpty,
  readContextFile,
  resetContextFile,
} from "../context.js";

export async function contextCommand(
  cwd: string,
  args: string[],
): Promise<number> {
  const path = await getContextFilePath(cwd);
  if (args.includes("--clear")) {
    await resetContextFile(path);
    console.log("context をリセットしました。");
    return 0;
  }

  const content = await readContextFile(path);
  if (!content || isContextEffectivelyEmpty(content)) {
    console.log("(empty)");
    return 0;
  }

  process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
  return 0;
}
