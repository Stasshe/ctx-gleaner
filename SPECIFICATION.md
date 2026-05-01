# gle 仕様書

**バージョン**: 0.1.0-draft  
**最終更新**: 2026-05-01  
**ステータス**: 設計フェーズ

---

## 1. 概要

### 1.1 プロダクトの目的

`gle` は、Claude Code のセッション中に発生した「作業の意図（プロンプト）」と「作業結果の要約」をプロジェクトごとに自動収集し、`gle commit` 実行時に Gemini Flash API を使って高品質なコミットメッセージを自動生成する CLI ツールである。通常の `git commit` / `git commit -m` は変更せず、既存の Git ワークフローを妨げない。

### 1.2 解決する問題

- コミットメッセージを手書きするのが面倒
- `git diff` だけでは「何をしたか（what）」は読めても「なぜしたか（why）」は読めない
- `git mv` や大量ファイルリネーム後の diff が肥大化し、AI に渡すコンテキストとして不適切になる
- Claude Code のインタラクティブセッションの出力をパイプで取ることができない（tty 問題）

### 1.3 解決アプローチ

Claude Code の公式 Hooks 機能（`UserPromptSubmit`, `Stop`）でプロンプトと作業要約を `.git/GLE_COMMIT_CONTEXT.md` に自動蓄積する。コミットメッセージ生成は `gle commit` コマンド内でのみ行い、staged diff と蓄積コンテキストを Gemini Flash に渡して生成する。通常の `git commit` は生成対象外とする。

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

[gle commit 実行時]
  │
  ├─ git diff --cached --find-renames で diff 取得・前処理
  ├─ .git/GLE_COMMIT_CONTEXT.md 読み込み
  ├─ Gemini Flash API にリクエスト
  ├─ 生成されたメッセージを一時ファイルに書き込み
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
│   └── gle.js               # CLI エントリーポイント
├── lib/
│   ├── install.js           # install コマンド実装
│   ├── uninstall.js         # uninstall コマンド実装
│   ├── hooks/
│   │   ├── user-prompt-submit.js  # Claude Code UserPromptSubmit hook
│   │   ├── stop.js                # Claude Code Stop hook
│   │   └── post-commit.js         # context clear hook
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
- `GLE_GEMINI_API_KEY` 環境変数の存在確認

`GLE_GEMINI_API_KEY` が未設定の場合、以下を表示して処理を継続する（警告扱い）:

```
⚠ GLE_GEMINI_API_KEY が設定されていません。
  コミットメッセージ生成を使用するには以下を ~/.zshrc または ~/.bashrc に追記してください:
  export GLE_GEMINI_API_KEY="your-api-key"
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

`gle install` は、コミット成功後のコンテキストクリア用に `post-commit` hook を設定する。

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

ファイルに実行権限を付与する（`chmod +x`）。  
`git config --global core.hooksPath` は変更しない。

---

**[通常モード]**

```bash
git config --global core.hooksPath ~/.gle/hooks
```

`~/.gle/hooks/post-commit` を作成し実行権限を付与する。

**注意**: `post-commit` は補助機能であり、`gle commit` 本体はコミット成功時に自前でコンテキストをクリアする。hook は通常の `git commit` を使った場合の掃除用である。

#### ステップ 5: 完了表示

```
✓ Claude Code hooks を登録しました (~/.claude/settings.json)
✓ git post-commit hook を設定しました (~/.gle/hooks)

gle のセットアップが完了しました。
次回 Claude Code セッションから自動でコンテキストが収集されます。

