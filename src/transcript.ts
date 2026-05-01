export interface HookTranscriptRecord {
  role?: string;
  content?: string;
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

export function extractAssistantText(jsonl: string): string | null {
  const lines = jsonl.split("\n").filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    try {
      const record = JSON.parse(line) as HookTranscriptRecord;
      if (record.role !== "assistant") {
        continue;
      }

      const direct = typeof record.content === "string" ? record.content : null;
      if (direct?.trim()) {
        return direct.trim();
      }

      const content = record.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }
      if (Array.isArray(content)) {
        const text = content
          .filter((part) => part?.type === "text" && typeof part.text === "string")
          .map((part) => part.text?.trim() ?? "")
          .filter(Boolean)
          .join("\n");
        if (text) {
          return text;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function truncateTail(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(-maxChars);
}
