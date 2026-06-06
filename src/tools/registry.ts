/**
 * tools/registry.ts — Single source of truth for all novel-weaver tools.
 *
 * Both the OpenCode plugin (src/index.ts) and the MCP server (src/mcp-server.ts)
 * consume this registry. Adding a new tool means:
 *   1. Implement it in src/tools/<name>.ts using `tool()` factory
 *   2. Import it here
 *   3. Add it to `TOOL_DEFINITIONS`
 *
 * No code changes are required in plugin/mcp entry points.
 */

import type { z } from "zod";
import type { ToolDefinition, ToolContext } from "@opencode-ai/plugin/tool";

import { tool } from "@opencode-ai/plugin/tool";

import { novel_arc_generate, novel_arc_customize } from "./arc.js";
import { novel_character_create, novel_character_update, novel_character_query } from "./character.js";
import { novelInitTool } from "./init.js";
import { novel_world_create, novel_world_query, novel_world_link } from "./world.js";
import { novel_review_chapter, novel_review_fix } from "./review.js";
import { novel_write_chapter, novel_write_continue, novel_write_edit } from "./write.js";
import { novel_consistency_check, novel_consistency_rules } from "./consistency.js";
import { novel_crosscheck } from "../modules/crosscheck/tool.js";
import { novel_query, novel_stats } from "./query.js";
import { novel_progress_track, novel_progress_summary } from "./progress.js";
import { novel_pipeline_start, novel_pipeline_status } from "../pipeline/index.js";
import { novel_style_anchor } from "../modules/style-anchor/tool.js";
import { novel_foreshadow } from "../modules/foreshadow/tool.js";
import { novel_state_snapshot } from "../modules/state-snapshot/tool.js";
import { novel_dashboard } from "../dashboard/manager.js";
import { novel_annotations } from "../modules/annotations/tool.js";
import { novel_imprint } from "../modules/style-imprint/tool.js";
import { novel_summary } from "../modules/summary/tool.js";
import { novel_fact_lock } from "../modules/consistency/fact-lock-tool.js";
import { novel_character_voice_check } from "./character-voice-check.js";
import { novel_genre_list, novel_genre_config } from "./genre.js";
import { novelInstallAgentsTool } from "./install-agents.js";

// ---------------------------------------------------------------------------
// Ping tool — trivial health check, not a typical "novel" tool
// ---------------------------------------------------------------------------

const novel_ping = tool({
  description:
    "Health check for the novel-weaver plugin. Returns 'pong' when the plugin is active.",
  args: {},
  async execute(_args, _context) {
    return { output: "pong" };
  },
});

// ---------------------------------------------------------------------------
// Registry — array of every exposed tool
// ---------------------------------------------------------------------------

/**
 * Flat list of all tool definitions. The shape is the same shape
 * `@opencode-ai/plugin/tool`'s `tool()` factory returns: a plain object
 * with description, args (ZodRawShape) and execute function.
 *
 * The order in this array determines the order tools are listed to
 * the LLM, so put the most-used tools first.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = Object.freeze([
  // ── Health ──
  novel_ping,

  // ── Project setup ──
  novelInitTool,

  // ── Arc management ──
  novel_arc_generate,
  novel_arc_customize,

  // ── World management ──
  novel_world_create,
  novel_world_query,
  novel_world_link,

  // ── Character management ──
  novel_character_create,
  novel_character_update,
  novel_character_query,
  novel_character_voice_check,

  // ── Chapter writing ──
  novel_write_chapter,
  novel_write_continue,
  novel_write_edit,

  // ── Review / Pacing ──
  novel_review_chapter,
  novel_review_fix,

  // ── Consistency ──
  novel_consistency_check,
  novel_consistency_rules,
  novel_fact_lock,
  novel_crosscheck,

  // ── Query / Stats ──
  novel_query,
  novel_stats,

  // ── Progress ──
  novel_progress_track,
  novel_progress_summary,

  // ── State & Foreshadow ──
  novel_state_snapshot,
  novel_foreshadow,

  // ── Style ──
  novel_style_anchor,
  novel_imprint,
  novel_summary,

  // ── Annotations / Dashboard ──
  novel_annotations,
  novel_dashboard,

  // ── Pipeline ──
  novel_pipeline_start,
  novel_pipeline_status,

  // ── Genre ──
  novel_genre_list,
  novel_genre_config,

  // ── Agent installation (omo / Sisyphus integration) ──
  novelInstallAgentsTool,
]);

/** Map from tool name → definition, for O(1) lookup during invocation. */
export const TOOL_DEFINITIONS_BY_NAME: ReadonlyMap<string, ToolDefinition> = (() => {
  const m = new Map<string, ToolDefinition>();
  for (const t of TOOL_DEFINITIONS) {
    m.set(t.description, t);
  }
  return m;
})();

