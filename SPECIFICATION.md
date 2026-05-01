# gle 仕様書

**バージョン**: 1.0.0  
**最終更新**: 2026-05-01  
**ステータス**: 確定

---

## 1. 概要

### 1.1 プロダクトの目的

`gle` は、Claude Code のセッション中に発生した「作業の意図（プロンプト）」と「作業結果の要約」をプロジェクトごとに自動収集し、`gle commit` 実行時に LLM API を使って高品質なコミットメッセージを自動生成する CLI ツールである。通常の `git commit` / `git commit -m` は変更せず、既存の Git ワークフローを妨げない。

### 1.2 解決する問題

- コミットメッセージを手書きするのが面倒
- `git diff` だけでは「何をしたか（what）」は読めても「なぜしたか（why）」は読めない
- `git mv` や大量ファイルリネーム後の diff が肥大化し、AI に渡すコンテキストとして不適切になる
- Claude Code のインタラクティブセッションの出力をパイプで取ることができない（tty 問題）

### 1.3 解決アプローチ

Claude Code の公式 Hooks 機能（`UserPromptSubmit`, `Stop`）でプロンプトと作業要約を `.git/GLE_COMMIT_CONTEXT.md` に自動蓄積する。コミットメッセージ生成は `gle commit` コマンド内でのみ行い、staged diff と蓄積コンテキストを LLM に渡して生成する。通常の `git commit` は生成対象外とする。

---

## 2. アーキテクチャ

### 2.1 全体フロー

```
[Claude Code セッション中]
  │
  ├─ UserPromptSubmit Hook 発火
  │    └─ プロンプト文字列を .git/GLE_COMMIT_CONTEXT.md に追記
  │
  └─ Stop Hook 発火（async）
       └─ transcript_path の JSONL 末尾から
          アシスタントメッセージを抽出して追記

[gle commit 実行時]
  │
  ├─ git diff --cached --find-renames で diff 取得・前処理
  ├─ .git/GLE_COMMIT_CONTEXT.md 読み込み
  ├─ Provider の generateMessage() を呼び出す
  ├─ 生成されたメッセージを一時ファイルに書き込み
  ├─ --edit フラグがあればエディタを起動
  ├─ git commit -F <生成メッセージファイル> <pass-through flags> を実行
  └─ コミット成功時のみ .git/GLE_COMMIT_CONTEXT.md をリセット

[通常の git commit 実行時]
  │
  └─ gle は生成処理を行わない
       └─ post-commit hook が有効な場合のみ、成功後に .git/GLE_COMMIT_CONTEXT.md をリセット
```

### 2.2 コンポーネント構成

```
gle (npm package)
├── bin/
│   └── gle.js                       # CLI エントリーポイント
├── lib/
│   ├── install.js                   # install コマンド実装
│   ├── uninstall.js                 # uninstall コマンド実装
│   ├── commit.js                    # commit コマンド実装
│   ├── config.js                    # 設定読み込み（.glerc.json / 環境変数）
│   ├── hooks/
│   │   ├── user-prompt-submit.js    # Claude Code UserPromptSubmit hook
│   │   ├── stop.js                  # Claude Code Stop hook
│   │   └── post-commit.js           # context clear hook
│   └── providers/
│       ├── index.js                 # Provider ファクトリ・選択ロジック
│       ├── base.js                  # BaseProvider（抽象インターフェース）
│       ├── gemini.js                # Gemini Flash API 実装
│       ├── openai.js                # OpenAI API 実装
│       └── litellm.js               # LiteLLM 実装
└── package.json
```

### 2.3 コンテキストファイル

**パス**: `<project>/.git/GLE_COMMIT_CONTEXT.md`

`.git/` 直下に置くため、gitignore 設定不要。自動的に追跡対象外。

**フォーマット**:

```markdown
<!-- gle context -->

## 2026-05-01T10:23:11+09:00

### prompt
JWTをセッション認証に切り替えて、既存のテストも修正して

### stop
認証ミドルウェアをセッションベースに書き換え、JWT関連の依存を削除。
テスト7件を修正し全件パスを確認。

---

## 2026-05-01T11:05:33+09:00

### prompt
不要になったjwtパッケージをpackage.jsonから削除して
```

セパレータ `---` でセッション単位を区切る。コミット後にファイル全体をリセット（空にする）。

---

## 3. 設定

### 3.1 設定の優先順位

