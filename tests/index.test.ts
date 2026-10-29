import { describe, test, expect } from "bun:test"

describe("ContextPersistence plugin v2", () => {
  test("module exports a default with id and setup", async () => {
    const mod = await import("../src/index.ts")
    expect(mod.default).toBeDefined()
    expect(mod.default.id).toBe("context-persistence")
    expect(typeof mod.default.setup).toBe("function")
  })

  test("setup registers a compaction hook", async () => {
    const mod = await import("../src/index.ts")
    const hooks: Record<string, unknown> = {}
    await mod.default.setup({
      location: { directory: "/tmp" },
      session: {
        hook: (name: string, handler: unknown) => {
          hooks[name] = handler
        },
      },
    })
    expect(hooks.compaction).toBeDefined()
    expect(typeof hooks.compaction).toBe("function")
  })

  test("setup handles non-string directory gracefully", async () => {
    const mod = await import("../src/index.ts")
    const hooks: Record<string, unknown> = {}
    await mod.default.setup({
      directory: { foo: "bar" },
      session: { hook: (name: string, handler: unknown) => { hooks[name] = handler } },
    })
    expect(hooks.compaction).toBeDefined()
  })
})