import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { SUPPORTED_LANGUAGES } from "../constants.js";
import { getGlobalConfigPath } from "../paths.js";
import { print, printError } from "../output.js";
import type { GleConfigFile } from "../types.js";

async function readConfigFile(): Promise<GleConfigFile> {
  try {
    const raw = await readFile(getGlobalConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as GleConfigFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeConfigFile(config: GleConfigFile): Promise<void> {
  const path = getGlobalConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function langCommand(args: string[]): Promise<number> {
  const [code] = args;

  if (!code) {
    const config = await readConfigFile();
    const current = config.language ?? "auto";
    print(`current language: ${current}`);
    print(`supported: ${SUPPORTED_LANGUAGES.join(", ")}`);
    return 0;
  }

  if (!SUPPORTED_LANGUAGES.includes(code as (typeof SUPPORTED_LANGUAGES)[number])) {
    printError(`gle: unsupported language "${code}". Supported: ${SUPPORTED_LANGUAGES.join(", ")}`);
    return 1;
  }

  const config = await readConfigFile();
  config.language = code;
  await writeConfigFile(config);
  print(`gle: language set to "${code}"`);
  return 0;
}
