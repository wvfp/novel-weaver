import { defineConfig } from "tsup";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const promptsDir = resolve("src/agents/prompts");
const distPromptsDir = resolve("dist/agents/prompts");

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/mcp-server.ts",
    "src/tools/install-agents.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  splitting: false,
  // Copy agent .md files to dist so the plugin can ship them to ~/.config/opencode/agent/
  onSuccess: async () => {
    if (existsSync(promptsDir)) {
      mkdirSync(distPromptsDir, { recursive: true });
      cpSync(promptsDir, distPromptsDir, {
        recursive: true,
        filter: (src) => src.endsWith(".md") || !src.includes("."),
      });
      console.log(`[novel-weaver] Copied agent .md files to ${distPromptsDir}`);
    }
  },
});
