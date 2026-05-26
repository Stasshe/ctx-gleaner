import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { commitCommand } from "../src/commands/commit.js";
import { getContextFilePath, markRepositoryPrepared, runGit } from "../src/git.js";
import { readContextFile } from "../src/context.js";

const execFileAsync = promisify(execFile);

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gle-commit-test-"));
  await runGit(["init"], dir);
  await runGit(["config", "user.name", "gle test"], dir);
  await runGit(["config", "user.email", "gle@example.com"], dir);
  await runGit(["config", "core.hooksPath", "/dev/null"], dir);
  await writeFile(join(dir, "file.txt"), "alpha\n", "utf8");
  await runGit(["add", "file.txt"], dir);
  return dir;
}

describe("commit command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GLE_PROVIDER;
    delete process.env.GLE_API_KEY;
    delete process.env.GLE_API_MODEL;
    delete process.env.GLE_API_BASE_URL;
  });

  test("generates a commit message through the provider path", async () => {
    const repoDir = await initRepo();
    try {
      await markRepositoryPrepared(repoDir);
      const contextPath = await getContextFilePath(repoDir);
      await mkdir(dirname(contextPath), { recursive: true });
      await writeFile(
        contextPath,
        "<!-- gle context -->\n\n## 2026-05-01T00:00:00.000Z\n\n### prompt\ncommit test\n",
        "utf8",
      );

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
                  content:
                    "feat: add generated commit\n\n- use mocked provider\n- verify commit flow",
                },
              },
            ],
          }),
        })),
      );

      const exitCode = await commitCommand(repoDir, []);
      expect(exitCode).toBe(0);

      const { stdout } = await execFileAsync("git", ["log", "--format=%B", "-1"], {
        cwd: repoDir,
        encoding: "utf8",
      });
      expect(stdout).toContain("feat: add generated commit");
      expect(stdout).toContain("verify commit flow");

      const context = await readContextFile(contextPath);
      expect(context.trim()).toBe("<!-- gle context -->");
    } finally {
      await rm(repoDir, { force: true, recursive: true });
    }
  });

  test("does not create context files after gle commit in an unprepared repository", async () => {
    const repoDir = await initRepo();
    try {
      process.env.GLE_PROVIDER = "api";
      process.env.GLE_API_KEY = "dummy";
      process.env.GLE_API_MODEL = "mock-model";
      process.env.GLE_API_BASE_URL = "http://mocked.invalid/v1";

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "test: unprepared commit" } }],
          }),
        })),
      );

      expect(await commitCommand(repoDir, [])).toBe(0);
      await expect(access(join(repoDir, ".gle"))).rejects.toThrow();
      await expect(access(join(repoDir, ".gitignore"))).rejects.toThrow();
    } finally {
      await rm(repoDir, { force: true, recursive: true });
    }
  });
});
