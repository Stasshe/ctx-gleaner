# gle 仕様書

**バージョン**: 0.1.0-draft  
**最終更新**: 2026-05-01  
**ステータス**: 設計フェーズ

---

## 1. 概要

### 1.1 プロダクトの目的

`gle` は、Claude Code のセッション中に発生した「作業の意図（プロンプト）」と「作業結果の要約」をプロジェクトごとに自動収集し、`git commit` 時に Gemini Flash API を使って高品質なコミットメッセージを自動生成する CLI ツールである。

### 1.2 解決する問題

- コミットメッセージを手書きするのが面倒
- `git diff` だけでは「何をしたか（what）」は読めても「なぜしたか（why）」は読めない
- `git mv` や大量ファイルリネーム後の diff が肥大化し、AI に渡すコンテキストとして不適切になる
- Claude Code のインタラクティブセッションの出力をパイプで取ることができない（tty 問題）

### 1.3 解決アプローチ

Claude Code の公式 Hooks 機能（`UserPromptSubmit`, `Stop`）でプロンプトと作業要約を `.git/GLE_COMMIT_CONTEXT.md` に自動蓄積し、`prepare-commit-msg` git hook で diff と合わせて Gemini Flash に投げてコミットメッセージを生成する。

### 1.4 スコープ

**v0.1 対象:**
- Claude Code 対応のみ
- Gemini Flash API によるメッセージ生成のみ

**v0.1 対象外:**
- Codex CLI 対応
- GitHub Copilot 対応
- 複数 AI エージェントの混在セッション

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

[git commit 実行時]
  │
  └─ prepare-commit-msg hook 発火
       ├─ git diff --cached --find-renames で diff 取得・前処理
       ├─ .git/GLE_COMMIT_CONTEXT.md 読み込み
       ├─ Gemini Flash API にリクエスト
       ├─ 生成されたメッセージを COMMIT_EDITMSG に書き込み
       └─ .git/GLE_COMMIT_CONTEXT.md をリセット
```

### 2.2 コンポーネント構成

```
gle (npm package)
├── bin/
│   └── gle.js               # CLI エントリーポイント
├── lib/
│   ├── install.js           # install コマンド実装
│   ├── uninstall.js         # uninstall コマンド実装
│   ├── hooks/
│   │   ├── user-prompt-submit.js  # Claude Code UserPromptSubmit hook
│   │   ├── stop.js                # Claude Code Stop hook
│   │   └── prepare-commit-msg.sh  # git hook
│   └── gemini.js            # Gemini API クライアント
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

## 3. インストール仕様

### 3.1 インストール方法

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

両方のインストール形態を同一の `gle install` コマンドでサポートする。`gle install` は実行時にローカルインストールかグローバルインストールかを自動判定する。

### 3.2 `gle install` の処理内容

以下を順に実行する。エラーが発生した場合は途中で停止し、ロールバック手順を表示する。

#### ステップ 1: 前提確認

- Node.js >= 18 の確認
- Claude Code がインストールされているか確認（`claude --version`）
- `GEMINI_API_KEY` 環境変数の存在確認

`GEMINI_API_KEY` が未設定の場合、以下を表示して処理を継続する（警告扱い）:

```
⚠ GEMINI_API_KEY が設定されていません。
  コミットメッセージ生成を使用するには以下を ~/.zshrc または ~/.bashrc に追記してください:
  export GEMINI_API_KEY="your-api-key"
  取得先: https://aistudio.google.com/app/apikey
```

#### ステップ 2: Claude Code hook スクリプトの配置

`--save-dev` の場合: `node_modules/gle/lib/hooks/` 以下のスクリプトを参照パスとして使う  
`-g` の場合: `$(npm root -g)/gle/lib/hooks/` を参照パスとして使う

#### ステップ 3: `~/.claude/settings.json` への hook 登録

既存の `settings.json` を読み込み、`hooks` セクションに以下を **マージ**（上書きではなく追記）する。既に gle の hook が登録されている場合はスキップ。

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

`settings.json` が存在しない場合は新規作成する。

バックアップ: 変更前の `settings.json` を `~/.claude/settings.json.gle-backup` として保存する。

#### ステップ 4: git hook の設定

`gle install` は以下の優先順位で hook の設置方法を自動判定する。

**判定ロジック:**

```
プロジェクトルートに .husky/ ディレクトリが存在する？
  YES → [Husky モード] .husky/prepare-commit-msg に追記
  NO  → core.hooksPath が既に設定されている？
          YES → 設定済みの hooksPath ディレクトリに prepare-commit-msg を配置
          NO  → [通常モード] ~/.gle/hooks/ に配置し core.hooksPath をグローバル設定
```

