import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolveConfig } from "../config.js";
import { isContextEffectivelyEmpty, readContextFile } from "../context.js";
import {
  getCachedDiffBody,
  getCachedDiffStat,
  getContextFilePath,
  getGeneratedMsgPath,
  getRenameEntries,
  hasStagedChanges,
  hasUnstagedChanges,
  hasUntrackedFiles,
  stageAll,
  getUnstagedDiffStat,
  getUnstagedDiffBody,
} from "../git.js";
import { PROVIDER_API_KEY_ENV } from "../constants.js";
import { createProvider } from "../providers/index.js";
import { print, printError } from "../output.js";

async function openEditor(path: string): Promise<void> {
  const editor =
    process.env.GIT_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? "vi";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [path], { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`editor exited with code ${code ?? 1}`));
    });
  });
}

export async function generateCommand(cwd: string): Promise<number> {
  const contextPath = await getContextFilePath(cwd);
  const contextMd = await readContextFile(contextPath);
  const staged = await hasStagedChanges(cwd);
  const hasModified = !staged && (await hasUnstagedChanges(cwd));
  const hasNew = !staged && (await hasUntrackedFiles(cwd));
  const useUnstaged = hasModified && !hasNew;
  const useAutoStage = !staged && hasNew;

  if (!staged && !useUnstaged && !useAutoStage && isContextEffectivelyEmpty(contextMd)) {
    printError("gle: no staged or unstaged changes and no context. Nothing to generate.");
    return 1;
  }

  const config = await resolveConfig(cwd);
  const provider = createProvider(config);
  if (!provider.validate()) {
    const envKey = PROVIDER_API_KEY_ENV[config.provider] ?? "provider API key";
    printError(`gle: ${envKey} is not set.`);
    return 1;
  }

  if (useAutoStage) {
    await stageAll(cwd);
  }

  const useCached = staged || useAutoStage;
  const diffStat = useUnstaged
    ? await getUnstagedDiffStat(cwd)
    : await getCachedDiffStat(cwd);
  const renameEntries = useCached ? await getRenameEntries(cwd) : [];
  const renamedModifiedPaths = renameEntries
    .filter((entry) => entry.modified)
    .map((entry) => entry.to);
  const fullDiff = useUnstaged
    ? await getUnstagedDiffBody(cwd)
    : await getCachedDiffBody(cwd, renamedModifiedPaths);
  const diffBody = fullDiff.slice(0, config.maxDiffChars);

  const message = await provider.generateMessage({
    contextMd,
    diffStat,
    diffBody,
    diffTruncated: fullDiff.length > config.maxDiffChars,
  });

  const outputPath = await getGeneratedMsgPath(cwd);
  await writeFile(outputPath, `${message.trim()}\n`, "utf8");
  print(`gle: generated message saved to ${outputPath}`);

  await openEditor(outputPath);
  return 0;
}
