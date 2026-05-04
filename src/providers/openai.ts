import type { ResolvedConfig } from "../types.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

export class OpenAiProvider extends OpenAiCompatibleProvider {
  constructor(config: ResolvedConfig) {
    super(config, {
      displayName: "OpenAI",
      apiKeyEnv: "GLE_OPENAI_API_KEY",
      baseUrlEnv: "GLE_OPENAI_BASE_URL",
      defaultBaseUrl: "https://api.openai.com/v1",
      requireApiKey: true,
    });
  }
}
