# ctx-gleaner

> Context-aware commit message generator for Claude Code.

---

## The Problem

AI coding assistants have changed how we write code. They have not changed how we document it.

When you use Claude Code, the why behind every change lives in your prompts: "replace JWT with session auth because the mobile client cannot handle token refresh", "split the renderer because tests are timing out", "keep the old config path because production still depends on it".

By the time you run `git commit`, that context is gone. All that remains is a diff.

A diff tells you **what** changed. It usually cannot tell you **why**.

Existing commit message generators are mostly built around the same assumption: `git diff` is enough. It is not. They produce messages like:

```text
Update auth.ts
```

or, if you are lucky:

```text
Refactor authentication middleware
```

Neither tells the next developer, or future you, why the change happened, what tradeoff was made, or what was intentionally left alone.

The real context is in the Claude Code session. The problem is getting it out without wrapping shells, scraping logs after the fact, or changing normal Git behavior.

---

## Why This Is Hard

The obvious solution is to pipe Claude Code's output somewhere. That does not work.

Claude Code runs interactively and writes directly to the tty. There is no stable stdout stream that represents the session. Scraping `~/.claude/` JSONL logs after the fact requires timestamp heuristics to guess which session belongs to which commit, and those heuristics break silently in multi-terminal workflows.

Shell wrappers can intercept commands before Claude Code starts, but they require editing the user's shell config. That is a high-trust ask for an OSS tool, and it is fragile across shells.

ctx-gleaner uses **Claude Code's official Hooks API**. `UserPromptSubmit` captures the user's intent at the moment it is submitted, and `Stop` captures the tail of the assistant response after work completes. The collected context is stored inside the repo's `.git/` directory, so it never becomes a tracked file.

---

## How It Works

### Step 1: Collect context inside the Claude Code session

ctx-gleaner registers two hooks in `~/.claude/settings.json`:

**`UserPromptSubmit`** fires when you send a prompt. ctx-gleaner appends the prompt to `.git/GLE_COMMIT_CONTEXT.md`. This captures intent.

**`Stop`** fires when Claude finishes a response. ctx-gleaner reads the transcript path provided by Claude Code, extracts the last assistant text message, truncates it to the tail, and appends it to the same context file. This captures the work summary.

The context file lives here:

```text
<repo>/.git/GLE_COMMIT_CONTEXT.md
```

Example:

```markdown
<!-- gle context -->

## 2026-05-01T10:23:11+09:00

### prompt
Replace JWT auth with session-based auth, fix the related tests

### stop
Rewrote the auth middleware to use express-session. Removed jsonwebtoken
dependency. Updated 7 tests, all passing.

---

## 2026-05-01T11:05:33+09:00

### prompt
Remove the jwt package from package.json, it is no longer needed
```

### Step 2: Commit

Use `gle commit` when you want generation.

`gle commit` reads staged changes and `.git/GLE_COMMIT_CONTEXT.md`, generates a message through the configured provider, writes it to a temporary commit message file, and then runs:

```bash
git commit -F <generated-message-file> <your flags>
```

Normal `git commit` is not replaced. If the optional `post-commit` hook is installed, a normal successful `git commit` only clears stale collected context so it does not leak into a later `gle commit`.

```bash
gle commit                   # generate a message, then commit
gle commit --edit            # generate, open editor, then commit
gle commit -a                # pass through to git commit
gle commit -m "message"      # generation skipped; plain git commit
gle commit --amend           # generation skipped; plain git commit --amend
```

After a successful generated commit, `.git/GLE_COMMIT_CONTEXT.md` is reset to the header only.

---

## Token and Cost Design

This is where most AI commit tools cut corners. ctx-gleaner is deliberately conservative about the context it sends.

**Rename detection.** Large `git mv` operations can explode into deletion-plus-addition diffs. ctx-gleaner runs rename detection and, when there are many renames, sends a compact rename summary instead of a huge low-signal diff:

```text
[リネーム検出: 5件]
- src/old/auth.ts -> src/new/auth.ts (similarity: 95%)
- src/old/user.ts -> src/new/user.ts (similarity: 100%)
```

Files that were renamed and also modified keep their content diff, so signal is preserved while rename noise is reduced.

