import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { appendStopContext } from "../context.js";
import { getContextFilePath, isGitRepository } from "../git.js";
import { printError } from "../output.js";
import { extractAssistantText, truncateTail } from "../transcript.js";

interface StopPayload {
  cwd?: string;
  stop_hook_active?: boolean;
  transcript_path?: string;
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleStopPayload(payload: StopPayload): Promise<void> {
  if (payload.stop_hook_active || !payload.cwd || !payload.transcript_path) {
    return;
  }
  if (!(await isGitRepository(payload.cwd))) {
    return;
  }

  const transcript = await readFile(payload.transcript_path, "utf8").catch(() => "");
  const assistantText = extractAssistantText(transcript);
  if (!assistantText) {
    return;
  }

  const contextPath = await getContextFilePath(payload.cwd);
  await appendStopContext(contextPath, truncateTail(assistantText, 800));
}

export async function runStopHook(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }

  await handleStopPayload(JSON.parse(raw) as StopPayload);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runStopHook().catch((error) => {
    printError(`gle hook error: ${(error as Error).message}`);
    process.exit(0);
  });
}
