import { getDatabase } from "../db/index.js";
import { queryOne, queryAll } from "../db/helpers.js";
import type { Hooks } from "@opencode-ai/plugin";

export function createEventHook(): NonNullable<Hooks["event"]> {
  return async (input) => {
    try {
      const event = input.event;

      // Only care about message part updated events (tool completion)
      if (event.type !== "message.part.updated") return;

      const part = event.properties.part;
      if (part.type !== "tool") return;

      // Check if the tool completed successfully
      const state = part.state as { status: string };
      if (state.status !== "completed") return;

      const toolName = part.tool as string;
      if (toolName !== "novel_write_chapter" && toolName !== "novel_write_continue") return;

      const db = getDatabase();
      if (!db) return;

      const project = queryOne("SELECT id, pipeline_phase FROM projects LIMIT 1");
      if (!project || project.pipeline_phase !== "writing") return;

      // Check if all chapters for the current arc are completed
      const arcId = (part.state as { input: Record<string, unknown> }).input?.arc_id as string;
      if (!arcId) return;

      const chapters = queryAll("SELECT status FROM chapters WHERE arc_id = ?", [arcId]);
      const allCompleted = chapters.length > 0 && chapters.every((c) => c.status === "completed");

      if (allCompleted) {
        db.run("UPDATE projects SET pipeline_phase = 'reviewing', updated_at = datetime('now') WHERE id = ?", [project.id]);
      }
    } catch {
      // Silent fail — never break event handling
    }
  };
}
