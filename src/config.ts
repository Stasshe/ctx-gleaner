import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MODELS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_PROVIDER,
  PROVIDER_MODEL_ENV,
  SUPPORTED_PROVIDERS,
} from "./constants.js";
import type { ProviderName, ResolvedConfig } from "./types.js";
import { getGlobalPromptPath } from "./paths.js";
import { readGlobalConfigFile } from "./config-file.js";

async function readGlobalPromptFile(): Promise<string | undefined> {
  try {
    const prompt = await readFile(getGlobalPromptPath(), "utf8");
    return prompt.trim() ? prompt : undefined;
  } catch {
    return undefined;
  }
}

function resolveProvider(
  envProvider: string | undefined,
  globalProvider: string | undefined,
): { value: ProviderName; source: ResolvedConfig["sources"]["provider"] } {
  const candidate = (envProvider ?? globalProvider ?? DEFAULT_PROVIDER).toLowerCase();
  if (SUPPORTED_PROVIDERS.includes(candidate as ProviderName)) {
    if (envProvider) {
      return { value: candidate as ProviderName, source: "env" };
    }
    if (globalProvider) {
      return { value: candidate as ProviderName, source: "global" };
    }
  }
  return { value: DEFAULT_PROVIDER, source: "default" };
}

export async function resolveConfig(cwd: string): Promise<ResolvedConfig> {
  void cwd;
  const globalConfig = await readGlobalConfigFile();
  const globalPrompt = await readGlobalPromptFile();
  const provider = resolveProvider(process.env.GLE_PROVIDER, globalConfig.provider);

  const providerModelEnv = PROVIDER_MODEL_ENV[provider.value];
  const envModel = providerModelEnv ? process.env[providerModelEnv] : undefined;
  const globalModel = globalConfig.model;
  const envApiBaseUrl = process.env.GLE_API_BASE_URL;
  const globalApiBaseUrl = globalConfig.apiBaseUrl;

  let model: string | undefined;
  let modelSource: ResolvedConfig["sources"]["model"] = "unset";

  if (envModel) {
    model = envModel;
    modelSource = "env";
  } else if (globalModel) {
    model = globalModel;
    modelSource = "global";
  } else if (provider.value in DEFAULT_MODELS) {
    model = DEFAULT_MODELS[provider.value as keyof typeof DEFAULT_MODELS];
    modelSource = "default";
  }

  return {
    provider: provider.value,
    model,
    prompt: globalConfig.prompt?.trim() ? globalConfig.prompt : globalPrompt,
    apiBaseUrl: envApiBaseUrl ?? globalApiBaseUrl,
    maxDiffChars:
      typeof globalConfig.maxDiffChars === "number" && globalConfig.maxDiffChars > 0
        ? globalConfig.maxDiffChars
        : DEFAULT_MAX_DIFF_CHARS,
    maxOutputTokens:
      typeof globalConfig.maxOutputTokens === "number" && globalConfig.maxOutputTokens > 0
        ? globalConfig.maxOutputTokens
        : DEFAULT_MAX_OUTPUT_TOKENS,
    language:
      typeof globalConfig.language === "string" && globalConfig.language.trim()
        ? globalConfig.language.trim()
        : DEFAULT_LANGUAGE,
    cmd: typeof globalConfig.cmd === "string" && globalConfig.cmd.trim()
      ? globalConfig.cmd.trim()
      : undefined,
    sources: {
      provider: provider.source,
      model: modelSource,
      prompt: globalConfig.prompt?.trim() || globalPrompt ? "global" : "default",
      apiBaseUrl: envApiBaseUrl ? "env" : globalApiBaseUrl ? "global" : "unset",
      maxDiffChars:
        typeof globalConfig.maxDiffChars === "number" && globalConfig.maxDiffChars > 0
          ? "global"
          : "default",
      maxOutputTokens:
        typeof globalConfig.maxOutputTokens === "number" && globalConfig.maxOutputTokens > 0
          ? "global"
          : "default",
      language:
        typeof globalConfig.language === "string" && globalConfig.language.trim()
          ? "global"
          : "default",
    },
  };
}
