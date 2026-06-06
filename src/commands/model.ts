/**
 * /novel:model slash-command family
 *
 * Subcommands:
 *   list                        — show all tasks with current model + source
 *   set <task> <model>          — set model + write to config file
 *   use <task> <model>          — set session override (not persisted)
 *   reset <task>                — clear session override for a task
 *   reset-all                   — clear all session overrides
 *   save                        — write all session overrides to config file
 *   cost                        — show token usage report
 *
 * The router is purely text-in / text-out: the host injects the
 * resulting `output` string into the chat reply. The function does not
 * mutate shared state besides the singleton resolver and the on-disk
 * config file managed internally by `ModelResolver`.
 *
 * Argument parsing is intentionally trivial — a whitespace split plus a
 * small structural check — so it stays predictable for end users. The
 * function never throws; errors are returned as Chinese error strings
 * in the same `ModelCommandResult` envelope.
 *
 * @packageDocumentation
 */

import {
  getModelResolver,
  initModelResolver,
  type ModelResolver,
  type ModelResolution,
} from "../services/model-resolver.js";

// ---------------------------------------------------------------------------
// Public result envelope
// ---------------------------------------------------------------------------

/** Returned by `handleModelCommand`. `output` is rendered to the user. */
export interface ModelCommandResult {
  output: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/** Parsed shape of a `/novel:model ...` invocation. */
export type ParsedArgs =
  | { subcommand: "list" }
  | { subcommand: "set"; task: string; model: string }
  | { subcommand: "use"; task: string; model: string }
  | { subcommand: "reset"; task: string }
  | { subcommand: "reset-all" }
  | { subcommand: "save" }
  | { subcommand: "cost" }
  | { subcommand: "help" };

/**
 * Split a raw argument string into the subcommand + positional args.
 *
 * Whitespace is the only separator — quoted model IDs are NOT supported
 * because the slash-command surface in this plugin does not escape
 * quotes; if a model name ever needs a space, use a `provider/model`
 * slug like `anthropic/claude-opus-4` instead.
 */
export function parseModelArgs(argsStr: string): ParsedArgs {
  const trimmed = argsStr.trim();
  if (!trimmed) return { subcommand: "help" };

  const parts = trimmed.split(/\s+/);
  const sub = parts[0]?.toLowerCase();

  switch (sub) {
    case "list":
      return { subcommand: "list" };
    case "reset-all":
    case "resetall":
      return { subcommand: "reset-all" };
    case "save":
      return { subcommand: "save" };
    case "cost":
      return { subcommand: "cost" };
    case "help":
    case "--help":
    case "-h":
      return { subcommand: "help" };
    case "set":
    case "use": {
      const task = parts[1];
      const model = parts[2];
      if (!task || !model) return { subcommand: "help" };
      return { subcommand: sub, task, model };
    }
    case "reset": {
      const task = parts[1];
      if (!task) return { subcommand: "help" };
      return { subcommand: "reset", task };
    }
    default:
      return { subcommand: "help" };
  }
}

// ---------------------------------------------------------------------------
// Resolver wiring
// ---------------------------------------------------------------------------

/**
 * Resolve the singleton `ModelResolver` for `projectRoot`. The first
 * call constructs and `init()`s the resolver against the given root;
 * subsequent calls return the cached instance. The wrapper exists so
 * `handleModelCommand` does not need to know whether the host has
 * already initialised the resolver or not.
 */
async function ensureResolver(projectRoot: string): Promise<ModelResolver> {
  try {
    const existing = getModelResolver();
    // Always force a re-init in case the caller switched project roots.
    await existing.init();
    return existing;
  } catch {
    const fresh = initModelResolver(projectRoot);
    await fresh.init();
    return fresh;
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Map the resolver's English source tag to the user-facing Chinese label. */
function sourceLabel(source: ModelResolution["source"]): string {
  switch (source) {
    case "session":
      return "临时覆盖";
    case "config":
      return "配置文件";
    case "default":
      return "默认";
  }
}

function formatList(resolver: ModelResolver): string {
  const rows = resolver.getAllResolutions();
  if (rows.length === 0) {
    return "当前没有可用的任务模型。";
  }
  const lines = ["当前任务模型："];
  const width = Math.max(...rows.map((r) => r.task.length));
  for (const row of rows) {
    const task = row.task.padEnd(width + 2, " ");
    const model = row.model || "(未设置)";
    lines.push(`  ${task}${model} (来源: ${sourceLabel(row.source)})`);
  }
  return lines.join("\n");
}

function formatCost(resolver: ModelResolver): string {
  const report = resolver.getUsageReport();
  if (report.length === 0) {
    return "本会话 token 消耗：\n  (暂无记录)\n---\n总成本: $0.00";
  }

  const lines = ["本会话 token 消耗："];
  const width = Math.max(...report.map((r) => r.task.length));
  const sorted = [...report].sort((a, b) => a.task.localeCompare(b.task));
  for (const entry of sorted) {
    const taskPadded = entry.task.padEnd(width + 2, " ");
    const inputStr = entry.promptTokens.toLocaleString("en-US");
    const outputStr = entry.completionTokens.toLocaleString("en-US");
    const costStr = `$${entry.estimatedCost.toFixed(2)}`;
    lines.push(
      `  ${taskPadded}输入 ${inputStr}   输出 ${outputStr}   估算成本 ${costStr}`,
    );
  }
  lines.push("---");
  lines.push(`总成本: $${resolver.getTotalCost().toFixed(2)}`);
  return lines.join("\n");
}

function helpText(): string {
  return [
    "用法: /novel:model <subcommand> [args...]",
    "",
    "可用子命令：",
    "  list                        显示所有任务当前模型",
    "  set <task> <model>          设置模型并写入配置文件",
    "  use <task> <model>          临时覆盖任务模型（不写入配置文件）",
    "  reset <task>                重置单个任务为配置文件/默认值",
    "  reset-all                   重置全部临时覆盖",
    "  save                        把当前临时覆盖写入配置文件",
    "  cost                        显示当前 session 的 token 消耗估算",
    "  help                        显示本帮助",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Handle a `/novel:model` slash-command invocation.
 *
 * @param argsStr     Raw argument string after the command name.
 * @param projectRoot Project root used to locate the config file and
 *                    construct the singleton resolver.
 */
export async function handleModelCommand(
  argsStr: string,
  projectRoot: string,
): Promise<ModelCommandResult> {
  const parsed = parseModelArgs(argsStr);

  if (parsed.subcommand === "help") {
    return { output: helpText() };
  }

  const resolver = await ensureResolver(projectRoot);

  switch (parsed.subcommand) {
    case "list":
      return { output: formatList(resolver) };

    case "set": {
      // setPersistentConfig writes the file and drops any stale
      // session override for the same task — exactly the semantics
      // the `set` subcommand promises.
      await resolver.setPersistentConfig(parsed.task, parsed.model);
      return {
        output: `已设置 ${parsed.task} = ${parsed.model}，已保存到配置文件`,
      };
    }

    case "use":
      resolver.setSessionOverride(parsed.task, parsed.model);
      return {
        output: `本次会话内 ${parsed.task} 临时使用 ${parsed.model}，配置文件未修改`,
      };

    case "reset":
      resolver.clearSessionOverride(parsed.task);
      return {
        output: `已重置 ${parsed.task} 为默认/配置文件值`,
      };

    case "reset-all":
      resolver.clearAllSessionOverrides();
      return { output: "已重置所有任务模型" };

    case "save": {
      // The resolver's save method silently no-ops when there are
      // no overrides; mirror that with an explicit user-facing hint
      // so the host doesn't see an empty success line.
      const count = Object.keys(resolver.getSessionOverrides()).length;
      if (count === 0) {
        return { output: "当前没有临时覆盖需要保存" };
      }
      await resolver.saveSessionOverridesToFile();
      return { output: `已保存 ${count} 个临时覆盖到配置文件` };
    }

    case "cost":
      return { output: formatCost(resolver) };
  }
}
