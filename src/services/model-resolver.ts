/**
 * novel-weaver ModelResolver Service
 *
 * Resolves "which LLM model should I use for task X?" with this priority
 * order (highest to lowest):
 *
 *   1. Session override (in-memory map)
 *   2. Persisted `.novel-weaver/config.json` `taskModel` field
 *   3. Hardcoded `DEFAULT_TASK_MODELS` from `src/config.ts`
 *
 * Also tracks per-task token usage and estimates cost via a small
 * per-model USD/1M-token table (sensible default for unknown models).
 *
 * @packageDocumentation
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { DEFAULT_TASK_MODELS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelSource = "session" | "config" | "default";

export interface ModelResolution {
  model: string;
  source: ModelSource;
  task: string;
}

export interface UsageReportEntry {
  task: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-model USD cost per 1M tokens (input, output). */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-4": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4": { input: 3, output: 15 },
  "anthropic/claude-haiku-4": { input: 0.25, output: 1.25 },
};

/** Fallback cost (per 1M tokens) when the model is not in MODEL_COSTS. */
const FALLBACK_COST = { input: 3, output: 15 };

/** Config file schema — we only validate the parts we care about. */
const TaskModelMap = z.record(z.string(), z.string());

const NovelWeaverFileConfig = z
  .object({
    taskModel: TaskModelMap.optional(),
    temperature: z.record(z.string(), z.number()).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateCostForModel(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const cost = MODEL_COSTS[model] ?? FALLBACK_COST;
  // Costs are per 1M tokens.
  return (
    (promptTokens / 1_000_000) * cost.input +
    (completionTokens / 1_000_000) * cost.output
  );
}

function validateTask(task: string): void {
  if (!task || typeof task !== "string") {
    throw new Error(
      "[novel-weaver] ModelResolver: task must be a non-empty string",
    );
  }
}

function validateModel(model: string): void {
  if (!model || typeof model !== "string") {
    throw new Error(
      "[novel-weaver] ModelResolver: model must be a non-empty string",
    );
  }
}

// ---------------------------------------------------------------------------
// ModelResolver
// ---------------------------------------------------------------------------

/**
 * Resolves the model to use for a given task, layered as:
 *   session override > persisted config file > hardcoded default.
 *
 * The instance is bound to a project root and reads / writes
 * `<projectRoot>/.novel-weaver/config.json` for the persisted layer.
 *
 * Call `init()` once at startup to make the file layer synchronously
 * visible to `getModel` / `getResolution`. Persistence methods
 * (`setPersistentConfig`, `saveSessionOverridesToFile`) re-read the
 * file as needed.
 */
export class ModelResolver {
  private readonly configPath: string;
  private readonly projectRoot: string;
  private fileTaskModels: Record<string, string> = {};
  private readonly sessionOverrides: Map<string, string> = new Map();
  private readonly usage: Map<
    string,
    { promptTokens: number; completionTokens: number }
  > = new Map();
  private fileLoadPromise: Promise<void> | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, ".novel-weaver", "config.json");
  }

  // ---------------------------------------------------------------------
  // Resolution API
  // ---------------------------------------------------------------------

  /** Get model for a task. Returns the resolved model string only. */
  getModel(task: string): string {
    return this.getResolution(task).model;
  }

  /** Get model + source info for a task. */
  getResolution(task: string): ModelResolution {
    validateTask(task);

    const sessionValue = this.sessionOverrides.get(task);
    if (sessionValue !== undefined) {
      return { model: sessionValue, source: "session", task };
    }

    const fileValue = this.fileTaskModels[task];
    if (fileValue !== undefined) {
      return { model: fileValue, source: "config", task };
    }

    const defaultValue = DEFAULT_TASK_MODELS[task];
    if (defaultValue !== undefined) {
      return { model: defaultValue, source: "default", task };
    }

    // Unknown task — fall back to the write default so callers always
    // receive a usable model string.
    return {
      model: DEFAULT_TASK_MODELS["write"] ?? "anthropic/claude-opus-4",
      source: "default",
      task,
    };
  }

  /** Get all current resolutions across all known tasks. */
  getAllResolutions(): ModelResolution[] {
    const tasks = new Set<string>([
      ...Object.keys(DEFAULT_TASK_MODELS),
      ...Object.keys(this.fileTaskModels),
      ...this.sessionOverrides.keys(),
    ]);
    return [...tasks].map((task) => this.getResolution(task));
  }

  // ---------------------------------------------------------------------
  // Session overrides
  // ---------------------------------------------------------------------

  /** Set an in-memory session override for a task (does NOT persist). */
  setSessionOverride(task: string, model: string): void {
    validateTask(task);
    validateModel(model);
    this.sessionOverrides.set(task, model);
  }

  /** Clear the session override for a single task. */
  clearSessionOverride(task: string): void {
    validateTask(task);
    this.sessionOverrides.delete(task);
  }

  /** Clear all session overrides. */
  clearAllSessionOverrides(): void {
    this.sessionOverrides.clear();
  }

  /** Snapshot of the current session override map (read-only copy). */
  getSessionOverrides(): Record<string, string> {
    return Object.fromEntries(this.sessionOverrides);
  }

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  /**
   * Eagerly load the persisted config from disk. Call this once at
   * startup to make `getModel` / `getResolution` synchronously reflect
   * the file layer. Safe to call multiple times — concurrent / repeated
   * calls share the same underlying read.
   */
  async init(): Promise<void> {
    await this.loadFile();
  }

  /** Write current session overrides to the config file. */
  async saveSessionOverridesToFile(): Promise<void> {
    if (this.sessionOverrides.size === 0) return;
    await this.loadFile();
    for (const [task, model] of this.sessionOverrides) {
      this.fileTaskModels[task] = model;
    }
    await this.persist();
  }

  /**
   * Write a value directly to the config file under `taskModel.<task>`,
   * and update the in-memory file-task-models cache. Also drops any
   * session override for the same task (file is now the source of truth).
   */
  async setPersistentConfig(task: string, model: string): Promise<void> {
    validateTask(task);
    validateModel(model);
    await this.loadFile();
    this.fileTaskModels[task] = model;
    this.sessionOverrides.delete(task);
    await this.persist();
  }

  // ---------------------------------------------------------------------
  // Token usage tracking
  // ---------------------------------------------------------------------

  /** Record token usage for a task. Accumulates across calls. */
  recordUsage(
    task: string,
    promptTokens: number,
    completionTokens: number,
  ): void {
    validateTask(task);
    if (!Number.isFinite(promptTokens) || promptTokens < 0) {
      throw new Error(
        "[novel-weaver] ModelResolver.recordUsage: promptTokens must be a non-negative finite number",
      );
    }
    if (!Number.isFinite(completionTokens) || completionTokens < 0) {
      throw new Error(
        "[novel-weaver] ModelResolver.recordUsage: completionTokens must be a non-negative finite number",
      );
    }

    const existing = this.usage.get(task) ?? {
      promptTokens: 0,
      completionTokens: 0,
    };
    existing.promptTokens += promptTokens;
    existing.completionTokens += completionTokens;
    this.usage.set(task, existing);
  }

  /** Per-task usage report with estimated cost in USD. */
  getUsageReport(): UsageReportEntry[] {
    return [...this.usage.entries()].map(([task, counts]) => {
      const model = this.getModel(task);
      return {
        task,
        promptTokens: counts.promptTokens,
        completionTokens: counts.completionTokens,
        estimatedCost: estimateCostForModel(
          model,
          counts.promptTokens,
          counts.completionTokens,
        ),
      };
    });
  }

  /** Total estimated cost across all tracked tasks, in USD. */
  getTotalCost(): number {
    let total = 0;
    for (const [task, counts] of this.usage) {
      const model = this.getModel(task);
      total += estimateCostForModel(
        model,
        counts.promptTokens,
        counts.completionTokens,
      );
    }
    return total;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  /**
   * Load the config file at most once, sharing a single read across
   * concurrent callers. Subsequent calls return the cached promise
   * (or no-op if the file has already been loaded).
   */
  private loadFile(): Promise<void> {
    if (this.fileLoadPromise) return this.fileLoadPromise;
    this.fileLoadPromise = this.readFileFromDisk();
    return this.fileLoadPromise;
  }

  private async readFileFromDisk(): Promise<void> {
    let raw: string;
    try {
      raw = await fsp.readFile(this.configPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      console.warn(
        `[novel-weaver] ModelResolver: failed to read config at ${this.configPath}: ${
          err instanceof Error ? err.message : String(err)
        } — falling back to defaults.`,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(
        `[novel-weaver] ModelResolver: malformed JSON in ${this.configPath}: ${
          err instanceof Error ? err.message : String(err)
        } — falling back to defaults.`,
      );
      return;
    }

    const result = NovelWeaverFileConfig.safeParse(parsed);
    if (!result.success) {
      console.warn(
        `[novel-weaver] ModelResolver: config at ${this.configPath} did not match expected shape — falling back to defaults.`,
      );
      return;
    }

    if (result.data.taskModel) {
      this.fileTaskModels = { ...result.data.taskModel };
    }
  }

  private async persist(): Promise<void> {
    let existing: Record<string, unknown> = {};
    try {
      const raw = await fsp.readFile(this.configPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          `[novel-weaver] ModelResolver: could not read existing config at ${this.configPath} before write: ${
            err instanceof Error ? err.message : String(err)
          } — overwriting.`,
        );
      }
    }

    const next = {
      ...existing,
      taskModel: { ...this.fileTaskModels },
    };

    await fsp.mkdir(path.dirname(this.configPath), { recursive: true });
    await fsp.writeFile(
      this.configPath,
      JSON.stringify(next, null, 2),
      "utf-8",
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton accessors
// ---------------------------------------------------------------------------

let globalResolver: ModelResolver | null = null;

/**
 * Initialise the singleton ModelResolver bound to `projectRoot`.
 * Subsequent `getModelResolver()` calls return this same instance.
 */
export function initModelResolver(projectRoot: string): ModelResolver {
  globalResolver = new ModelResolver(projectRoot);
  return globalResolver;
}

/** Get the current singleton ModelResolver. Throws if uninitialised. */
export function getModelResolver(): ModelResolver {
  if (!globalResolver) {
    throw new Error(
      "ModelResolver not initialized. Call initModelResolver() first.",
    );
  }
  return globalResolver;
}
