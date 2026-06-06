/**
 * experimental.chat.messages.transform hook
 *
 * Reads recent chapter summaries and character states from the DB
 * and injects them into the message context as a prepended text block
 * on the last user message.
 */

import type { Message, Part } from "@opencode-ai/sdk"
import { getDatabase } from "../db/index.js"
import { queryAll } from "../db/helpers.js"

type MessageWithParts = {
  info: Message
  parts: Part[]
}

type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
}

function isTextPart(part: Part): part is TextPart {
  return (part as { type: string }).type === "text"
}

function findLastUserMessage(messages: MessageWithParts[]): MessageWithParts | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") return messages[i]
  }
  return undefined
}

function buildContextText(): string | null {
  const db = getDatabase()
  if (!db) return null

  const summaries = queryAll(
    `SELECT cs.summary_text, cs.key_events, c.title, c.chapter_num
     FROM chapter_summaries cs
     JOIN chapters c ON c.id = cs.chapter_id
     WHERE cs.status = 'active'
     ORDER BY c.chapter_num DESC
     LIMIT 3`,
  )

  if (summaries.length === 0) {
    return "【小说项目上下文】这是新项目，尚无前文摘要。"
  }

  const latestChapterId = summaries[0].chapter_id as string | undefined

  const summaryLines = summaries.map((s) => {
    const title = s.title ?? `第${s.chapter_num}章`
    return `  ${title}：${s.summary_text}`
  })

  let characterLines: string[] = []
  if (latestChapterId) {
    const states = queryAll(
      `SELECT cs.status_tags, cs.power_level, cs.location, cs.items, cs.relationships,
              cs.narrative_state, ch.name
       FROM character_states cs
       JOIN characters ch ON ch.id = cs.character_id
       WHERE cs.chapter_id = ?
       ORDER BY ch.name`,
      [latestChapterId],
    )

    characterLines = states.map((s) => {
      const parts = [`  ${s.name}`]
      if (s.power_level) parts.push(`战力：${s.power_level}`)
      if (s.location) parts.push(`位置：${s.location}`)
      if (s.status_tags) {
        try {
          const tags = JSON.parse(s.status_tags as string)
          if (Array.isArray(tags) && tags.length > 0) parts.push(`状态：${tags.join("、")}`)
        } catch { /* skip */ }
      }
      return parts.join("，")
    })
  }

  const lines = [
    "【小说项目上下文 — 自动注入】",
    "最近章节摘要：",
    ...summaryLines,
  ]

  if (characterLines.length > 0) {
    lines.push("活跃角色状态：", ...characterLines)
  }

  return lines.join("\n")
}

export function createMessagesTransformHook() {
  return async (_input: {}, output: { messages: MessageWithParts[] }): Promise<void> => {
    try {
      const contextText = buildContextText()
      if (!contextText) return

      const lastUserMsg = findLastUserMessage(output.messages)
      if (!lastUserMsg) return

      const firstTextPart = lastUserMsg.parts.find(isTextPart)
      if (!firstTextPart) return

      firstTextPart.text = contextText + "\n\n" + firstTextPart.text
    } catch (err) {
      console.error("[novel-weaver] messages-transform hook error:", err instanceof Error ? err.message : String(err))
    }
  }
}
