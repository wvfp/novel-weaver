import { defineConfig } from "tsup";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const promptsDir = resolve("src/agents/prompts");
const distPromptsDir = resolve("dist/agents/prompts");
const genrePacksDir = resolve("src/genre-packs");
const distGenrePacksDir = resolve("dist/genre-packs");

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
  // Copy static assets (agent .md prompts + genre pack JSON files) to dist
  onSuccess: async () => {
    // Agent prompts
    if (existsSync(promptsDir)) {
      mkdirSync(distPromptsDir, { recursive: true });
      cpSync(promptsDir, distPromptsDir, {
        recursive: true,
        filter: (src) => src.endsWith(".md") || !src.includes("."),
      });
      console.log(`[novel-weaver] Copied agent .md files to ${distPromptsDir}`);
    }
    // Genre packs (pack.json + arc-templates/*.json)
    if (existsSync(genrePacksDir)) {
      mkdirSync(distGenrePacksDir, { recursive: true });
      const entries = cpSync(genrePacksDir, distGenrePacksDir, {
        recursive: true,
        filter: (src) => {
          if (!src.includes(".")) return true; // directory
          const name = src.split(/[/\\]/).pop() ?? "";
          return name === "pack.json" || name.endsWith(".json");
        },
      });
      console.log(`[novel-weaver] Copied genre packs to ${distGenrePacksDir}`);
    }
  },
});
