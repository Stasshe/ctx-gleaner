# ctx-gleaner

Claude Code の作業コンテキストを収集して、`gle commit` 時にコミットメッセージを生成する CLI です。

## What It Does

- `UserPromptSubmit` hook でユーザープロンプトを収集
- `Stop` hook で直近のアシスタント要約を収集
- 収集先は各 repo の `.git/GLE_COMMIT_CONTEXT.md`
- `gle commit` で staged diff と context をまとめて LLM に送り、生成メッセージで `git commit`
- commit 成功時だけ context をリセット
- 通常の `git commit` は上書きしない

## Current Scope

v0.3 時点の実装範囲:

- Claude Code hooks
- `gle install`
- `gle uninstall`
- `gle status`
- `gle context`
- `gle commit`
- Provider: `gemini`, `openai`, `litellm`
- lockfile 除外
- rename 検出
- diff 文字数制限

未確認または未対応:

- Claude Code 実セッションでの完全な E2E 確認
- Codex CLI / GitHub Copilot integration
- `gle context --edit`

## Requirements

- Node.js `>=18`
- Git
- Claude Code
- いずれかの API キー

## Install

### Per-project

```bash
npm install --save-dev ctx-gleaner
npx gle install
```

### Global

```bash
npm install -g ctx-gleaner
gle install
```

`gle install` は次を行います。

- `~/.claude/settings.json` に `UserPromptSubmit` / `Stop` hook をマージ
- 変更前の `settings.json` を `~/.claude/settings.json.gle-backup` に保存
- `post-commit` hook を設定
  - `.husky/` があれば `.husky/post-commit`
  - 既存 `core.hooksPath` があればその配下
  - なければ `~/.gle/hooks` を作成して `core.hooksPath` を設定

## Configuration

優先順位:

1. 環境変数
2. `~/.gle/glerc.json`
3. デフォルト値

### Environment Variables

```bash
export GLE_PROVIDER=gemini
export GLE_GEMINI_API_KEY=...
```

利用可能な変数:

- `GLE_PROVIDER`
- `GLE_GEMINI_API_KEY`
- `GLE_OPENAI_API_KEY`
- `GLE_LITELLM_API_KEY`
- `GLE_LITELLM_BASE_URL`
- `GLE_LITELLM_MODEL`

### `~/.gle/glerc.json`

ユーザー単位のグローバル設定です。project `.glerc.json` は使いません。

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "prompt": "custom prompt",
  "maxDiffChars": 8000,
  "language": "auto"
}
```

### `~/.gle/prompt.md`

prompt を Markdown で調整したい場合はここに置きます。`~/.gle/glerc.json` の `prompt` があればそちらを優先します。

```md
あなたは git コミットメッセージの専門家です。
以下のルールに従ってコミットメッセージのみを返してください。
```

## Usage

### Commit Message Generation

```bash
git add .
gle commit
```

`gle commit` の挙動:

- デフォルト: 生成してそのまま `git commit`
- `--edit`: 生成後に editor を開く
- `-m`, `--message`, `-F`, `--file`, `--amend`: 生成をスキップして plain `git commit`
- provider 未設定時: plain `git commit` にフォールバック

### Context

```bash
gle context
gle context --clear
```

### Status

```bash
gle status
```

出力内容:

- Claude hooks 登録状態
- `post-commit` hook 状態
- 解決済み provider / model / language / maxDiffChars
- `~/.gle/glerc.json` / `~/.gle/prompt.md` の有無
- `GLE_*` 環境変数の有無
- 現在の context 件数

## Context File

保存先:

```text
<repo>/.git/GLE_COMMIT_CONTEXT.md
```

例:

```md
<!-- gle context -->

## 2026-05-01T10:23:11+09:00

### prompt
JWTをセッション認証に切り替えて

### stop
認証ミドルウェアをセッションベースに書き換え、関連テストを更新した

---
```

## Diff Handling

- `git diff --cached --find-renames`
- lockfile を除外
  - `*.lock`
  - `package-lock.json`
  - `yarn.lock`
  - `pnpm-lock.yaml`
  - `Cargo.lock`
  - `Gemfile.lock`
- rename が 3 件以上なら rename 要約に圧縮
- diff 本文は `maxDiffChars` で切り詰め

## Providers

### Gemini

- default model: `gemini-2.5-flash`
- env: `GLE_GEMINI_API_KEY`

### OpenAI

- default model: `gpt-4o`
- env: `GLE_OPENAI_API_KEY`

### LiteLLM

- model は `GLE_LITELLM_MODEL` または `~/.gle/glerc.json` で必須
- env: `GLE_LITELLM_API_KEY`
- base URL default: `https://api.litellm.ai/v1`

## Limitations

- 複数 Claude Code セッションが同じ repo に同時書き込みすると context が混ざる
- `Stop` hook は transcript の最後の assistant message に依存する
- 通常の `git commit` は生成しない
- merge 中は生成をスキップする

## Commands

| Command | Description |
|---|---|
| `gle install` | hook と post-commit を設定 |
| `gle uninstall` | gle の設定を削除 |
| `gle commit [git flags]` | context + diff から message 生成 |
| `gle status` | 設定状態を表示 |
| `gle context` | context 内容を表示 |
| `gle context --clear` | context をリセット |
| `gle --version` | version 表示 |
| `gle --help` | help 表示 |

## Development

```bash
npm install
npm run build
npm test
```

配布確認:

```bash
npm pack
```

## License

MIT
