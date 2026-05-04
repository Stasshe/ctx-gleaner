import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput } from "../types.js";
import { PROVIDER_TIMEOUT_MS } from "../constants.js";
import { BaseProvider } from "./base.js";

export class ClaudeProvider extends BaseProvider {
  validate(): boolean {
    return Boolean(process.env.GLE_CLAUDE_API_KEY && this.config.model);
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const key = process.env.GLE_CLAUDE_API_KEY;
    const baseUrl = process.env.GLE_CLAUDE_BASE_URL ?? "https://api.anthropic.com";
    if (!key || !this.config.model) {
      throw new Error("GLE_CLAUDE_API_KEY or model is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: await this.getPrompt(params) }],
          temperature: 0.2,
          max_tokens: this.config.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const message = payload.content
        ?.filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("")
        .trim();
      if (!message) {
        throw new Error("Claude returned an empty response");
      }
      return stripCodeFences(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
