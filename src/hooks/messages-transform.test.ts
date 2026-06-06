import { describe, test, expect, beforeEach, mock } from "bun:test"
import type { Database as SqlJsDatabase } from "sql.js"

// Shared state that mock implementations will read from
let _getDbResult: SqlJsDatabase | null = null
let _queryAllResult: Record<string, unknown>[] = []
let _queryAllCallCount = 0
let _queryAllResults: Record<string, unknown>[][] = []

mock.module("../db/index.js", () => ({
  getDatabase: () => _getDbResult,
}))

mock.module("../db/helpers.js", () => ({
  queryAll: (_sql: string, _params?: unknown[]) => {
    _queryAllCallCount++
    if (_queryAllResults.length > 0) {
      return _queryAllResults.shift()!
    }
    return _queryAllResult
  },
}))

const { createMessagesTransformHook } = await import("./messages-transform")

describe("createMessagesTransformHook", () => {
  let hook: ReturnType<typeof createMessagesTransformHook>

  beforeEach(() => {
    _getDbResult = null
    _queryAllResult = []
    _queryAllCallCount = 0
    _queryAllResults = []
    hook = createMessagesTransformHook()
  })

  function makeMessages(role: string, text: string) {
    return [
      {
        info: { role } as any,
        parts: [
          { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text },
        ],
      },
    ]
  }

  test("DB not initialized — messages unchanged", async () => {
    _getDbResult = null

    const messages = makeMessages("user", "hello")
    const output = { messages }

    await hook({}, output)

    expect(output.messages[0].parts[0].text).toBe("hello")
  })

  test("No chapters — injects new-project hint", async () => {
    _getDbResult = {} as SqlJsDatabase
    _queryAllResult = []

    const messages = makeMessages("user", "write next chapter")
    const output = { messages }

    await hook({}, output)

    const text = output.messages[0].parts[0].text as string
    expect(text).toContain("新项目")
    expect(text).toContain("write next chapter")
  })

  test("With chapters — injects summaries and character states", async () => {
    _getDbResult = {} as SqlJsDatabase

    const summaries = [
      { summary_text: "主角进入副本", key_events: "进入", title: "第3章", chapter_num: 3, chapter_id: "ch3" },
      { summary_text: "获得道具", key_events: "获得", title: "第2章", chapter_num: 2, chapter_id: "ch2" },
    ]
    const states = [
      { name: "张三", status_tags: '["受伤"]', power_level: "C级", location: "副本入口", items: null, relationships: null, narrative_state: null },
    ]

    // First queryAll call returns summaries, second returns character states
    _queryAllResults = [summaries, states]

    const messages = makeMessages("user", "continue writing")
    const output = { messages }

    await hook({}, output)

    const text = output.messages[0].parts[0].text as string
    expect(text).toContain("小说项目上下文")
    expect(text).toContain("第3章")
    expect(text).toContain("主角进入副本")
    expect(text).toContain("张三")
    expect(text).toContain("C级")
    expect(text).toContain("continue writing")
  })

  test("No user message — does nothing", async () => {
    _getDbResult = {} as SqlJsDatabase
    _queryAllResult = []

    const output = {
      messages: [
        {
          info: { role: "assistant" } as any,
          parts: [
            { id: "p1", sessionID: "s1", messageID: "m1", type: "text", text: "response" },
          ],
        },
      ],
    }

    await hook({}, output)

    expect(output.messages[0].parts[0].text).toBe("response")
  })

  test("User message with no text part — does nothing", async () => {
    _getDbResult = {} as SqlJsDatabase
    _queryAllResult = []

    const output = {
      messages: [
        {
          info: { role: "user" } as any,
          parts: [
            { id: "p1", sessionID: "s1", messageID: "m1", type: "image", data: "..." },
          ],
        },
      ],
    }

    await hook({}, output)

    expect(output.messages[0].parts[0].data).toBe("...")
  })
})
