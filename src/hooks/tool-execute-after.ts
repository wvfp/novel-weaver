/**
 * tool.execute.after hook
 *
 * Triggers consistency check reminders after writing tools complete.
 */

const WRITING_TOOLS = new Set(["novel_write_chapter", "novel_write_continue"])

export function createToolExecuteAfterHook() {
  return async (
    input: { tool: string; sessionID: string; callID: string; args: unknown },
    output: { title: string; output: string; metadata: unknown },
  ): Promise<void> => {
    try {
      if (!WRITING_TOOLS.has(input.tool)) return

      output.output += "\n\n---\n【自动提醒】章节已写入，建议调用 novel_consistency_check 检查一致性。"

      const metadata = output.metadata as Record<string, unknown> | null | undefined
      if (metadata && typeof metadata === "object") {
        metadata.autoConsistencyCheck = true
      } else {
        (output as { metadata: Record<string, unknown> }).metadata = { autoConsistencyCheck: true }
      }
    } catch (err) {
      console.error("[novel-weaver] tool-execute-after hook error:", err instanceof Error ? err.message : String(err))
    }
  }
}
