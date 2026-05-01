import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
} from "./constants.js";
import type { GleConfigFile, ProviderName, ResolvedConfig } from "./types.js";
import { getGlobalConfigPath, getGlobalPromptPath } from "./paths.js";

async function readGlobalConfigFile(): Promise<GleConfigFile> {
  try {
    const raw = await readFile(getGlobalConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as GleConfigFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

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
  if (candidate === "openai" || candidate === "litellm" || candidate === "gemini") {
    if (envProvider) {
      return { value: candidate, source: "env" };
    }
    if (globalProvider) {
      return { value: candidate, source: "global" };
    }
  }
  return { value: DEFAULT_PROVIDER, source: "default" };
}

export async function resolveConfig(cwd: string): Promise<ResolvedConfig> {
  void cwd;
  const globalConfig = await readGlobalConfigFile();
  const globalPrompt = await readGlobalPromptFile();
  const provider = resolveProvider(process.env.GLE_PROVIDER, globalConfig.provider);

  const envModel =
    provider.value === "litellm" ? process.env.GLE_LITELLM_MODEL : undefined;
  const globalModel = globalConfig.model;

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
    maxDiffChars:
      typeof globalConfig.maxDiffChars === "number" && globalConfig.maxDiffChars > 0
        ? globalConfig.maxDiffChars
        : DEFAULT_MAX_DIFF_CHARS,
    language:
      typeof globalConfig.language === "string" && globalConfig.language.trim()
        ? globalConfig.language.trim()
        : DEFAULT_LANGUAGE,
    sources: {
      provider: provider.source,
      model: modelSource,
      prompt: globalConfig.prompt?.trim() || globalPrompt ? "global" : "default",
      maxDiffChars:
        typeof globalConfig.maxDiffChars === "number" && globalConfig.maxDiffChars > 0
          ? "global"
          : "default",
      language:
        typeof globalConfig.language === "string" && globalConfig.language.trim()
          ? "global"
          : "default",
    },
  };
}
