import { stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfig } from "../config.js";
import { countContextEntries, readContextFile } from "../context.js";
import { getCoreHooksPath, getContextFilePath } from "../git.js";
import { getClaudeSettingsPath, getDefaultHooksDir } from "../paths.js";

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export async function statusCommand(cwd: string): Promise<number> {
  const config = await resolveConfig(cwd);
  const settingsPath = getClaudeSettingsPath();
  const hookPath = (await getCoreHooksPath()) ?? getDefaultHooksDir();
  const postCommitPath = join(hookPath, "post-commit");
  const contextPath = await getContextFilePath(cwd).catch(() => null);
  const contextContent = contextPath ? await readContextFile(contextPath) : "";
  const contextEntries = contextContent ? countContextEntries(contextContent) : 0;

  console.log("gle status");
  console.log("");
  console.log("Claude Code hooks:");
  console.log(
    `  ${await exists(settingsPath) ? "✓" : "✗"} settings.json        ${settingsPath}`,
  );
  console.log("");
  console.log("git hook:");
  console.log(
    `  ${await exists(postCommitPath) ? "✓" : "✗"} post-commit        ${postCommitPath}`,
  );
  console.log(`  ${hookPath ? "✓" : "✗"} core.hooksPath    ${hookPath}`);
  console.log("");
  console.log("設定:");
  console.log(`  provider:           ${config.provider}  (${config.sources.provider})`);
  console.log(`  model:              ${config.model ?? "(unset)"}  (${config.sources.model})`);
  console.log(
    `  maxDiffChars:       ${config.maxDiffChars}  (${config.sources.maxDiffChars})`,
  );
  console.log(`  language:           ${config.language}  (${config.sources.language})`);
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
