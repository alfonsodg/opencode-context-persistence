# opencode-context-persistence

OpenCode V2 plugin that keeps `AGENTS.md` rules in front of the model: a
bounded digest on every request plus the full file in compaction summaries.

## Problem

Long OpenCode sessions compact earlier conversation into a summary, and agents
start ignoring project mandates (issues-first, conventional commits, no
hardcoded values, workspace confinement). Native instruction files are only
loaded when they resolve for the current directory, so projects without their
own `AGENTS.md` lose the rules entirely.

## Solution

The plugin registers two OpenCode V2 session hooks:

- `context`: injects a bounded digest of `AGENTS.md` into `event.system` on
  every model request, and records a durable session instruction entry (once
  per session) that survives compaction.
- `compaction`: injects the full `AGENTS.md` (bounded) into the summarizer
  system prompt so the checkpoint summary preserves the mandates.

Resolution order:

1. `AGENTS.md` in the session directory.
2. Walking up parent directories (up to 20 levels).
3. `~/.config/opencode/AGENTS.md`.
4. `~/.config/opencode/prompts/AGENTS.md`.

Injection is skipped when the system prompt already carries the file, so it
does not duplicate OpenCode's native `instructions` support. Every hook is
wrapped in `try/catch`: a plugin failure never breaks model resolution or a
request.

The `context` hook also stores a durable entry through
`ctx.session.instructions.entry.put` (key `context-persistence/agents-md`) on
the first request of each session. That entry is what keeps the rules visible
after a compaction rewrites the transcript.

## Requirements

- OpenCode `2.x`: uses the V2 `setup(ctx)` contract and `ctx.session.hook`.
- OpenCode `1.18+`: uses the V1 `server()` hooks
  (`experimental.session.compacting`, `experimental.chat.system.transform`).
- No runtime dependencies.

## Installation

### npm

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-context-persistence"]
}
```

### Local file

Copy `src/index.ts` to `~/.config/opencode/plugins/context-persistence.ts`
(global, V2) or `.opencode/plugins/context-persistence.ts` (project). OpenCode
1.x discovers `plugin/` (singular) instead, so use
`~/.config/opencode/plugin/context-persistence.ts` there. Install it in one
directory only: both are scanned on 2.x and two copies of the same `id` are a
duplicate load.

Verify with:

```bash
opencode plugin list
```

## Usage

Place an `AGENTS.md` in the project root, or keep the canonical copy at
`~/.config/opencode/AGENTS.md`. No configuration is required.

## Development

```bash
bun test
```

The E2E check runs an isolated OpenCode server against an OpenAI-compatible
mock, so it never touches the user's sessions or providers:

```bash
export OPENCODE_CONFIG_DIR=/tmp/e2e/config
opencode run --standalone -m localmock/mock-1 "hello"
```

## Author

Alfonso de la Guarda Reyes <alfonsodg@gmail.com>

## License

MIT
