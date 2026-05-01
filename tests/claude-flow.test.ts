import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { commitCommand } from "../src/commands/commit.js";
import { readContextFile } from "../src/context.js";
import { getContextFilePath, runGit } from "../src/git.js";
import { handleStopPayload } from "../src/hooks/stop.js";
import { handleUserPromptSubmitPayload } from "../src/hooks/user-prompt-submit.js";

const execFileAsync = promisify(execFile);

describe("Claude hook to commit flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GLE_PROVIDER;
    delete process.env.GLE_LITELLM_API_KEY;
    delete process.env.GLE_LITELLM_MODEL;
    delete process.env.GLE_LITELLM_BASE_URL;
  });

  test("collects prompt and stop context, generates commit, then clears context", async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "gle-claude-flow-"));
    const transcriptPath = join(repoDir, "transcript.jsonl");

    try {
      await runGit(["init"], repoDir);
      await runGit(["config", "user.name", "gle test"], repoDir);
      await runGit(["config", "user.email", "gle@example.com"], repoDir);

      await handleUserPromptSubmitPayload({
        cwd: repoDir,
        prompt: "Add a file for Claude hook flow verification",
      });

      await writeFile(
        transcriptPath,
        JSON.stringify({
          role: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Created file.txt and staged it for commit flow verification.",
              },
            ],
          },
        }),
        "utf8",
      );

      await handleStopPayload({
        cwd: repoDir,
        transcript_path: transcriptPath,
        stop_hook_active: false,
      });

      const contextPath = await getContextFilePath(repoDir);
      const collected = await readContextFile(contextPath);
      expect(collected).toContain("### prompt");
      expect(collected).toContain("### stop");

      await writeFile(join(repoDir, "file.txt"), "hook flow\n", "utf8");
      await runGit(["add", "file.txt"], repoDir);

      process.env.GLE_PROVIDER = "litellm";
      process.env.GLE_LITELLM_API_KEY = "dummy";
      process.env.GLE_LITELLM_MODEL = "mock-model";
      process.env.GLE_LITELLM_BASE_URL = "http://mocked.invalid/v1";

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content:
                    "test: verify Claude hook context flow\n\n- collect prompt and stop context\n- clear context after commit",
                },
              },
            ],
          }),
        })),
      );

      expect(await commitCommand(repoDir, [])).toBe(0);

      const { stdout } = await execFileAsync("git", ["log", "--format=%B", "-1"], {
        cwd: repoDir,
        encoding: "utf8",
      });
      expect(stdout).toContain("test: verify Claude hook context flow");
      expect((await readContextFile(contextPath)).trim()).toBe("<!-- gle context -->");
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
