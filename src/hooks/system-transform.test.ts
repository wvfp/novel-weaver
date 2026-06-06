import { describe, test, expect, beforeEach, mock } from "bun:test"
import type { StyleAnchorProfile } from "../modules/style-anchor/tool.js"
import type { AntiAiRule } from "../modules/review/anti-ai-rules.js"

// Shared state for mock implementations
let _styleAnchorResult: StyleAnchorProfile | null = null
let _antiAiHighRules: AntiAiRule[] = []
let _rcConfig: Record<string, unknown> = {}

mock.module("../modules/style-anchor/tool.js", () => ({
  loadStyleAnchor: (_projectRoot: string) => _styleAnchorResult,
}))

mock.module("../modules/review/anti-ai-rules.js", () => ({
  loadAntiAiRules: () => [] as AntiAiRule[],
  getRulesBySeverity: (...severities: string[]) => {
    if (severities.includes("high")) return _antiAiHighRules
    return []
  },
}))

mock.module("../tools/init.js", () => ({
  loadRcConfig: (_projectRoot: string) => _rcConfig,
}))

const { createSystemTransformHook } = await import("./system-transform")

describe("createSystemTransformHook", () => {
  let hook: ReturnType<typeof createSystemTransformHook>

  beforeEach(() => {
    _styleAnchorResult = null
    _antiAiHighRules = []
    _rcConfig = {}
    hook = createSystemTransformHook()
  })

  test("Style anchor exists — pushes style constraints to system", async () => {
    _rcConfig = {}
    _styleAnchorResult = {
      sentenceLengthDist: [10, 20, 30, 15, 5],
      paragraphLengthDist: [5, 10, 25, 30, 10],
      dialogueRatio: 0.35,
      topBigrams: [],
      punctuationFreq: {},
    }
    _antiAiHighRules = []

    const output = { system: [] as string[] }
    await hook({ model: {} as any }, output)

    expect(output.system.length).toBeGreaterThanOrEqual(1)
    const anchorEntry = output.system.find((s) => s.includes("风格锚点约束"))
    expect(anchorEntry).toBeDefined()
    expect(anchorEntry!).toContain("句子长度分布")
    expect(anchorEntry!).toContain("35.0%")
  })

  test("Anti-AI enabled with high-severity rules — pushes prohibition text", async () => {
    _rcConfig = { antiAi: { enabled: true } }
    _styleAnchorResult = null
    _antiAiHighRules = [
      { pattern: "缓缓说道", replacement: "用前置动作替代", category: "adverb_overuse", severity: "high", layer: 1 },
      { pattern: "心中一暖", replacement: "用具体行为替代", category: "emotion_tagging", severity: "high", layer: 3 },
    ]

    const output = { system: [] as string[] }
    await hook({ model: {} as any }, output)

    const antiAiEntry = output.system.find((s) => s.includes("反AI表达禁令"))
    expect(antiAiEntry).toBeDefined()
    expect(antiAiEntry!).toContain("缓缓说道")
    expect(antiAiEntry!).toContain("心中一暖")
  })

  test("No anchor, anti-AI disabled — pushes voice reminder", async () => {
    _rcConfig = { antiAi: { enabled: false } }
    _styleAnchorResult = null
    _antiAiHighRules = []

    const output = { system: [] as string[] }
    await hook({ model: {} as any }, output)

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain("角色语音提醒")
    expect(output.system[0]).toContain("voice_fingerprint")
  })

  test("Both anchor and anti-AI active — pushes all three", async () => {
    _rcConfig = { antiAi: { enabled: true } }
    _styleAnchorResult = {
      sentenceLengthDist: [5, 10, 15, 10, 5],
      paragraphLengthDist: [3, 7, 20, 15, 5],
      dialogueRatio: 0.25,
      topBigrams: [],
      punctuationFreq: {},
    }
    _antiAiHighRules = [
      { pattern: "一股暖流涌上心头", replacement: "用具体行为替代", category: "emotion_tagging", severity: "high", layer: 3 },
    ]

    const output = { system: [] as string[] }
    await hook({ model: {} as any }, output)

    expect(output.system).toHaveLength(3)
    expect(output.system[0]).toContain("风格锚点约束")
    expect(output.system[1]).toContain("反AI表达禁令")
    expect(output.system[2]).toContain("角色语音提醒")
  })

  test("Anti-AI config absent — defaults to enabled", async () => {
    _rcConfig = {}
    _styleAnchorResult = null
    _antiAiHighRules = [
      { pattern: "缓缓说道", replacement: "用前置动作替代", category: "adverb_overuse", severity: "high", layer: 1 },
    ]

    const output = { system: [] as string[] }
    await hook({ model: {} as any }, output)

    const antiAiEntry = output.system.find((s) => s.includes("反AI表达禁令"))
    expect(antiAiEntry).toBeDefined()
  })
})
