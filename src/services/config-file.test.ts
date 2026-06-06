/**
 * Unit tests for ConfigFileService.
 *
 * Each test uses an isolated temp directory under `os.tmpdir()` and
 * cleans up its own scratch space. No fixtures, no shared state, no
 * mocks — these tests exercise the real filesystem.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  ConfigFileService,
  createDefaultConfig,
  mergeConfig,
} from "./config-file";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/** Fresh temp dir for a single test; cleaned up in `afterEach`. */
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-wvr-cfg-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getConfigPath
// ---------------------------------------------------------------------------

describe("ConfigFileService.getConfigPath", () => {
  test("returns {projectRoot}/.novel-weaver/config.json", () => {
    // given
    const service = new ConfigFileService(tmpRoot);

    // when
    const configPath = service.getConfigPath();

    // then
    expect(configPath).toBe(path.join(tmpRoot, ".novel-weaver", "config.json"));
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("ConfigFileService.exists", () => {
  test("returns false when config file is missing", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);

    // when
    const present = await service.exists();

    // then
    expect(present).toBe(false);
  });

  test("returns true when config file is present", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({ taskModel: { write: "x" } });

    // when
    const present = await service.exists();

    // then
    expect(present).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

describe("ConfigFileService.load", () => {
  test("returns empty object when file is missing (does not throw)", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);

    // when
    const loaded = await service.load();

    // then
    expect(loaded).toEqual({});
  });

  test("returns parsed content when file exists", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    const seeded = {
      taskModel: { write: "anthropic/claude-opus-4" },
      temperature: { write: 0.7 },
    };
    await service.save(seeded);

    // when
    const loaded = await service.load();

    // then
    expect(loaded).toEqual(seeded);
  });

  test("returns {} when file is malformed JSON (no throw)", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await fs.mkdir(path.join(tmpRoot, ".novel-weaver"), { recursive: true });
    await fs.writeFile(service.getConfigPath(), "{ this is not json", "utf-8");

    // when
    const loaded = await service.load();

    // then
    expect(loaded).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// save
// ---------------------------------------------------------------------------

describe("ConfigFileService.save", () => {
  test("creates .novel-weaver/ directory if it is missing", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    const configDir = path.join(tmpRoot, ".novel-weaver");
    await fs.rm(configDir, { recursive: true, force: true });

    // when
    await service.save({ taskModel: { write: "anthropic/claude-opus-4" } });

    // then
    const stat = await fs.stat(configDir);
    expect(stat.isDirectory()).toBe(true);
    const written = await fs.readFile(service.getConfigPath(), "utf-8");
    expect(written.length).toBeGreaterThan(0);
  });

  test("writes JSON with 2-space indent", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    const payload = { taskModel: { write: "anthropic/claude-opus-4" } };

    // when
    await service.save(payload);

    // then
    const raw = await fs.readFile(service.getConfigPath(), "utf-8");
    expect(raw).toBe(JSON.stringify(payload, null, 2));
    // Sanity-check: the serialized form must contain a 2-space-indented key.
    expect(raw).toContain('  "taskModel"');
  });

  test("does not leave a .tmp file behind on success", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);

    // when
    await service.save({ taskModel: { write: "x" } });

    // then
    await expect(
      fs.access(`${service.getConfigPath()}.tmp`)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("ConfigFileService.update", () => {
  test("merges new taskModel entries with existing entries", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({
      taskModel: { write: "anthropic/claude-opus-4", review: "anthropic/claude-sonnet-4" },
    });

    // when
    const merged = await service.update({
      taskModel: { review: "anthropic/claude-opus-4" },
    });

    // then
    expect(merged.taskModel).toEqual({
      write: "anthropic/claude-opus-4",
      review: "anthropic/claude-opus-4",
    });
  });

  test("deep-merges temperature and maxTokens fields", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({
      temperature: { write: 0.8, review: 0.2 },
      maxTokens: { write: 8000 },
    });

    // when
    const merged = await service.update({
      temperature: { query: 0.3 },
      maxTokens: { review: 2000 },
    });

    // then
    expect(merged.temperature).toEqual({ write: 0.8, review: 0.2, query: 0.3 });
    expect(merged.maxTokens).toEqual({ write: 8000, review: 2000 });
  });

  test("preserves unknown top-level fields", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({
      taskModel: { write: "anthropic/claude-opus-4" },
      customFlag: { nested: { deep: 42 } },
      customArray: [1, 2, 3],
    });

    // when
    const merged = await service.update({
      taskModel: { review: "anthropic/claude-sonnet-4" },
    });

    // then
    expect(merged.customFlag).toEqual({ nested: { deep: 42 } });
    expect(merged.customArray).toEqual([1, 2, 3]);
    expect(merged.taskModel).toEqual({
      write: "anthropic/claude-opus-4",
      review: "anthropic/claude-sonnet-4",
    });
  });

  test("replaces non-deep-merge top-level keys outright", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({ theme: "dark", extra: "keep" });

    // when
    const merged = await service.update({ theme: "light" });

    // then
    expect(merged.theme).toBe("light");
    expect(merged.extra).toBe("keep");
  });

  test("persists the merged result to disk", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.update({ taskModel: { write: "anthropic/claude-opus-4" } });

    // when
    const reloaded = await service.load();

    // then
    expect(reloaded.taskModel).toEqual({ write: "anthropic/claude-opus-4" });
  });
});

// ---------------------------------------------------------------------------
// readRaw
// ---------------------------------------------------------------------------

describe("ConfigFileService.readRaw", () => {
  test("returns empty string when file is missing", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);

    // when
    const raw = await service.readRaw();

    // then
    expect(raw).toBe("");
  });

  test("returns the raw JSON text when file is present", async () => {
    // given
    const service = new ConfigFileService(tmpRoot);
    await service.save({ taskModel: { write: "anthropic/claude-opus-4" } });

    // when
    const raw = await service.readRaw();

    // then
    expect(raw).toBe(JSON.stringify({ taskModel: { write: "anthropic/claude-opus-4" } }, null, 2));
  });
});

