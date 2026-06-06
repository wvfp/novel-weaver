/**
 * novel-weaver Slash Command Router
 *
 * Parses slash-command arguments and routes them to the appropriate tool
 * definition.  Supports the full set of 23 novel-weaver tools as
 * `/command_name key=value key2="quoted value"` entries, plus the
 * `/novel:model` family (see `./model.ts`).
 *
 * This module is called from the `command.execute.before` hook registered
 * in `src/index.ts`.
 *
 * @packageDocumentation
 */

import { z } from "zod";
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { handleModelCommand } from "./model.js";

// ---------------------------------------------------------------------------
// Imports — all tool definitions
// ---------------------------------------------------------------------------

import { novelInitTool } from "../tools/init.js";
import {
  novel_world_create,
  novel_world_query,
  novel_world_link,
} from "../tools/world.js";
import {
  novel_arc_generate,
  novel_arc_customize,
} from "../tools/arc.js";
import {
  novel_character_create,
  novel_character_update,
  novel_character_query,
} from "../tools/character.js";
import {
  novel_write_chapter,
  novel_write_continue,
  novel_write_edit,
} from "../tools/write.js";
import { novel_review_chapter, novel_review_fix } from "../tools/review.js";
import {
  novel_consistency_check,
  novel_consistency_rules,
} from "../tools/consistency.js";
import {
  novel_progress_track,
  novel_progress_summary,
} from "../tools/progress.js";
import { novel_query, novel_stats } from "../tools/query.js";
import {
  novel_pipeline_start,
  novel_pipeline_status,
} from "../pipeline/index.js";
import { novel_dashboard } from "../dashboard/manager.js";
import { novel_annotations } from "../modules/annotations/tool.js";
import { novel_imprint } from "../modules/style-imprint/tool.js";
import { novel_summary } from "../modules/summary/tool.js";
import { novel_fact_lock } from "../modules/consistency/fact-lock-tool.js";
import { novel_character_voice_check } from "../tools/character-voice-check.js";

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw argument string into a key/value map.
 *
 * Supports two value forms:
 *   - Quoted:   key="value with spaces"
 *   - Unquoted: key=barevalue
 *
 * @example
 *   parseArgs(`project_name="轮回之塔"`)           // → { project_name: "轮回之塔" }
 *   parseArgs(`name=测试 type=core`)               // → { name: "测试", type: "core" }
 *   parseArgs(`action=view arc_id=abc-123`)    // → { action: "view", arc_id: "abc-123" }
 */
function parseArgs(argsStr: string): Record<string, string> {
  const args: Record<string, string> = {};
  const regex = /(\w+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(argsStr)) !== null) {
    args[match[1]] = match[2] ?? match[3] ?? "";
  }
  return args;
}

// ---------------------------------------------------------------------------
// Novel ping tool (defined inline in src/index.ts; replicated here so the
// command router can resolve it without modifying the existing hook).
// ---------------------------------------------------------------------------

const novelPingTool = tool({
  description:
    "Health check for the novel-weaver plugin. Returns 'pong' when the plugin is active.",
  args: {},
  async execute(_args, _context) {
    return { output: "pong" };
  },
});

// ---------------------------------------------------------------------------
// Command map — maps command name (without leading "/") → ToolDefinition
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, ToolDefinition> = {
  // ── Init ──────────────────────────────────────────────────────────
  novel_init: novelInitTool,

  // ── Ping ──────────────────────────────────────────────────────────
  novel_ping: novelPingTool,

  // ── World / Setting ───────────────────────────────────────────────
  novel_world_create,
  novel_world_query,
  novel_world_link,

  // ── Arc ───────────────────────────────────────────────────────
  novel_arc_generate,
  novel_arc_customize,

  // ── Character ─────────────────────────────────────────────────────
  novel_character_create,
  novel_character_update,
  novel_character_query,

  // ── Writing ───────────────────────────────────────────────────────
  novel_write_chapter,
  novel_write_continue,
  novel_write_edit,

  // ── Review ────────────────────────────────────────────────────────
  novel_review_chapter,
  novel_review_fix,

  // ── Consistency ───────────────────────────────────────────────────
  novel_consistency_check,
  novel_consistency_rules,

  // ── Progress ──────────────────────────────────────────────────────
  novel_progress_track,
  novel_progress_summary,

  // ── Query / Stats ─────────────────────────────────────────────────
  novel_query,
  novel_stats,

  // ── Pipeline ──────────────────────────────────────────────────────
  novel_pipeline_start,
  novel_pipeline_status,

  // ── Dashboard ─────────────────────────────────────────────────────
  novel_dashboard,

  // ── Annotations ───────────────────────────────────────────────────
  novel_annotations,

  // ── Style Imprint ─────────────────────────────────────────────────
  novel_imprint,

  // ── Chapter Summary ───────────────────────────────────────────────
  novel_summary,

  // ── Fact Lock ─────────────────────────────────────────────────────
  novel_fact_lock,

  // ── Character Voice Check ─────────────────────────────────────────
  novel_character_voice_check,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal text-part shape (matches the Part union from @opencode-ai/sdk). */
type TextPart = { type: "text"; text: string };

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle a slash command invocation.
 *
 * 1. Look up the command name in the COMMANDS map.
 * 2. Parse raw argument string with `parseArgs`.
 * 3. Validate parsed args against the tool's Zod schema.
 * 4. Execute the tool with a minimal context.
 * 5. Write the result (or error) into `output.parts`.
 *
 * @param command - Command name (without leading "/"), e.g. "novel_init"
 * @param argsStr - Raw argument string, e.g. `project_name="轮回之塔"`
 * @param output  - Output parts that will be returned to the user
 */
export async function handleCommand(
  command: string,
  argsStr: string,
  output: { parts: TextPart[] },
): Promise<void> {
  // /novel:model family — text-in/text-out, not a normal tool.
  if (command === "novel:model") {
    const result = await handleModelCommand(argsStr, process.cwd());
    output.parts = [{ type: "text", text: result.output }];
    return;
  }

  const def = COMMANDS[command];
  if (!def) {
    output.parts = [
      {
        type: "text",
        text: `未知命令: /${command}\n可用命令: ${Object.keys(COMMANDS).join(", ")}`,
      },
    ];
    return;
  }

  const rawArgs = parseArgs(argsStr);

  try {
    // Build a ZodObject from the tool's schema and validate
    const schema = z.object(def.args as Record<string, z.ZodTypeAny>);
    const validatedArgs = schema.parse(rawArgs);

    // Minimal tool context (picks up the current working directory so that
    // file-system-aware tools like novel_init work correctly).
    const ctx = {
      sessionID: "",
      messageID: "",
      agent: "",
      directory: process.cwd(),
      worktree: process.cwd(),
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    };

    const result = await (def.execute as Function)(validatedArgs, ctx);
    const text =
      typeof result === "string"
        ? result
        : (result as { output?: string }).output ?? String(result);
    output.parts = [{ type: "text", text }];
  } catch (err: unknown) {
    const message =
      err instanceof z.ZodError
        ? `参数错误:\n${err.issues.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n")}`
        : err instanceof Error
          ? err.message
          : String(err);
    output.parts = [{ type: "text", text: `错误: ${message}` }];
  }
}
