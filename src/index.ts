/**
 * Novel Weaver Plugin — Entry Point
 *
 * Exports a valid `PluginModule` that registers:
 *  - `config` hook — merges user config with defaults, calls `registerAgents`
 *  - `tool` hook   — exposes tools for world, character, review, and init
 *
 * @packageDocumentation
 */

import {
  type PluginModule,
  type Hooks,
  type Plugin,
} from "@opencode-ai/plugin";
import { DEFAULT_CONFIG, DEFAULT_TEMPERATURES, DEFAULT_TEMPERATURE } from "./config.js";
import { registerAgents } from "./agents/index.js";
import type { NovelWeaverConfig } from "./types.js";
import { buildPluginTools } from "./tools/registry.js";
import { handleCommand } from "./commands/index.js";
import { loadRcConfig } from "./tools/init.js";
import { createMessagesTransformHook } from "./hooks/messages-transform.js";
import { createSystemTransformHook } from "./hooks/system-transform.js";
import { createToolExecuteAfterHook } from "./hooks/tool-execute-after.js";
import { createChatMessageHook } from "./hooks/chat-message.js";
import { createEventHook } from "./hooks/event.js";
import { createCompactingHook } from "./hooks/compacting.js";

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

const novelWeaverPlugin: Plugin = async (_input, _options) => {
  // Capture plugin-level options so the config hook can merge them later.
  const pluginOptions = (_options ?? {}) as NovelWeaverConfig;

  const hooks: Hooks = {
    // -----------------------------------------------------------------------
    // Config hook — called by the host when configuration is (re)loaded.
    // Merges defaults with user-provided values and triggers agent registration.
    // -----------------------------------------------------------------------
    config: async () => {
      const merged: Required<NovelWeaverConfig> = {
        dataDir: pluginOptions.dataDir ?? DEFAULT_CONFIG.dataDir,
        defaultGenre:
          pluginOptions.defaultGenre ?? DEFAULT_CONFIG.defaultGenre,
        dbPath: pluginOptions.dbPath ?? DEFAULT_CONFIG.dbPath,
      };
      // Inject novel-weaver sub-agent definitions (world-builder,
      // arc-master, reviewer, plot-planner) into the config.
      registerAgents(merged);
    },

    // -----------------------------------------------------------------------
    // Tool hook — exposes plugin capabilities as LLM-callable tools.
    // The tool list is sourced from tools/registry.ts which is the single
    // source of truth shared with the MCP server entry point.
    // -----------------------------------------------------------------------
    tool: buildPluginTools(),

    // -----------------------------------------------------------------------
    // Tool definition hook — lightweight reminder: if you don't have the
    // info yet, use `question` to ask the user. The agent prompts
    // (WorldBuilder, ArcMaster, etc.) handle deep conversational flow.
    // -----------------------------------------------------------------------
    "tool.definition": async (input, output) => {
      if (!input.toolID.startsWith("novel_")) return;
      // Brief, natural reminder — no rigid checklists.
      const NOTE =
        "\n\n【提示】在调用此工具前，如果某个参数还不确定，" +
        "先用 `question` 工具询问用户。";
      output.description = output.description + NOTE;
    },

    // -----------------------------------------------------------------------
    // Command hook — routes `/novel_*` slash commands to the command router.
    // When `output.parts` is set, the default command handler is skipped.
    // -----------------------------------------------------------------------
    "command.execute.before": async (input, output) => {
      if (!input.command.startsWith("novel_")) return;
      await handleCommand(input.command, input.arguments, output as any);
    },

    // -----------------------------------------------------------------------
    // Chat params hook — per-agent temperature tuning via .novel-weaverrc.json
    // -----------------------------------------------------------------------
    "chat.params": async (_input, output) => {
      const agent = (_input as any).agent || "default";
      // Try loading rc config from session directory
      const sessionID = (_input as any).sessionID || "";
      const projectRoot = sessionID ? "." : process.cwd();
      const rcConfig = loadRcConfig(projectRoot);
      const userTemp = (rcConfig?.temperature as Record<string, number>)?.[agent];

      output.temperature = userTemp ?? DEFAULT_TEMPERATURES[agent] ?? DEFAULT_TEMPERATURE;
    },

    // -----------------------------------------------------------------------
    // Messages transform hook — injects chapter context into user messages
    // -----------------------------------------------------------------------
    "experimental.chat.messages.transform": createMessagesTransformHook(),

    // -----------------------------------------------------------------------
    // System transform hook — injects style anchors and anti-AI rules
    // -----------------------------------------------------------------------
    "experimental.chat.system.transform": createSystemTransformHook(),

    // -----------------------------------------------------------------------
    // Tool execute after hook — consistency check reminders after writing
    // -----------------------------------------------------------------------
    "tool.execute.after": createToolExecuteAfterHook(),

    // -----------------------------------------------------------------------
    // Chat message hook — detects writing intent and injects pipeline context
    // -----------------------------------------------------------------------
    "chat.message": createChatMessageHook(),

    // -----------------------------------------------------------------------
    // Event hook — auto-advances pipeline when arc chapters complete
    // -----------------------------------------------------------------------
    event: createEventHook(),

    // -----------------------------------------------------------------------
    // Session compacting hook — injects novel-specific retention context
    // (locked facts, unresolved hooks, character states, creative intent)
    // -----------------------------------------------------------------------
    "experimental.session.compacting": createCompactingHook(),
  };

  return hooks;
};

// ---------------------------------------------------------------------------
// PluginModule — the shape expected by the opencode plugin loader
// ---------------------------------------------------------------------------

const pluginModule: PluginModule = {
  id: "novel-weaver",
  server: novelWeaverPlugin,
};

export default pluginModule;
export { novelWeaverPlugin as server };