// ---------------------------------------------------------------------------
// createDefaultConfig
// ---------------------------------------------------------------------------

describe("createDefaultConfig", () => {
  test("returns the documented default structure", () => {
    // when
    const defaults = createDefaultConfig();

    // then
    expect(defaults.taskModel).toEqual({
      write: "anthropic/claude-opus-4",
      review: "anthropic/claude-sonnet-4",
      query: "anthropic/claude-haiku-4",
      summary: "anthropic/claude-haiku-4",
      consistency: "anthropic/claude-sonnet-4",
      agent: "anthropic/claude-opus-4",
      extract: "anthropic/claude-haiku-4",
      planning: "anthropic/claude-sonnet-4",
    });
    expect(defaults.temperature).toEqual({
      write: 0.8,
      review: 0.2,
      query: 0.3,
      summary: 0.3,
      consistency: 0.2,
    });
    expect(defaults.maxTokens).toEqual({
      write: 8000,
      review: 2000,
      query: 4000,
      summary: 2000,
    });
  });

  test("returns a fresh object on every call (no shared references)", () => {
    // when
    const a = createDefaultConfig();
    const b = createDefaultConfig();

    // then
    expect(a).not.toBe(b);
    a.taskModel!.write = "mutated";
    expect(b.taskModel!.write).toBe("anthropic/claude-opus-4");
  });
});

// ---------------------------------------------------------------------------
// mergeConfig (internal helper)
// ---------------------------------------------------------------------------

describe("mergeConfig", () => {
  test("deep-merges taskModel", () => {
    // given
    const current = { taskModel: { write: "a", review: "b" } };

    // when
    const merged = mergeConfig(current, { taskModel: { review: "c" } });

    // then
    expect(merged.taskModel).toEqual({ write: "a", review: "c" });
  });

  test("does not mutate the input", () => {
    // given
    const current = { taskModel: { write: "a" } };

    // when
    mergeConfig(current, { taskModel: { review: "b" } });

    // then
    expect(current).toEqual({ taskModel: { write: "a" } });
  });

  test("ignores undefined update values", () => {
    // given
    const current = { taskModel: { write: "a" } };

    // when
    const merged = mergeConfig(current, { taskModel: undefined });

    // then
    expect(merged).toEqual({ taskModel: { write: "a" } });
  });
});
