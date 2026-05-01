import { appendPromptContext } from "../context.js";
import { getContextFilePath, isGitRepository } from "../git.js";

interface UserPromptPayload {
  cwd?: string;
  prompt?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }
  const payload = JSON.parse(raw) as UserPromptPayload;
  if (!payload.cwd || !payload.prompt) {
    return;
  }
  if (!(await isGitRepository(payload.cwd))) {
    return;
  }
  const contextPath = await getContextFilePath(payload.cwd);
  await appendPromptContext(contextPath, payload.prompt);
}

main().catch((error) => {
  console.error(`gle hook error: ${(error as Error).message}`);
  process.exit(0);
});
