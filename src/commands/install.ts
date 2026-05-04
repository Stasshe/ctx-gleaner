import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveConfig } from "../config.js";
import { ensureContextFile, ensureGleGitignoreEntry } from "../context.js";
import {
  getContextFilePath,
  getCoreHooksPath,
  getGitRoot,
  runGit,
  setCoreHooksPath,
} from "../git.js";
import {
  getClaudeBackupPath,
  getClaudeSettingsPath,
  getDefaultHooksDir,
  getGlobalConfigPath,
} from "../paths.js";
import {
  type ClaudeSettings,
  mergeClaudeHook,
  removeClaudeHookByScriptName,
  removeClaudeHookBySubcommand,
  upsertPostCommitScript,
} from "./install-shared.js";
import { print, warn } from "../output.js";
import { PROVIDER_API_KEY_ENV } from "../constants.js";

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getGlobalCliPath(): string {
  const cliPath = resolve(process.argv[1] ?? "");
  if (
    cliPath.endsWith(`${join("dist", "cli.js")}`) ||
    cliPath.includes(`${join("node_modules", ".bin", "gle")}`) ||
    cliPath.includes(`${join("node_modules", "ctx-gleaner")}`)
  ) {
    throw new Error(
      "gle install must be run from a global install. Run: npm install -g ctx-gleaner && gle install",
    );
  }
  return cliPath;
}

function buildCliCommand(subcommand: string): string {
  return `node ${quoteShellArg(getGlobalCliPath())} ${subcommand}`;
}

const DEFAULT_GLOBAL_CONFIG = `{
  // Generation mode: "api" (default) | "cmd"
  // "api"  — use a cloud API provider
  // "cmd"  — pipe the prompt to a custom command via stdin; read commit message from stdout
  "mode": "api",

  // ── api mode ────────────────────────────────────────────────────────────────
  // provider: "api" | "openai" | "gemini" (default) | "claude"
  "provider": "gemini",
  // model name (provider-specific); api requires this or GLE_API_MODEL
  "model": "gemini-2.5-flash",
  // max characters from the diff sent to the prompt
  "maxDiffChars": 8000,
  // commit message language: "auto" | "en" | "ja" | "zh" | "ko" | "es"
  "language": "auto",

  // ── cmd mode ─────────────────────────────────────────────────────────────────
  // shell command to run; prompt → stdin, commit message ← stdout
  // examples:
  //   "cmd": "ollama run llama3.2"
  //   "cmd": "qc --stdin"
  // "cmd": ""
}
`;

async function ensureUserConfigFiles(): Promise<void> {
  const configPath = getGlobalConfigPath();
  await mkdir(dirname(configPath), { recursive: true });

  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeFile(configPath, DEFAULT_GLOBAL_CONFIG, "utf8");
  }
}

async function ensureGitInstalled(): Promise<void> {
  try {
    await runGit(["--version"]);
  } catch {
    throw new Error("git is required");
  }
}

