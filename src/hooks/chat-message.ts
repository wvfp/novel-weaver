import { detectNovelIntent, type NovelIntent } from "./intent-gate.js";
import { getDatabase } from "../db/index.js";
import { queryOne } from "../db/helpers.js";
import type { Hooks } from "@opencode-ai/plugin";

export function createChatMessageHook(): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    try {
      // Extract text content from the user message parts
      const textParts = output.parts
        .filter((p): p is typeof p & { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text);
      const messageText = textParts.join(" ");
      if (!messageText) return;

      const intent = detectNovelIntent(messageText);
      if (!intent) return;

      // Attach intent to the message metadata via the output parts
      for (const part of output.parts) {
        if (part.type === "text") {
          if (!("metadata" in part)) {
            (part as Record<string, unknown>).metadata = {};
          }
          const meta = (part as Record<string, unknown>).metadata as Record<string, unknown>;
          meta.novelIntent = intent;
        }
      }

      // If write-related intent, inject pipeline context into metadata
      if (intent === "write-next" || intent === "write-new" || intent === "continue-pipeline") {
        const db = getDatabase();
        if (!db) return;

        const project = queryOne("SELECT pipeline_phase, genre_pack_id FROM projects LIMIT 1");
        if (project) {
          for (const part of output.parts) {
            if (part.type === "text") {
              const meta = (part as Record<string, unknown>).metadata as Record<string, unknown>;
              meta.pipelinePhase = project.pipeline_phase;
              meta.genrePackId = project.genre_pack_id;
            }
          }
        }
      }
    } catch {
      // Silent fail — never break the chat flow
    }
  };
}
