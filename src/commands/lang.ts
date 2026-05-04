import { SUPPORTED_LANGUAGES } from "../constants.js";
import { print, printError } from "../output.js";
import { readGlobalConfigFile, writeGlobalConfigFile } from "../config-file.js";

export async function langCommand(args: string[]): Promise<number> {
  const [code] = args;

  if (!code) {
    const config = await readGlobalConfigFile();
    const current = config.language ?? "auto";
    print(`current language: ${current}`);
    print(`supported: ${SUPPORTED_LANGUAGES.join(", ")}`);
    return 0;
  }

  if (!SUPPORTED_LANGUAGES.includes(code as (typeof SUPPORTED_LANGUAGES)[number])) {
    printError(`gle: unsupported language "${code}". Supported: ${SUPPORTED_LANGUAGES.join(", ")}`);
    return 1;
  }

  const config = await readGlobalConfigFile();
  config.language = code;
  await writeGlobalConfigFile(config);
  print(`gle: language set to "${code}"`);
  return 0;
}
