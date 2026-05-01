import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput } from "../types.js";
import { PROVIDER_TIMEOUT_MS } from "../constants.js";
import { BaseProvider } from "./base.js";

export class OpenAiProvider extends BaseProvider {
  validate(): boolean {
    return Boolean(process.env.GLE_OPENAI_API_KEY && this.config.model);
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const key = process.env.GLE_OPENAI_API_KEY;
    if (!key || !this.config.model) {
      throw new Error("GLE_OPENAI_API_KEY or model is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const message = payload.choices?.[0]?.message?.content?.trim();
      if (!message) {
        throw new Error("OpenAI returned an empty response");
      }
      return stripCodeFences(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
