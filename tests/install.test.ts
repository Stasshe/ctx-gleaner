import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { installCommand, prepareCommand } from "../src/commands/install.js";
import { runGit } from "../src/git.js";

describe("install and prepare commands", () => {
  const originalArgv = [...process.argv];
  const originalHome = process.env.HOME;
  const originalGleHome = process.env.GLE_HOME;
  const originalGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;

  afterEach(() => {
    process.argv = [...originalArgv];
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
    if (originalGitConfigGlobal === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL;
    } else {
      process.env.GIT_CONFIG_GLOBAL = originalGitConfigGlobal;
    }
    vi.restoreAllMocks();
  });

  test("install configures Claude hooks outside a git repository", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-install-home-"));
    const nonRepo = await mkdtemp(join(tmpdir(), "gle-install-nonrepo-"));

    try {
      process.env.GLE_HOME = fakeHome;
      process.argv = ["node", "/usr/local/bin/gle", "install"];
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await expect(installCommand(nonRepo)).resolves.toBe(0);

      const settings = await readFile(
        join(fakeHome, ".claude", "settings.json"),
        "utf8",
      );
      expect(settings).toContain("_user-prompt-submit");
      expect(settings).toContain("_stop");

      const globalConfig = await readFile(
        join(fakeHome, ".gle", "glerc.jsonc"),
        "utf8",
      );
      expect(globalConfig).toContain("gemini-2.5-flash");
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  test("prepare configures cleanup hook inside a git repository", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "gle-prepare-home-"));
    const repo = await mkdtemp(join(tmpdir(), "gle-prepare-repo-"));

    try {
      process.env.GLE_HOME = fakeHome;
      process.env.GIT_CONFIG_GLOBAL = join(fakeHome, ".gitconfig");
      process.argv = ["node", "/usr/local/bin/gle", "prepare"];
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      await runGit(["init"], repo);
      await expect(prepareCommand(repo)).resolves.toBe(0);

      const hook = await readFile(join(fakeHome, ".gle", "hooks", "post-commit"), "utf8");
      expect(hook).toContain("_post-commit");

      const context = await readFile(
        join(repo, ".gle", "GLE_COMMIT_CONTEXT.md"),
        "utf8",
      );
      expect(context).toContain("<!-- gle context -->");

      const gitignore = await readFile(join(repo, ".gitignore"), "utf8");
      expect(gitignore.split("\n")).toContain(".gle/");
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
      await rm(repo, { recursive: true, force: true });
    }
  });
});
