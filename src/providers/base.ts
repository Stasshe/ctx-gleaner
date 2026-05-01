import { readFile } from "node:fs/promises";
import type { CommitGenerationInput, ResolvedConfig } from "../types.js";
import { getBuiltinPromptPath } from "../paths.js";
import { SUPPORTED_LANGUAGES } from "../constants.js";

export abstract class BaseProvider {
  constructor(protected readonly config: ResolvedConfig) {}

  abstract validate(): boolean;

  protected async getPrompt(params: CommitGenerationInput): Promise<string> {
    if (this.config.prompt) {
      return this.config.prompt;
    }

    const lang = SUPPORTED_LANGUAGES.includes(this.config.language as (typeof SUPPORTED_LANGUAGES)[number])
      ? this.config.language
      : "auto";

    const templatePath = getBuiltinPromptPath(lang);
    const template = await readFile(templatePath, "utf8");

    const contextSection = params.contextMd.trim() || "なし";
    const diffSection = params.diffBody.trim() || "なし";
    const truncatedNote = params.diffTruncated
      ? `\n\n注記: diff 詳細は ${this.config.maxDiffChars} 文字で切り詰められています。`
      : "";

    return template
      .replace("{{CONTEXT}}", contextSection)
      .replace("{{DIFF_STAT}}", params.diffStat.trim() || "なし")
      .replace("{{DIFF_BODY}}", diffSection)
      .replace("{{TRUNCATED_NOTE}}", truncatedNote);
  }

  abstract generateMessage(params: CommitGenerationInput): Promise<string>;
}
