export type ProviderName = "gemini" | "openai" | "litellm";
export type ModeName = "api" | "cmd";

export interface GleConfigFile {
  mode?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  maxDiffChars?: number;
  language?: string;
  cmd?: string;
}

export interface ResolvedConfig {
  mode: ModeName;
  provider: ProviderName;
  model: string | undefined;
  prompt: string | undefined;
  maxDiffChars: number;
  language: string;
  cmd: string | undefined;
  sources: {
    mode: "global" | "default";
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
