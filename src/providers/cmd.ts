import { spawn } from "node:child_process";
import { stripCodeFences } from "../utils.js";
import type { CommitGenerationInput } from "../types.js";
import { PROVIDER_TIMEOUT_MS } from "../constants.js";
import { BaseProvider } from "./base.js";

export class CmdProvider extends BaseProvider {
  validate(): boolean {
    return Boolean(this.config.cmd?.trim());
  }

  async generateMessage(params: CommitGenerationInput): Promise<string> {
    const cmd = this.config.cmd;
    if (!cmd) throw new Error("cmd is not configured in glerc.jsonc");

    const prompt = await this.getPrompt(params);

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, [], {
        shell: true,
        stdio: ["pipe", "pipe", "inherit"],
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`cmd timed out after ${PROVIDER_TIMEOUT_MS}ms`));
      }, PROVIDER_TIMEOUT_MS);

      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`cmd exited with code ${code ?? 1}`));
          return;
        }
        const message = stripCodeFences(output.trim());
        if (!message) {
          reject(new Error("cmd returned an empty response"));
          return;
        }
        resolve(message);
      });

      child.stdin.write(prompt, "utf8");
      child.stdin.end();
    });
  }
}
