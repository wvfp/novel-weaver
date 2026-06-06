/**
 * ConfigFileService — Read/write the project-level novel-weaver config file.
 *
 * File path: `{projectRoot}/.novel-weaver/config.json`
 *
 * Responsibilities:
 *  - Resolve the canonical config file path.
 *  - Detect whether the file already exists.
 *  - Load existing config (returning `{}` on missing/malformed files rather
 *    than throwing — first-time use should never block the caller).
 *  - Persist config to disk atomically (write to a `.tmp` sibling, then
 *    rename) so partial writes never leave a corrupt file behind.
 *  - Update the config in place with a shallow merge for unknown top-level
 *    keys and a deep merge for the known nested objects (`taskModel`,
 *    `temperature`, `maxTokens`) so per-task overrides accumulate rather
 *    than overwrite siblings.
 *  - Expose a raw-text reader for debugging / export.
 *
 * @packageDocumentation
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the project-level `.novel-weaver/config.json` file.
 *
 * The interface is intentionally open (`[key: string]: unknown`) so that
 * forward-compatible additions land in the file without breaking older
 * readers.
 */
export interface NovelWeaverConfigFile {
  taskModel?: Record<string, string>;
  temperature?: Record<string, number>;
  maxTokens?: Record<string, number>;
  [key: string]: unknown;
}

/** Top-level nested keys that should be deep-merged on `update()`. */
const DEEP_MERGE_KEYS = new Set(["taskModel", "temperature", "maxTokens"]);

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

/**
 * Default config written on first `novel_init` invocation.
 *
 * Model IDs follow the OpenCode `provider/model` convention. Temperatures
 * are picked per role: low (0.2) for review/consistency (deterministic),
 * medium (0.3) for query/summary, higher (0.8) for the writing role where
 * a touch of creativity is desired.
 */
export function createDefaultConfig(): NovelWeaverConfigFile {
  return {
    taskModel: {
      write: "anthropic/claude-opus-4",
      review: "anthropic/claude-sonnet-4",
      query: "anthropic/claude-haiku-4",
      summary: "anthropic/claude-haiku-4",
      consistency: "anthropic/claude-sonnet-4",
      agent: "anthropic/claude-opus-4",
      extract: "anthropic/claude-haiku-4",
      planning: "anthropic/claude-sonnet-4",
    },
    temperature: {
      write: 0.8,
      review: 0.2,
      query: 0.3,
      summary: 0.3,
      consistency: 0.2,
    },
    maxTokens: {
      write: 8000,
      review: 2000,
      query: 4000,
      summary: 2000,
    },
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Read/write the `.novel-weaver/config.json` file for a single project.
 *
 * The service is stateless beyond the project root passed at construction;
 * safe to instantiate per-request.
 */
export class ConfigFileService {
  constructor(private readonly projectRoot: string) {}

  /**
   * Absolute path to the project's config file.
   *
   * Resolved from `projectRoot` plus `.novel-weaver/config.json`.
   * The directory is NOT guaranteed to exist — use `exists()` to check.
   */
  getConfigPath(): string {
    return path.join(this.projectRoot, ".novel-weaver", "config.json");
  }

  /**
   * Check whether the config file currently exists on disk.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.getConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read and parse the config file.
   *
   * Returns `{}` (NOT an error) if the file is missing — first-time use
   * should not block the caller. Malformed JSON is logged and treated as
   * empty rather than thrown, so a corrupted config can be repaired by a
   * subsequent `save()`.
   */
  async load(): Promise<NovelWeaverConfigFile> {
    const configPath = this.getConfigPath();

    let raw: string;
    try {
      raw = await fs.readFile(configPath, "utf-8");
    } catch (err) {
      if (isNotFoundError(err)) {
        return {};
      }
      // Permission errors / unexpected I/O — surface the failure.
      throw err;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as NovelWeaverConfigFile;
      }
      console.warn(
        `[novel-weaver] Config file at ${configPath} is not a JSON object; treating as empty.`
      );
      return {};
    } catch (err) {
      console.warn(
        `[novel-weaver] Config file at ${configPath} is malformed JSON (${
          err instanceof Error ? err.message : String(err)
        }); treating as empty.`
      );
      return {};
    }
  }

  /**
   * Persist the given config to disk.
   *
   * Creates the `.novel-weaver/` directory if it is missing. Writes are
   * atomic at the file level: the JSON is first written to a `.tmp`
   * sibling, then renamed over the destination. On Windows the rename
   * is best-effort across the same volume, which is always the case for
   * a sibling file in the same directory.
   */
  async save(config: NovelWeaverConfigFile): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);

    await fs.mkdir(configDir, { recursive: true });

    const tmpPath = `${configPath}.tmp`;
    const json = JSON.stringify(config, null, 2);
    await fs.writeFile(tmpPath, json, "utf-8");
    await fs.rename(tmpPath, configPath);
  }

  /**
   * Merge `updates` into the existing config and persist the result.
   *
   * Merge policy:
   *  - For known nested keys (`taskModel`, `temperature`, `maxTokens`),
   *    perform a shallow per-key merge so per-task overrides accumulate.
   *  - For any other top-level key, replace the existing value outright.
   *  - Unknown top-level keys present in the existing file are preserved.
   *
   * @returns The merged config that was persisted.
   */
  async update(
    updates: Partial<NovelWeaverConfigFile>
  ): Promise<NovelWeaverConfigFile> {
    const current = await this.load();
    const merged = mergeConfig(current, updates);
    await this.save(merged);
    return merged;
  }

  /**
   * Read the raw file text without parsing — useful for debugging,
   * diagnostic exports, and migration tooling.
   *
   * Returns an empty string when the file is missing.
   */
  async readRaw(): Promise<string> {
    try {
      return await fs.readFile(this.getConfigPath(), "utf-8");
    } catch (err) {
      if (isNotFoundError(err)) {
        return "";
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when `err` is a Node `ENOENT` (file/dir does not exist). */
function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Merge `updates` into `current` using the documented deep/shallow policy.
 *
 * Exported only for unit tests; not part of the public service surface.
 */
export function mergeConfig(
  current: NovelWeaverConfigFile,
  updates: Partial<NovelWeaverConfigFile>
): NovelWeaverConfigFile {
  const result: NovelWeaverConfigFile = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    if (
      DEEP_MERGE_KEYS.has(key) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = { ...(result[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      result[key] = value;
    }
  }

  return result;
}
