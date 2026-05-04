import { DEFAULT_MODELS, SUPPORTED_PROVIDERS } from "../constants.js";
import { readGlobalConfigFile, writeGlobalConfigFile } from "../config-file.js";
import { getGlobalConfigPath } from "../paths.js";
import { print, printError } from "../output.js";
import type { GleConfigFile, ProviderName } from "../types.js";

const LOCAL_API_BASE_URL = "http://localhost:11434/v1";

function isProvider(value: string): value is ProviderName {
  return SUPPORTED_PROVIDERS.includes(value as ProviderName);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function positionalArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--base-url") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      continue;
    }
    result.push(arg);
  }
  return result;
}

function printUsage(config: GleConfigFile): void {
  print(`current provider: ${config.provider ?? "gemini"}`);
  print(`current model:    ${config.model ?? "(default)"}`);
  if (config.apiBaseUrl) {
    print(`api base URL:     ${config.apiBaseUrl}`);
  }
  print("");
  print("Usage:");
  print("  gle switch api <model> --base-url <url>");
  print("  gle switch local <model> [--base-url <url>]");
  print("  gle switch openai [model]");
  print("  gle switch gemini [model]");
  print("  gle switch claude [model]");
  print("  gle switch cmd <command>");
}

export async function switchCommand(args: string[]): Promise<number> {
  const config = await readGlobalConfigFile();
  const [rawTarget, ...rest] = positionalArgs(args);

  if (!rawTarget) {
    printUsage(config);
    return 0;
  }

  const target = rawTarget.toLowerCase();
  const baseUrl = readFlag(args, "--base-url");
  let provider: ProviderName;
  let model = rest[0];
  let apiBaseUrl: string | undefined;

  if (target === "local") {
    provider = "api";
    apiBaseUrl = baseUrl ?? LOCAL_API_BASE_URL;
  } else if (target === "api") {
    provider = "api";
    apiBaseUrl = baseUrl;
  } else if (isProvider(target)) {
    provider = target;
  } else {
    printError(
      `gle: unsupported provider "${rawTarget}". Supported: api, local, openai, gemini, claude, cmd`,
    );
    return 1;
  }

  if (provider === "cmd") {
    const command = rest.join(" ").trim();
    if (!command) {
      printError("gle: cmd requires a command. Example: gle switch cmd 'ollama run llama3.2'");
      return 1;
    }
    const nextConfig: GleConfigFile = {
      ...config,
      provider,
      cmd: command,
    };
    delete nextConfig.model;
    delete nextConfig.apiBaseUrl;
    await writeGlobalConfigFile(nextConfig);
    print('gle: provider set to "cmd"');
    print(`gle: cmd set to "${command}"`);
    print(`gle: wrote ${getGlobalConfigPath()}`);
    return 0;
  }

  if (!model && provider in DEFAULT_MODELS) {
    model = DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS];
  }

  if (provider === "api" && !model) {
    printError(
      "gle: api requires a model. Example: gle switch api llama3.2 --base-url <url>",
    );
    return 1;
  }

  if (provider === "api" && !apiBaseUrl && !config.apiBaseUrl) {
    printError(
      "gle: api requires --base-url unless apiBaseUrl is already configured.",
    );
    return 1;
  }
  if (!model) {
    printError(`gle: ${provider} requires a model.`);
    return 1;
  }

  const nextConfig: GleConfigFile = {
    ...config,
    provider,
    model,
  };
  delete nextConfig.cmd;

  if (provider === "api") {
    const nextApiBaseUrl = apiBaseUrl ?? config.apiBaseUrl;
    if (nextApiBaseUrl) {
      nextConfig.apiBaseUrl = nextApiBaseUrl;
    }
  } else {
    delete nextConfig.apiBaseUrl;
  }

  await writeGlobalConfigFile(nextConfig);
  print(`gle: provider set to "${provider}"`);
  print(`gle: model set to "${model}"`);
  if (provider === "api") {
    print(`gle: api base URL set to "${nextConfig.apiBaseUrl}"`);
  }
  print(`gle: wrote ${getGlobalConfigPath()}`);
  return 0;
}
