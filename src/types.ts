export type ProviderName =
  | "api"
  | "openai"
  | "gemini"
  | "claude"
  | "cmd";

export interface GleConfigFile {
  provider?: string;
  model?: string;
  apiBaseUrl?: string;
  prompt?: string;
  maxDiffChars?: number;
  maxOutputTokens?: number;
  language?: string;
  cmd?: string;
}

export interface ResolvedConfig {
  provider: ProviderName;
  model: string | undefined;
  apiBaseUrl: string | undefined;
  prompt: string | undefined;
  maxDiffChars: number;
  maxOutputTokens: number;
  language: string;
  cmd: string | undefined;
  sources: {
    provider: "env" | "global" | "default";
    model: "env" | "global" | "default" | "unset";
    apiBaseUrl: "env" | "global" | "unset";
    prompt: "global" | "default";
    maxDiffChars: "global" | "default";
    maxOutputTokens: "global" | "default";
    language: "global" | "default";
  };
}

export interface CommitGenerationInput {
  contextMd: string;
  diffStat: string;
  diffBody: string;
  diffTruncated: boolean;
}