アンインストール: gle uninstall
```

### 3.3 `gle uninstall` の処理内容

- `~/.claude/settings.json` から gle の hook エントリを削除
- `~/.gle/hooks/post-commit` を削除
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

## 5. コミット生成実装仕様

### 5.1 `gle commit`

**トリガー**: ユーザーが `gle commit [git flags]` を実行したとき

**基本方針**:
- AI 生成は `gle commit` の内部でのみ実行する
- 通常の `git commit` / `git commit -m` / `git commit --amend` は上書きしない
- `gle commit` は標準の `git commit` フラグを可能な限り pass-through する
- コミット成功時のみ `.git/GLE_COMMIT_CONTEXT.md` をリセットする

**スキップ条件:**

以下のいずれかに該当する場合は生成せず、原則として通常の `git commit` にフォールバックする:
- `--amend` が指定されている
- `-m` / `--message` / `-F` / `--file` が指定されており、ユーザーが明示的にメッセージを与えている
- `GLE_GEMINI_API_KEY` 環境変数が未設定
- `.git/GLE_COMMIT_CONTEXT.md` が存在しない、かつ staged diff が空

**処理フロー**:

1. 引数を解析する
2. スキップ条件に該当する場合は `git commit "$@"` を実行する
3. `git diff --cached --find-renames --stat` で diff サマリーを取得
4. `git diff --cached --find-renames -- . ':(exclude)*.lock' ':(exclude)package-lock.json'` で diff 本文を取得（最大 8000 文字に切り詰め）
5. リネーム検出の前処理を行う
6. `.git/GLE_COMMIT_CONTEXT.md` を読み込む（存在しない場合は空文字）
7. Gemini Flash API にリクエストする
8. 生成されたコミットメッセージを一時ファイルに保存する
9. `git commit -F <tempfile> <pass-through flags>` を実行する
10. `git commit` が成功した場合のみ `.git/GLE_COMMIT_CONTEXT.md` を空にリセットする
11. 一時ファイルを削除して exit する

**`--no-edit` の扱い**:

`gle commit --no-edit` は、生成されたメッセージをそのまま採用してコミットする。通常の `git commit --no-edit` と異なり、生成結果を採用する入口として扱う。

**`-m` / `--message` の扱い**:

`gle commit -m "..."` は生成しない。ユーザーが明示的にメッセージを指定しているため、通常の `git commit -m "..."` と同じ意味で扱う。

**`--amend` の扱い**:

`gle commit --amend` は生成しない。既存メッセージを勝手に上書きしないため、通常の `git commit --amend` にフォールバックする。

**エラーハンドリング**:
- Gemini API エラー（ネットワーク、認証失敗等）の場合: stderr にエラーを出力し、通常の `git commit` にフォールバックする
- タイムアウト: 15 秒
- `git commit` が失敗した場合: `.git/GLE_COMMIT_CONTEXT.md` はリセットしない

### 5.1.1 post-commit Hook

**ファイル**: `~/.gle/hooks/post-commit` または `.husky/post-commit`  
**トリガー**: 通常の `git commit` が成功した後

**役割**:
- 通常の `git commit` / `git commit -m` を使った場合でも、古い Claude Code コンテキストが次回の `gle commit` に混ざらないように掃除する
- コミットメッセージ生成は行わない

**処理フロー**:

1. `git rev-parse --git-dir` で `.git` ディレクトリを解決
2. `.git/GLE_COMMIT_CONTEXT.md` が存在する場合、ヘッダ行のみ残してリセット
3. exit 0

**エラーハンドリング**:
- 失敗しても commit 自体はすでに成功しているため、stderr に警告を出して exit 0

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
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=<GLE_GEMINI_API_KEY>
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
| `gle commit [git flags]` | コンテキストと staged diff からメッセージを生成して commit |
| `gle status` | 現在の設定状態を表示 |
| `gle context` | 現在の `.git/GLE_COMMIT_CONTEXT.md` の内容を表示 |
| `gle context --clear` | `.git/GLE_COMMIT_CONTEXT.md` を手動でリセット |
| `gle --version` | バージョン表示 |
| `gle --help` | ヘルプ表示 |

### 7.2 `gle status` の出力例

```
gle status

Claude Code hooks:
  ✓ UserPromptSubmit  登録済み (~/.claude/settings.json)
  ✓ Stop              登録済み (~/.claude/settings.json)

git hook:
  ✓ post-commit         (~/.gle/hooks/post-commit)
  ✓ core.hooksPath      ~/.gle/hooks

環境変数:
  ✓ GLE_GEMINI_API_KEY      設定済み

現在のコンテキスト:
  プロジェクト: /home/user/my-project
  ✓ GLE_COMMIT_CONTEXT.md  3件のエントリ
