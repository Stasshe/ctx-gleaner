export const CONTEXT_FILE_NAME = "GLE_COMMIT_CONTEXT.md";
export const CONTEXT_HEADER = "<!-- gle context -->\n";

export const DEFAULT_MAX_DIFF_CHARS = 8000;
export const DEFAULT_LANGUAGE = "auto";
export const DEFAULT_MODE = "api";
export const SUPPORTED_LANGUAGES = ["auto", "en", "ja", "zh", "ko", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const PROVIDER_TIMEOUT_MS = 15_000;

export const DEFAULT_PROVIDER = "gemini";

export const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
  claude: "claude-sonnet-4-5",
} as const;

export const SUPPORTED_PROVIDERS = [
  "api",
  "openai",
  "gemini",
  "claude",
] as const;

export const LOCKFILE_PATTERNS = [
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
];

export const GLE_MANAGED_COMMENT =
  "# gle: clear collected context after successful commit";

export const GLE_ENV_VARS = [
  "GLE_PROVIDER",
  "GLE_HOME",
  "GLE_API_KEY",
  "GLE_API_BASE_URL",
  "GLE_API_MODEL",
  "GLE_GEMINI_API_KEY",
  "GLE_GEMINI_MODEL",
  "GLE_OPENAI_API_KEY",
  "GLE_OPENAI_BASE_URL",
  "GLE_OPENAI_MODEL",
  "GLE_CLAUDE_API_KEY",
  "GLE_CLAUDE_BASE_URL",
  "GLE_CLAUDE_MODEL",
] as const;

export const PROVIDER_API_KEY_ENV: Record<string, string> = {
  api: "GLE_API_KEY",
  gemini: "GLE_GEMINI_API_KEY",
  openai: "GLE_OPENAI_API_KEY",
  claude: "GLE_CLAUDE_API_KEY",
};

export const PROVIDER_MODEL_ENV: Partial<Record<string, string>> = {
  api: "GLE_API_MODEL",
  gemini: "GLE_GEMINI_MODEL",
  openai: "GLE_OPENAI_MODEL",
  claude: "GLE_CLAUDE_MODEL",
};
