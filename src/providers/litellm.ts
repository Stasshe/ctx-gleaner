import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput } from "../types.js";
import { BaseProvider } from "./base.js";

export class LiteLlmProvider extends BaseProvider {
  validate(): boolean {
    return Boolean(process.env.GLE_LITELLM_API_KEY && this.config.model);
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const key = process.env.GLE_LITELLM_API_KEY;
    const baseUrl = process.env.GLE_LITELLM_BASE_URL ?? "https://api.litellm.ai/v1";
    if (!key || !this.config.model) {
      throw new Error("GLE_LITELLM_API_KEY or model is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: this.getPrompt(params) }],
          temperature: 0.2,
          max_tokens: 512,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LiteLLM API error: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const message = payload.choices?.[0]?.message?.content?.trim();
      if (!message) {
        throw new Error("LiteLLM returned an empty response");
      }
      return stripCodeFences(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
