import { describe, expect, test } from "vitest";
import { extractAssistantText, truncateTail } from "../src/transcript.js";

describe("transcript helpers", () => {
  test("extracts text content from the last assistant record", () => {
    const jsonl = [
      JSON.stringify({ role: "user", message: { content: "hello" } }),
      "not-json",
      JSON.stringify({
        role: "assistant",
        message: {
          content: [
            { type: "text", text: "first line" },
            { type: "text", text: "second line" },
          ],
        },
      }),
    ].join("\n");

    expect(extractAssistantText(jsonl)).toBe("first line\nsecond line");
  });

  test("truncates from the tail", () => {
    expect(truncateTail("abcdef", 3)).toBe("def");
  });
});