設定は以下の優先順位で解決される（上が高い）:

1. 環境変数
2. プロジェクトルートの `.glerc.json`
3. デフォルト値

### 3.2 `.glerc.json` スキーマ

プロジェクトルート（`git rev-parse --show-toplevel` で取得）に配置する。

```json
{
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "prompt": "カスタムプロンプト文字列（省略時はデフォルトプロンプトを使用）",
  "maxDiffChars": 8000,
  "language": "auto"
}
```

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `provider` | string | `"gemini"` | 使用する Provider |
| `model` | string | Provider ごとのデフォルト | 使用するモデル |
| `prompt` | string | （後述） | BaseProvider で使うシステムプロンプト全文 |
| `maxDiffChars` | number | `8000` | diff 本文の最大文字数 |
| `language` | string | `"auto"` | コミットメッセージの言語（`"auto"` / `"ja"` / `"en"` など） |

`.glerc.json` は `.gitignore` への追加を推奨するが、強制しない。API キーを直接書かない限り、コミットしても安全である。

### 3.3 環境変数

| 変数名 | 説明 |
|---|---|
| `GLE_PROVIDER` | 使用する Provider（`gemini` / `openai` / `litellm`） |
| `GLE_GEMINI_API_KEY` | Gemini API キー |
| `GLE_OPENAI_API_KEY` | OpenAI API キー |
| `GLE_LITELLM_API_KEY` | LiteLLM API キー |
| `GLE_LITELLM_BASE_URL` | LiteLLM プロキシ URL（省略時は LiteLLM デフォルト） |
| `GLE_LITELLM_MODEL` | LiteLLM で使用するモデル |

API キーは環境変数のみで管理する。`.glerc.json` には書かない。

---

## 4. インストール仕様

### 4.1 インストール方法

**--save-dev（推奨）**:
```bash
npm install --save-dev gle
npx gle install
```

**グローバル**:
```bash
npm install -g gle
gle install
```

`gle install` は実行時にローカルインストールかグローバルインストールかを自動判定する。

### 4.2 `gle install` の処理内容

以下を順に実行する。エラーが発生した場合は途中で停止し、ロールバック手順を表示する。

#### ステップ 1: 前提確認

- Node.js >= 18 の確認
- Claude Code がインストールされているか確認（`claude --version`）
- `GLE_PROVIDER` 環境変数の確認（デフォルト: `gemini`）
- 指定された Provider に対応する API キー環境変数の確認

API キーが未設定の場合、以下のように警告して処理を継続する（エラーではなく警告扱い）:

```
⚠ GLE_GEMINI_API_KEY が設定されていません。
  コミットメッセージ生成を使用するには以下を ~/.zshrc または ~/.bashrc に追記してください:
  export GLE_PROVIDER=gemini
  export GLE_GEMINI_API_KEY="your-api-key"
  取得先: https://aistudio.google.com/app/apikey
```

#### ステップ 2: Claude Code hook スクリプトの配置

`--save-dev` の場合: `node_modules/gle/lib/hooks/` 以下のスクリプトを参照パスとして使う  
`-g` の場合: `$(npm root -g)/gle/lib/hooks/` を参照パスとして使う

#### ステップ 3: `~/.claude/settings.json` への hook 登録

既存の `settings.json` を読み込み、`hooks` セクションに以下を **マージ**（上書きではなく追記）する。既に gle の hook が登録されている場合はスキップする。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/gle/lib/hooks/user-prompt-submit.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/gle/lib/hooks/stop.js",
            "async": true
          }
        ]
      }
    ]
  }
}
```

`settings.json` が存在しない場合は新規作成する。変更前の `settings.json` を `~/.claude/settings.json.gle-backup` として保存する。

#### ステップ 4: git hook の設定

`post-commit` hook を設定する。役割は通常の `git commit` 実行後のコンテキストクリアのみ。

**判定ロジック:**

```
プロジェクトルートに .husky/ ディレクトリが存在する？
  YES → [Husky モード] .husky/post-commit に追記
  NO  → core.hooksPath が既に設定されている？
          YES → 設定済みの hooksPath ディレクトリに post-commit を配置
          NO  → [通常モード] ~/.gle/hooks/ に配置し core.hooksPath をグローバル設定
