#!/usr/bin/env node
/**
 * novel-weaver CLI (vanilla JS, no TypeScript)
 */

import {
  resolveOpencodeConfigDir,
  resolveBundledAgentsDir,
} from "../dist/tools/install-agents.js";
import * as fs from "node:fs";
import * as path from "node:path";

const VERSION = "0.1.4";

function printHelp() {
  console.log(`novel-weaver v${VERSION} — novel writing toolkit for OpenCode

Usage:
  novel-weaver <command> [options]

Commands:
  install-agents    Install 4 agent .md files to the OpenCode agent directory
                    (ArcMaster, WorldBuilder, Reviewer, PlotPlanner)
                    Options:
                      --force         Overwrite existing files
                      --target <dir>  Override target directory

  mcp               Run as an MCP (Model Context Protocol) server on stdio.
                    Exposes all novel-weaver tools to MCP-compatible clients
                    (omo, Claude Desktop, Cursor, custom agents, etc).
                    Options:
                      --dir <path>    Set the project directory (default: cwd)
                      --list-tools    List tool names + descriptions and exit

  --version         Print version and exit
  --help, -h        Print this help and exit

Examples:
  # Install agents to default location
  npx novel-weaver install-agents

  # Run as MCP server
  npx novel-weaver mcp

  # Use as MCP server from a custom directory
  npx novel-weaver mcp --dir /path/to/novel-project
`);
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
  const flags = new Set();
  const options = new Map();

  const startIdx = command ? 1 : 0;
  for (let i = startIdx; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force" || arg === "-f") {
      flags.add("force");
    } else if (arg === "--help" || arg === "-h") {
      flags.add("help");
    } else if (arg === "--version" || arg === "-v") {
      flags.add("version");
    } else if (arg === "--target" || arg === "-t") {
      const next = argv[++i];
      if (!next) {
        console.error("Error: --target requires a value");
        process.exit(1);
      }
      options.set("target", next);
    } else if (arg === "--dir") {
      const next = argv[++i];
      if (!next) {
        console.error("Error: --dir requires a value");
        process.exit(1);
      }
      options.set("dir", next);
    } else if (arg === "--list-tools") {
      flags.add("list-tools");
    } else {
      console.error(`Error: unknown argument '${arg}'`);
      process.exit(1);
    }
  }

  return { command, flags, options };
}

function installAgents(opts) {
  const bundledDir = resolveBundledAgentsDir();
  if (!bundledDir) {
    console.error(
      `❌ Cannot locate bundled agent .md files.\n` +
        `   This usually means the plugin was not built with the agent files copied.\n` +
        `   Try: cd <plugin-root> && npm run build`,
    );
    process.exit(2);
  }

  const baseDir =
    opts.options.get("target") || path.join(resolveOpencodeConfigDir(), "agent");
  const force = opts.flags.has("force");

  try {
    fs.mkdirSync(baseDir, { recursive: true });
  } catch (err) {
    console.error(
      `❌ Failed to create directory '${baseDir}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(2);
  }

  const NAMES = ["ArcMaster", "WorldBuilder", "Reviewer", "PlotPlanner"];
  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of NAMES) {
    const src = path.join(bundledDir, `${name}.md`);
    const dst = path.join(baseDir, `${name}.md`);

    if (!fs.existsSync(src)) {
      console.error(`❌ Source file not found: ${src}`);
      failed++;
      continue;
    }
    if (fs.existsSync(dst) && !force) {
      console.log(`⏭  Skip (exists): ${name}.md`);
      skipped++;
      continue;
    }
    try {
      fs.copyFileSync(src, dst);
      console.log(`✅ Installed: ${name}.md`);
      installed++;
    } catch (err) {
      console.error(
        `❌ Failed to copy ${name}.md: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      failed++;
    }
  }

  console.log(``);
  console.log(`📁 Target: ${baseDir}`);
  console.log(`📊 Summary: ${installed} installed, ${skipped} skipped, ${failed} failed`);

  if (installed > 0) {
    console.log(``);
    console.log(`🎯 Next steps:`);
    console.log(`   1. Restart OpenCode to rescan the agent directory.`);
    console.log(`   2. In omo / Sisyphus, switch via:`);
    for (const name of NAMES) {
      console.log(`      task(agent="${name}", prompt="...")`);
    }
  }

  process.exit(failed > 0 ? 2 : 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help")) {
    printHelp();
    return;
  }
  if (args.flags.has("version")) {
    console.log(`novel-weaver v${VERSION}`);
    return;
  }

  if (!args.command) {
    printHelp();
    process.exit(1);
  }

  switch (args.command) {
    case "install-agents":
      installAgents(args);
      break;
    case "mcp":
      runMcp(args);
      break;
    default:
      console.error(`❌ Unknown command: '${args.command}'\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(2);
});

// ── MCP subcommand ─────────────────────────────────────────────────────────

async function runMcp(opts) {
  const { runMcpServer, deriveToolName, TOOL_DEFINITIONS } = await import(
    "../dist/mcp-server.js"
  );

  const directory = opts.options.get("dir") || process.cwd();

  if (opts.flags.has("list-tools")) {
    console.log(`novel-weaver v${VERSION} — ${TOOL_DEFINITIONS.length} tools available\n`);
    for (const def of TOOL_DEFINITIONS) {
      const name = deriveToolName(def);
      const desc = def.description.split("\n")[0].slice(0, 100);
      console.log(`  ${name.padEnd(40)} ${desc}`);
    }
    return;
  }

  await runMcpServer(directory);
}
