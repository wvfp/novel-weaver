/**
 * mcp-server.ts — Model Context Protocol server entry point.
 *
 * Exposes all novel-weaver tools to any MCP-compatible client:
 *   - omo / Sisyphus (OpenCode forks)
 *   - Claude Desktop
 *   - Cursor / VS Code MCP extensions
 *   - Any custom MCP client
 *
 * Run with:
 *   npx novel-weaver mcp
 *
 * Communication: stdio (JSON-RPC).
 * The server reads MCP requests from stdin and writes responses to stdout.
 *
 * @packageDocumentation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  TOOL_DEFINITIONS,
  deriveToolName,
  callToolByName,
  listMcpTools,
} from "./tools/registry.js";

// Re-export for the CLI subcommand and external consumers
export { TOOL_DEFINITIONS, deriveToolName, listMcpTools, callToolByName };

const SERVER_NAME = "novel-weaver";
const SERVER_VERSION = "0.1.4";

/**
 * Convert a novel-weaver ToolResult to MCP CallToolResult format.
 *
 * novel-weaver returns `string | {output: string, metadata?, attachments?}`.
 * MCP wants `{content: Array<{type: "text"|"image"|"resource", ...}>, isError?}`.
 */
function toCallToolResult(result: unknown): CallToolResult {
  // String → wrap in text content block
  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }

  // Null/undefined → empty result
  if (result === null || result === undefined) {
    return { content: [{ type: "text", text: "" }] };
  }

  // ToolResult object shape
  if (typeof result === "object") {
    const r = result as {
      output?: unknown;
      title?: string;
      metadata?: Record<string, unknown>;
      attachments?: Array<{ type: "file"; mime: string; url: string; filename?: string }>;
    };

    const blocks: Array<
      { type: "text"; text: string } | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } }
    > = [];

    if (r.title) {
      blocks.push({ type: "text", text: `# ${r.title}\n\n` });
    }
    if (typeof r.output === "string") {
      blocks.push({ type: "text", text: r.output });
    } else if (r.output !== undefined) {
      blocks.push({ type: "text", text: JSON.stringify(r.output, null, 2) });
    }

    // Attachments → resource blocks (file:// URIs)
    if (Array.isArray(r.attachments)) {
      for (const att of r.attachments) {
        if (att.type === "file") {
          blocks.push({
            type: "resource",
            resource: {
              uri: att.url,
              mimeType: att.mime,
              text: att.filename,
            },
          });
        }
      }
    }

    // Metadata → emit as a small JSON footer so the LLM can see it
    if (r.metadata && Object.keys(r.metadata).length > 0) {
      blocks.push({
        type: "text",
        text: `\n\n---\n_metadata: ${JSON.stringify(r.metadata)}`,
      });
    }

    return { content: (blocks.length > 0 ? blocks : [{ type: "text", text: "" }]) as any };
  }

  // Fallback: stringify
  return { content: [{ type: "text", text: String(result) }] as any };
}

/**
 * Build an MCP server that registers every tool from the registry.
 */
export function createMcpServer(directory: string = process.cwd()): { server: McpServer["server"]; mcp: McpServer } {
  const mcp = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        `novel-weaver v${SERVER_VERSION} — AI-assisted novel writing system. ` +
        `Provides ${TOOL_DEFINITIONS.length} tools for arc generation, world building, ` +
        `character management, chapter writing, review/pacing, consistency, ` +
        `style anchoring, and project state management. ` +
        `First call novel_init to bootstrap a project, then novel_arc_generate, ` +
        `novel_world_create, novel_character_create before novel_write_chapter.`,
    },
  );

  for (const def of TOOL_DEFINITIONS) {
    const toolName = deriveToolName(def);
    // The plugin SDK uses ZodRawShape (the args object literal). The MCP
    // SDK accepts the same shape, so we can pass it through directly.
    const args = def.args as any;

    mcp.tool(
      toolName,
      def.description,
      args,
      async (input: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          const result = await callToolByName(toolName, input, directory);
          return toCallToolResult(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          // MCP wants isError + content with details
          return {
            content: [
              {
                type: "text",
                text: `❌ Tool '${toolName}' failed: ${message}${stack ? `\n\n${stack}` : ""}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  return { server: mcp.server, mcp };
}

/**
 * Run the MCP server on stdio. This is the entry point invoked by
 * the `npx novel-weaver mcp` CLI command.
 */
export async function runMcpServer(directory: string = process.cwd()): Promise<void> {
  // Log to stderr — stdout is reserved for the JSON-RPC protocol
  console.error(`[novel-weaver MCP] starting (directory=${directory})`);
  console.error(`[novel-weaver MCP] registering ${TOOL_DEFINITIONS.length} tools`);

  const { mcp } = createMcpServer(directory);
  const transport = new StdioServerTransport();

  // Graceful shutdown on SIGINT/SIGTERM
  const shutdown = async () => {
    console.error("[novel-weaver MCP] shutting down");
    await mcp.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await mcp.connect(transport);
  console.error("[novel-weaver MCP] ready (stdio)");
}
