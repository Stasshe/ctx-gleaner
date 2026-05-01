import type { ResolvedConfig } from "../types.js";
import { BaseProvider } from "./base.js";
import { GeminiProvider } from "./gemini.js";
import { LiteLlmProvider } from "./litellm.js";
import { OpenAiProvider } from "./openai.js";

export function createProvider(config: ResolvedConfig): BaseProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAiProvider(config);
    case "litellm":
      return new LiteLlmProvider(config);
    case "gemini":
    default:
      return new GeminiProvider(config);
  }
}
