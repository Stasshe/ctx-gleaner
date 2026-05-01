import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfig } from "../config.js";
import { countContextEntries, readContextFile } from "../context.js";
import { getCoreHooksPath, getContextFilePath } from "../git.js";
import {
  getClaudeSettingsPath,
  getDefaultHooksDir,
  getDistHookPath,
  getGlobalConfigPath,
  getGlobalPromptPath,
} from "../paths.js";
import { type ClaudeSettings, hasClaudeHook } from "./install-shared.js";

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
  const userPromptCommand = `node ${getDistHookPath("user-prompt-submit")}`;
  const stopCommand = `node ${getDistHookPath("stop")}`;
  const configuredHooksPath = await getCoreHooksPath();
  const hookPath = configuredHooksPath ?? getDefaultHooksDir();
  const postCommitPath = join(hookPath, "post-commit");
  const postCommitContent = await readFile(postCommitPath, "utf8").catch(() => "");
  const globalConfigPath = getGlobalConfigPath();
  const globalPromptPath = getGlobalPromptPath();
  const contextPath = await getContextFilePath(cwd).catch(() => null);
  const contextContent = contextPath ? await readContextFile(contextPath) : "";
  const contextEntries = contextContent ? countContextEntries(contextContent) : 0;

  console.log("gle status");
  console.log("");
  console.log("Claude Code hooks:");
  console.log(
    `  ${hasClaudeHook(settings, "UserPromptSubmit", userPromptCommand) ? "✓" : "✗"} UserPromptSubmit  ${settingsPath}`,
  );
  console.log(
    `  ${hasClaudeHook(settings, "Stop", stopCommand, true) ? "✓" : "✗"} Stop              ${settingsPath}`,
  );
  console.log("");
  console.log("git hook:");
  console.log(
    `  ${postCommitContent.includes(`node ${getDistHookPath("post-commit")}`) ? "✓" : "✗"} post-commit       ${postCommitPath}`,
  );
  console.log(
    `  ${configuredHooksPath ? "✓" : "✗"} core.hooksPath    ${hookPath}`,
  );
  console.log("");
  console.log("設定:");
  console.log(`  provider:           ${config.provider}  (${config.sources.provider})`);
  console.log(`  model:              ${config.model ?? "(unset)"}  (${config.sources.model})`);
  console.log(
    `  maxDiffChars:       ${config.maxDiffChars}  (${config.sources.maxDiffChars})`,
  );
  console.log(`  language:           ${config.language}  (${config.sources.language})`);
  console.log(`  prompt:             ${config.sources.prompt}`);
  console.log(`  global config:      ${await exists(globalConfigPath) ? globalConfigPath : "(none)"}`);
  console.log(`  global prompt:      ${await exists(globalPromptPath) ? globalPromptPath : "(none)"}`);
  console.log("");
  console.log("環境変数:");
  for (const name of [
    "GLE_PROVIDER",
    "GLE_GEMINI_API_KEY",
    "GLE_OPENAI_API_KEY",
    "GLE_LITELLM_API_KEY",
  ]) {
    const value = process.env[name];
    console.log(`  ${value ? "✓" : "✗"} ${name.padEnd(22)} ${value ? "設定済み" : "未設定"}`);
  }
  console.log("");
  console.log("現在のコンテキスト:");
  if (contextPath) {
    console.log(`  プロジェクト: ${cwd}`);
    console.log(
      `  ${contextEntries > 0 ? "✓" : "✗"} GLE_COMMIT_CONTEXT.md  ${contextEntries}件のエントリ`,
    );
  } else {
    console.log("  git リポジトリ外です");
  }

  return 0;
}