```

---

**[Husky モード]**

`.husky/post-commit` が存在しない場合は新規作成:

```sh
#!/usr/bin/env sh
# gle: clear collected context after successful commit
node "$(npm root)/.bin/gle" _post-commit
```

既に `.husky/post-commit` が存在する場合は末尾に追記:

```sh
# gle: clear collected context after successful commit
node "$(npm root)/.bin/gle" _post-commit
```

ファイルに実行権限を付与する（`chmod +x`）。`git config --global core.hooksPath` は変更しない。

---

**[通常モード]**

```bash
git config --global core.hooksPath ~/.gle/hooks
```

`~/.gle/hooks/post-commit` を作成し実行権限を付与する。

#### ステップ 5: 完了表示

```
✓ Claude Code hooks を登録しました (~/.claude/settings.json)
✓ git post-commit hook を設定しました (~/.gle/hooks)

gle のセットアップが完了しました。
次回 Claude Code セッションから自動でコンテキストが収集されます。

アンインストール: gle uninstall
```

### 4.3 `gle uninstall` の処理内容

- `~/.claude/settings.json` から gle の hook エントリを削除
- `~/.gle/hooks/post-commit` を削除
- `git config --global --unset core.hooksPath` を実行（ただし、他のツールが hooksPath を使っていた場合は削除せず警告のみ）
- `~/.claude/settings.json.gle-backup` が存在する場合、復元するか確認する

---

## 5. Claude Code Hook 実装仕様

### 5.1 UserPromptSubmit Hook

**ファイル**: `lib/hooks/user-prompt-submit.js`  
**トリガー**: Claude Code でユーザーがプロンプトを送信するたびに発火  
**非同期**: false（同期）

**stdin で受け取る JSON**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "JWTをセッション認証に切り替えて"
}
```

**処理フロー**:

1. stdin から JSON をパース
2. `cwd` フィールドで git リポジトリか確認（`git -C <cwd> rev-parse --git-dir`）。失敗なら exit 0
3. `.git/GLE_COMMIT_CONTEXT.md` のパスを解決
4. ファイルが存在しない場合は `<!-- gle context -->` ヘッダ付きで新規作成
5. 以下を追記:
   ```markdown
   
   ## <ISO8601タイムスタンプ>
   
   ### prompt
   <prompt の内容>
   ```
6. exit 0

**注意**: `UserPromptSubmit` の stdout は Claude が見えるコンテキストに追加されるため、stdout には何も出力しない。エラーは stderr のみ。

### 5.2 Stop Hook

**ファイル**: `lib/hooks/stop.js`  
**トリガー**: Claude Code がレスポンスを完了するたびに発火  
**非同期**: true（`async: true`）

