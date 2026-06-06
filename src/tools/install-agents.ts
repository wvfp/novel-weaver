/**
 * novel_install_agents tool — Write novel-weaver agent .md files to the
 * OpenCode agent directory so that omo / Sisyphus can switch to them.
 *
 * Behaviour:
 *   1. Locates the user-level OpenCode config dir
 *      (default: $XDG_CONFIG_HOME/opencode or $HOME/.config/opencode).
 *   2. Ensures `<configDir>/agent/` exists.
 *   3. Copies the four bundled agent .md files (ArcMaster, WorldBuilder,
 *      Reviewer, PlotPlanner) from the plugin's dist/agents/prompts/
 *      directory into the agent directory.
 *   4. Returns a structured summary of which agents were installed.
 *
 * @packageDocumentation
 */

import { tool } from "@opencode-ai/plugin/tool";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const AGENT_NAMES = ["ArcMaster", "WorldBuilder", "Reviewer", "PlotPlanner"] as const;
type AgentName = (typeof AGENT_NAMES)[number];

/**
 * Resolve the bundled .md directory in dist/agents/prompts/.
 *
 * Works in both ESM and CJS contexts. The dist layout is:
 *   <pluginRoot>/dist/agents/prompts/<name>.md
 *   <pluginRoot>/dist/index.js
 * so we walk up from this file (or its compiled CJS twin) until we find
 * `agents/prompts` and verify the .md files exist.
 */
function resolveBundledAgentsDir(): string | null {
  // Try ESM first (the runtime path).
  let here: string;
  try {
    const metaUrl: string | undefined = (import.meta as any)?.url;
    here = metaUrl ? fileURLToPath(metaUrl) : __filename;
  } catch {
    here = __filename;
  }

  let dir = path.dirname(here);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "agents", "prompts");
    if (
      fs.existsSync(path.join(candidate, "ArcMaster.md")) &&
      fs.existsSync(path.join(candidate, "WorldBuilder.md"))
    ) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve the user-level opencode config dir. Honours XDG_CONFIG_HOME on
 * every platform (Windows users typically have it set; if not, we fall
 * back to %APPDATA%/opencode, then $HOME/.config/opencode).
 */
function resolveOpencodeConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) {
    return process.env.OPENCODE_CONFIG_DIR;
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return path.join(xdg, "opencode");
  }

  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, "opencode");
    }
    return path.join(home, "AppData", "Roaming", "opencode");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "opencode");
  }
  return path.join(home, ".config", "opencode");
}

export const novelInstallAgentsTool = tool({
  description:
    "Install novel-weaver's 4 agent prompts (ArcMaster, WorldBuilder, Reviewer, PlotPlanner) " +
    "into the OpenCode agent directory so omo / Sisyphus / other agents can switch to them " +
    "via task(agent=\"ArcMaster\", ...). This is a one-time setup per machine.",
  args: {
    force: z
      .boolean()
      .default(false)
      .describe("Overwrite existing agent .md files (default: false, skip if exists)"),
    target_dir: z
      .string()
      .optional()
      .describe(
        "Override the target directory. By default uses the OpenCode user config dir " +
        "(~/.config/opencode/agent/ on Unix, %APPDATA%/opencode/agent/ on Windows)."
      ),
  },
  async execute({ force, target_dir }, _context) {
    const bundledDir = resolveBundledAgentsDir();
    if (!bundledDir) {
      return {
        output:
          `❌ 无法找到 bundled agent .md 文件。\n` +
          `请确认插件构建产物完整（应该包含 dist/agents/prompts/*.md）。\n` +
          `如果你是从源码运行，请执行 npm run build。`,
      };
    }

    const baseDir = target_dir ?? path.join(resolveOpencodeConfigDir(), "agent");
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (err) {
      return {
        output: `❌ 创建目录失败「${baseDir}」: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const installed: string[] = [];
    const skipped: string[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const name of AGENT_NAMES) {
      const src = path.join(bundledDir, `${name}.md`);
      const dst = path.join(baseDir, `${name}.md`);

      if (!fs.existsSync(src)) {
        failed.push({ name, error: `源文件不存在: ${src}` });
        continue;
      }

      if (fs.existsSync(dst) && !force) {
        skipped.push(name);
        continue;
      }

      try {
        const content = fs.readFileSync(src, "utf-8");
        fs.writeFileSync(dst, content, "utf-8");
        installed.push(name);
      } catch (err) {
        failed.push({
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const lines: string[] = [
      `✅ novel-weaver agents 安装完成`,
      ``,
      `📁 目标目录: ${baseDir}`,
      `📦 Bundled 源: ${bundledDir}`,
      ``,
      `📊 结果统计:`,
      `  新安装: ${installed.length} 个 (${installed.join(", ") || "—"})`,
      `  跳过（已存在）: ${skipped.length} 个 (${skipped.join(", ") || "—"})`,
      `  失败: ${failed.length} 个`,
    ];

    if (failed.length > 0) {
      lines.push(``, `❌ 失败详情:`);
      for (const f of failed) {
        lines.push(`  - ${f.name}: ${f.error}`);
      }
    }

    if (skipped.length > 0 && !force) {
      lines.push(
        ``,
        `💡 提示: 如果要覆盖已存在的 agent 文件，请使用 force=true。`,
      );
    }

    lines.push(
      ``,
      `🎯 接下来:`,
      `  1. 重启 OpenCode 让它扫描 agent 目录`,
      `  2. 在 omo / Sisyphus 中可以通过 task 工具切换:`,
    );
    for (const name of AGENT_NAMES) {
      lines.push(`     task(agent="${name}", prompt="...")`);
    }

    return {
      output: lines.join("\n"),
      metadata: {
        targetDir: baseDir,
        bundledDir,
        installed,
        skipped,
        failed,
        totalAgents: AGENT_NAMES.length,
      },
    };
  },
});

/** Public re-exports for the CLI binary. */
export { resolveOpencodeConfigDir, resolveBundledAgentsDir, AGENT_NAMES };
export type { AgentName };
