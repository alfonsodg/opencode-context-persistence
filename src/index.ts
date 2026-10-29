import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export default {
  id: "context-persistence",
  async setup(ctx: any) {
    const directory =
      typeof ctx?.location?.directory === "string"
        ? ctx.location.directory
        : typeof ctx?.directory === "string"
          ? ctx.directory
          : process.cwd()

    const agentsPath = join(directory, "AGENTS.md")

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

    if (ctx?.session?.hook) {
      ctx.session.hook("compaction", async (event: any) => {
        const agents = readAgents()
        if (!agents) return
        const text = `## Re-injected AGENTS.md (context persistence)\n${agents}`
        if (Array.isArray(event?.context)) {
          event.context.push(text)
        } else if (Array.isArray(event?.options?.context)) {
          event.options.context.push(text)
        } else if (typeof event?.prompt === "string") {
          event.prompt += `\n\n${text}`
        }
      })
    }
  },
}