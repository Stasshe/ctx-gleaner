import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput } from "../types.js";
import { PROVIDER_TIMEOUT_MS } from "../constants.js";
import { BaseProvider } from "./base.js";

export class GeminiProvider extends BaseProvider {
  validate(): boolean {
    return Boolean(process.env.GLE_GEMINI_API_KEY && this.config.model);
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const key = process.env.GLE_GEMINI_API_KEY;
    if (!key || !this.config.model) {
      throw new Error("GLE_GEMINI_API_KEY or model is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: await this.getPrompt(params) }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 512,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const message = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!message) {
        throw new Error("Gemini returned an empty response");
      }
      return stripCodeFences(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