**stdin で受け取る JSON**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "hook_event_name": "Stop",
  "stop_hook_active": false
}
```

**処理フロー**:

1. stdin から JSON をパース
2. `stop_hook_active` が true の場合は即 exit 0（無限ループ防止）
3. `cwd` で git リポジトリか確認。失敗なら exit 0
4. `transcript_path` の JSONL ファイルを読み込む
5. JSONL の末尾から `role: "assistant"` のエントリを最大 1 件取得
6. `content` フィールドからテキストを抽出し、末尾 800 文字に切り詰める
7. `.git/GLE_COMMIT_CONTEXT.md` に以下を追記:
   ```markdown
   
   ### stop
   <抽出したテキスト>
   
   ---
   ```
8. exit 0

**JSONL パース仕様**:

```javascript
// transcript.jsonl の各行の構造
{
  "role": "assistant" | "user",
  "message": {
    "content": string | Array<{type: "text", text: string}>
  },
  "timestamp": "..."
}
```

`content` が文字列の場合はそのまま使用。配列の場合は `type: "text"` のブロックを連結する。JSONL の各行のパースエラーはスキップして処理を継続する。

### 5.3 post-commit Hook

**ファイル**: `~/.gle/hooks/post-commit` または `.husky/post-commit`  
**トリガー**: 通常の `git commit` が成功した後

**処理フロー**:

1. `git rev-parse --git-dir` で `.git` ディレクトリを解決
2. `.git/GLE_COMMIT_CONTEXT.md` が存在する場合、ヘッダ行のみ残してリセット
3. exit 0

失敗しても commit 自体はすでに成功しているため、stderr に警告を出して exit 0。`gle commit` 本体もコミット成功時に自前でコンテキストをクリアするため、両方が実行されても冪等である。

---

## 6. コミット生成実装仕様

### 6.1 `gle commit`

**基本方針**:
- AI 生成は `gle commit` の内部でのみ実行する
- 通常の `git commit` / `git commit -m` / `git commit --amend` は上書きしない
- `gle commit` は標準の `git commit` フラグを可能な限り pass-through する
- コミット成功時のみ `.git/GLE_COMMIT_CONTEXT.md` をリセットする
- デフォルトは確認なしでそのままコミットする

**フラグの扱い**:

| フラグ | 動作 |
|---|---|
| （なし） | 生成→確認なしでそのままコミット |
| `--edit` | 生成→エディタを起動してメッセージを確認・編集後コミット |
| `-m` / `--message` / `-F` / `--file` | 生成をスキップ。通常の `git commit` にフォールバック |
| `--amend` | 生成をスキップ。通常の `git commit --amend` にフォールバック |

**スキップ条件（どれか一つでも該当すれば生成しない）**:
- `-m` / `--message` / `-F` / `--file` / `--amend` が指定されている
- 指定された Provider の API キーが未設定
- staged diff が空、かつ `.git/GLE_COMMIT_CONTEXT.md` が空または存在しない

**処理フロー**:

1. 引数を解析する
2. スキップ条件に該当する場合は `git commit "$@"` を実行して終了
3. `config.js` で設定を解決する（環境変数 → `.glerc.json` → デフォルト値）
4. Provider を初期化・検証する
5. `git diff --cached --find-renames --stat` で diff サマリーを取得
6. `git diff --cached --find-renames` でロックファイルを除外した diff 本文を取得（`maxDiffChars` 文字に切り詰め）
7. リネーム検出の前処理を行う
8. `.git/GLE_COMMIT_CONTEXT.md` を読み込む（存在しない場合は空文字）
9. Provider の `generateMessage()` を呼び出す
10. 生成されたメッセージを一時ファイルに保存する
11. `--edit` フラグがある場合はエディタを起動する（`GIT_EDITOR` → `VISUAL` → `EDITOR` → `vi` の順で解決）
12. `git commit -F <tempfile> <pass-through flags>` を実行する
13. `git commit` が成功した場合のみ `.git/GLE_COMMIT_CONTEXT.md` を空にリセットする
14. 一時ファイルを削除して exit する

**エラーハンドリング**:
- Provider API エラー（ネットワーク、認証失敗等）: stderr にエラーを出力し、通常の `git commit` にフォールバック
- タイムアウト: 15 秒
- `git commit` が失敗した場合: `.git/GLE_COMMIT_CONTEXT.md` はリセットしない

### 6.2 diff 前処理仕様

**リネーム検出**:

```bash
git diff --cached --find-renames=50% --diff-filter=R --name-status
```

リネームされたファイルが 3 件以上ある場合、diff 本文の代わりに以下の整形済みテキストを使用する:

```
[リネーム検出: 5件]
- src/old/auth.ts → src/new/auth.ts (similarity: 95%)
- src/old/user.ts → src/new/user.ts (similarity: 100%)
```

リネーム後にさらに内容変更があるファイルは、`git diff --cached --diff-filter=M` で取得した diff を別途付加する。

**ロックファイル除外**:

以下のパターンに一致するファイルは diff から除外する:

```
*.lock
package-lock.json
yarn.lock
pnpm-lock.yaml
Cargo.lock
Gemfile.lock
```

**diff 文字数制限**:

diff 本文は `.glerc.json` の `maxDiffChars`（デフォルト 8000 文字）で切り詰める。超過した場合はその旨をプロンプトに明記する。

---

## 7. LLM プロバイダー仕様

### 7.1 Provider インターフェース（BaseProvider）

全プロバイダーは `BaseProvider` を継承し、以下のメソッドを実装する。プロンプトは `BaseProvider` で定義し、各 Provider 実装は共通プロンプトを使用する（`.glerc.json` の `prompt` で上書き可能）。

```javascript
class BaseProvider {
  /**
   * @param {Object} config - 解決済み設定オブジェクト
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * プロバイダーの検証（環境変数の確認など）
   * @returns {boolean}
   */
  validate() {}

  /**
   * コミットメッセージ生成用プロンプトを組み立てる
   * .glerc.json の prompt が設定されている場合はそちらを使用する
   * @param {Object} params
   * @param {string} params.contextMd
   * @param {string} params.diffStat
   * @param {string} params.diffBody
   * @returns {string}
   */
  buildPrompt(params) {}

