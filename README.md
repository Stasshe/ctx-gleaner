# ctx-gleaner

> Commit message generator that understands why, not just what.

---

## The Problem

Commit message generators built on `git diff` produce messages like:

```text
Update auth.ts
```

or, with effort:

```text
Refactor authentication middleware
```

Neither tells the next developer why the change happened, what tradeoff was made, or what was intentionally left alone. The why lives in your prompts to your AI coding assistant — "replace JWT with session auth because the mobile client can't handle token refresh", "split the renderer because tests are timing out" — and it disappears when the session ends.

ctx-gleaner solves this at two levels.

**Level 1: Better diff handling, on its own.** Rename detection, lock file exclusion, and a token budget mean the input to the LLM is cleaner and cheaper than what diff-only tools send. This works regardless of how you write code.

**Level 2: Session context.** When you are working with an AI coding CLI, ctx-gleaner hooks into its event system to capture your prompts and the assistant's work summaries. At commit time, the generated message includes the *why*, not just the *what*.

Currently supported: **Claude Code** (via its Hooks API). Other AI CLIs are on the roadmap.

---

## Diff Handling

Most commit message generators send the raw `git diff` to an LLM and call it done. ctx-gleaner preprocesses before sending.

**Rename detection.** Large `git mv` operations explode into deletion-plus-addition diffs that can be thousands of lines of near-zero-signal noise. ctx-gleaner detects renames and replaces them with a compact summary:

```text
[Renamed: 5 files]
- src/old/auth.ts → src/new/auth.ts (similarity: 95%)
- src/old/user.ts → src/new/user.ts (similarity: 100%)
```

Files that were renamed *and* modified keep their full content diff.

**Lock file exclusion.** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, and `*.lock` are excluded. These files routinely dominate token usage while contributing nothing to a commit message.

**Diff truncation.** The diff body is capped at `maxDiffChars` (default `8000`). When truncated, the prompt says so explicitly so the model does not hallucinate the missing content.

**Model choice.** The default is Gemini with `gemini-2.5-flash` — low latency, well under $0.001 per commit. OpenAI and any OpenAI-compatible endpoint (LiteLLM, Ollama, local models) are also supported.

---

## Session Context (Claude Code)

When using Claude Code, ctx-gleaner registers two hooks in `~/.claude/settings.json`.

**`UserPromptSubmit`** fires when you send a prompt. ctx-gleaner appends the prompt to `.git/GLE_COMMIT_CONTEXT.md`.

**`Stop`** fires when Claude finishes a response. ctx-gleaner reads the transcript, extracts the last assistant message, truncates it to the tail, and appends it to the same file.

The context file lives at `<repo>/.git/GLE_COMMIT_CONTEXT.md` — inside `.git/`, so it is never tracked or pushed.

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

The Stop hook runs **asynchronously** — transcript extraction adds no latency to Claude Code's response loop.

Claude Code hooks are installed globally and are safe in repositories where you do not use ctx-gleaner: if the current working directory is not a Git repository, the hooks exit silently.

---

## Usage

```bash
claude          # work as normal; context is collected automatically
git add .
gle commit      # generate a message from diff + session context, then commit
```

```bash
gle commit --edit    # generate, open editor, then commit
gle commit -m "msg" # skip generation; plain git commit
gle context         # inspect collected context
gle context --clear # clear context manually
gle status          # show setup, provider, config, and context status
```

After a successful generated commit, `.git/GLE_COMMIT_CONTEXT.md` is reset to the header only.

---

## Requirements

- Node.js `>=18`
- Git
- One provider API key
- Claude Code (optional — required only for session context capture)

---

## Installation

```bash
npm install -g ctx-gleaner
gle install
```

ctx-gleaner is installed globally because Claude Code hooks are stored in `~/.claude/settings.json`. A per-project `--save-dev` install would make those hooks point at a specific `node_modules/`, which breaks when the project is removed or moved.

`gle install` does three things:

- Registers `UserPromptSubmit` and `Stop` hooks in `~/.claude/settings.json`
- Backs up the previous settings to `~/.claude/settings.json.gle-backup`
- Creates user config files if missing: `~/.gle/glerc.json` and `~/.gle/prompt.md`

For repo-level context cleanup after a normal `git commit`, run inside each repository where you want stale context cleared automatically:

```bash
gle prepare
```

For projects using Husky v9+, `gle prepare` appends to `.husky/post-commit`. Otherwise it uses an existing `core.hooksPath` if present, or creates `~/.gle/hooks`.

---

## Configuration

User-level only. No project-level `.glerc.json`.

Resolution order: environment variables → `~/.gle/glerc.json` → defaults.

### `~/.gle/glerc.json`

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "maxDiffChars": 8000,
  "language": "auto"
}
```

### `~/.gle/prompt.md`

Customize the generation prompt without embedding large text in JSON. If both `~/.gle/glerc.json`'s `prompt` field and `~/.gle/prompt.md` are present, the JSON field takes precedence.

### Environment variables

```bash
export GLE_PROVIDER=gemini
export GLE_GEMINI_API_KEY="your-api-key"
```

| Variable | Description |
|---|---|
| `GLE_PROVIDER` | `gemini` / `openai` / `litellm` |
| `GLE_GEMINI_API_KEY` | Gemini API key |
| `GLE_OPENAI_API_KEY` | OpenAI API key |
| `GLE_LITELLM_API_KEY` | LiteLLM API key |
| `GLE_LITELLM_BASE_URL` | LiteLLM proxy URL |
| `GLE_LITELLM_MODEL` | Model name for LiteLLM |

API keys are environment-variable-only. Do not put them in `~/.gle/glerc.json`.

---

## Commands

| Command | Description |
|---|---|
| `gle install` | Register Claude Code hooks and create user config |
| `gle prepare` | Install repo-level post-commit context cleanup |
| `gle uninstall` | Remove ctx-gleaner hook entries |
| `gle commit [git flags]` | Generate a message from context + diff, then commit |
| `gle commit --edit [git flags]` | Generate, open editor, then commit |
| `gle status` | Show setup, provider, config, and context status |
| `gle context` | Print `.git/GLE_COMMIT_CONTEXT.md` |
| `gle context --clear` | Reset context manually |
| `gle --version` | Print version |
| `gle --help` | Print help |

---

## Limitations

**Parallel sessions.** Multiple Claude Code instances in the same repo write to the same context file. Entries may interleave.

**Context-free commits.** Without session context, `gle commit` generates from diff only. Diff preprocessing still applies.

**Merge commits and amend.** `gle commit --amend` and merge commits skip generation and fall back to standard `git commit` behavior.

**Normal `git commit`.** ctx-gleaner never intercepts `git commit`. With the cleanup hook installed, it only clears stale context after a successful commit.

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
