import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const currentDir = dirname(fileURLToPath(import.meta.url));

export function getPackageRoot(): string {
  return resolve(currentDir, "..");
}

export function getDistHookPath(name: string): string {
  return join(getPackageRoot(), "dist", "hooks", `${name}.js`);
}

export function getClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function getClaudeBackupPath(): string {
  return join(homedir(), ".claude", "settings.json.gle-backup");
}

export function getDefaultHooksDir(): string {
  return join(homedir(), ".gle", "hooks");
}