  /**
   * コミットメッセージを生成する
   * @param {Object} params
   * @param {string} params.contextMd - .git/GLE_COMMIT_CONTEXT.md の内容
   * @param {string} params.diffStat  - git diff --stat の出力
   * @param {string} params.diffBody  - diff 本文（maxDiffChars 文字以内）
   * @returns {Promise<string>}
   */
  async generateMessage(params) {}
}
```

**デフォルトプロンプト**（`buildPrompt` の出力）:

```
あなたは git コミットメッセージの専門家です。
以下の情報をもとに、簡潔で明確なコミットメッセージを生成してください。

## ルール
- 1行目: 命令形・現在形で50文字以内の要約（例: "Add JWT authentication"）
- 空行
- 本文: 変更の理由と内容を箇条書きで記述（省略可）
- Conventional Commits 形式（feat:, fix:, refactor: 等）を推奨
- 言語: <language の値。auto の場合は diff とコンテキストの言語に合わせる>

## 作業コンテキスト（AI セッションログ）
<GLE_COMMIT_CONTEXT.md の内容。空の場合は「なし」>

## diff サマリー
<git diff --stat の出力>

## diff 詳細
<diff 本文（最大 <maxDiffChars> 文字）>

コミットメッセージのみを出力してください。説明や前置きは不要です。
```

### 7.2 Provider の選択

`providers/index.js` のファクトリが以下の優先順位で Provider を決定する:

1. 環境変数 `GLE_PROVIDER`
2. `.glerc.json` の `provider` フィールド
3. デフォルト: `gemini`

### 7.3 Gemini Provider

**モデルデフォルト**: `gemini-2.0-flash`（`.glerc.json` の `model` で上書き可）

**環境変数**: `GLE_GEMINI_API_KEY`

**エンドポイント**:
```
POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<GLE_GEMINI_API_KEY>
```

**リクエストボディ**:
```json
{
  "contents": [{ "parts": [{ "text": "<buildPrompt() の出力>" }] }],
  "generationConfig": {
    "temperature": 0.2,
    "maxOutputTokens": 512
  }
}
```

**レスポンス処理**:
- `candidates[0].content.parts[0].text` からテキストを取得
- 先頭・末尾の空白をトリム
- `` ``` `` で囲まれていた場合は除去

### 7.4 OpenAI Provider

**モデルデフォルト**: `gpt-4o`（`.glerc.json` の `model` で上書き可）

**環境変数**: `GLE_OPENAI_API_KEY`

**エンドポイント**: `https://api.openai.com/v1/chat/completions`

**リクエストボディ**:
```json
{
  "model": "<model>",
  "messages": [{ "role": "user", "content": "<buildPrompt() の出力>" }],
  "temperature": 0.2,
  "max_tokens": 512
}
```

**レスポンス処理**:
- `choices[0].message.content` からテキストを取得
- 先頭・末尾の空白をトリム
- `` ``` `` で囲まれていた場合は除去

### 7.5 LiteLLM Provider

**環境変数**: `GLE_LITELLM_API_KEY` / `GLE_LITELLM_BASE_URL` / `GLE_LITELLM_MODEL`

**モデル**: `GLE_LITELLM_MODEL` または `.glerc.json` の `model`（必須。デフォルトなし）

**エンドポイント**: `${GLE_LITELLM_BASE_URL}/chat/completions`（デフォルト: `https://api.litellm.ai/v1/chat/completions`）

OpenAI 互換フォーマットで送受信する。ローカル LLM（Ollama、LM Studio）も `GLE_LITELLM_BASE_URL` で対応。

**validate()**: `GLE_LITELLM_MODEL` または `.glerc.json` の `model` が未設定の場合は false を返す。

---

## 8. CLI コマンド仕様

### 8.1 コマンド一覧

| コマンド | 説明 |
|---|---|
| `gle install` | セットアップを実行 |
| `gle uninstall` | セットアップを取り消す |
| `gle commit [git flags]` | コンテキストと staged diff からメッセージを生成してコミット |
| `gle commit --edit [git flags]` | 生成後エディタを起動してメッセージを確認・編集してからコミット |
| `gle status` | 現在の設定状態を表示 |
| `gle context` | 現在の `.git/GLE_COMMIT_CONTEXT.md` の内容を表示 |
| `gle context --clear` | `.git/GLE_COMMIT_CONTEXT.md` を手動でリセット |
| `gle --version` | バージョン表示 |
| `gle --help` | ヘルプ表示 |