---

**[Husky モード]**

`.husky/prepare-commit-msg` が存在しない場合は新規作成:

```sh
#!/usr/bin/env sh
# gle: AI commit message generator
node "$(npm root)/.bin/gle" _prepare-commit-msg "$@"
```

既に `.husky/prepare-commit-msg` が存在する場合は末尾に追記:

```sh
# gle: AI commit message generator
node "$(npm root)/.bin/gle" _prepare-commit-msg "$@"
```

ファイルに実行権限を付与する（`chmod +x`）。  
`git config --global core.hooksPath` は変更しない。

---

**[通常モード]**

```bash
git config --global core.hooksPath ~/.gle/hooks
```

`~/.gle/hooks/prepare-commit-msg` を作成し実行権限を付与する。

#### ステップ 5: 完了表示

```
✓ Claude Code hooks を登録しました (~/.claude/settings.json)
✓ git global hook を設定しました (~/.gle/hooks)

gle のセットアップが完了しました。
次回 Claude Code セッションから自動でコンテキストが収集されます。

アンインストール: gle uninstall
```

### 3.3 `gle uninstall` の処理内容

- `~/.claude/settings.json` から gle の hook エントリを削除
- `~/.gle/hooks/prepare-commit-msg` を削除
- `git config --global --unset core.hooksPath` を実行（ただし、他のツールが hooksPath を使っていた場合は削除せず警告のみ）
- `~/.claude/settings.json.gle-backup` が存在する場合、復元するか確認する

---

## 4. Claude Code Hook 実装仕様

### 4.1 UserPromptSubmit Hook

**ファイル**: `lib/hooks/user-prompt-submit.js`  
**トリガー**: Claude Code でユーザーがプロンプトを送信するたびに発火  
**非同期**: false（同期。ただし処理は軽量なので問題なし）

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
2. `cwd` フィールドで git リポジトリか確認  
   `git -C <cwd> rev-parse --git-dir` を実行  
   失敗（git リポジトリ外）の場合は何もせず exit 0
3. `.git/GLE_COMMIT_CONTEXT.md` のパスを解決
4. ファイルが存在しない場合は `<!-- gle context -->` ヘッダ付きで新規作成
5. 以下を追記:
   ```markdown
   
   ## <ISO8601タイムスタンプ>
   
   ### prompt
   <prompt の内容>
   ```
6. exit 0

**エラーハンドリング**:
- ファイル書き込みエラーは stderr に出力し exit 0（非ブロッキング）
- JSON パースエラーは stderr に出力し exit 0

**注意**: `UserPromptSubmit` の stdout は Claude が見えるコンテキストに追加されるため、stdout には何も出力しない。

### 4.2 Stop Hook

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

`content` が文字列の場合はそのまま使用。配列の場合は `type: "text"` のブロックを連結する。

**エラーハンドリング**:
- `transcript_path` が存在しない、または読み込めない場合は何もせず exit 0
- JSONL の各行のパースエラーはスキップして処理を継続
- async hook なので exit コードは Claude の動作に影響しない

---

## 5. git Hook 実装仕様

### 5.1 prepare-commit-msg Hook

**ファイル**: `~/.gle/hooks/prepare-commit-msg`  
**トリガー**: `git commit` 実行時、エディタが開く前

**引数**:
- `$1`: COMMIT_EDITMSG ファイルのパス
- `$2`: コミットのソース（`message` / `template` / `merge` / `squash` / `commit`）
- `$3`: コミット SHA（`--amend` 時のみ）

**スキップ条件**:

以下のいずれかに該当する場合は何もせず exit 0:
- `$2` が `merge` または `squash`（マージコミット・スカッシュコミットは生成しない）
- `$2` が `commit`（`--amend` の場合はスキップ）
- `GEMINI_API_KEY` 環境変数が未設定
- `.git/GLE_COMMIT_CONTEXT.md` が存在しない、かつ staged diff が空

**処理フロー**:

1. スキップ条件の確認
2. `git diff --cached --find-renames --stat` で diff サマリーを取得
3. `git diff --cached --find-renames -- . ':(exclude)*.lock' ':(exclude)package-lock.json'` で diff 本文を取得（最大 8000 文字に切り詰め）
4. リネーム検出の前処理:  
   `git diff --cached --diff-filter=R --name-status --find-renames` でリネームされたファイルのリストを取得し、diff が肥大化していた場合にリネーム情報として整形
