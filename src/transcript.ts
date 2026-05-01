type ContentBlock = { type: string; text?: string };
type ContentValue = string | ContentBlock[] | undefined;

export interface HookTranscriptRecord {
  // flat format: {role, content}
  role?: string;
  content?: ContentValue;
  // wrapped format: {type, message: {role, content}}  ← actual Claude Code format
  type?: string;
  message?: {
    role?: string;
    content?: ContentValue;
  };
}

function extractTextFromContent(content: ContentValue): string | null {
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return null;
}

export function extractAssistantText(jsonl: string): string | null {
  const lines = jsonl.split("\n").filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) continue;
    try {
      const record = JSON.parse(line) as HookTranscriptRecord;

      const isAssistant =
        record.type === "assistant" ||
        record.role === "assistant" ||
        record.message?.role === "assistant";
      if (!isAssistant) continue;

      // wrapped format first (actual Claude Code transcript format)
      const nested = extractTextFromContent(record.message?.content);
      if (nested) return nested;

      // flat format fallback
      const flat = extractTextFromContent(record.content);
      if (flat) return flat;
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
