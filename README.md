# ctx-gleaner

> Commit message generator that understands why, not just what.

---

## TL;DR
CTX-GLEANER do the following:
1. Captures the user prompt, and the assistant's partial response, during an AI coding session.
2. Refines diffs to extract high-signal summaries
3. Combines both to generate commit messages that explain why changes were made, not just what changed.

## The Problem

AI coding assistants have changed how we write code. They have not changed how we document it.

When you use Claude Code, the why behind every change lives in your prompts: "replace JWT with session auth because the mobile client cannot handle token refresh", "split the renderer because tests are timing out", "keep the old config path because production still depends on it".

By the time you run `git commit`, that context is gone. All that remains is a diff.

A diff tells you **what** changed. It usually cannot tell you **why**.

Existing commit message generators are mostly built around the same assumption: `git diff` is enough. It is not.

They produce messages like:

```text
Update auth.ts
```

or:

```text
Refactor authentication middleware
```

---

## Why this happens

The problem is structural.

* Git tracks **state transitions**
* AI sessions contain **intent and reasoning**
* These two systems do not intersect

By the time a commit is created, the only available input is the diff.
The original reasoning is already lost.

Trying to reconstruct intent from a diff is fundamentally unreliable.

---

## Design Principles

ctx-gleaner is built around three constraints:

### 1. The source of truth for "why" is outside Git

The diff is not incomplete.
It is the wrong data source for intent.

### 2. Context must be captured at creation time

Intent cannot be reconstructed later.
It must be recorded when it is produced.

### 3. Token usage must be controlled

Raw diffs are noisy and expensive.
Signal must be extracted before sending anything to a model.

---

## How ctx-gleaner works

ctx-gleaner combines two independent layers.

### Layer 1: Diff refinement

Before sending anything to an LLM, the diff is transformed into a higher-signal representation.

* Rename detection replaces large move operations with compact summaries
* Lock files are excluded entirely
* Diff size is capped (`maxDiffChars`)

This reduces noise and keeps input predictable.

---

### Layer 2: Session context capture

When using an AI coding CLI, ctx-gleaner captures the missing half: intent.

With Claude Code, it hooks into the event system:

* `UserPromptSubmit` → captures the user’s intent
* `Stop` → captures the assistant’s outcome

Both are appended to:

```
.git/GLE_COMMIT_CONTEXT.md
```

At commit time, the message is generated from:

```
refined diff + session context
```

This is the key difference.

Not reconstructing intent.
Preserving it.

---

## Example context

```markdown
## 2026-05-01T10:23:11+09:00

### prompt
Replace JWT auth with session-based auth, fix the related tests

### stop
Rewrote the auth middleware to use express-session. Removed jsonwebtoken
dependency. Updated 7 tests, all passing.
```

---

## Usage

```bash
claude          # work as usual
git add .
gle commit      # generate commit message from context + diff
```

```bash
# For more control:
gle commit --edit
gle commit -m "msg"
gle context
gle context --clear
gle status
```

After a successful commit, context is cleared automatically.

---

## Installation

```bash
npm install -g ctx-gleaner
gle install
```

This installs hooks into:

```
~/.claude/settings.json
```

Run `gle prepare` in each repository where context collection should be enabled. Claude and post-commit hooks do not create or update `.gle` files in unprepared repositories.

---

## Configuration

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "maxDiffChars": 8000,
  "language": "auto"
}
```

Environment variables:

```bash
export GLE_PROVIDER=gemini
export GLE_GEMINI_API_KEY=...
```

---

## Supported providers

* Gemini (default)
* OpenAI-compatible endpoints (LiteLLM, Ollama, etc.)

---

## Commands

| Command       | Description               |
| ------------- | ------------------------- |
| `gle install` | Install Claude Code hooks |
| `gle prepare` | Enable context collection and cleanup in this repository |
| `gle commit`  | Generate commit message   |
| `gle context` | Show captured context     |
| `gle status`  | Show configuration        |

---

## Limitations

* Parallel sessions may interleave context
* Without session context, it falls back to diff-only generation
* Does not modify normal `git commit` behavior

---

## License

MIT