5. `.git/GLE_COMMIT_CONTEXT.md` を読み込む（存在しない場合は空文字）
6. Gemini Flash API にリクエスト（後述のプロンプトフォーマット参照）
7. レスポンスを `$1`（COMMIT_EDITMSG）に書き込む
8. `.git/GLE_COMMIT_CONTEXT.md` を空にリセット（ヘッダ行のみ残す）
9. exit 0

**エラーハンドリング**:
- Gemini API エラー（ネットワーク、認証失敗等）の場合: stderr にエラーを出力し、COMMIT_EDITMSG を変更せず exit 0。ユーザーは通常通りエディタでメッセージを書ける。
- タイムアウト: 15 秒

### 5.2 diff 前処理仕様

**リネーム検出**:

```bash
git diff --cached --find-renames=50% --diff-filter=R --name-status
```

出力例:
```
R095    src/old/auth.ts    src/new/auth.ts
R100    src/old/user.ts    src/new/user.ts
```

リネームされたファイルが 3 件以上ある場合、diff 本文の代わりに以下の整形済みテキストを使用:

```
[リネーム検出: 5件]
- src/old/auth.ts → src/new/auth.ts (similarity: 95%)
- src/old/user.ts → src/new/user.ts (similarity: 100%)
...（リネーム後にさらに変更があるファイルは別途 diff に含める）
```

リネーム後にさらに内容変更がある場合（`git diff --cached --diff-filter=M` で検出）は、そのファイルの diff だけを別途取得して付加する。

**ロックファイル除外**:

以下のファイルは diff から除外する:
- `*.lock`
- `package-lock.json`
- `yarn.lock`
- `pnpm-lock.yaml`
- `Cargo.lock`
- `Gemfile.lock`

**diff 文字数制限**:

diff 本文は最大 8000 文字。超過した場合は切り詰め、その旨をプロンプトに明記する。

---

## 6. Gemini API 仕様

### 6.1 使用モデル

`gemini-2.0-flash` （コスト・速度のバランスが最適）

### 6.2 リクエスト仕様

**エンドポイント**:
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=<GEMINI_API_KEY>
```

**プロンプトフォーマット**:

```
あなたは git コミットメッセージの専門家です。
以下の情報をもとに、簡潔で明確なコミットメッセージを生成してください。

## ルール
- 1行目: 命令形・現在形で50文字以内の要約（例: "Add JWT authentication"）
- 空行
- 本文: 変更の理由と内容を箇条書きで記述（省略可）
- Conventional Commits 形式（feat:, fix:, refactor: 等）を推奨
- 言語: diffとコンテキストの言語に合わせる

## 作業コンテキスト（AI セッションログ）
<GLE_COMMIT_CONTEXT.md の内容。空の場合は「なし」>

## diff サマリー
<git diff --stat の出力>

## diff 詳細
<diff 本文（最大8000文字）>

コミットメッセージのみを出力してください。説明や前置きは不要です。
```

**パラメータ**:
```json
{
  "generationConfig": {
    "temperature": 0.2,
    "maxOutputTokens": 512
  }
}
```

### 6.3 レスポンス処理

- `candidates[0].content.parts[0].text` からテキストを取得
- 先頭・末尾の空白をトリム
- `` ``` `` で囲まれていた場合は除去
- COMMIT_EDITMSG に書き込む際、既存の内容（テンプレートがある場合）をコメント行として末尾に残す

---

## 7. CLI コマンド仕様

### 7.1 コマンド一覧

| コマンド | 説明 |
|---|---|
| `gle install` | セットアップを実行 |
| `gle uninstall` | セットアップを取り消す |
| `gle status` | 現在の設定状態を表示 |
| `gle context` | 現在の `.git/GLE_COMMIT_CONTEXT.md` の内容を表示 |
| `gle context --clear` | `.git/GLE_COMMIT_CONTEXT.md` を手動でリセット |
| `gle generate` | コミットせずにメッセージだけ生成して stdout に出力 |
| `gle --version` | バージョン表示 |
| `gle --help` | ヘルプ表示 |

### 7.2 `gle status` の出力例

```
gle status

Claude Code hooks:
  ✓ UserPromptSubmit  登録済み (~/.claude/settings.json)
  ✓ Stop              登録済み (~/.claude/settings.json)

git global hook:
  ✓ prepare-commit-msg  (~/.gle/hooks/prepare-commit-msg)
  ✓ core.hooksPath      ~/.gle/hooks

環境変数:
  ✓ GEMINI_API_KEY      設定済み

現在のコンテキスト:
  プロジェクト: /home/user/my-project
  ✓ GLE_COMMIT_CONTEXT.md  3件のエントリ
```

