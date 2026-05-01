import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPackageRoot } from "./paths.js";

export async function getPackageVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await readFile(join(getPackageRoot(), "package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
