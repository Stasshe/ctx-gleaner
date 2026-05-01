import { describe, expect, test } from "vitest";
import {
  hasClaudeHook,
  mergeClaudeHook,
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

  test("appends managed post-commit block without clobbering existing script", () => {
    const existing = "#!/usr/bin/env sh\necho before\n";
    const command = "node /tmp/post-commit.js";
    const next = upsertPostCommitScript(existing, command);

    expect(next).toContain("echo before");
    expect(next).toContain(command);
    expect(upsertPostCommitScript(next, command)).toBe(next);
  });

  test("removes only the managed post-commit block", () => {
    const command = "node /tmp/post-commit.js";
    const content = `#!/usr/bin/env sh\necho before\n# gle: clear collected context after successful commit\n${command}\necho after\n`;
    expect(removeManagedPostCommitBlock(content, command)).toBe(
      "#!/usr/bin/env sh\necho before\necho after",
    );
  });
});
