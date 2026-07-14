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

    const lang = SUPPORTED_LANGUAGES.includes(
      this.config.language as (typeof SUPPORTED_LANGUAGES)[number],
    )
      ? this.config.language
      : "auto";

    const templatePath = getBuiltinPromptPath(lang);
    const systemPrompt = (await readFile(templatePath, "utf8")).trimEnd();

    const contextSection = params.contextMd.trim() || "none";
    const diffSection = params.diffBody.trim() || "none";
    const truncatedNote = params.diffTruncated
      ? `\n\nNote: diff details truncated at ${this.config.maxDiffChars} characters.`
      : "";

    return `${systemPrompt}

## Work Context (AI Session Log)
${contextSection}

## Diff Summary
${params.diffStat.trim() || "none"}

## Diff Details
${diffSection}${truncatedNote}

Output the commit message only. No explanation or preamble.`;
  }

  abstract generateMessage(params: CommitGenerationInput): Promise<string>;
}
