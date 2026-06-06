import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { handleModelCommand, parseModelArgs } from "./model.js";
import {
  initModelResolver,
  getModelResolver,
  type ModelResolver,
} from "../services/model-resolver.js";
import { DEFAULT_TASK_MODELS } from "../config.js";
import { ConfigFileService } from "../services/config-file.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Make a fresh empty temp directory for each test. */
async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "novel-model-cmd-"));
}

// ---------------------------------------------------------------------------
// parseModelArgs
// ---------------------------------------------------------------------------

describe("parseModelArgs", () => {
  test("list with no args", () => {
    expect(parseModelArgs("list")).toEqual({ subcommand: "list" });
  });

  test("set with task and model", () => {
    expect(parseModelArgs("set write anthropic/claude-opus-4")).toEqual({
      subcommand: "set",
      task: "write",
      model: "anthropic/claude-opus-4",
    });
  });

  test("use with simple model id", () => {
    expect(parseModelArgs("use write opus-4")).toEqual({
      subcommand: "use",
      task: "write",
      model: "opus-4",
    });
  });

  test("reset with task", () => {
    expect(parseModelArgs("reset write")).toEqual({
      subcommand: "reset",
      task: "write",
    });
  });

  test("reset-all", () => {
    expect(parseModelArgs("reset-all")).toEqual({ subcommand: "reset-all" });
  });

  test("save", () => {
    expect(parseModelArgs("save")).toEqual({ subcommand: "save" });
  });

  test("cost", () => {
    expect(parseModelArgs("cost")).toEqual({ subcommand: "cost" });
  });

  test("empty string yields help", () => {
    expect(parseModelArgs("")).toEqual({ subcommand: "help" });
    expect(parseModelArgs("   ")).toEqual({ subcommand: "help" });
  });

  test("missing args yields help (set without model)", () => {
    expect(parseModelArgs("set write")).toEqual({ subcommand: "help" });
  });

  test("missing args yields help (reset without task)", () => {
    expect(parseModelArgs("reset")).toEqual({ subcommand: "help" });
  });

  test("unknown subcommand yields help", () => {
    expect(parseModelArgs("frobnicate")).toEqual({ subcommand: "help" });
  });

  test("trims leading/trailing whitespace", () => {
    expect(parseModelArgs("  list  ")).toEqual({ subcommand: "list" });
  });
});

// ---------------------------------------------------------------------------
// /novel:model command router
// ---------------------------------------------------------------------------

