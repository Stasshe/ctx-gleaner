import type { CommitGenerationInput, ResolvedConfig } from "../types.js";

export abstract class BaseProvider {
  constructor(protected readonly config: ResolvedConfig) {}

  abstract validate(): boolean;

  protected getPrompt(params: CommitGenerationInput): string {
    if (this.config.prompt) {
      return this.config.prompt;
    }

    const contextSection = params.contextMd.trim() || "なし";
    const diffSection = params.diffBody.trim() || "なし";
    const truncatedNote = params.diffTruncated
      ? `\n\n注記: diff 詳細は ${this.config.maxDiffChars} 文字で切り詰められています。`
      : "";

    return `あなたは git コミットメッセージの専門家です。
以下の情報をもとに、簡潔で明確なコミットメッセージを生成してください。

## ルール
- 1行目: 命令形・現在形で50文字以内の要約
- 空行
- 本文: 変更の理由と内容を箇条書きで記述（省略可）
- Conventional Commits 形式（feat:, fix:, refactor: 等）を推奨
- 言語: ${this.config.language === "auto" ? "diff とコンテキストに合わせて自動判定" : this.config.language}

## 作業コンテキスト（AI セッションログ）
${contextSection}

## diff サマリー
${params.diffStat.trim() || "なし"}

## diff 詳細
${diffSection}${truncatedNote}

コミットメッセージのみを出力してください。説明や前置きは不要です。`;
  }

  abstract generateMessage(params: CommitGenerationInput): Promise<string>;
}
