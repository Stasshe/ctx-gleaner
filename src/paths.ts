import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const currentDir = dirname(fileURLToPath(import.meta.url));

function getUserHomeDir(): string {
  return process.env.GLE_HOME ?? process.env.HOME ?? homedir();
}

export function getPackageRoot(): string {
  return resolve(currentDir, "..");
}

export function getDistHookPath(name: string): string {
  return join(getPackageRoot(), "dist", "hooks", `${name}.js`);
}

export function getClaudeSettingsPath(): string {
  return join(getUserHomeDir(), ".claude", "settings.json");
}

export function getClaudeBackupPath(): string {
  return join(getUserHomeDir(), ".claude", "settings.json.gle-backup");
}

export function getDefaultHooksDir(): string {
  return join(getUserHomeDir(), ".gle", "hooks");
}

export function getGleRootDir(): string {
  return join(getUserHomeDir(), ".gle");
}

export function getGlobalConfigPath(): string {
  return join(getGleRootDir(), "glerc.json");
}

export function getGlobalPromptPath(): string {
  return join(getGleRootDir(), "prompt.md");
}
