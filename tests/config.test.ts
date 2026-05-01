import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("config resolution", () => {
  const originalHome = process.env.HOME;
  const originalGleHome = process.env.GLE_HOME;
  const originalProvider = process.env.GLE_PROVIDER;
  const originalLiteLlmModel = process.env.GLE_LITELLM_MODEL;

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
    if (originalLiteLlmModel === undefined) {
      delete process.env.GLE_LITELLM_MODEL;
    } else {
      process.env.GLE_LITELLM_MODEL = originalLiteLlmModel;
    }
  });

  test("loads config and prompt from ~/.gle", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-config-home-"));
    const repoDir = await mkdtemp(join(tmpdir(), "gle-config-repo-"));

    try {
      process.env.GLE_HOME = fakeHome;
      delete process.env.GLE_PROVIDER;
      delete process.env.GLE_LITELLM_MODEL;
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
});
