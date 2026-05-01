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
    provider: "env" | "global" | "default";
    model: "env" | "global" | "default" | "unset";
    prompt: "global" | "default";
    maxDiffChars: "global" | "default";
    language: "global" | "default";
  };
}

export interface CommitGenerationInput {
  contextMd: string;
  diffStat: string;
  diffBody: string;
  diffTruncated: boolean;
}
