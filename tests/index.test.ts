import { describe, test, expect } from "bun:test"

describe("ContextPersistence plugin v2", () => {
  test("module exports a default with id and setup", async () => {
    const mod = await import("../src/index.ts")
    expect(mod.default).toBeDefined()
    expect(mod.default.id).toBe("context-persistence")
    expect(typeof mod.default.setup).toBe("function")
  })
})