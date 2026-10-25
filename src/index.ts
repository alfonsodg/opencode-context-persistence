import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const plugin: Plugin = {
  id: "context-persistence",
  setup: async (ctx: { directory: string; worktree?: string }) => {
    const agentsPath = join(ctx.worktree || ctx.directory, "AGENTS.md")

    const readAgents = (): string => {
      try {
        if (existsSync(agentsPath)) {
          return readFileSync(agentsPath, "utf-8")
        }
      } catch {
        // ignore read errors
      }
      return ""
    }

    return {
      "experimental.session.compacting": async (_input: any, output: any) => {
        const agents = readAgents()
        if (agents) {
          output.context.push(`
## Re-injected AGENTS.md (context persistence)
The following rules were re-injected after compaction to prevent context loss.
Follow them without exception:

${agents}
`)
        }
      },
    }
  },
}

export default plugin