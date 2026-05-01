import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CONTEXT_HEADER } from "./constants.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureContextFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
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
