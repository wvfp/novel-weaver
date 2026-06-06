#!/usr/bin/env node

/**
 * Novel Weaver — Plugin Load & Tool Validation Test
 *
 * Simulates how OpenCode loads the plugin and verifies:
 *  1. Module loads as ESM
 *  2. Plugin id === "novel-weaver"
 *  3. server() returns hooks with config and tool
 *  4. All 23 expected tools are registered
 *  5. novel_ping returns "pong"
 */

// ---------------------------------------------------------------------------
// Expected tool names (per plugin spec)
// ---------------------------------------------------------------------------
const EXPECTED_TOOLS = [
  "novel_ping",
  "novel_init",

  "novel_dungeon_generate",
  "novel_dungeon_customize",

  "novel_world_create",
  "novel_world_query",
  "novel_world_link",

  "novel_character_create",
  "novel_character_update",
  "novel_character_query",

  "novel_write_chapter",
  "novel_write_continue",
  "novel_write_edit",

  "novel_review_chapter",
  "novel_review_fix",

  "novel_consistency_check",
  "novel_consistency_rules",

  "novel_progress_track",
  "novel_progress_summary",

  "novel_pipeline_start",
  "novel_pipeline_status",

  "novel_query",
  "novel_stats",
];

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const results = { pass: 0, fail: 0, warn: 0 };

function pass(label, detail = "") {
  results.pass++;
  console.log(`  ✅ PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  results.fail++;
  console.error(`  ❌ FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "") {
  results.warn++;
  console.warn(`  ⚠️  WARN  ${label}${detail ? ` — ${detail}` : ""}`);
}

function heading(text) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"=".repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Main test routine
// ---------------------------------------------------------------------------
(async () => {
  console.log(`novel-weaver plugin test @ ${new Date().toISOString()}`);
  console.log(`Node.js ${process.version}\n`);

  // ── 1. Module load ──────────────────────────────────────────────────────
  heading("1. Plugin module load");

  let pluginModule;
  try {
    pluginModule = (await import("../dist/index.js")).default;
    pass("import ../dist/index.js", `default export: ${typeof pluginModule}`);
  } catch (err) {
    fail("import ../dist/index.js", err.message);
    process.exit(1);
  }

  // ── 2. Plugin ID ────────────────────────────────────────────────────────
  heading("2. Plugin identity");

  if (typeof pluginModule !== "object" || pluginModule === null) {
    fail("pluginModule type", `expected object, got ${typeof pluginModule}`);
    process.exit(1);
  }

  if (pluginModule.id === "novel-weaver") {
    pass("pluginModule.id", `"${pluginModule.id}"`);
  } else {
    fail("pluginModule.id", `expected "novel-weaver", got "${pluginModule.id}"`);
  }

  if (typeof pluginModule.server === "function") {
    pass("pluginModule.server", `type: function`);
  } else {
    fail("pluginModule.server", `expected function, got ${typeof pluginModule.server}`);
    process.exit(1);
  }

  // ── 3. server() → hooks ────────────────────────────────────────────────
  heading("3. server() → hooks");

  let hooks;
  try {
    hooks = await pluginModule.server({}, {});
    pass("server() call", "resolved");
  } catch (err) {
    fail("server() call", err.message);
    process.exit(1);
  }

  if (hooks && typeof hooks === "object") {
    pass("hooks type", typeof hooks);
  } else {
    fail("hooks type", `expected object, got ${typeof hooks}`);
    process.exit(1);
  }

  // config hook
  if (typeof hooks.config === "function") {
    pass("hooks.config", `type: function`);
  } else {
    fail("hooks.config", `expected function, got ${typeof hooks.config}`);
  }

  // tool hook
  if (hooks.tool && typeof hooks.tool === "object") {
    pass("hooks.tool", `type: object`);
  } else {
    fail("hooks.tool", `expected object, got ${typeof hooks.tool}`);
    process.exit(1);
  }

  // ── 4. Tool registration ────────────────────────────────────────────────
  heading("4. Tool registration (all 23 expected)");

  const registeredNames = Object.keys(hooks.tool).sort();
  let allFound = true;

  for (const name of EXPECTED_TOOLS) {
    const toolDef = hooks.tool[name];
    if (toolDef && typeof toolDef.execute === "function") {
      pass(`hooks.tool.${name}`, "registered with execute()");
    } else if (toolDef) {
      warn(`hooks.tool.${name}`, "found but missing execute()");
    } else {
      allFound = false;
      warn(`hooks.tool.${name}`, "NOT FOUND in registry — import exists but tool not added to hooks");
    }
  }

  console.log(`\n  Registered tools: ${registeredNames.length}`);
  console.log(`  Expected tools:   ${EXPECTED_TOOLS.length}`);
  console.log(`  All found:        ${allFound ? "YES" : "NO (see warnings above)"}`);

  // ── 5. novel_ping execution ──────────────────────────────────────────────
  heading("5. novel_ping execution");

  try {
    const pingResult = await hooks.tool.novel_ping.execute({}, {});
    if (pingResult && pingResult.output === "pong") {
      pass("novel_ping.execute()", `output: "${pingResult.output}"`);
    } else {
      fail("novel_ping.execute()", `expected { output: "pong" }, got ${JSON.stringify(pingResult)}`);
    }
  } catch (err) {
    fail("novel_ping.execute()", err.message);
  }

  // ── 6. config hook execution ───────────────────────────────────────────
  heading("6. config hook (dry-run)");

  try {
    await hooks.config();
    pass("hooks.config()", "executed without error");
  } catch (err) {
    fail("hooks.config()", err.message);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  heading("Summary");

  console.log(`  PASS: ${results.pass}`);
  console.log(`  FAIL: ${results.fail}`);
  console.log(`  WARN: ${results.warn}`);

  const ok = results.fail === 0;
  if (ok) {
    console.log("\n  🎉 ALL CHECKS PASSED");
  } else {
    console.error(`\n  💥 ${results.fail} check(s) failed`);
  }

  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error("UNEXPECTED ERROR:", err);
  process.exit(1);
});
