import { describe, expect, test } from "vitest";
import {
  hasClaudeHook,
  hasClaudeHookSubcommand,
  mergeClaudeHook,
  removeClaudeHookBySubcommand,
  removeClaudeHookByScriptName,
  removeAnyManagedPostCommitBlock,
  removeClaudeHook,
  removeManagedPostCommitBlock,
  upsertPostCommitScript,
  type ClaudeSettings,
} from "../src/commands/install-shared.js";

describe("install shared helpers", () => {
  test("merges and removes Claude hook entries", () => {
    const settings: ClaudeSettings = {};
    expect(mergeClaudeHook(settings, "UserPromptSubmit", "node /tmp/a.js")).toBe(true);
    expect(hasClaudeHook(settings, "UserPromptSubmit", "node /tmp/a.js")).toBe(true);
    expect(mergeClaudeHook(settings, "UserPromptSubmit", "node /tmp/a.js")).toBe(false);
    expect(removeClaudeHook(settings, "UserPromptSubmit", "node /tmp/a.js")).toBe(true);
    expect(hasClaudeHook(settings, "UserPromptSubmit", "node /tmp/a.js")).toBe(false);
  });

  test("removes old Claude hook entries by script name before reinstall", () => {
    const settings: ClaudeSettings = {};
    mergeClaudeHook(
      settings,
      "UserPromptSubmit",
      "node /home/user/dev/ctx-gleaner/dist/hooks/user-prompt-submit.js",
    );

    expect(removeClaudeHookByScriptName(settings, "UserPromptSubmit", "user-prompt-submit")).toBe(
      true,
    );
    expect(settings.hooks?.UserPromptSubmit).toEqual([]);
  });

  test("detects and removes Claude hook entries by hidden subcommand", () => {
    const settings: ClaudeSettings = {};
    mergeClaudeHook(settings, "Stop", "node /usr/local/bin/gle _stop", true);

    expect(hasClaudeHookSubcommand(settings, "Stop", "_stop")).toBe(true);
    expect(removeClaudeHookBySubcommand(settings, "Stop", "_stop")).toBe(true);
    expect(hasClaudeHookSubcommand(settings, "Stop", "_stop")).toBe(false);
  });

  test("appends managed post-commit block without clobbering existing script", () => {
    const existing = "#!/usr/bin/env sh\necho before\n";
    const command = "node /tmp/post-commit.js";
    const next = upsertPostCommitScript(existing, command);

    expect(next).toContain("echo before");
    expect(next).toContain(command);
    expect(upsertPostCommitScript(next, command)).toBe(next);
  });

  test("replaces old managed post-commit command on reinstall", () => {
    const existing =
      "#!/usr/bin/env sh\n# gle: clear collected context after successful commit\nnode /old/dist/hooks/post-commit.js\n";
    const next = upsertPostCommitScript(existing, "node /new/dist/hooks/post-commit.js");

    expect(next).toContain("node /new/dist/hooks/post-commit.js");
    expect(next).not.toContain("node /old/dist/hooks/post-commit.js");
  });

  test("removes only the managed post-commit block", () => {
    const command = "node /tmp/post-commit.js";
    const content = `#!/usr/bin/env sh\necho before\n# gle: clear collected context after successful commit\n${command}\necho after\n`;
    expect(removeManagedPostCommitBlock(content, command)).toBe(
      "#!/usr/bin/env sh\necho before\necho after",
    );
  });

  test("removes any managed post-commit block regardless of command path", () => {
    const content =
      "#!/usr/bin/env sh\n# gle: clear collected context after successful commit\nnode /old/dist/hooks/post-commit.js\necho after\n";

    expect(removeAnyManagedPostCommitBlock(content)).toBe("#!/usr/bin/env sh\necho after");
  });
});
