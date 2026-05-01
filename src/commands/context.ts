import { getContextFilePath } from "../git.js";
import {
  isContextEffectivelyEmpty,
  readContextFile,
  resetContextFile,
} from "../context.js";
import { print } from "../output.js";

export async function contextCommand(
  cwd: string,
  args: string[],
): Promise<number> {
  const path = await getContextFilePath(cwd);
  if (args.includes("--clear")) {
    await resetContextFile(path);
    print("context をリセットしました。");
    return 0;
  }

  const content = await readContextFile(path);
  if (!content || isContextEffectivelyEmpty(content)) {
    print("(empty)");
    return 0;
  }

  process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
  return 0;
}
