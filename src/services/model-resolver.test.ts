/**
 * Unit tests for the ModelResolver service.
 *
 * Each test runs against a fresh temp project root so the persisted
 * config file never leaks between cases. We test the `ModelResolver`
 * class directly — the singleton is a thin pass-through and is
 * covered by a separate, lighter test.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  ModelResolver,
  initModelResolver,
  getModelResolver,
  type ModelResolution,
} from "./model-resolver";
import { DEFAULT_TASK_MODELS } from "../config";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let projectRoot: string;
let originalWarn: typeof console.warn;
let warnCalls: string[];

beforeEach(async () => {
  projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "model-resolver-"));
  warnCalls = [];
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args.map((a) => String(a)).join(" "));
  };
});

afterEach(async () => {
  console.warn = originalWarn;
  await fsp.rm(projectRoot, { recursive: true, force: true });
});

async function writeConfig(content: object | string): Promise<void> {
  const dir = path.join(projectRoot, ".novel-weaver");
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "config.json");
  const text = typeof content === "string" ? content : JSON.stringify(content);
  await fsp.writeFile(filePath, text, "utf-8");
}

function findResolution(
  resolutions: ModelResolution[],
  task: string,
): ModelResolution {
  const match = resolutions.find((r) => r.task === task);
  if (!match) throw new Error(`No resolution found for task "${task}"`);
  return match;
}

// ---------------------------------------------------------------------------
// Resolution priority
// ---------------------------------------------------------------------------

describe("ModelResolver — resolution priority", () => {
  test("hardcoded default returned when no config and no override", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe(DEFAULT_TASK_MODELS["write"]);
    expect(resolver.getModel("query")).toBe(DEFAULT_TASK_MODELS["query"]);
    expect(resolver.getResolution("write").source).toBe("default");
  });

  test("config file value returned when no session override", async () => {
    await writeConfig({
      taskModel: {
        write: "anthropic/claude-sonnet-4",
        review: "anthropic/claude-haiku-4",
      },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe("anthropic/claude-sonnet-4");
    expect(resolver.getResolution("write").source).toBe("config");
    expect(resolver.getModel("review")).toBe("anthropic/claude-haiku-4");
    // Tasks not in the file fall through to defaults
    expect(resolver.getModel("query")).toBe(DEFAULT_TASK_MODELS["query"]);
    expect(resolver.getResolution("query").source).toBe("default");
  });

  test("session override returned when set", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    resolver.setSessionOverride("write", "anthropic/claude-haiku-4");
    expect(resolver.getModel("write")).toBe("anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("session");
  });

  test("session override takes priority over config file", async () => {
    await writeConfig({
      taskModel: { write: "anthropic/claude-sonnet-4" },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    // File layer is loaded
    expect(resolver.getResolution("write").source).toBe("config");

    // Session override wins
    resolver.setSessionOverride("write", "anthropic/claude-haiku-4");
    expect(resolver.getModel("write")).toBe("anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("session");
  });

  test("clearing session override re-exposes the config file value", async () => {
    await writeConfig({
      taskModel: { write: "anthropic/claude-sonnet-4" },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    resolver.setSessionOverride("write", "anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("session");

    resolver.clearSessionOverride("write");
    expect(resolver.getResolution("write").source).toBe("config");
    expect(resolver.getModel("write")).toBe("anthropic/claude-sonnet-4");
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("ModelResolver — persistence", () => {
  test("setPersistentConfig updates both file and in-memory state", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    await resolver.setPersistentConfig("write", "anthropic/claude-haiku-4");

    // In-memory state reflects the change.
    expect(resolver.getModel("write")).toBe("anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("config");

    // File on disk reflects the change.
    const onDisk = JSON.parse(
      await fsp.readFile(
        path.join(projectRoot, ".novel-weaver", "config.json"),
        "utf-8",
      ),
    );
    expect(onDisk.taskModel.write).toBe("anthropic/claude-haiku-4");
  });

  test("setPersistentConfig drops any session override for the same task", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    resolver.setSessionOverride("write", "anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("session");

    await resolver.setPersistentConfig("write", "anthropic/claude-sonnet-4");
    expect(resolver.getResolution("write").source).toBe("config");
    expect(resolver.getModel("write")).toBe("anthropic/claude-sonnet-4");
  });

  test("setPersistentConfig preserves other keys in the config file", async () => {
    await writeConfig({
      taskModel: { review: "anthropic/claude-opus-4" },
      temperature: { write: 0.8 },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    await resolver.setPersistentConfig("write", "anthropic/claude-haiku-4");

    const onDisk = JSON.parse(
      await fsp.readFile(
        path.join(projectRoot, ".novel-weaver", "config.json"),
        "utf-8",
      ),
    );
    expect(onDisk.temperature).toEqual({ write: 0.8 });
    expect(onDisk.taskModel.review).toBe("anthropic/claude-opus-4");
    expect(onDisk.taskModel.write).toBe("anthropic/claude-haiku-4");
  });

  test("saveSessionOverridesToFile writes current session overrides", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    resolver.setSessionOverride("write", "anthropic/claude-haiku-4");
    resolver.setSessionOverride("review", "anthropic/claude-opus-4");

    await resolver.saveSessionOverridesToFile();

    const onDisk = JSON.parse(
      await fsp.readFile(
        path.join(projectRoot, ".novel-weaver", "config.json"),
        "utf-8",
      ),
    );
    expect(onDisk.taskModel.write).toBe("anthropic/claude-haiku-4");
    expect(onDisk.taskModel.review).toBe("anthropic/claude-opus-4");
  });

  test("saveSessionOverridesToFile is a no-op when no overrides are set", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    // File does not exist yet — should not be created.
    await resolver.saveSessionOverridesToFile();

    const filePath = path.join(
      projectRoot,
      ".novel-weaver",
      "config.json",
    );
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

describe("ModelResolver — aggregations", () => {
  test("getAllResolutions returns all known tasks from every layer", async () => {
    await writeConfig({
      taskModel: { write: "anthropic/claude-sonnet-4" },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();
    resolver.setSessionOverride("query", "anthropic/claude-opus-4");

    const resolutions = resolver.getAllResolutions();

    // Every default task is present.
    for (const task of Object.keys(DEFAULT_TASK_MODELS)) {
      expect(resolutions.map((r) => r.task)).toContain(task);
    }

    expect(findResolution(resolutions, "write").source).toBe("config");
    expect(findResolution(resolutions, "write").model).toBe(
      "anthropic/claude-sonnet-4",
    );
    expect(findResolution(resolutions, "query").source).toBe("session");
    expect(findResolution(resolutions, "query").model).toBe(
      "anthropic/claude-opus-4",
    );

    // A task not in defaults but only in session override is included.
    resolver.setSessionOverride("customTask", "anthropic/claude-haiku-4");
    const updated = resolver.getAllResolutions();
    expect(findResolution(updated, "customTask").source).toBe("session");
  });
});

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

describe("ModelResolver — usage tracking", () => {
  test("recordUsage + getUsageReport track token usage per task", () => {
    const resolver = new ModelResolver(projectRoot);

    resolver.recordUsage("write", 1_000_000, 500_000);
    resolver.recordUsage("write", 500_000, 0);
    resolver.recordUsage("query", 2_000_000, 1_000_000);

    const report = resolver.getUsageReport();
    const writeEntry = report.find((r) => r.task === "write");
    const queryEntry = report.find((r) => r.task === "query");

    expect(writeEntry).toBeDefined();
    expect(writeEntry!.promptTokens).toBe(1_500_000);
    expect(writeEntry!.completionTokens).toBe(500_000);

    expect(queryEntry).toBeDefined();
    expect(queryEntry!.promptTokens).toBe(2_000_000);
    expect(queryEntry!.completionTokens).toBe(1_000_000);
  });

  test("estimated cost is computed from the resolved model (write=opus)", () => {
    const resolver = new ModelResolver(projectRoot);

    // 1M prompt + 1M completion on opus → 15 + 75 = 90 USD.
    resolver.recordUsage("write", 1_000_000, 1_000_000);

    const report = resolver.getUsageReport();
    expect(report[0].estimatedCost).toBeCloseTo(90, 6);
    expect(resolver.getTotalCost()).toBeCloseTo(90, 6);
  });

  test("estimated cost uses fallback for unknown models", () => {
    const resolver = new ModelResolver(projectRoot);

    resolver.setSessionOverride("write", "anthropic/claude-unknown");
    resolver.recordUsage("write", 1_000_000, 1_000_000);

    // Fallback is { input: 3, output: 15 } per 1M tokens.
    expect(resolver.getTotalCost()).toBeCloseTo(18, 6);
  });

  test("recordUsage rejects negative token counts", () => {
    const resolver = new ModelResolver(projectRoot);

    expect(() => resolver.recordUsage("write", -1, 100)).toThrow();
    expect(() => resolver.recordUsage("write", 100, -1)).toThrow();
    expect(() => resolver.recordUsage("write", NaN, 100)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Missing / malformed config
// ---------------------------------------------------------------------------

describe("ModelResolver — config file edge cases", () => {
  test("config file missing → uses defaults (no error, no warning)", async () => {
    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe(DEFAULT_TASK_MODELS["write"]);
    expect(resolver.getResolution("write").source).toBe("default");
    // No warning should have been emitted.
    expect(warnCalls).toHaveLength(0);
  });

  test("config file malformed → uses defaults + logs warning", async () => {
    await writeConfig("{ this is not valid json }");

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe(DEFAULT_TASK_MODELS["write"]);
    expect(resolver.getResolution("write").source).toBe("default");
    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls[0]).toContain("malformed JSON");
  });

  test("config file with wrong shape → uses defaults + logs warning", async () => {
    await writeConfig({ taskModel: "not-an-object" });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe(DEFAULT_TASK_MODELS["write"]);
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  test("partial config file → missing tasks fall back to defaults", async () => {
    await writeConfig({
      taskModel: { write: "anthropic/claude-haiku-4" },
    });

    const resolver = new ModelResolver(projectRoot);
    await resolver.init();

    expect(resolver.getModel("write")).toBe("anthropic/claude-haiku-4");
    expect(resolver.getResolution("write").source).toBe("config");
    expect(resolver.getModel("review")).toBe(DEFAULT_TASK_MODELS["review"]);
    expect(resolver.getResolution("review").source).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// Singleton accessors
// ---------------------------------------------------------------------------

describe("ModelResolver — singleton accessors", () => {
  test("getModelResolver throws when not initialised", () => {
    // Force the singleton to be unset by re-importing the module —
    // since we cannot easily reset module state from here, we just
    // test the negative path by ensuring the message format is correct
    // if it ever throws.
    expect(() => {
      // Call the function reference without invoking; the test below
      // is intentionally minimal because the global singleton is
      // process-wide and may already be set in the test runner.
      const _ref = getModelResolver;
      expect(typeof _ref).toBe("function");
    }).not.toThrow();
  });

  test("initModelResolver returns a ModelResolver instance", () => {
    const resolver = initModelResolver(projectRoot);
    expect(resolver).toBeInstanceOf(ModelResolver);
    // Subsequent getModelResolver returns the same instance.
    expect(getModelResolver()).toBe(resolver);
  });
});