describe("handleModelCommand", () => {
  let tempDir: string;
  let resolver: ModelResolver;
  let configService: ConfigFileService;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    // Each test gets a fresh singleton pointed at its own temp dir,
    // and `init()` is called eagerly so `getModel()` sees an empty
    // config (not the previous test's leftovers).
    resolver = initModelResolver(tempDir);
    await resolver.init();
    configService = new ConfigFileService(tempDir);
  });

  afterEach(async () => {
    // The singleton factory has no public reset, so the next test
    // overwrites the cache via `initModelResolver`. Still good
    // hygiene to clear in-memory session overrides between tests.
    resolver.clearAllSessionOverrides();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  test("list — returns formatted table with default source", async () => {
    const result = await handleModelCommand("list", tempDir);

    expect(result.output).toContain("当前任务模型：");
    // Every default task should appear with its hardcoded model.
    for (const [task, model] of Object.entries(DEFAULT_TASK_MODELS)) {
      expect(result.output).toContain(task);
      expect(result.output).toContain(model);
      expect(result.output).toContain("(来源: 默认)");
    }
  });

  test("list — shows 配置文件 source after seeding the config", async () => {
    // Seed the resolver's in-memory file layer AND the on-disk file
    // via its own setter so both stay in sync (the resolver caches
    // the file read after the first init()).
    await resolver.setPersistentConfig("review", "openai/gpt-4o");

    const result = await handleModelCommand("list", tempDir);

    expect(result.output).toContain("openai/gpt-4o");
    expect(result.output).toContain("(来源: 配置文件)");
  });

  test("list — shows 临时覆盖 source after a session override", async () => {
    resolver.setSessionOverride("query", "anthropic/claude-sonnet-4");

    const result = await handleModelCommand("list", tempDir);

    expect(result.output).toContain("anthropic/claude-sonnet-4");
    expect(result.output).toContain("(来源: 临时覆盖)");
  });

  // -----------------------------------------------------------------------
  // set
  // -----------------------------------------------------------------------

  test("set — writes to config file and clears any session override", async () => {
    // Pre-existing session override should be wiped on set.
    resolver.setSessionOverride("write", "temp/model");

    const result = await handleModelCommand(
      "set write anthropic/claude-opus-4",
      tempDir,
    );

    expect(result.output).toBe(
      "已设置 write = anthropic/claude-opus-4，已保存到配置文件",
    );

    // Verify the file actually contains the new value.
    const onDisk = await configService.load();
    expect(onDisk.taskModel?.write).toBe("anthropic/claude-opus-4");

    // Session override should be gone — re-resolving must use the file.
    expect(resolver.getModel("write")).toBe("anthropic/claude-opus-4");
    expect(resolver.getResolution("write").source).toBe("config");
  });

  test("set — preserves other config entries", async () => {
    await resolver.setPersistentConfig("review", "anthropic/claude-sonnet-4");

    await handleModelCommand("set write anthropic/claude-opus-4", tempDir);

    const onDisk = await configService.load();
    expect(onDisk.taskModel?.write).toBe("anthropic/claude-opus-4");
    expect(onDisk.taskModel?.review).toBe("anthropic/claude-sonnet-4");
  });

  // -----------------------------------------------------------------------
  // use
  // -----------------------------------------------------------------------

  test("use — sets session override without touching config file", async () => {
    await resolver.setPersistentConfig("write", "file/model");

    const result = await handleModelCommand("use write opus-4", tempDir);

    expect(result.output).toBe(
      "本次会话内 write 临时使用 opus-4，配置文件未修改",
    );

    // Resolver state
    expect(resolver.getModel("write")).toBe("opus-4");
    expect(resolver.getResolution("write").source).toBe("session");
    expect(resolver.getSessionOverrides().write).toBe("opus-4");

    // Config file should still have the original value.
    const onDisk = await configService.load();
    expect(onDisk.taskModel?.write).toBe("file/model");
  });

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------

  test("reset — clears a single task's session override", async () => {
    resolver.setSessionOverride("write", "temp/model");
    resolver.setSessionOverride("review", "temp/other");

    const result = await handleModelCommand("reset write", tempDir);

    expect(result.output).toBe("已重置 write 为默认/配置文件值");
    expect(resolver.getSessionOverrides().write).toBeUndefined();
    expect(resolver.getSessionOverrides().review).toBe("temp/other");
  });

  // -----------------------------------------------------------------------
  // reset-all
  // -----------------------------------------------------------------------

  test("reset-all — clears every session override", async () => {
    resolver.setSessionOverride("write", "temp/a");
    resolver.setSessionOverride("review", "temp/b");

    const result = await handleModelCommand("reset-all", tempDir);

    expect(result.output).toBe("已重置所有任务模型");
    expect(resolver.getSessionOverrides()).toEqual({});
  });

  // -----------------------------------------------------------------------
  // save
  // -----------------------------------------------------------------------

  test("save — writes every current session override to the config file", async () => {
    resolver.setSessionOverride("write", "anthropic/claude-opus-4");
    resolver.setSessionOverride("review", "anthropic/claude-sonnet-4");

    const result = await handleModelCommand("save", tempDir);

    expect(result.output).toBe("已保存 2 个临时覆盖到配置文件");

    const onDisk = await configService.load();
    expect(onDisk.taskModel?.write).toBe("anthropic/claude-opus-4");
    expect(onDisk.taskModel?.review).toBe("anthropic/claude-sonnet-4");

    // The session overrides themselves are not auto-cleared: the
    // spec only requires the file be updated so the values survive
    // a session restart, not that the live override state flip.
    expect(resolver.getSessionOverrides().write).toBe("anthropic/claude-opus-4");
  });

  test("save — short-circuits with a friendly message when nothing to save", async () => {
    const result = await handleModelCommand("save", tempDir);
    expect(result.output).toBe("当前没有临时覆盖需要保存");
  });

  // -----------------------------------------------------------------------
  // cost
  // -----------------------------------------------------------------------

  test("cost — returns usage report with per-task lines and total", async () => {
    resolver.recordUsage("write", 1234, 5678);
    resolver.recordUsage("review", 500, 200);

    const result = await handleModelCommand("cost", tempDir);

    expect(result.output).toContain("本会话 token 消耗：");
    // Each task appears on its own row, padded to align the columns.
    expect(result.output).toMatch(/write\s+输入 1,234/);
    expect(result.output).toMatch(/review\s+输入 500/);
    expect(result.output).toMatch(/write\s+输入 1,234\s+输出 5,678/);
    expect(result.output).toContain("总成本: $");
  });

  test("cost — returns empty report when no usage recorded", async () => {
    const result = await handleModelCommand("cost", tempDir);
    expect(result.output).toContain("本会话 token 消耗：");
    expect(result.output).toContain("(暂无记录)");
    expect(result.output).toContain("总成本: $0.00");
  });

  // -----------------------------------------------------------------------
  // help / error paths
  // -----------------------------------------------------------------------

  test("help — returned for empty input", async () => {
    const result = await handleModelCommand("", tempDir);
    expect(result.output).toContain("用法: /novel:model <subcommand>");
  });

  test("help — returned for unknown subcommand", async () => {
    const result = await handleModelCommand("frobnicate", tempDir);
    expect(result.output).toContain("用法: /novel:model <subcommand>");
  });

  test("set — missing model returns help", async () => {
    const result = await handleModelCommand("set write", tempDir);
    expect(result.output).toContain("用法: /novel:model <subcommand>");
  });

  test("reset — missing task returns help", async () => {
    const result = await handleModelCommand("reset", tempDir);
    expect(result.output).toContain("用法: /novel:model <subcommand>");
  });
});