```

### 7.3 `gle commit` の動作

`gle commit` は、staged diff と `.git/GLE_COMMIT_CONTEXT.md` をもとに Gemini Flash API でコミットメッセージを生成し、そのメッセージを `git commit -F <tempfile>` に渡す。

全フラグは可能な限り `git commit` に pass-through する。ただし、以下は生成をスキップして通常の `git commit` として扱う:

- `-m` / `--message`
- `-F` / `--file`
- `--amend`

存在意義は以下である:

1. 通常の `git commit` を壊さず、AI 生成を明示的な入口に閉じ込める
2. `git commit -m` を従来通り使える状態に保つ
3. `gle commit` を選んだときだけ、Claude Code の文脈を使ったメッセージ生成を行う

**通常の `git commit` との関係**:

`git commit` / `git commit -m` は生成対象外。post-commit hook が設定されている場合、コミット成功後に `.git/GLE_COMMIT_CONTEXT.md` をリセットするだけである。

---

## 8. ファイル・ディレクトリ構成

### 8.1 インストール後の生成物

```
~/.claude/
└── settings.json          # gle の hook エントリが追記される

~/.gle/
└── hooks/
    └── post-commit         # context clear hook (実行権限付き)

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

`.git/GLE_COMMIT_CONTEXT.md` が存在しない、または空の場合でも `gle commit` は動作する。diff 情報のみで生成する。精度は下がるが動作は保証する。

### 9.2 複数ターミナルでの並行作業

複数のターミナルで Claude Code セッションを並行して動かしている場合、それぞれの `UserPromptSubmit` / `Stop` hook が同じ `.git/GLE_COMMIT_CONTEXT.md` に追記する。ファイルへの書き込みはアトミックではないため、競合の可能性がある。v0.1 ではこのケースへの対策は行わない（README に記載して注意喚起のみ）。

### 9.3 git リポジトリ外での Claude Code 使用

`git rev-parse --git-dir` が失敗した場合、hook は何もせず exit 0。Claude Code の通常動作に影響しない。

### 9.4 `--amend` コミット

`gle commit --amend` は生成をスキップし、通常の `git commit --amend` にフォールバックする。既存メッセージを上書きしない。

### 9.5 Husky との共存

Husky が検出された場合（プロジェクトルートに `.husky/` が存在）、gle は Husky モードで動作する。

**検出方法**: `git rev-parse --show-toplevel` で得たプロジェクトルートに `.husky/` ディレクトリが存在するか確認。

**Husky モードでの `gle uninstall`**:

`.husky/post-commit` 内の gle が追記した行を削除する。ファイルが gle のエントリのみになった場合はファイルごと削除する。`core.hooksPath` は変更しない。

**Husky v8 以前への対応**:

v8 は `package.json` の `husky.hooks` フィールドで設定する形式だった。v8 を検出した場合（`.husky/` が存在しない、かつ `package.json` に `"husky"` キーが存在する）は、通常モードにフォールバックし、以下の警告を表示する:

```
⚠ Husky v8 が検出されました。gle は Husky v9+ のみ自動対応します。
  手動で .husky/post-commit を作成するか、Husky を v9 にアップグレードしてください。
  詳細: https://github.com/gle-dev/gle#husky-v8
```

**その他の `core.hooksPath` 競合**:

Husky 以外のツールが `core.hooksPath` を設定している場合、設定済みのパスに `post-commit` を配置し、`~/.gle/hooks/` への変更は行わない。その旨を表示する。

### 9.6 `settings.json` の JSON 破損

`~/.claude/settings.json` が不正な JSON の場合、パースエラーを表示してインストールを中断する。ユーザーが手動で修正するよう案内する。

---

## 10. セキュリティ

- `GLE_GEMINI_API_KEY` はファイルに書き込まない。環境変数のみで参照する。
- `.git/GLE_COMMIT_CONTEXT.md` はプロジェクトの git 管理対象外（`.git/` 直下）。リポジトリにプッシュされない。
- `gle commit` は `GLE_GEMINI_API_KEY` が未設定の場合は API コールを行わない。
- hook スクリプトは stdin の JSON のみを信頼する。環境変数 `PATH` は最小限の操作のみ行う。

---

## 11. 今後の拡張候補（v0.1 対象外）

- Codex CLI 対応（`~/.codex/` ログ or shell preexec）
- OpenAI API / ローカル LLM のサポート
- `.glerc` による設定ファイルサポート（使用モデル、プロンプトカスタマイズ、除外パターン等）
- `gle context --edit` でコミット前にコンテキストを手動編集
- Conventional Commits の type を対話的に選択するモード
- VS Code 拡張連携