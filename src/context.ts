import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONTEXT_HEADER } from "./constants.js";

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetStr = `${sign}${pad(Math.floor(absMinutes / 60))}:${pad(absMinutes % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetStr}`
  );
}

async function ensureGitignoreEntry(gitRoot: string): Promise<void> {
  const gitignorePath = join(gitRoot, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf8");
  } catch {
    // file doesn't exist yet
  }
  const lines = content.split("\n");
  if (lines.some((line) => line.trim() === ".gle/")) {
    return;
  }
  const entry = content === "" || content.endsWith("\n") ? ".gle/\n" : "\n.gle/\n";
  await appendFile(gitignorePath, entry, "utf8");
}

export async function ensureContextFile(path: string): Promise<void> {
  const gleDir = dirname(path);
  const gitRoot = dirname(gleDir);
  await mkdir(gleDir, { recursive: true });
  await ensureGitignoreEntry(gitRoot);
  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, CONTEXT_HEADER, "utf8");
  }
}

export async function readContextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

export async function resetContextFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, CONTEXT_HEADER, "utf8");
}

export function isContextEffectivelyEmpty(content: string): boolean {
  const normalized = content.replace(CONTEXT_HEADER, "").trim();
  return normalized.length === 0;
}

export async function appendPromptContext(
  path: string,
  prompt: string,
  timestamp = nowIso(),
): Promise<void> {
  await ensureContextFile(path);
  const block = `\n## ${timestamp}\n\n### prompt\n${prompt.trim()}\n`;
  await appendFile(path, block, "utf8");
}

export async function appendStopContext(
  path: string,
  summary: string,
): Promise<void> {
  await ensureContextFile(path);
  const block = `\n### stop\n${summary.trim()}\n\n---\n`;
  await appendFile(path, block, "utf8");
}

export function countContextEntries(content: string): number {
  return content
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .length;
}
