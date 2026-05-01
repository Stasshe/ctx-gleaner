import { appendPromptContext } from "../context.js";
import { getContextFilePath, isGitRepository } from "../git.js";
import { pathToFileURL } from "node:url";
import { printError } from "../output.js";

interface UserPromptPayload {
  cwd?: string;
  prompt?: string;
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleUserPromptSubmitPayload(
  payload: UserPromptPayload,
): Promise<void> {
  if (!payload.cwd || !payload.prompt) {
    return;
  }
  if (!(await isGitRepository(payload.cwd))) {
    return;
  }
  const contextPath = await getContextFilePath(payload.cwd);
  await appendPromptContext(contextPath, payload.prompt);
}

export async function runUserPromptSubmitHook(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }
  await handleUserPromptSubmitPayload(JSON.parse(raw) as UserPromptPayload);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runUserPromptSubmitHook().catch((error) => {
    printError(`gle hook error: ${(error as Error).message}`);
    process.exit(0);
  });
}
