import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
} from "./constants.js";
import type { GleConfigFile, ProviderName, ResolvedConfig } from "./types.js";
import { getGitRoot } from "./git.js";

async function readConfigFile(cwd: string): Promise<GleConfigFile> {
  try {
    const root = await getGitRoot(cwd);
    const raw = await readFile(join(root, ".glerc.json"), "utf8");
    const parsed = JSON.parse(raw) as GleConfigFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveProvider(
  envProvider: string | undefined,
  fileProvider: string | undefined,
): { value: ProviderName; source: ResolvedConfig["sources"]["provider"] } {
  const candidate = (envProvider ?? fileProvider ?? DEFAULT_PROVIDER).toLowerCase();
  if (candidate === "openai" || candidate === "litellm" || candidate === "gemini") {
    if (envProvider) {
      return { value: candidate, source: "env" };
    }
    if (fileProvider) {
      return { value: candidate, source: "file" };
    }
  }
  return { value: DEFAULT_PROVIDER, source: "default" };
}

export async function resolveConfig(cwd: string): Promise<ResolvedConfig> {
  const fileConfig = await readConfigFile(cwd);
  const provider = resolveProvider(process.env.GLE_PROVIDER, fileConfig.provider);

  const envModel =
    provider.value === "litellm" ? process.env.GLE_LITELLM_MODEL : undefined;
  const fileModel = fileConfig.model;

  let model: string | undefined;
  let modelSource: ResolvedConfig["sources"]["model"] = "unset";

  if (envModel) {
    model = envModel;
    modelSource = "env";
  } else if (fileModel) {
    model = fileModel;
    modelSource = "file";
  } else if (provider.value in DEFAULT_MODELS) {
    model = DEFAULT_MODELS[provider.value as keyof typeof DEFAULT_MODELS];
    modelSource = "default";
  }

  return {
    provider: provider.value,
    model,
    prompt: fileConfig.prompt,
    maxDiffChars:
      typeof fileConfig.maxDiffChars === "number" && fileConfig.maxDiffChars > 0
        ? fileConfig.maxDiffChars
        : DEFAULT_MAX_DIFF_CHARS,
    language:
      typeof fileConfig.language === "string" && fileConfig.language.trim()
        ? fileConfig.language.trim()
        : DEFAULT_LANGUAGE,
    sources: {
      provider: provider.source,
      model: modelSource,
      prompt: fileConfig.prompt ? "file" : "default",
      maxDiffChars:
        typeof fileConfig.maxDiffChars === "number" && fileConfig.maxDiffChars > 0
          ? "file"
          : "default",
      language:
        typeof fileConfig.language === "string" && fileConfig.language.trim()
          ? "file"
          : "default",
    },
  };
}
