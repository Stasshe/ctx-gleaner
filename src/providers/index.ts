import type { ResolvedConfig } from "../types.js";
import { ApiProvider } from "./api.js";
import { BaseProvider } from "./base.js";
import { ClaudeProvider } from "./claude.js";
import { CmdProvider } from "./cmd.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAiProvider } from "./openai.js";

export function createProvider(config: ResolvedConfig): BaseProvider {
  if (config.mode === "cmd") {
    return new CmdProvider(config);
  }
  switch (config.provider) {
    case "api":
      return new ApiProvider(config);
    case "openai":
      return new OpenAiProvider(config);
    case "claude":
      return new ClaudeProvider(config);
    case "gemini":
    default:
      return new GeminiProvider(config);
  }
}
