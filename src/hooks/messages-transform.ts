/**
 * experimental.chat.messages.transform hook
 *
 * 扫描对话消息中的旧章节引用，替换为摘要以节省上下文。
 * 若未发现旧章节引用，回退到原有行为：在最后一条用户消息前
 * 注入最近3章摘要和角色状态。
 *
 * 通过 .novel-weaverrc.json 的 context.summary.enabled（默认 true）
 * 和 context.summary.recentChapters（默认 5）控制行为。
 */

import type { Message, Part } from "@opencode-ai/sdk"
import * as fs from "node:fs"
import * as path from "node:path"
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

/** 从消息中提取的章节引用信息 */
type ChapterRef = {
  chapterNum: number
  match: string
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

/**
 * 扫描消息文本部分中的章节引用。
 * 支持以下模式：
 * - ch{num}（如 ch3、ch12）
 * - 第X章（如 第3章）
 * - 章节文件名 ch{num}-*.md（如 ch3-intro.md）
 */
function extractChapterRef(msg: MessageWithParts): ChapterRef[] {
  const refs: ChapterRef[] = []
  const seen = new Set<number>()

  for (const part of msg.parts) {
    if (!isTextPart(part)) continue
    const text = part.text

    // 模式1：ch{num}（章节文件短名）
    const chRegex = /\bch(\d+)\b/gi
    let m: RegExpExecArray | null
    while ((m = chRegex.exec(text)) !== null) {
      const num = parseInt(m[1], 10)
      if (num > 0 && !seen.has(num)) {
        seen.add(num)
        refs.push({ chapterNum: num, match: m[0] })
      }
    }

    // 模式2：第X章（中文章节引用）
    const zhRegex = /第(\d+)章/g
    while ((m = zhRegex.exec(text)) !== null) {
      const num = parseInt(m[1], 10)
      if (num > 0 && !seen.has(num)) {
        seen.add(num)
        refs.push({ chapterNum: num, match: m[0] })
      }
    }

    // 模式3：章节文件路径名 ch{num}-*.md
    const fileRegex = /ch(\d+)-[^/\\]*\.md/g
    while ((m = fileRegex.exec(text)) !== null) {
      const num = parseInt(m[1], 10)
      if (num > 0 && !seen.has(num)) {
        seen.add(num)
        refs.push({ chapterNum: num, match: m[0] })
      }
    }
  }

  return refs
}

/**
 * 获取指定章节的最佳摘要。
 * 优先级：压缩摘要（level 3）> 分组摘要（level 2）> 单章摘要（level 1）。
 */
function getBestSummary(
  chapterId: string,
): { summary_text: string; key_events: string; title: string; chapter_num: number } | null {
  const db = getDatabase()
  if (!db) return null

  try {
    const rows = queryAll(
      `SELECT cs.summary_text, cs.key_events, c.title, c.chapter_num
       FROM chapter_summaries cs
       JOIN chapters c ON c.id = cs.chapter_id
       WHERE cs.chapter_id = ? AND cs.status = 'active'
       ORDER BY cs.summary_level DESC
       LIMIT 1`,
      [chapterId],
    )
    if (rows.length === 0) return null
    return rows[0] as unknown as { summary_text: string; key_events: string; title: string; chapter_num: number }
  } catch (err) {
    console.error("[novel-weaver] getBestSummary error:", err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * 判断章节号是否在最近 N 章范围内。
 * 从 chapters 表查询 MAX(chapter_num) 做比较。
 */
function isRecentChapter(chapterNum: number, recentCount: number): boolean {
  const db = getDatabase()
  if (!db) return false

  try {
    const rows = queryAll(`SELECT MAX(chapter_num) AS max_num FROM chapters`)
    if (rows.length === 0) return false

    const maxNum = rows[0].max_num as number | null
    if (maxNum == null) return false

    return chapterNum >= maxNum - recentCount + 1
  } catch (err) {
    console.error("[novel-weaver] isRecentChapter error:", err instanceof Error ? err.message : String(err))
    return false
  }
}

/**
 * 构建最近3章摘要 + 角色状态上下文块（原有回退行为）。
 */
function buildContextText(): string | null {
  const db = getDatabase()
  if (!db) return null

  const summaries = queryAll(
    `SELECT cs.summary_text, cs.key_events, c.title, c.chapter_num, c.id AS chapter_id
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
      const db = getDatabase()
      if (!db) return

      // ---- 读取 RC 配置（内联读取，避免引入 tools/init.ts 的 import 链）----
      let enabled = true
      let recentCount = 5
      try {
        const rcPath = path.join(process.cwd(), ".novel-weaverrc.json")
        if (fs.existsSync(rcPath)) {
          const raw = fs.readFileSync(rcPath, "utf-8")
          const rcConfig = JSON.parse(raw) as Record<string, unknown>
          const ctxConfig = rcConfig.context as Record<string, unknown> | undefined
          const summaryConfig = ctxConfig?.summary as Record<string, unknown> | undefined
          if (summaryConfig?.enabled === false) enabled = false
          if (typeof summaryConfig?.recentChapters === "number") recentCount = summaryConfig.recentChapters
        }
      } catch { /* 忽略配置读取错误 */ }

      if (!enabled) return

      // ---- 第一步：扫描所有消息，查找旧章节引用 -------------------------
      let foundOldRef = false

      for (const msg of output.messages) {
        const refs = extractChapterRef(msg)
        if (refs.length === 0) continue

        // 只处理非近期章节的引用
        const oldRefs = refs.filter((r) => !isRecentChapter(r.chapterNum, recentCount))
        if (oldRefs.length === 0) continue

        foundOldRef = true

        // 收集每个旧章节的摘要
        const summaryItems: string[] = []
        for (const ref of oldRefs) {
          try {
            const chapterRows = queryAll(`SELECT id, title FROM chapters WHERE chapter_num = ?`, [ref.chapterNum])
            if (chapterRows.length === 0) {
              summaryItems.push(`  ${ref.match}：章节未找到`)
              continue
            }

            const chapterRow = chapterRows[0]
            const summary = getBestSummary(chapterRow.id as string)
            if (summary) {
              summaryItems.push(`  ${summary.title ?? ref.match}：${summary.summary_text}`)
            } else {
              // 有章节记录但无摘要，输出章节标题作为替代
              summaryItems.push(`  ${chapterRow.title ?? ref.match}：无摘要`)
            }
          } catch (err) {
            console.error("[novel-weaver] 解析章节引用出错:", err instanceof Error ? err.message : String(err))
            summaryItems.push(`  ${ref.match}：解析出错`)
          }
        }

        // 替换该消息的文本内容为摘要
        const summaryBlock = `【旧章节内容替换 — 摘要】\n${summaryItems.join("\n")}`
        for (const part of msg.parts) {
          if (isTextPart(part)) {
            part.text = summaryBlock
            break
          }
        }
      }

      // ---- 第二步：没有旧章节引用时，回退到原有行为 ---------------------
      if (!foundOldRef) {
        const contextText = buildContextText()
        if (!contextText) return

        const lastUserMsg = findLastUserMessage(output.messages)
        if (!lastUserMsg) return

        const firstTextPart = lastUserMsg.parts.find(isTextPart)
        if (!firstTextPart) return

        firstTextPart.text = contextText + "\n\n" + firstTextPart.text
      }
    } catch (err) {
      console.error("[novel-weaver] messages-transform hook error:", err instanceof Error ? err.message : String(err))
    }
  }
}
