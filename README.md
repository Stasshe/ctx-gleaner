# ctx-gleaner

> Context-aware commit message generator for Claude Code.

---

## The Problem

AI coding assistants have changed how we write code. They haven't changed how we document it.

When you use Claude Code, the *why* behind every change lives in your prompts — "replace JWT with session auth because the mobile client can't handle token refresh" — but that context evaporates the moment the session ends. By the time you run `git commit`, all that's left is a diff.

A diff tells you **what** changed. It cannot tell you **why**.

Existing commit message generators are all built around the same assumption: that `git diff` is enough. It isn't. They produce messages like:

```
Update auth.ts
```

or, if you're lucky:

```
Refactor authentication middleware
```

Neither tells the next developer — or future you — why this change happened, what tradeoff was made, or what was intentionally left behind.

The real context is in your Claude Code session. The problem is getting it out.

---

## Why This Is Hard

The obvious solution is to pipe Claude Code's output somewhere. It doesn't work.

Claude Code runs in interactive mode, writing directly to the tty. There's nothing to intercept. Scraping `~/.claude/` JSONL logs after the fact requires timestamp-based heuristics to guess which session corresponds to which commit — and those heuristics break silently in any multi-terminal workflow.

Shell-level wrappers (`preexec` hooks in zsh) can intercept the command line before Claude Code launches, but they require modifying the user's shell config — a high-trust ask for an OSS tool, and it breaks for anyone not on zsh.

gle solves this using **Claude Code's official Hooks API** — the only mechanism that fires deterministically inside the agent loop, with no shell modification required.

---

## How gle Works

### Step 1 — Collect context inside the Claude Code session

gle registers two hooks via `~/.claude/settings.json`:

**`UserPromptSubmit`** fires every time you send a prompt. gle writes the prompt text to `.git/GLE_COMMIT_CONTEXT.md`. This is your intent — the *why*.

**`Stop`** fires every time Claude finishes a response. gle reads the session transcript (`transcript_path` from the hook payload) and appends the tail of the last assistant message. This is the *what actually happened* — a complement to your intent when the implementation diverged from the prompt.

Both hooks write to `.git/GLE_COMMIT_CONTEXT.md`, which lives inside `.git/` and is therefore never tracked by git. No `.gitignore` entry needed.

The context file looks like this after a session:

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
Remove the jwt package from package.json, it's no longer needed
```

### Step 2 — Generate the message at commit time

When you run `git commit`, a `prepare-commit-msg` hook fires. gle:

1. Runs `git diff --cached` with rename detection and lock file exclusion
2. Reads `.git/GLE_COMMIT_CONTEXT.md`
3. Sends both to Gemini Flash
4. Writes the generated message into your editor
5. Resets the context file

You review the message, adjust if needed, and save. Done.

---

## Token and Cost Design

This is where most AI commit tools cut corners. gle doesn't.

**Rename detection.** `git mv` produces diffs that look like a full file deletion plus a full file addition — even for a one-character rename. For large refactors involving directory restructuring, this can balloon a diff to tens of thousands of tokens. gle runs `git diff --cached --find-renames=50% --diff-filter=R` before building the prompt. Renamed files are replaced with a compact summary:

```
[Renames detected: 5]
- src/old/auth.ts → src/new/auth.ts (similarity: 95%)
- src/old/user.ts → src/new/user.ts (similarity: 100%)
```

Files that were renamed *and* modified get their actual diff appended separately — so content changes are preserved, only the noise is removed.

**Lock file exclusion.** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, and `Gemfile.lock` are excluded from the diff automatically. These files routinely account for the majority of tokens in a diff while contributing zero signal to a commit message.

**Diff truncation.** The diff body is capped at 8,000 characters. If truncated, the prompt notes this explicitly so the model doesn't hallucinate about code it hasn't seen.

**Model choice.** gle uses `gemini-2.0-flash`. It has a large context window (useful for big diffs), low latency (you're waiting on a commit), and a free tier generous enough that typical commit message generation costs effectively nothing. For structured, constrained generation tasks like this, Flash performs on par with larger models at a fraction of the cost.

**`Stop` hook is async.** The transcript read and append runs with `async: true`, so it never blocks Claude Code's response cycle. Zero added latency to your Claude Code workflow.

---

## Requirements

- Node.js >= 18
- [Claude Code](https://claude.ai/code)
- Gemini API key — free at [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Installation

**Per-project (recommended)**

```bash
npm install --save-dev gle
npx gle install
```

**Global**

```bash
npm install -g gle
gle install
```

`gle install` does three things:

- Registers `UserPromptSubmit` and `Stop` hooks in `~/.claude/settings.json` (backs up the existing file first)
- Sets up `prepare-commit-msg` git hook (see Husky below)
- Guides you through setting `GEMINI_API_KEY`

**Set your API key**

```bash
# Add to ~/.zshrc or ~/.bashrc
export GEMINI_API_KEY="your-api-key"
```

### Husky

gle auto-detects Husky v9+. If `.husky/` exists in your project root, gle writes to `.husky/prepare-commit-msg` instead of touching `core.hooksPath`. If the file already exists, gle appends to it — your existing hooks are untouched.

Husky v8 (configured via `package.json`) is not auto-detected. See [Husky v8 manual setup](#husky-v8).

---

## Usage

After install, just work normally.

```bash
# Work with Claude Code as usual
claude

# Commit as usual
git add .
git commit
# gle generates the message and inserts it into your editor
```

**Preview before committing**

```bash
gle generate
# Prints the generated message to stdout without committing or resetting context
```

**Inspect or clear context**

```bash
gle context          # Show the current context file
gle context --clear  # Reset manually (e.g. after discarding work)
```

**Check setup**

```bash
gle status
```

---

## Commands

| Command | Description |
|---|---|
| `gle install` | Run setup |
| `gle uninstall` | Remove all gle configuration |
| `gle status` | Show current setup state |
| `gle context` | Print the current context file |
| `gle context --clear` | Reset context manually |
| `gle generate` | Preview generated message without committing |
| `gle --version` | Print version |
| `gle --help` | Print help |

---

## Limitations

**Parallel Claude Code sessions.** If you run multiple Claude Code instances in separate terminals against the same repo, their hooks write to the same context file. Entries may interleave. v0.1 does not handle this — context from both sessions will be included in the next commit message.

**Context-free commits.** If you commit without having used Claude Code (direct edits, etc.), the context file will be empty. gle falls back to diff-only generation. The message will be less informative about intent.

**Merge and amend commits.** gle skips generation for `git merge` and `git commit --amend`. Your editor opens normally.

**Claude Code only.** v0.1 supports Claude Code hooks only. Codex CLI and GitHub Copilot are on the roadmap.

---

## Roadmap

- [ ] Codex CLI support
- [ ] OpenAI API / local LLM support
- [ ] `.glerc` config file (model selection, prompt customization, exclude patterns)
- [ ] `gle context --edit` — edit context before committing

---

## License

MIT