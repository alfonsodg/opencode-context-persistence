import { describe, test, expect } from "bun:test"

describe("ContextPersistence plugin", () => {
  test("module exports a default function", async () => {
    const mod = await import("../src/index.ts")
    expect(typeof mod.default).toBe("function")
  })
})