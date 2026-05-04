import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { generateCommand } from "../src/commands/generate.js";
import { getGeneratedMsgPath, runGit } from "../src/git.js";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gle-generate-test-"));
  await runGit(["init"], dir);
  await writeFile(join(dir, "file.txt"), "alpha\n", "utf8");
  await runGit(["add", "file.txt"], dir);
  return dir;
}

describe("generate command", () => {
  const originalEditor = process.env.GIT_EDITOR;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEditor === undefined) {
      delete process.env.GIT_EDITOR;
    } else {
      process.env.GIT_EDITOR = originalEditor;
    }
    delete process.env.GLE_PROVIDER;
    delete process.env.GLE_API_KEY;
    delete process.env.GLE_API_MODEL;
    delete process.env.GLE_API_BASE_URL;
  });

  test("creates the project .gle directory before writing the generated message", async () => {
    const repoDir = await initRepo();
    try {
      process.env.GIT_EDITOR = "true";
      process.env.GLE_PROVIDER = "api";
      process.env.GLE_API_KEY = "dummy";
      process.env.GLE_API_MODEL = "mock-model";
      process.env.GLE_API_BASE_URL = "http://mocked.invalid/v1";

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "feat: add generated message",
                },
              },
            ],
          }),
        })),
      );

      const exitCode = await generateCommand(repoDir);
      expect(exitCode).toBe(0);

      const outputPath = await getGeneratedMsgPath(repoDir);
      await expect(readFile(outputPath, "utf8")).resolves.toBe(
        "feat: add generated message\n",
      );
    } finally {
      await rm(repoDir, { force: true, recursive: true });
    }
  });
});
