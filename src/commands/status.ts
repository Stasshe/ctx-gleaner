import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfig } from "../config.js";
import { GLE_ENV_VARS } from "../constants.js";
import { countContextEntries, readContextFile } from "../context.js";
import { getCoreHooksPath, getContextFilePath } from "../git.js";
import {
  getClaudeSettingsPath,
  getDefaultHooksDir,
  getGlobalConfigPath,
  getGlobalPromptPath,
} from "../paths.js";
import { type ClaudeSettings, hasClaudeHookSubcommand } from "./install-shared.js";
import { print } from "../output.js";

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export async function statusCommand(cwd: string): Promise<number> {
  const config = await resolveConfig(cwd);
  const settingsPath = getClaudeSettingsPath();
  const settings = await readFile(settingsPath, "utf8")
    .then((raw) => JSON.parse(raw) as ClaudeSettings)
    .catch(() => ({} as ClaudeSettings));
  const configuredHooksPath = await getCoreHooksPath();
  const hookPath = configuredHooksPath ?? getDefaultHooksDir();
  const postCommitPath = join(hookPath, "post-commit");
  const postCommitContent = await readFile(postCommitPath, "utf8").catch(() => "");
  const globalConfigPath = getGlobalConfigPath();
  const globalPromptPath = getGlobalPromptPath();
  const contextPath = await getContextFilePath(cwd).catch(() => null);
  const contextContent = contextPath ? await readContextFile(contextPath) : "";
  const contextEntries = contextContent ? countContextEntries(contextContent) : 0;

  print("gle status");
  print();
  print("Claude Code hooks:");
  print(
    `  ${hasClaudeHookSubcommand(settings, "UserPromptSubmit", "_user-prompt-submit") ? "✓" : "✗"} UserPromptSubmit  ${settingsPath}`,
  );
  print(
    `  ${hasClaudeHookSubcommand(settings, "Stop", "_stop") ? "✓" : "✗"} Stop              ${settingsPath}`,
  );
  print();
  print("git hook:");
  print(
    `  ${postCommitContent.includes(" _post-commit") ? "✓" : "✗"} post-commit       ${postCommitPath}`,
  );
  print(
    `  ${configuredHooksPath ? "✓" : "✗"} core.hooksPath    ${hookPath}`,
  );
  print();
  print("設定:");
  print(`  provider:           ${config.provider}  (${config.sources.provider})`);
  if (config.provider === "cmd") {
    print(`  cmd:                ${config.cmd ?? "(unset)"}`);
  } else {
    print(`  model:              ${config.model ?? "(unset)"}  (${config.sources.model})`);
    if (config.provider === "api") {
      print(
        `  apiBaseUrl:         ${config.apiBaseUrl ?? "(unset)"}  (${config.sources.apiBaseUrl})`,
      );
    }
  }
  print(
    `  maxDiffChars:       ${config.maxDiffChars}  (${config.sources.maxDiffChars})`,
  );
  print(
    `  maxOutputTokens:    ${config.maxOutputTokens}  (${config.sources.maxOutputTokens})`,
  );
  print(`  language:           ${config.language}  (${config.sources.language})`);
  print(`  prompt:             ${config.sources.prompt}`);
  print(`  global config:      ${await exists(globalConfigPath) ? globalConfigPath : "(none)"}`);
  print(`  global prompt:      ${await exists(globalPromptPath) ? globalPromptPath : "(none)"}`);
  print();
  print("環境変数:");
  for (const name of GLE_ENV_VARS) {
    const value = process.env[name];
    print(`  ${value ? "✓" : "✗"} ${name.padEnd(22)} ${value ? "設定済み" : "未設定"}`);
  }
  print();
  print("現在のコンテキスト:");
  if (contextPath) {
    print(`  プロジェクト: ${cwd}`);
    print(
      `  ${contextEntries > 0 ? "✓" : "✗"} GLE_COMMIT_CONTEXT.md  ${contextEntries}件のエントリ`,
    );
  } else {
    print("  git リポジトリ外です");
  }

  return 0;
}
