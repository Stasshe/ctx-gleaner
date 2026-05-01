import { spawn } from "node:child_process";
import { resolveConfig } from "../config.js";
import {
  isContextEffectivelyEmpty,
  readContextFile,
  resetContextFile,
} from "../context.js";
import {
  getCachedDiffBody,
  getCachedDiffStat,
  getContextFilePath,
  getGitRoot,
  getRenameEntries,
  hasMergeInProgress,
  hasStagedChanges,
} from "../git.js";
import { createProvider } from "../providers/index.js";
import { createTempCommitFile } from "../utils.js";
import { printError } from "../output.js";

function hasFlag(args: string[], ...targets: string[]): boolean {
  return args.some((arg, index) => {
    if (targets.includes(arg)) {
      return true;
    }
    return targets.some((target) => target.length > 2 && arg.startsWith(`${target}=`));
  });
}

function isGenerationSkipped(args: string[]): boolean {
  return hasFlag(args, "-m", "--message", "-F", "--file", "--amend");
}

function stripCustomFlags(args: string[]): { gitArgs: string[]; edit: boolean } {
  const gitArgs: string[] = [];
  let edit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--edit") {
      edit = true;
      continue;
    }
    gitArgs.push(arg);
  }

  return { gitArgs, edit };
}

async function runGitCommit(cwd: string, args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("git", ["commit", ...args], {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code: number | null) => resolve(code ?? 1));
  });
}

async function runEditor(path: string): Promise<void> {
  const editor =
    process.env.GIT_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? "vi";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [path], { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`editor exited with code ${code ?? 1}`));
    });
  });
}

export async function postCommitCommand(cwd: string): Promise<number> {
  const contextPath = await getContextFilePath(cwd).catch(() => null);
  if (contextPath) {
    await resetContextFile(contextPath).catch((error) => {
      printError(`gle: failed to reset context: ${(error as Error).message}`);
    });
  }
  return 0;
}

export async function commitCommand(cwd: string, rawArgs: string[]): Promise<number> {
  const { gitArgs, edit } = stripCustomFlags(rawArgs);

  if (isGenerationSkipped(rawArgs) || (await hasMergeInProgress(cwd).catch(() => false))) {
    return runGitCommit(cwd, rawArgs);
  }

  const contextPath = await getContextFilePath(cwd);
  const contextMd = await readContextFile(contextPath);
  const staged = await hasStagedChanges(cwd);

  if (!staged && isContextEffectivelyEmpty(contextMd)) {
    return runGitCommit(cwd, rawArgs);
  }

  const config = await resolveConfig(cwd);
  const provider = createProvider(config);
  if (!provider.validate()) {
    printError("gle: provider is not configured. Falling back to git commit.");
    return runGitCommit(cwd, rawArgs);
  }

  try {
    await getGitRoot(cwd);
    const diffStat = await getCachedDiffStat(cwd);
    const renameEntries = await getRenameEntries(cwd);
    const renamedModifiedPaths = renameEntries
      .filter((entry) => entry.modified)
      .map((entry) => entry.to);
    const fullDiff = await getCachedDiffBody(cwd, renamedModifiedPaths);
    const diffBody = fullDiff.slice(0, config.maxDiffChars);
    const generatedMessage = await provider.generateMessage({
      contextMd,
      diffStat,
      diffBody,
      diffTruncated: fullDiff.length > config.maxDiffChars,
    });

    const tempFile = await createTempCommitFile(`${generatedMessage.trim()}\n`);
    try {
      if (edit) {
        await runEditor(tempFile.path);
      }

      const exitCode = await runGitCommit(cwd, ["-F", tempFile.path, ...gitArgs]);
      if (exitCode === 0) {
        await resetContextFile(contextPath);
      }
      return exitCode;
    } finally {
      await tempFile.cleanup();
    }
  } catch (error) {
    printError(`gle: ${(error as Error).message}`);
    printError("gle: falling back to plain git commit.");
    return runGitCommit(cwd, rawArgs);
  }
}
