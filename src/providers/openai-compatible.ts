import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput, ResolvedConfig } from "../types.js";
import { PROVIDER_TIMEOUT_MS } from "../constants.js";
import { BaseProvider } from "./base.js";

interface OpenAiCompatibleProviderOptions {
  displayName: string;
  apiKeyEnv?: string;
  baseUrlEnv: string;
  defaultBaseUrl?: string;
  requireApiKey?: boolean;
  useConfigBaseUrl?: boolean;
}

export class OpenAiCompatibleProvider extends BaseProvider {
  constructor(
    config: ResolvedConfig,
    private readonly options: OpenAiCompatibleProviderOptions,
  ) {
    super(config);
  }

  validate(): boolean {
    const key = this.options.apiKeyEnv ? process.env[this.options.apiKeyEnv] : undefined;
    return Boolean(
      (!this.options.requireApiKey || key) &&
        (this.getBaseUrl() || this.options.defaultBaseUrl) &&
        this.config.model,
    );
  }

  private getBaseUrl(): string | undefined {
    if (this.options.useConfigBaseUrl && this.config.apiBaseUrl) {
      return this.config.apiBaseUrl;
    }
    return process.env[this.options.baseUrlEnv];
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const key = this.options.apiKeyEnv ? process.env[this.options.apiKeyEnv] : undefined;
    const baseUrl = this.getBaseUrl() ?? this.options.defaultBaseUrl;
    if ((!key && this.options.requireApiKey) || !baseUrl || !this.config.model) {
      throw new Error(
        `${this.options.apiKeyEnv ?? "API key"}, ${this.options.baseUrlEnv}, or model is not configured`,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          ...(key ? { authorization: `Bearer ${key}` } : {}),
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
        throw new Error(
          `${this.options.displayName} API error: ${response.status} ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const message = payload.choices?.[0]?.message?.content?.trim();
      if (!message) {
        throw new Error(`${this.options.displayName} returned an empty response`);
      }
      return stripCodeFences(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
