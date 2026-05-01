import { rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GLE_MANAGED_COMMENT } from "../constants.js";
import {
  getCoreHooksPath,
  getGitRoot,
  unsetCoreHooksPath,
} from "../git.js";
import {
  getClaudeBackupPath,
  getClaudeSettingsPath,
  getDefaultHooksDir,
  getDistHookPath,
} from "../paths.js";

interface ClaudeSettings {
  hooks?: Record<string, Array<{ hooks?: Array<Record<string, unknown>> }>>;
  [key: string]: unknown;
}

function removeClaudeCommand(
  settings: ClaudeSettings,
  hookName: "UserPromptSubmit" | "Stop",
  command: string,
): void {
  const groups = settings.hooks?.[hookName];
  if (!groups) {
    return;
  }
  settings.hooks![hookName] = groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks ?? []).filter(
        (hook) => !(hook.type === "command" && hook.command === command),
      ),
    }))
    .filter((group) => (group.hooks?.length ?? 0) > 0);
}

async function uninstallClaudeHooks(): Promise<void> {
  const settingsPath = getClaudeSettingsPath();
  const raw = await readFile(settingsPath, "utf8").catch(() => null);
  if (!raw) {
    return;
  }

  const settings = JSON.parse(raw) as ClaudeSettings;
  removeClaudeCommand(
    settings,
    "UserPromptSubmit",
    `node ${getDistHookPath("user-prompt-submit")}`,
  );
  removeClaudeCommand(settings, "Stop", `node ${getDistHookPath("stop")}`);

  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function removeManagedLines(content: string): string {
  const command = `node ${getDistHookPath("post-commit")}`;
  const lines = content.split("\n");
  const filtered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    if (line === GLE_MANAGED_COMMENT && lines[index + 1] === command) {
      index += 1;
      continue;
    }
    if (line === command) {
      continue;
    }
    filtered.push(line);
  }
  return filtered.join("\n").trimEnd();
}

async function cleanupPostCommit(path: string): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing === null) {
    return;
  }
  const next = removeManagedLines(existing);
  if (!next || next === "#!/usr/bin/env sh") {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, `${next}\n`, "utf8");
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
      console.warn(`⚠ core.hooksPath は保持しました: ${hooksPath}`);
    }
  }

  const backupPath = getClaudeBackupPath();
  const backup = await readFile(backupPath, "utf8").catch(() => null);
  if (backup !== null) {
    console.log(`バックアップが残っています: ${backupPath}`);
  }

  console.log("gle の設定を削除しました。");
  return 0;
}
