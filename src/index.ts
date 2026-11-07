import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

/**
 * OpenCode V2 context-persistence plugin.
 *
 * V2 plugins export a definition with an `id` and a `setup(ctx)` function that
 * registers hooks on the owning domain. The V1 helpers (`ctx.session.hook`
 * with a `"compaction"` callback that mutated `event.context`/`event.prompt`)
 * do not exist in V2: both hooks below receive one mutable event with a
 * `system` array of text parts.
 */

const ENTRY_KEY = "context-persistence/agents-md"
const MAX_COMPACTION_CHARS = 12000
const MAX_DIGEST_CHARS = 4000
const SIGNATURES = ["# AI Agents Guide", "# AGENTS.md", "YOU MUST FOLLOW"]

function readText(path: string): string {
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8")
  } catch {
    // Unreadable files are skipped; resolution keeps walking.
  }
  return ""
}

function findUpwards(start: string): string {
  let current = resolve(start)
  for (let depth = 0; depth < 20; depth += 1) {
    const text = readText(join(current, "AGENTS.md"))
    if (text) return text
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return ""
}

function candidateDirectories(ctx: any): string[] {
  const values = [ctx?.location?.directory, ctx?.directory, ctx?.worktree, process.cwd()]
  return values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
}

function homeDirectory(): string {
  const fromEnv = process.env.HOME
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv
  return homedir()
}

export function resolveAgents(ctx: any): string {
  for (const start of candidateDirectories(ctx)) {
    const found = findUpwards(start)
    if (found) return found
  }
  const home = homeDirectory()
  for (const fallback of [
    join(home, ".config", "opencode", "AGENTS.md"),
    join(home, ".config", "opencode", "prompts", "AGENTS.md"),
  ]) {
    const text = readText(fallback)
    if (text) return text
  }
  return ""
}

export function digest(agents: string, maxChars = MAX_DIGEST_CHARS): string {
  const lines = agents.split(/\r?\n/)
  const kept: string[] = []
  for (const line of lines) {
    const interesting =
      /^#{1,3}\s/.test(line) || /^>\s+\*\*/.test(line) || /^-\s+\S/.test(line) || /^\d+\.\s/.test(line)
    if (interesting) kept.push(line)
    if (kept.join("\n").length >= maxChars) break
  }
  let text = kept.join("\n").trim()
  if (text.length < 400) text = agents.trim()
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n[...truncated]`
  return text
}

function systemHasAgents(event: any): boolean {
  const system = Array.isArray(event?.system) ? event.system : []
  return system.some((part: any) => {
    const text = typeof part?.text === "string" ? part.text : ""
    return SIGNATURES.some((signature) => text.includes(signature))
  })
}

function pushSystem(event: any, text: string): void {
  if (!Array.isArray(event?.system)) return
  if (systemHasAgents(event)) return
  event.system.push({ type: "text", text })
}

export default {
  id: "context-persistence",
  async setup(ctx: any) {
    const seenSessions = new Set<string>()

    const load = (): string => {
      try {
        return resolveAgents(ctx)
      } catch {
        return ""
      }
    }

    const register = async (name: string, handler: (event: any) => void): Promise<void> => {
      try {
        await ctx.session.hook(name, handler)
      } catch {
        // A registration failure must never break OpenCode startup.
      }
    }

    await register("compaction", (event: any) => {
      const agents = load()
      if (!agents) return
      let text = agents.trim()
      if (text.length > MAX_COMPACTION_CHARS) {
        text = `${text.slice(0, MAX_COMPACTION_CHARS)}\n[...AGENTS.md truncated]`
      }
      try {
        pushSystem(
          event,
          [
            "## Non-negotiable project rules (AGENTS.md)",
            "The conversation above is being summarized. The summary MUST preserve these rules and cite them:",
            "",
            text,
          ].join("\n"),
        )
      } catch {
        // Never fail a model request because of this plugin.
      }
    })

    await register("context", (event: any) => {
      const agents = load()
      if (!agents) return
      try {
        const sessionID = typeof event?.sessionID === "string" ? event.sessionID : ""
        const entries = ctx?.session?.instructions?.entry
        if (sessionID && entries && typeof entries.put === "function") {
          if (!seenSessions.has(sessionID)) {
            seenSessions.add(sessionID)
            Promise.resolve(
              entries.put({
                sessionID,
                key: ENTRY_KEY,
                value: `Project rules (AGENTS.md). Re-read the full file before acting.\n\n${digest(agents)}`,
              }),
            ).catch(() => {
              seenSessions.delete(sessionID)
            })
          }
        }
        pushSystem(
          event,
          [
            "## Ambients rules reminder (AGENTS.md)",
            "Obey AGENTS.md. Re-read REMOTE.md before remote operations. No code or commit without an approved issue.",
            "",
            digest(agents),
          ].join("\n"),
        )
      } catch {
        // Never fail a model request because of this plugin.
      }
    })

    return () => {
      seenSessions.clear()
    }
  },
}
