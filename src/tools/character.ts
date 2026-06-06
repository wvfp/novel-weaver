/**
 * novel-weaver Character Management Tools
 *
 * Provides three LLM-callable tools:
 * - novel_character_create  — insert character row + generate char-{name}.md
 * - novel_character_update  — update character row + regenerate .md
 * - novel_character_query   — search by name/alias via LIKE + FTS4 fallback
 *
 * Also exports ensureDefaultProtagonist() for use during world initialisation
 * (creates a placeholder male protagonist named "未命名").
 */

import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { getDatabase, generateId } from "../db/index.js";
import type { Database } from "../db/index.js";
import { generateCharacterFile } from "../md/obsidian.js";
import { buildCharacterFilename } from "../md/wikilink.js";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory for generated character Markdown files */
const CHARACTERS_DIR = ".novel-weaver/content/settings";

/** Valid character role types */
const VALID_ROLES = ["protagonist", "support", "antagonist", "npc"] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function characterFilePath(name: string): string {
  return path.resolve(CHARACTERS_DIR, buildCharacterFilename(name));
}

function ensureContentDir(): void {
  fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
}

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
}

function validateRoleType(role: string): string {
  return (VALID_ROLES as readonly string[]).includes(role) ? role : "npc";
}

/** Run a prepared SELECT and return all rows as objects. */
function queryAll(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown>[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row) rows.push(row);
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error(`[novel-weaver] queryAll failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Run a prepared SELECT and return the first row, or null. */
function queryOne(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown> | null {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row: Record<string, unknown> | null = null;
    if (stmt.step()) {
      row = stmt.getAsObject() ?? null;
    }
    stmt.free();
    return row;
  } catch (err) {
    console.error(`[novel-weaver] queryOne failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Look up a world's name by ID (returns null on failure/not-found). */
function getWorldName(worldId: string): string | null {
  const db = getDatabase();
  if (!db) return null;
  const row = queryOne(db, "SELECT name FROM worlds WHERE id = ?", [worldId]);
  return (row?.name as string) ?? null;
}

/** Write (or overwrite) the character Markdown file on disk. */
function writeCharacterMdFile(
  id: string,
  name: string,
  worldId: string,
  roleType: string,
  aliases: string[],
  description: string,
): string {
  ensureContentDir();
  const filePath = characterFilePath(name);

  const worldName = getWorldName(worldId);

  // Build a description that includes a wikilink to the world
  const worldWikilink = worldName ? `[[${worldName}]]` : worldId;
  const fullDescription = description
    ? `${description}\n\n所属世界：${worldWikilink}`
    : `暂无描述\n\n所属世界：${worldWikilink}`;

  const mdContent = generateCharacterFile({
    title: name,
    aliases: aliases.length > 0 ? aliases : undefined,
    status: "unknown",
    role: roleType,
    worldId,
    description: fullDescription,
    appearance: "",
    personality: "",
    abilities: "",
    background: "",
  });

  try {
    fs.writeFileSync(filePath, mdContent, "utf-8");
  } catch (err) {
    throw new Error(
      `写入角色文件失败 (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return filePath;
}

/** Delete a character Markdown file if it exists. */
function deleteCharacterMdFile(name: string): void {
  try {
    const filePath = characterFilePath(name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[novel-weaver] Failed to delete character file for ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Sync the FTS4 index for a character (delete old + insert new). */
function syncCharacterFts(
  rowId: number,
  name: string,
  aliasesArr: string[],
  description: string,
): void {
  const db = getDatabase();
  if (!db) return;
  try {
    db.run("DELETE FROM characters_fts WHERE rowid = ?", [rowId]);
    db.run(
      "INSERT INTO characters_fts (rowid, name, aliases, description) VALUES (?, ?, ?, ?)",
      [rowId, name, aliasesArr.join(" "), description],
    );
  } catch (err) {
    console.error(`[novel-weaver] FTS sync failed for character ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Exported utilities
// ---------------------------------------------------------------------------

/**
 * Ensure a default male protagonist ("未命名") exists for a world.
 *
 * Designed to be called during world initialisation — if the world already
 * has any characters this is a no-op.
 *
 * @returns The new character's ID, or `null` if no action was taken.
 */
export function ensureDefaultProtagonist(worldId: string): string | null {
  const db = getDatabase();
  if (!db) return null;

  const row = queryOne(
    db,
    "SELECT COUNT(*) AS cnt FROM characters WHERE world_id = ?",
    [worldId],
  );
  const count = (row?.cnt as number) ?? 0;
  if (count > 0) return null;

  const id = generateId();
  const name = "未命名";
  const roleType = "protagonist";
  const aliasesArr = ["男主"];
  const aliasesJson = JSON.stringify(aliasesArr);
  const description = "男主角（占位）";

  try {
    db.run(
      `INSERT INTO characters (id, world_id, name, role_type, aliases, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, worldId, name, roleType, aliasesJson, description],
    );
  } catch (err) {
    console.error(`[novel-weaver] Failed to insert default protagonist: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  // Sync FTS — get the auto-assigned rowid
  try {
    const rowIdResult = db.exec("SELECT last_insert_rowid()");
    if (rowIdResult.length > 0 && rowIdResult[0].values.length > 0) {
      const rowId = rowIdResult[0].values[0][0] as number;
      syncCharacterFts(rowId, name, aliasesArr, description);
    }
  } catch (err) {
    console.error(`[novel-weaver] FTS sync for default protagonist failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    writeCharacterMdFile(id, name, worldId, roleType, aliasesArr, description);
  } catch (err) {
    console.error(`[novel-weaver] Failed to write default protagonist file: ${err instanceof Error ? err.message : String(err)}`);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Tool: novel_character_create
// ---------------------------------------------------------------------------

export const novel_character_create = tool({
  description:
    "Create a new character in a world. Writes to the characters table and generates a char-{name}.md file with frontmatter and wikilinks.",
  args: {
    world_id: z.string().describe("ID of the parent world the character belongs to"),
    name: z.string().describe("Character display name"),
    role_type: z
      .enum(["protagonist", "support", "antagonist", "npc"])
      .default("npc")
      .describe("Role type classification"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("Alternative names / nicknames (used for alias search)"),
    description: z.string().optional().describe("Character description / bio"),
    voice_fingerprint: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("角色声音指纹 JSON 对象（口头禅、句式偏好、情感风格等）"),
    address_chain: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("角色称谓链 JSON 对象（addresses 映射 + updatedAt + sourceChapters）"),
  },
  async execute(
    args: {
      world_id: string;
      name: string;
      role_type?: string;
      aliases?: string[];
      description?: string;
      voice_fingerprint?: Record<string, unknown>;
      address_chain?: Record<string, unknown>;
    },
    _context: unknown,
  ) {
    const db = getDatabase();
    if (!db) {
      return {
        output:
          "Error: Database not initialised. Call initDatabase() first.",
      };
    }

    const worldId = String(args.world_id);
    const name = String(args.name).trim();
    if (!name) {
      return { output: "Error: Character name cannot be empty." };
    }
    const roleType = validateRoleType(String(args.role_type ?? "npc"));
    const aliasesArr = parseAliases(args.aliases);
    const description = String(args.description ?? "");
    const aliasesJson = JSON.stringify(aliasesArr);
    const voiceFingerprintJson = args.voice_fingerprint
      ? JSON.stringify(args.voice_fingerprint)
      : null;
    const addressChainJson = args.address_chain
      ? JSON.stringify(args.address_chain)
      : null;
    const id = generateId();

    // Verify world exists
    const world = queryOne(db, "SELECT id FROM worlds WHERE id = ?", [worldId]);
    if (!world) {
      return {
        output: `Error: World with id "${worldId}" not found. Create the world first.`,
      };
    }

    // Insert into characters table
    try {
      db.run(
        `INSERT INTO characters (id, world_id, name, role_type, aliases, description, voice_fingerprint, address_chain)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, worldId, name, roleType, aliasesJson, description, voiceFingerprintJson, addressChainJson],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Error creating character: ${msg}` };
    }

    // Sync FTS index
    try {
      const rowIdResult = db.exec("SELECT last_insert_rowid()");
      if (rowIdResult.length > 0 && rowIdResult[0].values.length > 0) {
        const rowId = rowIdResult[0].values[0][0] as number;
        syncCharacterFts(rowId, name, aliasesArr, description);
      }
    } catch (err) {
      console.error(`[novel-weaver] FTS sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Generate .md file
    let filePath: string;
    try {
      filePath = writeCharacterMdFile(
        id,
        name,
        worldId,
        roleType,
        aliasesArr,
        description,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        output: `Character created in DB but failed writing .md file: ${msg}`,
        metadata: { id },
      };
    }

    return {
      output: `Character "${name}" created successfully.`,
      metadata: {
        id,
        name,
        role_type: roleType,
        alias_count: aliasesArr.length,
        has_voice_fingerprint: voiceFingerprintJson !== null,
        has_address_chain: addressChainJson !== null,
        file_path: filePath,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_character_update
// ---------------------------------------------------------------------------

export const novel_character_update = tool({
  description:
    "Update an existing character's information. Re-generates the char-{name}.md file if name or content changes.",
  args: {
    id: z.string().describe("Character ID (required to identify which character to update)"),
    name: z.string().optional().describe("New character name (renames the .md file if changed)"),
    role_type: z
      .enum(["protagonist", "support", "antagonist", "npc"])
      .optional()
      .describe("Role type classification"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("Alternative names / nicknames"),
    description: z.string().optional().describe("Character description / bio"),
    voice_fingerprint: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("角色声音指纹 JSON 对象（覆盖现有值）"),
    address_chain: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("角色称谓链 JSON 对象（覆盖现有值）"),
  },
  async execute(
    args: {
      id: string;
      name?: string;
      role_type?: string;
      aliases?: string[];
      description?: string;
      voice_fingerprint?: Record<string, unknown>;
      address_chain?: Record<string, unknown>;
    },
    _context: unknown,
  ) {
    const db = getDatabase();
    if (!db) {
      return { output: "Error: Database not initialised." };
    }

    const id = String(args.id);

    // Fetch existing character
    const existing = queryOne(
      db,
      "SELECT id, world_id, name, role_type, aliases, description, voice_fingerprint, address_chain FROM characters WHERE id = ?",
      [id],
    );
    if (!existing) {
      return {
        output: `Error: Character with id "${id}" not found.`,
      };
    }

    const oldName = String(existing.name ?? "");
    const oldWorldId = String(existing.world_id ?? "");
    const oldRoleType = String(existing.role_type ?? "npc");
    const oldAliasesJson = String(existing.aliases ?? "[]");
    const oldDescription = String(existing.description ?? "");
    const oldVoiceFingerprint = existing.voice_fingerprint
      ? String(existing.voice_fingerprint)
      : null;
    const oldAddressChain = existing.address_chain
      ? String(existing.address_chain)
      : null;

    const newName = args.name !== undefined ? String(args.name).trim() : oldName;
    const newRoleType =
      args.role_type !== undefined
        ? validateRoleType(String(args.role_type))
        : oldRoleType;
    const newAliasesArr =
      args.aliases !== undefined ? parseAliases(args.aliases) : JSON.parse(oldAliasesJson);
    const newDescription =
      args.description !== undefined ? String(args.description) : oldDescription;
    const newAliasesJson = JSON.stringify(newAliasesArr);
    const newVoiceFingerprint =
      args.voice_fingerprint !== undefined
        ? JSON.stringify(args.voice_fingerprint)
        : oldVoiceFingerprint;
    const newAddressChain =
      args.address_chain !== undefined
        ? JSON.stringify(args.address_chain)
        : oldAddressChain;

    // Perform update
    try {
      db.run(
        `UPDATE characters SET name = ?, role_type = ?, aliases = ?, description = ?,
         voice_fingerprint = ?, address_chain = ?
         WHERE id = ?`,
        [newName, newRoleType, newAliasesJson, newDescription, newVoiceFingerprint, newAddressChain, id],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Error updating character: ${msg}` };
    }

    // Sync FTS index
    const rowRow = queryOne(db, "SELECT rowid FROM characters WHERE id = ?", [id]);
    if (rowRow) {
      const rowId = rowRow.rowid as number;
      syncCharacterFts(rowId, newName, newAliasesArr, newDescription);
    }

    // Handle .md file rename if name changed
    if (newName !== oldName) {
      deleteCharacterMdFile(oldName);
    }

    // Write updated .md file
    let filePath: string;
    try {
      filePath = writeCharacterMdFile(
        id,
        newName,
        oldWorldId,
        newRoleType,
        newAliasesArr,
        newDescription,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        output: `Character updated in DB but failed writing .md file: ${msg}`,
        metadata: { id },
      };
    }

    const changedFields: string[] = [];
    if (newName !== oldName) changedFields.push("name");
    if (newRoleType !== oldRoleType) changedFields.push("role_type");
    if (newAliasesJson !== oldAliasesJson) changedFields.push("aliases");
    if (newDescription !== oldDescription) changedFields.push("description");
    if (newVoiceFingerprint !== oldVoiceFingerprint) changedFields.push("voice_fingerprint");
    if (newAddressChain !== oldAddressChain) changedFields.push("address_chain");

    return {
      output: `Character "${oldName}" updated successfully. Changed: ${changedFields.join(", ") || "none"}`,
      metadata: {
        id,
        name: newName,
        old_name: oldName,
        changed_fields: changedFields,
        file_path: filePath,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_character_query
// ---------------------------------------------------------------------------

export const novel_character_query = tool({
  description:
    "Search characters by name or alias. Returns matching characters with their details, including role type, world info, and file path.",
  args: {
    name: z.string().optional().describe("Search term — matches character name or aliases (substring)"),
    world_id: z.string().optional().describe("Optional: filter by world ID"),
    role_type: z
      .enum(["protagonist", "support", "antagonist", "npc"])
      .optional()
      .describe("Optional: filter by role type"),
  },
  async execute(
    args: {
      name?: string;
      world_id?: string;
      role_type?: string;
    },
    _context: unknown,
  ) {
    const db = getDatabase();
    if (!db) {
      return { output: "Error: Database not initialised." };
    }

    const searchTerm = args.name ? String(args.name).trim() : "";
    const worldFilter = args.world_id ? String(args.world_id) : null;
    const roleFilter = args.role_type ? String(args.role_type) : null;

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (searchTerm) {
      // Search by name (LIKE) or aliases (JSON LIKE)
      conditions.push("(c.name LIKE ? OR c.aliases LIKE ?)");
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (worldFilter) {
      conditions.push("c.world_id = ?");
      params.push(worldFilter);
    }

    if (roleFilter) {
      conditions.push("c.role_type = ?");
      params.push(roleFilter);
    }

    const whereClause =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const sql = `SELECT c.id, c.world_id, c.name, c.role_type, c.aliases, c.description,
                        w.name AS world_name
                 FROM characters c
                 LEFT JOIN worlds w ON w.id = c.world_id
                 ${whereClause}
                 ORDER BY c.name ASC
                 LIMIT 50`;

    let rows: Record<string, unknown>[];
    try {
      rows = queryAll(db, sql, params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Error querying characters: ${msg}` };
    }

    // Fallback: try FTS4 MATCH if LIKE returned nothing and a search term is given
    if (rows.length === 0 && searchTerm) {
      try {
        const ftsSql = `SELECT c.id, c.world_id, c.name, c.role_type, c.aliases, c.description,
                               w.name AS world_name
                        FROM characters_fts fts
                        JOIN characters c ON c.rowid = fts.rowid
                        LEFT JOIN worlds w ON w.id = c.world_id
                        WHERE characters_fts MATCH ?
                        ORDER BY c.name ASC
                        LIMIT 50`;
        rows = queryAll(db, ftsSql, [searchTerm]);
      } catch {
        // FTS MATCH may fail on certain terms — silently fall through
      }
    }

    const characters = rows.map((row) => {
      let parsedAliases: string[] = [];
      try {
        parsedAliases = JSON.parse(String(row.aliases ?? "[]"));
      } catch {
        parsedAliases = [];
      }
      return {
        id: String(row.id ?? ""),
        world_id: String(row.world_id ?? ""),
        name: String(row.name ?? ""),
        role_type: String(row.role_type ?? ""),
        aliases: parsedAliases,
        description: String(row.description ?? ""),
        world_name: row.world_name ? String(row.world_name) : null,
        file_path: characterFilePath(String(row.name ?? "")),
      };
    });

    if (characters.length === 0) {
      return {
        output: searchTerm
          ? `No characters found matching "${searchTerm}".`
          : "No characters found.",
        metadata: { count: 0, characters: [] },
      };
    }

    const summary = characters
      .map(
        (c) =>
          `- ${c.name} (${c.role_type}) [world: ${c.world_name || c.world_id}]`,
      )
      .join("\n");

    return {
      output: `Found ${characters.length} character(s):\n${summary}`,
      metadata: {
        count: characters.length,
        characters,
      },
    };
  },
});