async function ensureClaudeCli(): Promise<void> {
  try {
    const { execFile } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      execFile("claude", ["--version"], (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch {
    throw new Error("claude command was not found");
  }
}

async function loadSettings(path: string): Promise<ClaudeSettings> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ClaudeSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function installClaudeHooks(): Promise<void> {
  const settingsPath = getClaudeSettingsPath();
  const backupPath = getClaudeBackupPath();
  await mkdir(dirname(settingsPath), { recursive: true });

  const originalContent = await readFile(settingsPath, "utf8").catch(() => null);
  if (originalContent !== null) {
    await writeFile(backupPath, originalContent, "utf8");
  }

  const settings = await loadSettings(settingsPath);
  const userPromptCommand = buildCliCommand("_user-prompt-submit");
  const stopCommand = buildCliCommand("_stop");

  removeClaudeHookByScriptName(settings, "UserPromptSubmit", "user-prompt-submit");
  removeClaudeHookByScriptName(settings, "Stop", "stop");
  removeClaudeHookBySubcommand(settings, "UserPromptSubmit", "_user-prompt-submit");
  removeClaudeHookBySubcommand(settings, "Stop", "_stop");
  mergeClaudeHook(settings, "UserPromptSubmit", userPromptCommand);
  mergeClaudeHook(settings, "Stop", stopCommand, true);

  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function createPostCommitScript(targetPath: string): Promise<void> {
  const command = buildCliCommand("_post-commit");
  const existing = await readFile(targetPath, "utf8").catch(() => "");
  const content = upsertPostCommitScript(existing, command);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
  await chmod(targetPath, 0o755);
}

async function installHuskyPostCommit(projectRoot: string): Promise<string> {
  const huskyPath = join(projectRoot, ".husky", "post-commit");
  const existing = await readFile(huskyPath, "utf8").catch(() => "");
  const command = buildCliCommand("_post-commit");
  const nextContent = upsertPostCommitScript(existing, command);
  await writeFile(huskyPath, nextContent, "utf8");
  await chmod(huskyPath, 0o755);
  return huskyPath;
}

async function detectLegacyHusky(projectRoot: string): Promise<boolean> {
  try {
    const packageJson = JSON.parse(
      await readFile(join(projectRoot, "package.json"), "utf8"),
    ) as { husky?: unknown };
    return Boolean(packageJson.husky);
  } catch {
    return false;
  }
}

function printApiKeyWarning(provider: string): void {
  const envName = PROVIDER_API_KEY_ENV[provider];
  if (envName && !process.env[envName]) {
    warn(`⚠ ${envName} が設定されていません。`);
  }
}

async function installGitHook(cwd: string): Promise<string> {
  const projectRoot = await getGitRoot(cwd);
  const huskyDir = join(projectRoot, ".husky");
  const hasHuskyDir = await stat(huskyDir)
    .then((value: { isDirectory: () => boolean }) => value.isDirectory())
    .catch(() => false);

  if (hasHuskyDir) {
    return installHuskyPostCommit(projectRoot);
  }

  if (await detectLegacyHusky(projectRoot)) {
    warn(
      "⚠ Husky v8 が検出されました。gle は Husky v9+ のみ自動対応します。",
    );
  }

  const existingHooksPath = await getCoreHooksPath();
  if (existingHooksPath) {
    const postCommitPath = join(existingHooksPath, "post-commit");
    await createPostCommitScript(postCommitPath);
    return postCommitPath;
  }

  const hooksDir = getDefaultHooksDir();
  await mkdir(hooksDir, { recursive: true });
  await setCoreHooksPath(hooksDir);
  const postCommitPath = join(hooksDir, "post-commit");
  await createPostCommitScript(postCommitPath);
  return postCommitPath;
}

export async function installCommand(cwd: string): Promise<number> {
  if (Number(process.versions.node.split(".")[0]) < 18) {
    throw new Error("Node.js >= 18 is required");
  }

  getGlobalCliPath();
  await ensureGitInstalled();
  await ensureClaudeCli();

  const config = await resolveConfig(cwd);
  printApiKeyWarning(config.provider);
  await ensureUserConfigFiles();
  await installClaudeHooks();

  print(`✓ Claude Code hooks を登録しました (${getClaudeSettingsPath()})`);
  print(`✓ ユーザー設定を確認しました (${getGlobalConfigPath()})`);
  print();
  print("gle のユーザーセットアップが完了しました。");
  print("次回 Claude Code セッションから自動でコンテキストが収集されます。");
  print("repo ごとの post-commit cleanup が必要な場合は、その repo で gle prepare を実行してください。");
  print();
  print("カスタムプロンプト: ~/.gle/prompt.md を作成するとデフォルトプロンプトを上書きできます。");
  print("言語設定: gle lang [auto|en|ja|zh|ko|es]");
  print();
  print("アンインストール: gle uninstall");

  return 0;
}

export async function prepareCommand(cwd: string): Promise<number> {
  getGlobalCliPath();
  await ensureGitInstalled();
  const projectRoot = await getGitRoot(cwd);
  const hookPathDescription = await installGitHook(cwd);
  const contextPath = await getContextFilePath(cwd);
  await ensureGleGitignoreEntry(projectRoot);
  await ensureContextFile(contextPath);

  print(`✓ git post-commit hook を設定しました (${hookPathDescription})`);
  print(`✓ コンテキスト保存先を初期化しました (${contextPath})`);
  return 0;
}