// ---------------------------------------------------------------------------
// Plugin adapter — wraps raw tool() definitions as a plain object the
// @opencode-ai/plugin SDK can register. Identity for now, but kept as
// a function so we can post-process later (e.g. inject metadata).
// ---------------------------------------------------------------------------

/**
 * Build the plugin-facing tools record.
 *
 * OpenCode's plugin SDK accepts an object keyed by tool name; the value
 * can be either a `tool()` factory result (a `ToolDefinition`) or a
 * pre-built wrapper. We pass the `ToolDefinition` directly.
 */
export function buildPluginTools(): Record<string, ToolDefinition> {
  const out: Record<string, ToolDefinition> = {};
  for (const t of TOOL_DEFINITIONS) {
    out[deriveToolName(t)] = t;
  }
  return out;
}

/**
 * Derive a snake_case tool name from the tool's description.
 *
 * Tool definitions don't carry their own name (the plugin SDK adds it
 * when registering); the `description` field starts with the intended
 * name in our codebase. We extract it for the MCP side which needs
 * explicit names.
 *
 * Falls back to a generated id if the description doesn't start with
 * a name-like prefix.
 */
export function deriveToolName(def: ToolDefinition): string {
  // Each tool file exports `export const novel_xxx = tool({...})`.
  // The variable name is the canonical tool name; we look it up in a
  // pre-computed map (built once at module load) to avoid runtime
  // string parsing.
  return TOOL_DEFINITION_NAME_MAP.get(def) ?? `novel_unknown_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Name lookup — pre-compute the (ToolDefinition → name) mapping at module
// load. We walk the imports above, find each tool's export name, and pair
// it with its value.
// ---------------------------------------------------------------------------

const TOOL_DEFINITION_NAME_MAP: ReadonlyMap<ToolDefinition, string> = (() => {
  const m = new Map<ToolDefinition, string>();
  const candidates: Array<readonly [string, unknown]> = [
    ["novel_ping", novel_ping],
    ["novel_init", novelInitTool],
    ["novel_arc_generate", novel_arc_generate],
    ["novel_arc_customize", novel_arc_customize],
    ["novel_world_create", novel_world_create],
    ["novel_world_query", novel_world_query],
    ["novel_world_link", novel_world_link],
    ["novel_character_create", novel_character_create],
    ["novel_character_update", novel_character_update],
    ["novel_character_query", novel_character_query],
    ["novel_character_voice_check", novel_character_voice_check],
    ["novel_write_chapter", novel_write_chapter],
    ["novel_write_continue", novel_write_continue],
    ["novel_write_edit", novel_write_edit],
    ["novel_review_chapter", novel_review_chapter],
    ["novel_review_fix", novel_review_fix],
    ["novel_consistency_check", novel_consistency_check],
    ["novel_consistency_rules", novel_consistency_rules],
    ["novel_fact_lock", novel_fact_lock],
    ["novel_crosscheck", novel_crosscheck],
    ["novel_query", novel_query],
    ["novel_stats", novel_stats],
    ["novel_progress_track", novel_progress_track],
    ["novel_progress_summary", novel_progress_summary],
    ["novel_state_snapshot", novel_state_snapshot],
    ["novel_foreshadow", novel_foreshadow],
    ["novel_style_anchor", novel_style_anchor],
    ["novel_imprint", novel_imprint],
    ["novel_summary", novel_summary],
    ["novel_annotations", novel_annotations],
    ["novel_dashboard", novel_dashboard],
    ["novel_pipeline_start", novel_pipeline_start],
    ["novel_pipeline_status", novel_pipeline_status],
    ["novel_genre_list", novel_genre_list],
    ["novel_genre_config", novel_genre_config],
    ["novel_install_agents", novelInstallAgentsTool],
  ];
  for (const [name, def] of candidates) {
    m.set(def as ToolDefinition, name);
  }
  return m;
})();

// ---------------------------------------------------------------------------
// MCP adapter — produce a JSON Schema for the MCP tools/list response
// and invoke a tool by name with a mock context.
// ---------------------------------------------------------------------------

/**
 * Recursively convert a Zod schema (or raw shape) to JSON Schema.
 *
 * The plugin SDK uses zod 3 (via @opencode-ai/plugin), while the MCP SDK
 * 1.18 uses zod 4 internally. Calling `zodToJsonSchema` on a zod-3
 * schema fed into a zod-4 validator throws a type error. To sidestep
 * the version mismatch, we walk the Zod schema manually using only
 * the stable public API (`_def`, `typeName`, `parse`, `description`).
 *
 * Supported types:
 *   - string, number, boolean, bigint, symbol
 *   - literal
 *   - enum, nativeEnum
 *   - array
 *   - object (raw shape)
 *   - optional, nullable, default
 *   - union, discriminatedUnion (best-effort)
 *   - record
 *   - unknown / any
 */
type AnyZod = {
  _def?: { typeName?: string; innerType?: AnyZod; schema?: AnyZod; shape?: Record<string, AnyZod>; values?: Record<string, unknown>; defaultValue?: () => unknown; description?: string; options?: AnyZod[] };
  description?: string;
  // Zod 4 may not have _def; check typeName
  typeName?: string;
};

function getTypeName(z: AnyZod): string {
  // Zod 3 exposes _def.typeName (e.g. "ZodString")
  if (z._def?.typeName) return z._def.typeName;
  // Zod 4 exposes top-level typeName (e.g. "string")
  if (z.typeName) return `Zod${capitalize(z.typeName)}`;
  return "Unknown";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function zodToJsonSchemaInner(z: AnyZod): Record<string, unknown> {
  const tn = getTypeName(z);
  const description = (z._def?.description ?? z.description) as string | undefined;
  const base: Record<string, unknown> = {};
  if (description) base.description = description;

  switch (tn) {
    case "ZodString":
    case "string":
      return { ...base, type: "string" };
    case "ZodNumber":
    case "number":
      return { ...base, type: "number" };
    case "ZodBoolean":
    case "boolean":
      return { ...base, type: "boolean" };
    case "ZodNull":
    case "null":
      return { ...base, type: "null" };
    case "ZodInteger":
      return { ...base, type: "integer" };
    case "ZodBigInt":
    case "bigint":
      return { ...base, type: "integer" };

    case "ZodLiteral":
    case "literal": {
      const v = (z as any)._def?.value ?? (z as any).value;
      return { ...base, type: typeof v as any, enum: [v] };
    }

    case "ZodEnum":
    case "enum": {
      const values = (z as any)._def?.values ?? Object.values((z as any)._def?.entries ?? {});
      return { ...base, type: "string", enum: values };
    }

    case "ZodNativeEnum":
    case "nativeEnum": {
      const values = Object.values((z as any)._def?.values ?? {});
      return { ...base, type: "string", enum: values as string[] };
    }

    case "ZodArray":
    case "array": {
      const inner = (z as any)._def?.type ?? (z as any)._def?.innerType ?? (z as any).element;
      return { ...base, type: "array", items: zodToJsonSchemaInner(inner) };
    }

    case "ZodObject":
    case "object": {
      const shape = (z as any)._def?.shape?.() ?? (z as any)._def?.shape ?? (z as any).shape ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = zodToJsonSchemaInner(v as AnyZod);
        // Only mark as required if NOT optional / has-default
        const childTn = getTypeName(v as AnyZod);
        if (childTn !== "ZodOptional" && childTn !== "ZodDefault" && childTn !== "optional" && childTn !== "default") {
          required.push(k);
        }
      }
      return {
        ...base,
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }

    case "ZodOptional":
    case "optional": {
      const inner = (z as any)._def?.innerType ?? (z as any)._def?.type;
      return zodToJsonSchemaInner(inner);
    }

    case "ZodNullable":
    case "nullable": {
      const inner = (z as any)._def?.innerType ?? (z as any)._def?.type;
      return { anyOf: [zodToJsonSchemaInner(inner), { type: "null" }] };
    }

    case "ZodDefault":
    case "default": {
      const inner = (z as any)._def?.innerType ?? (z as any)._def?.type;
      return zodToJsonSchemaInner(inner);
    }

    case "ZodUnion":
    case "union": {
      const options = (z as any)._def?.options ?? (z as any)._def?.unionType?.options ?? [];
      return { ...base, anyOf: options.map((o: AnyZod) => zodToJsonSchemaInner(o)) };
    }

    case "ZodDiscriminatedUnion":
    case "discriminatedUnion": {
      const options = (z as any)._def?.options ?? [];
      return { ...base, anyOf: options.map((o: AnyZod) => zodToJsonSchemaInner(o)) };
    }

    case "ZodRecord":
    case "record": {
      const valueType = (z as any)._def?.valueType ?? (z as any)._def?.type;
      return { ...base, type: "object", additionalProperties: valueType ? zodToJsonSchemaInner(valueType) : true };
    }

    case "ZodAny":
    case "any":
    case "ZodUnknown":
    case "unknown":
      return base;

    case "ZodNever":
    case "never":
      return { ...base, not: {} };

    case "ZodVoid":
    case "void":
    case "ZodUndefined":
    case "undefined":
      return {};

    case "ZodEffects":
    case "ZodPipeline":
    case "ZodCatch":
    case "ZodPromise":
    case "ZodLazy":
    case "ZodBranded": {
      // Unwrap transform / pipeline / etc.
      const inner = (z as any)._def?.schema ?? (z as any)._def?.type ?? (z as any)._def?.innerType;
      if (inner) return zodToJsonSchemaInner(inner);
      return base;
    }

    default:
      // Unknown / new — fall back to accepting any JSON
      return base;
  }
}

/**
 * Convert a ZodRawShape to a JSON Schema object suitable for MCP's
 * `tools/list` response.
 */
export function toJsonSchema(args: z.ZodRawShape): Record<string, unknown> {
  // Build an equivalent object schema by walking the shape directly,
  // avoiding the need to construct a zod `z.object(...)` instance
  // (which would re-validate and trip the zod 3/4 mismatch).
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [k, v] of Object.entries(args)) {
    properties[k] = zodToJsonSchemaInner(v as unknown as AnyZod);
    const childTn = getTypeName(v as unknown as AnyZod);
    if (
      childTn !== "ZodOptional" &&
      childTn !== "ZodDefault" &&
      childTn !== "optional" &&
      childTn !== "default"
    ) {
      required.push(k);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/**
 * Build the list of MCP tool descriptors for the `tools/list` response.
 */
export function listMcpTools(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return TOOL_DEFINITIONS.map((def) => ({
    name: deriveToolName(def),
    description: def.description,
    inputSchema: toJsonSchema(def.args),
  }));
}

/**
 * Invoke a tool by name with a directory-derived ToolContext.
 *
 * Returns the raw `ToolResult` (string or {output, metadata, ...}).
 * Throws if the tool name is unknown.
 */
export async function callToolByName(
  name: string,
  args: Record<string, unknown>,
  directory: string = process.cwd(),
): Promise<unknown> {
  const def = TOOL_DEFINITIONS.find((d) => deriveToolName(d) === name);
  if (!def) {
    throw new Error(`Unknown tool: ${name}`);
  }
  // Build a minimal context. Most tools only use `directory`.
  const ctx: ToolContext = {
    sessionID: "mcp-session",
    messageID: "mcp-msg",
    agent: "mcp-client",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
  // The plugin SDK expects `args` typed as `z.infer<z.ZodObject<Args>>`.
  // We trust MCP clients to send correctly-typed JSON; if zod parsing
  // throws, it propagates as an MCP tool error.
  return await def.execute(args as any, ctx);
}
