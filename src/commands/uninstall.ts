import { rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCoreHooksPath, getGitRoot, unsetCoreHooksPath } from "../git.js";
import {
  getClaudeBackupPath,
  getClaudeSettingsPath,
  getDefaultHooksDir,
  getDistHookPath,
} from "../paths.js";
import {
  type ClaudeSettings,
  removeClaudeHookBySubcommand,
  removeClaudeHookByScriptName,
  removeClaudeHook,
  removeAnyManagedPostCommitBlock,
  removeManagedPostCommitBlock,
} from "./install-shared.js";
import { print, warn } from "../output.js";

async function uninstallClaudeHooks(): Promise<void> {
  const settingsPath = getClaudeSettingsPath();
  const raw = await readFile(settingsPath, "utf8").catch(() => null);
  if (!raw) {
    return;
  }

  const settings = JSON.parse(raw) as ClaudeSettings;
  removeClaudeHook(settings, "UserPromptSubmit", `node ${getDistHookPath("user-prompt-submit")}`);
  removeClaudeHook(settings, "Stop", `node ${getDistHookPath("stop")}`);
  removeClaudeHookByScriptName(settings, "UserPromptSubmit", "user-prompt-submit");
  removeClaudeHookByScriptName(settings, "Stop", "stop");
  removeClaudeHookBySubcommand(settings, "UserPromptSubmit", "_user-prompt-submit");
  removeClaudeHookBySubcommand(settings, "Stop", "_stop");

  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function cleanupPostCommit(path: string): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing === null) {
    return;
  }
  const next = removeManagedPostCommitBlock(
    removeAnyManagedPostCommitBlock(existing),
    `node ${getDistHookPath("post-commit")}`,
  );
  if (!next || next === "#!/usr/bin/env sh") {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, `${next}\n`, "utf8");
}

async function promptRestoreBackup(backupPath: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    print(`バックアップが残っています: ${backupPath}`);
    return false;
  }

  process.stdout.write(`バックアップを復元しますか? [y/N] `);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(String(chunk).trim().toLowerCase());
    });
  });
  return answer === "y" || answer === "yes";
}

export async function uninstallCommand(cwd: string): Promise<number> {
  await uninstallClaudeHooks();

  const projectRoot = await getGitRoot(cwd).catch(() => null);
  if (projectRoot) {
    await cleanupPostCommit(join(projectRoot, ".husky", "post-commit"));
  }

  const hooksPath = await getCoreHooksPath();
  if (hooksPath) {
    const postCommitPath = join(hooksPath, "post-commit");
    await cleanupPostCommit(postCommitPath);
    if (hooksPath === getDefaultHooksDir()) {
      await unsetCoreHooksPath().catch(() => undefined);
    } else {
      warn(`⚠ core.hooksPath は保持しました: ${hooksPath}`);
    }
  }

  const backupPath = getClaudeBackupPath();
  const backup = await readFile(backupPath, "utf8").catch(() => null);
  if (backup !== null) {
    if (await promptRestoreBackup(backupPath)) {
      await writeFile(getClaudeSettingsPath(), backup, "utf8");
      print(`バックアップを復元しました: ${backupPath}`);
    } else {
      print(`バックアップが残っています: ${backupPath}`);
    }
  }

  print("gle の設定を削除しました。");
  return 0;
}