**Lock file exclusion.** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, and `*.lock` are excluded from the prompt diff. These files often dominate token usage while adding little value to a commit message.

**Diff truncation.** The diff body is capped by `maxDiffChars` (default `8000`). If it is truncated, the prompt says so explicitly.

**Model choice.** The default Gemini model is `gemini-2.5-flash`. It is a low-latency model suitable for constrained generation tasks like commit messages. OpenAI and LiteLLM are also supported for users who want a different provider or a local gateway.

**Async Stop hook.** The `Stop` hook is registered as async, so transcript extraction does not add latency to Claude Code's response loop.

---

## Requirements

- Node.js `>=18`
- Git
- Claude Code
- One provider API key

---

## Installation

```bash
npm install -g ctx-gleaner
gle install
```

ctx-gleaner is installed globally because Claude Code hooks are stored in the global `~/.claude/settings.json`. A per-project `--save-dev` install would make those hooks point at that project's `node_modules`, which breaks when the project is moved, removed, or used only as a temporary install check.

`gle install` does three things:

- Registers `UserPromptSubmit` and `Stop` hooks in `~/.claude/settings.json`
- Backs up the previous settings file to `~/.claude/settings.json.gle-backup`

`gle install` is user-level and does not require a Git repository. Claude hooks are safe in repositories where you do not use ctx-gleaner: if the current working directory is not a Git repository, the hooks exit without output.

For repo-level cleanup after normal `git commit`, run this inside each repository where you want stale context to be cleared automatically:

```bash
gle prepare
```

For projects using Husky v9+, `gle prepare` appends to `.husky/post-commit`. Otherwise it uses an existing `core.hooksPath` if present, or creates `~/.gle/hooks`.

---

## Configuration

Configuration is user-level, not project-level. Project `.glerc.json` is not used.

Resolution order:

1. Environment variables
2. `~/.gle/glerc.json`
3. Defaults

### Environment

```bash
export GLE_PROVIDER=gemini
export GLE_GEMINI_API_KEY="your-api-key"
```

Supported variables:

- `GLE_PROVIDER`
- `GLE_GEMINI_API_KEY`
- `GLE_OPENAI_API_KEY`
- `GLE_LITELLM_API_KEY`
- `GLE_LITELLM_BASE_URL`
- `GLE_LITELLM_MODEL`

### `~/.gle/glerc.json`

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "maxDiffChars": 8000,
  "language": "auto"
}
```

You can also put a full prompt in `prompt`, but for longer prompt customization prefer `~/.gle/prompt.md`.

### `~/.gle/prompt.md`

Use this file to customize the commit-message prompt without putting large text in JSON.

If both are present, `~/.gle/glerc.json`'s `prompt` field wins over `~/.gle/prompt.md`.

---

## Usage

```bash
claude
git add .
gle commit
```

Inspect collected context:

```bash
gle context
```

Clear collected context manually:

```bash
gle context --clear
```

Check setup:

```bash
gle status
```

---

## Commands

| Command | Description |
|---|---|
| `gle install` | Register global Claude Code hooks |
| `gle prepare` | Install repo-level post-commit context cleanup |
| `gle uninstall` | Remove ctx-gleaner hook entries |
| `gle commit [git flags]` | Generate a message from context + staged diff, then commit |
| `gle status` | Show setup, provider, config, and context status |
| `gle context` | Print `.git/GLE_COMMIT_CONTEXT.md` |
| `gle context --clear` | Reset context manually |
| `gle --version` | Print version |
| `gle --help` | Print help |

---

## Limitations

**Parallel Claude Code sessions.** Multiple Claude Code instances in the same repo write to the same context file. Entries may interleave.

**Context-free commits.** If no Claude context exists, `gle commit` can still generate from diff only, but the message will have less information about intent.

**Normal Git commits.** `git commit` never generates a message. With the cleanup hook installed, it only clears stale context after a successful commit.

**Merge commits and amend.** `gle commit --amend` and merge commits skip generation and fall back to Git behavior.

**Claude Code only.** v0.3 supports Claude Code hooks. Codex CLI and GitHub Copilot are outside this version.

---

## Development

```bash
npm install
npm run build
npm test
npm pack
```

---

## License

MIT
