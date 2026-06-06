/**
 * experimental.session.compacting hook
 *
 * 在会话压缩时注入小说项目的关键上下文保留指令，
 * 包括锁定事实、角色最新状态、未回收伏笔和创作意图提示，
 * 确保压缩后的会话仍保留小说项目的核心连续性信息。
 */

import { getDatabase } from "../db/index.js"
import { queryAll, queryOne } from "../db/helpers.js"

export function createCompactingHook() {
  return async (
    _input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ): Promise<void> => {
    try {
      const db = getDatabase()
      if (!db) return

      // ---- 1. 获取锁定事实 ------------------------------------------------
      const lockedFacts = queryAll(
        `SELECT cf.description, cf.fact_type, cf.chapter_num
         FROM chapter_facts cf
         WHERE cf.locked = 1
         ORDER BY cf.chapter_num ASC`,
      )

      // ---- 2. 获取未回收伏笔 ----------------------------------------------
      // hook_set 类型的事实，其 id 未被任何 hook_payoff 的 entity_ref 引用
      const unresolvedHooks = queryAll(
        `SELECT cf.description, cf.chapter_num, cf.id
         FROM chapter_facts cf
         WHERE cf.fact_type = 'hook_set'
         AND cf.id NOT IN (
           SELECT cf2.entity_ref
           FROM chapter_facts cf2
           WHERE cf2.fact_type = 'hook_payoff' AND cf2.entity_ref IS NOT NULL
         )
         ORDER BY cf.chapter_num DESC`,
      )

      // ---- 3. 获取最新章节的角色状态 ---------------------------------------
      const latestChapterRow = queryOne(
        `SELECT id FROM chapters ORDER BY chapter_num DESC LIMIT 1`,
      )

      let characterStates: Record<string, unknown>[] = []
      if (latestChapterRow) {
        characterStates = queryAll(
          `SELECT ch.name, cs.status_tags, cs.power_level, cs.location, cs.items, cs.relationships
           FROM character_states cs
           JOIN characters ch ON ch.id = cs.character_id
           WHERE cs.chapter_id = ?
           ORDER BY ch.name`,
          [latestChapterRow.id],
        )
      }

      // ---- 构建保留上下文字符串 -------------------------------------------
      const lines: string[] = [
        "【小说项目保留上下文 — 会话压缩】",
        "",
      ]

      if (lockedFacts.length > 0) {
        lines.push("=== 锁定事实（不可修改） ===")
        for (const f of lockedFacts) {
          lines.push(`- [第${f.chapter_num}章][${f.fact_type}] ${f.description}`)
        }
        lines.push("")
      }

      if (unresolvedHooks.length > 0) {
        lines.push("=== 未回收伏笔（最多展示10条） ===")
        const topHooks = unresolvedHooks.slice(0, 10)
        for (const h of topHooks) {
          lines.push(`- (第${h.chapter_num}章) ${h.description}`)
        }
        if (unresolvedHooks.length > 10) {
          lines.push(`- ... 另有 ${unresolvedHooks.length - 10} 条未回收伏笔`)
        }
        lines.push("")
      }

      if (characterStates.length > 0) {
        lines.push("=== 角色最新状态 ===")
        for (const s of characterStates) {
          const parts: string[] = [`${s.name}`]
          if (s.power_level) parts.push(`战力：${s.power_level}`)
          if (s.location) parts.push(`位置：${s.location}`)
          if (s.status_tags) {
            try {
              const tags = JSON.parse(s.status_tags as string)
              if (Array.isArray(tags) && tags.length > 0) {
                parts.push(`状态：${tags.join("、")}`)
              }
            } catch { /* 非 JSON 则跳过 */ }
          }
          lines.push(`- ${parts.join("，")}`)
        }
        lines.push("")
      }

      lines.push("=== 创作意图提示 ===")
      lines.push("- 请保持已建立的文风一致，避免使用【反AI表达禁令】中的模式")
      lines.push("- 请参考角色声音指纹（voice_fingerprint）保持对白风格一致性")
      lines.push("- 新增设定不应与已有锁定事实冲突")
      lines.push("- 未回收伏笔应在合适的章节内回收")
      lines.push("- 角色状态变化应该基于最新的角色快照")

      output.context.push(lines.join("\n"))
    } catch (err) {
      console.error(
        "[novel-weaver] compacting hook error:",
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}
