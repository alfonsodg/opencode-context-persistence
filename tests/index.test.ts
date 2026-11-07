import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import plugin, { digest, resolveAgents } from "../src/index.ts"

const AGENTS =
  "# AI Agents Guide — Test\n\nYOU MUST FOLLOW EVERY RULE.\n\n## Rules\n- Rule one\n1. Rule two\n"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "context-persistence-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function buildContext(overrides: Record<string, unknown> = {}) {
  const hooks: Record<string, (event: any) => void> = {}
  const entries: any[] = []
  const ctx: any = {
    location: { directory: root },
    session: {
      hook: async (name: string, handler: (event: any) => void) => {
        hooks[name] = handler
        return { dispose: async () => {} }
      },
      instructions: { entry: { put: async (input: any) => entries.push(input) } },
      ...overrides,
    },
  }
  return { ctx, hooks, entries }
}

describe("context-persistence plugin (OpenCode V2)", () => {
  test("exports a V2 definition with id and setup", () => {
    expect(plugin.id).toBe("context-persistence")
    expect(typeof plugin.setup).toBe("function")
  })

  test("registers the V2 session hooks", async () => {
    const { ctx, hooks } = buildContext()
    await plugin.setup(ctx)
    expect(typeof hooks.compaction).toBe("function")
    expect(typeof hooks.context).toBe("function")
  })

  test("compaction hook injects AGENTS.md into the summarizer system prompt", async () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const { ctx, hooks } = buildContext()
    await plugin.setup(ctx)

    const event: any = { sessionID: "ses_1", system: [] }
    hooks.compaction(event)

    expect(event.system).toHaveLength(1)
    expect(event.system[0].type).toBe("text")
    expect(event.system[0].text).toContain("YOU MUST FOLLOW EVERY RULE")
  })

  test("context hook injects a bounded digest on every request", async () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const { ctx, hooks } = buildContext()
    await plugin.setup(ctx)

    const first: any = { sessionID: "ses_1", system: [] }
    const second: any = { sessionID: "ses_1", system: [] }
    hooks.context(first)
    hooks.context(second)

    for (const event of [first, second]) {
      expect(event.system).toHaveLength(1)
      expect(event.system[0].text).toContain("Obey AGENTS.md")
      expect(event.system[0].text).toContain("Rule one")
    }
  })

  test("does not duplicate rules already present in the system prompt", async () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const { ctx, hooks } = buildContext()
    await plugin.setup(ctx)

    const event: any = { sessionID: "ses_1", system: [{ type: "text", text: AGENTS }] }
    hooks.context(event)
    expect(event.system).toHaveLength(1)
  })

  test("stores a durable instruction entry once per session", async () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const { ctx, hooks, entries } = buildContext()
    await plugin.setup(ctx)

    hooks.context({ sessionID: "ses_1", system: [] })
    hooks.context({ sessionID: "ses_1", system: [] })
    hooks.context({ sessionID: "ses_2", system: [] })
    await Bun.sleep(10)

    expect(entries).toHaveLength(2)
    expect(entries[0].sessionID).toBe("ses_1")
    expect(entries[1].sessionID).toBe("ses_2")
    expect(entries[0].key).toBe("context-persistence/agents-md")
    expect(entries[0].value).toContain("Rule one")
  })

  test("never throws when the host rejects a hook registration", async () => {
    const ctx: any = {
      location: { directory: root },
      session: {
        hook: async () => {
          throw new Error("unsupported hook")
        },
      },
    }
    await expect(plugin.setup(ctx)).resolves.toBeDefined()
  })

  test("never throws when instruction entries are unsupported", async () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const { ctx, hooks } = buildContext({ instructions: undefined })
    await plugin.setup(ctx)
    const event: any = { sessionID: "ses_1", system: [] }
    expect(() => hooks.context(event)).not.toThrow()
  })
})

describe("AGENTS.md resolution", () => {
  test("finds AGENTS.md in the session directory", () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    expect(resolveAgents({ location: { directory: root } })).toContain("Rule one")
  })

  test("walks up to a parent directory", () => {
    writeFileSync(join(root, "AGENTS.md"), AGENTS)
    const nested = join(root, "src", "deep")
    mkdirSync(nested, { recursive: true })
    expect(resolveAgents({ location: { directory: nested } })).toContain("Rule one")
  })

  test("falls back to the canonical OpenCode config path", () => {
    const home = join(root, "home")
    const config = join(home, ".config", "opencode")
    mkdirSync(config, { recursive: true })
    writeFileSync(join(config, "AGENTS.md"), AGENTS)
    const empty = join(root, "empty")
    mkdirSync(empty, { recursive: true })

    const previous = process.env.HOME
    process.env.HOME = home
    try {
      expect(resolveAgents({ location: { directory: empty } })).toContain("Rule one")
    } finally {
      process.env.HOME = previous
    }
  })

  test("returns an empty string when no AGENTS.md exists", () => {
    const empty = join(root, "empty")
    mkdirSync(empty, { recursive: true })
    const previous = process.env.HOME
    process.env.HOME = join(root, "no-home")
    try {
      expect(resolveAgents({ location: { directory: empty } })).toBe("")
    } finally {
      process.env.HOME = previous
    }
  })

  test("digest stays bounded", () => {
    const long = `# Title\n\n${"- rule\n".repeat(5000)}`
    expect(digest(long, 2000).length).toBeLessThanOrEqual(2020)
  })
})
