export type ProviderName = "gemini" | "openai" | "litellm";

export interface GleConfigFile {
  provider?: string;
  model?: string;
  prompt?: string;
  maxDiffChars?: number;
  language?: string;
}

export interface ResolvedConfig {
  provider: ProviderName;
  model: string | undefined;
  prompt: string | undefined;
  maxDiffChars: number;
  language: string;
  sources: {
    provider: "env" | "file" | "default";
    model: "env" | "file" | "default" | "unset";
    prompt: "file" | "default";
    maxDiffChars: "file" | "default";
    language: "file" | "default";
  };
}

export interface CommitGenerationInput {
  contextMd: string;
  diffStat: string;
  diffBody: string;
  diffTruncated: boolean;
}