### 8.2 `gle status` の出力例

```
gle status

Claude Code hooks:
  ✓ UserPromptSubmit  登録済み (~/.claude/settings.json)
  ✓ Stop              登録済み (~/.claude/settings.json)

git hook:
  ✓ post-commit       (~/.gle/hooks/post-commit)
  ✓ core.hooksPath    ~/.gle/hooks

設定:
  provider:           gemini  (環境変数)
  model:              gemini-2.0-flash  (デフォルト)
  maxDiffChars:       8000  (デフォルト)
  language:           auto  (デフォルト)

環境変数:
  ✓ GLE_PROVIDER           gemini
  ✓ GLE_GEMINI_API_KEY     設定済み

現在のコンテキスト:
  プロジェクト: /home/user/my-project
  ✓ GLE_COMMIT_CONTEXT.md  3件のエントリ
```

---

## 9. ファイル・ディレクトリ構成

### 9.1 インストール後の生成物

```
~/.claude/
└── settings.json              # gle の hook エントリが追記される
~/.claude/
└── settings.json.gle-backup   # 変更前のバックアップ

~/.gle/
└── hooks/
    └── post-commit             # context clear hook（実行権限付き）

<project>/
├── .glerc.json                 # プロジェクト設定（省略可）
└── .git/
    └── GLE_COMMIT_CONTEXT.md   # コミットごとにリセットされるコンテキスト
```

### 9.2 package.json の主要フィールド

```json
{
  "name": "ctx-gleaner",
  "version": "1.0.0",
  "bin": {
    "gle": "./bin/gle.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {}
}
```

Node.js 18 以上の組み込み `fetch` を使用するため、外部依存なし。

---

## 10. エッジケースと制約

### 10.1 コンテキストなしでのコミット

`.git/GLE_COMMIT_CONTEXT.md` が存在しない、または空の場合でも `gle commit` は動作する。diff 情報のみで生成する。精度は下がるが動作は保証する。

### 10.2 複数ターミナルでの並行作業

複数のターミナルで Claude Code セッションを並行して動かしている場合、各セッションの hook が同じ `.git/GLE_COMMIT_CONTEXT.md` に同時に追記する可能性がある。ファイルへの書き込みはアトミックではないため競合の可能性がある。README に注意として記載する。

### 10.3 git リポジトリ外での Claude Code 使用

`git rev-parse --git-dir` が失敗した場合、hook は何もせず exit 0。Claude Code の通常動作に影響しない。

### 10.4 `--amend` コミット

`gle commit --amend` は生成をスキップし、通常の `git commit --amend` にフォールバックする。既存メッセージを上書きしない。

### 10.5 Husky との共存

**検出方法**: `git rev-parse --show-toplevel` で得たプロジェクトルートに `.husky/` ディレクトリが存在するか確認する。

Husky v9 未満（`.husky/` が存在しない、かつ `package.json` に `"husky"` キーが存在する）を検出した場合は通常モードにフォールバックし、以下の警告を表示する:

```
⚠ Husky v8 が検出されました。gle は Husky v9+ のみ自動対応します。
  手動で .husky/post-commit を作成するか、Husky を v9 にアップグレードしてください。
  詳細: https://github.com/ctx-gleaner/gle#husky-v8
```

Husky 以外のツールが `core.hooksPath` を設定している場合、設定済みのパスに `post-commit` を配置し、`~/.gle/hooks/` への変更は行わない。

**`gle uninstall` の Husky モード**: `.husky/post-commit` 内の gle が追記した行を削除する。gle のエントリのみの場合はファイルごと削除する。`core.hooksPath` は変更しない。

### 10.6 Provider が利用不可な場合

`validate()` が false を返した場合、`gle commit` は API コールを行わず stderr にエラーを出力して通常の `git commit` にフォールバックする。

---

## 11. セキュリティ

- API キーはファイルに書き込まない。環境変数のみで参照する。
- `.glerc.json` には API キーを記載しない。
- `.git/GLE_COMMIT_CONTEXT.md` は `.git/` 直下のためリポジトリにプッシュされない。
- `gle commit` は API キーが未設定の場合は API コールを行わない。
- hook スクリプトは stdin の JSON のみを信頼する。