import { readFile } from "node:fs/promises";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MODE,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
} from "./constants.js";
import type { GleConfigFile, ModeName, ProviderName, ResolvedConfig } from "./types.js";
import { getGlobalConfigPath, getLegacyConfigPath, getGlobalPromptPath } from "./paths.js";

function parseJsonc(text: string): unknown {
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
    } else {
      if (text[i] === '"') {
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
  }
  return JSON.parse(result);
}

async function readGlobalConfigFile(): Promise<GleConfigFile> {
  for (const path of [getGlobalConfigPath(), getLegacyConfigPath()]) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseJsonc(raw) as GleConfigFile;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      // try next
    }
  }
  return {};
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

  const modeRaw = typeof globalConfig.mode === "string" ? globalConfig.mode.trim() : "";
  const mode: ModeName = modeRaw === "cmd" ? "cmd" : DEFAULT_MODE;

  return {
    mode,
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
    cmd: typeof globalConfig.cmd === "string" && globalConfig.cmd.trim()
      ? globalConfig.cmd.trim()
      : undefined,
    sources: {
      mode: modeRaw === "cmd" || modeRaw === "api" ? "global" : "default",
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