### 7.3 `gle generate` の動作

`prepare-commit-msg` と同じロジックでメッセージを生成し、stdout に出力するのみ。COMMIT_EDITMSG は変更しない。コンテキストファイルもリセットしない。デバッグ・プレビュー用途。

---

## 8. ファイル・ディレクトリ構成

### 8.1 インストール後の生成物

```
~/.claude/
└── settings.json          # gle の hook エントリが追記される

~/.gle/
└── hooks/
    └── prepare-commit-msg  # git global hook (実行権限付き)

<project>/.git/
└── GLE_COMMIT_CONTEXT.md   # コミットごとにリセットされるコンテキスト
```

### 8.2 package.json の主要フィールド

```json
{
  "name": "gle",
  "version": "0.1.0",
  "bin": {
    "gle": "./bin/gle.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "node-fetch": "^3.0.0"
  }
}
```

依存は最小限に保つ。`node-fetch` のみ（Node.js 18 以上であれば組み込みの `fetch` を使うことも検討）。

---

## 9. エッジケースと制約

### 9.1 コンテキストなしでのコミット

`.git/GLE_COMMIT_CONTEXT.md` が存在しない、または空の場合でも `prepare-commit-msg` hook は動作する。diff 情報のみで生成する。精度は下がるが動作は保証する。

### 9.2 複数ターミナルでの並行作業

複数のターミナルで Claude Code セッションを並行して動かしている場合、それぞれの `UserPromptSubmit` / `Stop` hook が同じ `.git/GLE_COMMIT_CONTEXT.md` に追記する。ファイルへの書き込みはアトミックではないため、競合の可能性がある。v0.1 ではこのケースへの対策は行わない（README に記載して注意喚起のみ）。

### 9.3 git リポジトリ外での Claude Code 使用

`git rev-parse --git-dir` が失敗した場合、hook は何もせず exit 0。Claude Code の通常動作に影響しない。

### 9.4 `--amend` コミット

`prepare-commit-msg` の `$2` 引数が `commit` の場合はスキップ。既存メッセージを上書きしない。

### 9.5 Husky との共存

Husky が検出された場合（プロジェクトルートに `.husky/` が存在）、gle は Husky モードで動作する。

**検出方法**: `git rev-parse --show-toplevel` で得たプロジェクトルートに `.husky/` ディレクトリが存在するか確認。

**Husky モードでの `gle uninstall`**:

`.husky/prepare-commit-msg` 内の gle が追記した行を削除する。ファイルが gle のエントリのみになった場合はファイルごと削除する。`core.hooksPath` は変更しない。

**Husky v8 以前への対応**:

v8 は `package.json` の `husky.hooks` フィールドで設定する形式だった。v8 を検出した場合（`.husky/` が存在しない、かつ `package.json` に `"husky"` キーが存在する）は、通常モードにフォールバックし、以下の警告を表示する:

```
⚠ Husky v8 が検出されました。gle は Husky v9+ のみ自動対応します。
  手動で .husky/prepare-commit-msg を作成するか、Husky を v9 にアップグレードしてください。
  詳細: https://github.com/gle-dev/gle#husky-v8
```

**その他の `core.hooksPath` 競合**:

Husky 以外のツールが `core.hooksPath` を設定している場合、設定済みのパスに `prepare-commit-msg` を配置し、`~/.gle/hooks/` への変更は行わない。その旨を表示する。

### 9.6 `settings.json` の JSON 破損

`~/.claude/settings.json` が不正な JSON の場合、パースエラーを表示してインストールを中断する。ユーザーが手動で修正するよう案内する。

---

## 10. セキュリティ

- `GEMINI_API_KEY` はファイルに書き込まない。環境変数のみで参照する。
- `.git/GLE_COMMIT_CONTEXT.md` はプロジェクトの git 管理対象外（`.git/` 直下）。リポジトリにプッシュされない。
- `prepare-commit-msg` hook は `GEMINI_API_KEY` が未設定の場合は API コールを行わない。
- hook スクリプトは stdin の JSON のみを信頼する。環境変数 `PATH` は最小限の操作のみ行う。

---

## 11. 今後の拡張候補（v0.1 対象外）

- Codex CLI 対応（`~/.codex/` ログ or shell preexec）
- OpenAI API / ローカル LLM のサポート
- `.glerc` による設定ファイルサポート（使用モデル、プロンプトカスタマイズ、除外パターン等）
- `gle context --edit` でコミット前にコンテキストを手動編集
- Conventional Commits の type を対話的に選択するモード
- VS Code 拡張連携