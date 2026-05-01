import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!haystack.includes(needle)) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

export async function createTempCommitFile(content: string): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "gle-"));
  const path = join(dir, "COMMIT_EDITMSG");
  await writeFile(path, content, "utf8");

  return {
    path,
    cleanup: async () => {
      await rm(dir, { force: true, recursive: true });
    },
  };
}
