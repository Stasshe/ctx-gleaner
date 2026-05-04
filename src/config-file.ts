import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getGlobalConfigPath } from "./paths.js";
import type { GleConfigFile } from "./types.js";

export function parseJsonc(text: string): unknown {
  let result = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\") {
        result += text[i] + (text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (text[i] === '"') inString = false;
      result += text[i++];
    } else if (text[i] === '"') {
      inString = true;
      result += text[i++];
    } else if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else {
      result += text[i++];
    }
  }
  return JSON.parse(result);
}

export async function readGlobalConfigFile(): Promise<GleConfigFile> {
  try {
    const raw = await readFile(getGlobalConfigPath(), "utf8");
    const parsed = parseJsonc(raw) as GleConfigFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeGlobalConfigFile(config: GleConfigFile): Promise<void> {
  const path = getGlobalConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
