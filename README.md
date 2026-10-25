# opencode-context-persistence

OpenCode plugin that re-injects `AGENTS.md` context
after compaction to prevent context loss.

## Problem

Long OpenCode sessions compact older conversation into a summary. When this
happens, project rules in `AGENTS.md` can be dropped, causing the agent to
forget mandates (issues-first, conventional commits, no hardcoded values, etc.).

## Solution

This plugin hooks into `experimental.session.compacting` and injects the
contents of `AGENTS.md` into the compaction context, ensuring the rules
survive compaction.

## Installation

### From npm (when published)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-context-persistence"]
}
```

### From local files

Copy `src/index.ts` to `.opencode/plugins/context-persistence.ts` in your
project, or to `~/.config/opencode/plugins/context-persistence.ts` for global
use.

## Usage

Place an `AGENTS.md` at your project root. The plugin reads it automatically
and re-injects it after every compaction.

## License

MIT
