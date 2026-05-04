import { afterEach, describe, expect, test, vi } from "vitest";
import type { ResolvedConfig } from "../src/types.js";
import { createProvider } from "../src/providers/index.js";

const baseConfig: Omit<ResolvedConfig, "provider" | "model"> = {
  apiBaseUrl: undefined,
  prompt: "write a commit message",
  maxDiffChars: 8000,
  maxOutputTokens: 2048,
  language: "auto",
  cmd: undefined,
  sources: {
    provider: "env",
    model: "env",
    apiBaseUrl: "unset",
    prompt: "global",
    maxDiffChars: "default",
    maxOutputTokens: "default",
    language: "default",
  },
};

const input = {
  contextMd: "",
  diffStat: "file.txt | 1 +",
  diffBody: "+alpha",
  diffTruncated: false,
};

describe("providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GLE_API_KEY;
    delete process.env.GLE_API_BASE_URL;
    delete process.env.GLE_CLAUDE_API_KEY;
    delete process.env.GLE_CLAUDE_BASE_URL;
  });

  test("api provider calls an OpenAI-compatible endpoint without forcing an API key", async () => {
    process.env.GLE_API_BASE_URL = "http://mocked.invalid/v1";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "feat: api provider" } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createProvider({
      ...baseConfig,
      provider: "api",
      model: "api-model",
    });
    await expect(provider.generateMessage(input)).resolves.toBe("feat: api provider");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://mocked.invalid/v1/chat/completions",
      expect.objectContaining({
        headers: expect.not.objectContaining({ authorization: expect.any(String) }),
      }),
    );
  });

  test("claude provider calls the Anthropic Messages API", async () => {
    process.env.GLE_CLAUDE_API_KEY = "dummy";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "feat: claude provider" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createProvider({
      ...baseConfig,
      provider: "claude",
      model: "claude-test",
    });
    await expect(provider.generateMessage(input)).resolves.toBe(
      "feat: claude provider",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "anthropic-version": "2023-06-01",
          "x-api-key": "dummy",
        }),
      }),
    );
  });

  test("local shortcut uses the same API provider shape without an API key", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "feat: local provider" } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createProvider({
      ...baseConfig,
      provider: "api",
      model: "qwen2.5-coder-12k:latest",
      apiBaseUrl: "http://localhost:11434/v1",
    });
    await expect(provider.generateMessage(input)).resolves.toBe(
      "feat: local provider",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        headers: expect.not.objectContaining({ authorization: expect.any(String) }),
      }),
    );
  });
});
