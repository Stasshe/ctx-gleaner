import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { switchCommand } from "../src/commands/switch.js";

describe("switch command", () => {
  const originalGleHome = process.env.GLE_HOME;

  afterEach(() => {
    if (originalGleHome === undefined) {
      delete process.env.GLE_HOME;
    } else {
      process.env.GLE_HOME = originalGleHome;
    }
    vi.restoreAllMocks();
  });

  test("switches to a local OpenAI-compatible API with a model", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-switch-home-"));
    try {
      process.env.GLE_HOME = fakeHome;
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      await expect(switchCommand(["local", "llama3.2"])).resolves.toBe(0);

      const raw = await readFile(join(fakeHome, ".gle", "glerc.jsonc"), "utf8");
      const config = JSON.parse(raw) as {
        provider?: string;
        model?: string;
        apiBaseUrl?: string;
      };
      expect(config.provider).toBe("api");
      expect(config.model).toBe("llama3.2");
      expect(config.apiBaseUrl).toBe("http://localhost:11434/v1");
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  test("switches to a first-party provider and default model", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-switch-home-"));
    try {
      process.env.GLE_HOME = fakeHome;
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      await expect(switchCommand(["claude"])).resolves.toBe(0);

      const raw = await readFile(join(fakeHome, ".gle", "glerc.jsonc"), "utf8");
      const config = JSON.parse(raw) as {
        provider?: string;
        model?: string;
        apiBaseUrl?: string;
      };
      expect(config.provider).toBe("claude");
      expect(config.model).toBe("claude-sonnet-4-5");
      expect(config.apiBaseUrl).toBeUndefined();
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  test("switches to a command provider", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-switch-home-"));
    try {
      process.env.GLE_HOME = fakeHome;
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      await expect(switchCommand(["cmd", "qc", "--stdin"])).resolves.toBe(0);

      const raw = await readFile(join(fakeHome, ".gle", "glerc.jsonc"), "utf8");
      const config = JSON.parse(raw) as {
        provider?: string;
        cmd?: string;
      };
      expect(config.provider).toBe("cmd");
      expect(config.cmd).toBe("qc --stdin");
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});
