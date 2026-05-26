import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CONTEXT_FILE_NAME, LOCKFILE_PATTERNS } from "./constants.js";

const execFileAsync = promisify(execFile);

async function runGitRaw(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message: string;
    };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
      code: failure.code ?? 1,
    };
  }
}

export async function runGit(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await runGitRaw(args, cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const result = await runGitRaw(["-C", cwd, "rev-parse", "--git-dir"]);
  return result.code === 0;
}

export async function getGitRoot(cwd: string): Promise<string> {
  const { stdout } = await runGit(["-C", cwd, "rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function getGitDir(cwd: string): Promise<string> {
  const { stdout } = await runGit(["-C", cwd, "rev-parse", "--git-dir"]);
  return resolve(cwd, stdout.trim());
}

export async function getProjectGleDir(cwd: string): Promise<string> {
  const gitRoot = await getGitRoot(cwd);
  return join(gitRoot, ".gle");
}

export async function getContextFilePath(cwd: string): Promise<string> {
  const gleDir = await getProjectGleDir(cwd);
  return join(gleDir, CONTEXT_FILE_NAME);
}

export async function hasMergeInProgress(cwd: string): Promise<boolean> {
  const gitDir = await getGitDir(cwd);
  try {
    await access(resolve(gitDir, "MERGE_HEAD"), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function hasUntrackedFiles(cwd: string): Promise<boolean> {
  const result = await runGitRaw(
    ["ls-files", "--others", "--exclude-standard"],
    cwd,
  );
  return result.code === 0 && result.stdout.trim().length > 0;
}

export async function getUntrackedFilesList(cwd: string): Promise<string> {
  const result = await runGitRaw(
    ["ls-files", "--others", "--exclude-standard"],
    cwd,
  );
  return result.code === 0 ? result.stdout.trim() : "";
}

export async function stageAll(cwd: string): Promise<void> {
  await runGit(["add", "-A"], cwd);
}

export async function getCoreHooksPath(): Promise<string | null> {
  const result = await runGitRaw(["config", "--global", "--get", "core.hooksPath"]);
  return result.code === 0 ? result.stdout.trim() : null;
}

export async function unsetCoreHooksPath(): Promise<void> {
  await runGit(["config", "--global", "--unset", "core.hooksPath"]);
}

export async function setCoreHooksPath(path: string): Promise<void> {
  await runGit(["config", "--global", "core.hooksPath", path]);
}

export async function isRepositoryPrepared(cwd: string): Promise<boolean> {
  const result = await runGitRaw(
    ["-C", cwd, "config", "--local", "--bool", "--get", "gle.prepared"],
  );
  return result.code === 0 && result.stdout.trim() === "true";
}

export async function markRepositoryPrepared(cwd: string): Promise<void> {
  await runGit(["-C", cwd, "config", "--local", "gle.prepared", "true"]);
}

function buildDiffPathspec(): string[] {
  return LOCKFILE_PATTERNS.map((pattern) => `:(exclude)${pattern}`);
}

export async function getCachedDiffStat(cwd: string): Promise<string> {
  const args = ["diff", "--cached", "--find-renames", "--stat", "--", ...buildDiffPathspec()];
  const { stdout } = await runGit(args, cwd);
  return stdout.trim();
}

export interface RenameEntry {
  similarity: number;
  from: string;
  to: string;
  modified: boolean;
}

export async function getRenameEntries(cwd: string): Promise<RenameEntry[]> {
  const args = [
    "diff",
    "--cached",
    "--find-renames=50%",
    "--diff-filter=R",
    "--name-status",
    "--",
    ...buildDiffPathspec(),
  ];
  const { stdout } = await runGit(args, cwd);

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [status, from, to] = line.split("\t");
      if (!status || !from || !to || !status.startsWith("R")) {
        return [];
      }
      const similarity = Number.parseInt(status.slice(1), 10);
      return [
        {
          similarity: Number.isFinite(similarity) ? similarity : 0,
          from,
          to,
          modified: similarity < 100,
        },
      ];
    });
}

export async function getCachedDiffBody(
  cwd: string,
  renamedModifiedPaths: string[] = [],
): Promise<string> {
  const renameEntries = await getRenameEntries(cwd);
  const pathspec = ["--", ...buildDiffPathspec()];

  if (renameEntries.length >= 3) {
    const renameSummary = [
      `[リネーム検出: ${renameEntries.length}件]`,
      ...renameEntries.map(
        (entry) =>
          `- ${entry.from} → ${entry.to} (similarity: ${entry.similarity}%)`,
      ),
    ].join("\n");

    const modifiedFiles = renamedModifiedPaths.length
      ? await getDiffForPaths(cwd, renamedModifiedPaths)
      : "";

    return [renameSummary, modifiedFiles.trim()].filter(Boolean).join("\n\n").trim();
  }

  const { stdout } = await runGit(
    ["diff", "--cached", "--find-renames=50%", ...pathspec],
    cwd,
  );
  return stdout.trim();
}

export async function getDiffForPaths(
  cwd: string,
  paths: string[],
): Promise<string> {
  if (paths.length === 0) {
    return "";
  }
  const { stdout } = await runGit(
    ["diff", "--cached", "--find-renames=50%", "--", ...paths],
    cwd,
  );
  return stdout.trim();
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
  const result = await runGitRaw(["diff", "--cached", "--quiet"], cwd);
  return result.code === 1;
}

export async function hasUnstagedChanges(cwd: string): Promise<boolean> {
  const result = await runGitRaw(["diff", "--quiet"], cwd);
  return result.code === 1;
}

export async function getUnstagedDiffStat(cwd: string): Promise<string> {
  const args = ["diff", "--find-renames", "--stat", "--", ...buildDiffPathspec()];
  const { stdout } = await runGit(args, cwd);
  return stdout.trim();
}

export async function getUnstagedDiffBody(cwd: string): Promise<string> {
  const { stdout } = await runGit(
    ["diff", "--find-renames=50%", "--", ...buildDiffPathspec()],
    cwd,
  );
  return stdout.trim();
}

export async function getGeneratedMsgPath(cwd: string): Promise<string> {
  const gleDir = await getProjectGleDir(cwd);
  return join(gleDir, "GLE_GENERATED_MSG.md");
}
