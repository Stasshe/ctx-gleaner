import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("config resolution", () => {
  const originalHome = process.env.HOME;
  const originalGleHome = process.env.GLE_HOME;
  const originalProvider = process.env.GLE_PROVIDER;
  const originalApiModel = process.env.GLE_API_MODEL;
  const originalClaudeModel = process.env.GLE_CLAUDE_MODEL;

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalGleHome === undefined) {
      delete process.env.GLE_HOME;
    } else {
      process.env.GLE_HOME = originalGleHome;
    }
    if (originalProvider === undefined) {
      delete process.env.GLE_PROVIDER;
    } else {
      process.env.GLE_PROVIDER = originalProvider;
    }
    if (originalApiModel === undefined) {
      delete process.env.GLE_API_MODEL;
    } else {
      process.env.GLE_API_MODEL = originalApiModel;
    }
    if (originalClaudeModel === undefined) {
      delete process.env.GLE_CLAUDE_MODEL;
    } else {
      process.env.GLE_CLAUDE_MODEL = originalClaudeModel;
    }
  });

  test("loads config and prompt from ~/.gle", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-config-home-"));
    const repoDir = await mkdtemp(join(tmpdir(), "gle-config-repo-"));

    try {
      process.env.GLE_HOME = fakeHome;
      delete process.env.GLE_PROVIDER;
      delete process.env.GLE_API_MODEL;
      delete process.env.GLE_CLAUDE_MODEL;
      await mkdir(join(fakeHome, ".gle"), { recursive: true });
      await writeFile(
        join(fakeHome, ".gle", "glerc.json"),
        JSON.stringify({
          provider: "openai",
          model: "gpt-test",
          maxDiffChars: 1234,
          language: "ja",
        }),
        "utf8",
      );
      await writeFile(
        join(fakeHome, ".gle", "prompt.md"),
        "custom prompt from markdown\n",
        "utf8",
      );

      const config = await resolveConfig(repoDir);
      expect(config.provider).toBe("openai");
      expect(config.model).toBe("gpt-test");
      expect(config.maxDiffChars).toBe(1234);
      expect(config.language).toBe("ja");
      expect(config.prompt).toBe("custom prompt from markdown\n");
      expect(config.sources.provider).toBe("global");
      expect(config.sources.prompt).toBe("global");
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  test("supports API and Claude providers with model environment overrides", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "gle-config-provider-"));
    try {
      process.env.GLE_PROVIDER = "claude";
      process.env.GLE_CLAUDE_MODEL = "claude-test";

      const claudeConfig = await resolveConfig(repoDir);
      expect(claudeConfig.provider).toBe("claude");
      expect(claudeConfig.model).toBe("claude-test");
      expect(claudeConfig.sources.model).toBe("env");

      process.env.GLE_PROVIDER = "api";
      process.env.GLE_API_MODEL = "api-test";

      const apiConfig = await resolveConfig(repoDir);
      expect(apiConfig.provider).toBe("api");
      expect(apiConfig.model).toBe("api-test");
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
