import { describe, test, expect, beforeEach } from "bun:test"
import { createToolExecuteAfterHook } from "./tool-execute-after"

describe("createToolExecuteAfterHook", () => {
  let hook: ReturnType<typeof createToolExecuteAfterHook>

  beforeEach(() => {
    hook = createToolExecuteAfterHook()
  })

  test("Writing tool — appends reminder and sets metadata", async () => {
    const input = { tool: "novel_write_chapter", sessionID: "s1", callID: "c1", args: {} }
    const output = { title: "Chapter written", output: "Chapter content saved.", metadata: {} }

    await hook(input, output)

    expect(output.output).toContain("自动提醒")
    expect(output.output).toContain("novel_consistency_check")
    expect(output.metadata).toEqual({ autoConsistencyCheck: true })
  })

  test("novel_write_continue — also triggers reminder", async () => {
    const input = { tool: "novel_write_continue", sessionID: "s1", callID: "c1", args: {} }
    const output = { title: "Continue written", output: "Done.", metadata: {} }

    await hook(input, output)

    expect(output.output).toContain("自动提醒")
    expect((output.metadata as Record<string, unknown>).autoConsistencyCheck).toBe(true)
  })

  test("Non-writing tool — output unchanged", async () => {
    const input = { tool: "novel_world_create", sessionID: "s1", callID: "c1", args: {} }
    const output = { title: "World created", output: "World saved.", metadata: {} }

    await hook(input, output)

    expect(output.output).toBe("World saved.")
    expect(output.metadata).toEqual({})
  })

  test("Null metadata — creates metadata object with autoConsistencyCheck", async () => {
    const input = { tool: "novel_write_chapter", sessionID: "s1", callID: "c1", args: {} }
    const output = { title: "Written", output: "Done.", metadata: null }

    await hook(input, output)

    expect(output.output).toContain("自动提醒")
    expect((output as { metadata: Record<string, unknown> }).metadata).toEqual({ autoConsistencyCheck: true })
  })
})
