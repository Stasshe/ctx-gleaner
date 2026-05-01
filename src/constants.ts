export const CONTEXT_FILE_NAME = "GLE_COMMIT_CONTEXT.md";
export const CONTEXT_HEADER = "<!-- gle context -->\n";

export const DEFAULT_MAX_DIFF_CHARS = 8000;
export const DEFAULT_LANGUAGE = "auto";

export const DEFAULT_PROVIDER = "gemini";

export const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
} as const;

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
  "GLE_GEMINI_API_KEY",
  "GLE_OPENAI_API_KEY",
  "GLE_LITELLM_API_KEY",
  "GLE_LITELLM_BASE_URL",
  "GLE_LITELLM_MODEL",
] as const;
