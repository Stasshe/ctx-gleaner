import type { ResolvedConfig } from "../types.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

export class ApiProvider extends OpenAiCompatibleProvider {
  constructor(config: ResolvedConfig) {
    super(config, {
      displayName: "API",
      apiKeyEnv: "GLE_API_KEY",
      baseUrlEnv: "GLE_API_BASE_URL",
    });
  }
}
