/**
 * experimental.chat.system.transform hook
 *
 * Reads style anchors and anti-AI rules, injecting them into
 * the system prompt to enforce writing consistency.
 */

import type { Model } from "@opencode-ai/sdk"
import { loadStyleAnchor } from "../modules/style-anchor/tool.js"
import { loadAntiAiRules, getRulesBySeverity } from "../modules/review/anti-ai-rules.js"
import { loadRcConfig } from "../tools/init.js"

function buildStyleAnchorString(projectRoot: string): string | null {
  const profile = loadStyleAnchor(projectRoot)
  if (!profile) return null

  const sentenceDist = profile.sentenceLengthDist
    ? `[${profile.sentenceLengthDist.join(", ")}]`
    : "无数据"
  const paragraphDist = profile.paragraphLengthDist
    ? `[${profile.paragraphLengthDist.join(", ")}]`
    : "无数据"
  const dialoguePct =
    profile.dialogueRatio !== undefined
      ? `${(profile.dialogueRatio * 100).toFixed(1)}%`
      : "无数据"

  return [
    "【风格锚点约束】",
    `- 句子长度分布：${sentenceDist}`,
    `- 段落长度分布：${paragraphDist}`,
    `- 对话比例：${dialoguePct}`,
    "请保持与上述风格特征一致。",
  ].join("\n")
}

function buildAntiAiString(): string | null {
  const highRules = getRulesBySeverity("high")
  if (highRules.length === 0) return null

  const top10 = highRules.slice(0, 10)
  const lines = ["【反AI表达禁令】", "严禁使用以下表达模式："]
  top10.forEach((rule, i) => {
    lines.push(`${i + 1}. ${rule.pattern} → 建议替换为：${rule.replacement}`)
  })

  return lines.join("\n")
}

function buildVoiceCheckReminder(): string {
  return [
    "【角色语音提醒】",
    "写作前请检查：",
    "- 主要角色是否有 voice_fingerprint 设定？",
    "- 角色之间的称呼链是否完整？",
    "- 写完后调用 novel_character_voice_check 验证对白与既有指纹的一致性。",
  ].join("\n")
}

export function createSystemTransformHook() {
  return async (
    _input: { sessionID?: string; model: Model },
    output: { system: string[] },
  ): Promise<void> => {
    try {
      const projectRoot = process.cwd()
      const rcConfig = loadRcConfig(projectRoot)
      const antiAiConfig = rcConfig.antiAi as Record<string, unknown> | undefined
      const antiAiEnabled = antiAiConfig?.enabled !== false

      let injected = false

      const anchorStr = buildStyleAnchorString(projectRoot)
      if (anchorStr) {
        output.system.push(anchorStr)
        injected = true
      }

      if (antiAiEnabled) {
        const antiAiStr = buildAntiAiString()
        if (antiAiStr) {
          output.system.push(antiAiStr)
          injected = true
        }
      }

      output.system.push(buildVoiceCheckReminder())
      injected = true

      if (!injected) {
        output.system.push(
          "【写作质量提醒】请保持文风一致性，避免过度使用副词和情绪标签。",
        )
      }
    } catch (err) {
      console.error("[novel-weaver] system-transform hook error:", err instanceof Error ? err.message : String(err))
    }
  }
}
