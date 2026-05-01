import { GLE_MANAGED_COMMENT } from "../constants.js";

export interface HookCommandSet {
  userPromptCommand: string;
  stopCommand: string;
  postCommitCommand: string;
}

export interface ClaudeSettings {
  hooks?: Record<
    string,
    Array<{
      hooks?: Array<Record<string, unknown>>;
    }>
  >;
  [key: string]: unknown;
}

export function buildClaudeHookEntry(command: string, asyncFlag = false) {
  return {
    hooks: [
      {
        type: "command",
        command,
        ...(asyncFlag ? { async: true } : {}),
      },
    ],
  };
}

function isCommandHook(
  hook: Record<string, unknown>,
  command: string,
  asyncFlag = false,
): boolean {
  return (
    hook.type === "command" &&
    hook.command === command &&
    (asyncFlag ? hook.async === true : true)
  );
}

export function hasClaudeHook(
  settings: ClaudeSettings,
  hookName: "UserPromptSubmit" | "Stop",
  command: string,
  asyncFlag = false,
): boolean {
  const existing = settings.hooks?.[hookName] ?? [];
  return existing.some((group) =>
    (group.hooks ?? []).some((hook) => isCommandHook(hook, command, asyncFlag)),
  );
}

export function mergeClaudeHook(
  settings: ClaudeSettings,
  hookName: "UserPromptSubmit" | "Stop",
  command: string,
  asyncFlag = false,
): boolean {
  if (hasClaudeHook(settings, hookName, command, asyncFlag)) {
    return false;
  }

  settings.hooks ??= {};
  settings.hooks[hookName] = [
    ...(settings.hooks[hookName] ?? []),
    buildClaudeHookEntry(command, asyncFlag),
  ];
  return true;
}

export function removeClaudeHook(
  settings: ClaudeSettings,
  hookName: "UserPromptSubmit" | "Stop",
  command: string,
): boolean {
  const groups = settings.hooks?.[hookName];
  if (!groups) {
    return false;
  }

  let changed = false;
  const nextGroups = groups
    .map((group) => {
      const nextHooks = (group.hooks ?? []).filter((hook) => {
        const matched = hook.type === "command" && hook.command === command;
        changed ||= matched;
        return !matched;
      });
      return {
        ...group,
        hooks: nextHooks,
      };
    })
    .filter((group) => (group.hooks?.length ?? 0) > 0);

  settings.hooks![hookName] = nextGroups;
  return changed;
}

export function formatPostCommitManagedBlock(command: string): string {
  return `${GLE_MANAGED_COMMENT}\n${command}`;
}

export function upsertPostCommitScript(
  existingContent: string,
  command: string,
): string {
  const managedBlock = formatPostCommitManagedBlock(command);
  const normalized = existingContent.trimEnd();

  if (!normalized) {
    return `#!/usr/bin/env sh\n${managedBlock}\n`;
  }

  if (normalized.includes(managedBlock) || normalized.includes(command)) {
    return `${normalized}\n`;
  }

  return `${normalized}\n${managedBlock}\n`;
}

export function removeManagedPostCommitBlock(
  content: string,
  command: string,
): string {
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
