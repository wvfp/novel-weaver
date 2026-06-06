/**
 * novel_character_voice_check 单元测试
 *
 * 覆盖：
 *  1. 章节无对白 → "no dialog" 消息
 *  2. 检测避讳词
 *  3. 检测缺失口头禅
 *  4. 检测句式偏好偏离
 *  5. 检测称呼不一致
 *  6. 偏差列表结构与 severity
 *  7. 错误格式 voice_fingerprint 容错
 *  8. 中文输出
 *
 * 模式：与 src/hooks/system-transform.test.ts 一致——用 mock.module
 * 替换 db 模块，共享状态由闭包变量控制。
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";

// ---------------------------------------------------------------------------
// Test fixture — in-memory DB seeded with characters & chapters
// ---------------------------------------------------------------------------

let SQL: SqlJsStatic;
let _db: Database;
let _dbAvailable = true;

function resetSchema(handle: Database) {
  handle.run("DROP TABLE IF EXISTS characters");
  handle.run("DROP TABLE IF EXISTS chapters");
  handle.run(`CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    world_id TEXT,
    name TEXT NOT NULL,
    role_type TEXT,
    aliases TEXT,
    description TEXT,
    voice_fingerprint TEXT,
    address_chain TEXT
  )`);
  handle.run(`CREATE TABLE chapters (
    id TEXT PRIMARY KEY,
    arc_id TEXT,
    volume_num INTEGER NOT NULL DEFAULT 1,
    chapter_num INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
  )`);
}

beforeAll(async () => {
  SQL = await initSqlJs();
  _db = new SQL.Database();
  resetSchema(_db);
});

beforeEach(() => {
  _dbAvailable = true;
  resetSchema(_db);
});

afterAll(() => {
  _db?.close();
});

// ---------------------------------------------------------------------------
// Mock the db module — return current state
// ---------------------------------------------------------------------------

mock.module("../db/index.js", () => ({
  getDatabase: () => (_dbAvailable ? _db : null),
  generateId: () => "test-id",
  initDatabase: async () => _db,
  closeDatabase: () => {},
}));

const toolModule = await import("./character-voice-check.js");
const {
  novel_character_voice_check,
  checkVoiceConsistency,
  checkAddressConsistency,
  formatOutput,
  parseAddressChainJson,
} = toolModule;

// ---------------------------------------------------------------------------
// Helpers — DB seeding
// ---------------------------------------------------------------------------

function insertCharacter(opts: {
  name: string;
  aliases?: string[];
  voiceFingerprint?: unknown;
  addressChain?: unknown;
}): string {
  const id = `char-${opts.name}`;
  _db.run(
    `INSERT INTO characters (id, name, aliases, voice_fingerprint, address_chain)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      JSON.stringify(opts.aliases ?? []),
      opts.voiceFingerprint !== undefined
        ? JSON.stringify(opts.voiceFingerprint)
        : null,
      opts.addressChain !== undefined
        ? JSON.stringify(opts.addressChain)
        : null,
    ],
  );
  return id;
}

function makeContext(directory = process.cwd()) {
  return {
    sessionID: "",
    messageID: "",
    agent: "",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
}

async function runTool(
  args: { chapter_id?: string; chapter_content?: string },
  directory = process.cwd(),
) {
  return (toolModule.novel_character_voice_check.execute as Function)(
    args,
    makeContext(directory),
  );
}

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("parseAddressChainJson", () => {
  test("returns empty addresses for null / empty / {} input", () => {
    expect(parseAddressChainJson(null)).toEqual({ addresses: {} });
    expect(parseAddressChainJson(undefined)).toEqual({ addresses: {} });
    expect(parseAddressChainJson("")).toEqual({ addresses: {} });
    expect(parseAddressChainJson("{}")).toEqual({ addresses: {} });
  });

  test("parses valid address chain", () => {
    const raw = JSON.stringify({
      addresses: {
        "char-师父": { current: "师父", history: [] },
      },
    });
    const out = parseAddressChainJson(raw);
    expect(out.addresses["char-师父"]?.current).toBe("师父");
  });

  test("returns empty for malformed JSON", () => {
    expect(parseAddressChainJson("{not json")).toEqual({ addresses: {} });
  });
});

describe("checkVoiceConsistency", () => {
  const baseFingerprint = {
    catchphrases: ["哼"],
    sentenceStyle: "mixed" as const,
    avoidWords: [],
    emotionStyle: "含蓄" as const,
  };

  test("returns empty when dialog is empty", () => {
    const out = checkVoiceConsistency("", baseFingerprint, "林夜");
    expect(out).toEqual([]);
  });

  test("detects avoided word usage", () => {
    const fp = { ...baseFingerprint, avoidWords: ["在下"] };
    const out = checkVoiceConsistency(
      "在下不才，今日领教。",
      fp,
      "林夜",
    );
    const hit = out.find((d) => d.kind === "avoided_word_used");
    expect(hit).toBeTruthy();
    expect(hit?.severity).toBe("warning");
    expect(hit?.message).toContain("避讳词");
  });

  test("detects tone mismatch — long sentences for short-style character", () => {
    const fp = { ...baseFingerprint, sentenceStyle: "short" as const };
    const longText =
      "你这话可就说错了，我林夜向来不喜欢与人争辩但是今日若你不给我一个合理的解释那就别怪我不客气了！";
    const out = checkVoiceConsistency(longText, fp, "林夜");
    const hit = out.find((d) => d.kind === "tone_mismatch");
    expect(hit).toBeTruthy();
    expect(hit?.severity).toBe("info");
  });

  test("detects tone mismatch — short sentences for long-style character", () => {
    const fp = { ...baseFingerprint, sentenceStyle: "long" as const };
    const out = checkVoiceConsistency("好。嗯。行。", fp, "林夜");
    const hit = out.find((d) => d.kind === "tone_mismatch");
    expect(hit).toBeTruthy();
    expect(hit?.message).toContain("长句");
  });

  test("returns deviations with proper severity levels", () => {
    const fp = { ...baseFingerprint, avoidWords: ["在下"] };
    const dialog = "在下不才。承让。";
    const out = checkVoiceConsistency(dialog, fp, "林夜");
    expect(out.length).toBeGreaterThan(0);
    for (const d of out) {
      expect(["info", "warning", "error"]).toContain(d.severity);
      expect(d.message.length).toBeGreaterThan(0);
      expect(d.suggestion.length).toBeGreaterThan(0);
    }
  });

  test("handles missing avoidWords field gracefully", () => {
    const fp = { ...baseFingerprint, avoidWords: [] };
    const out = checkVoiceConsistency("好。", fp, "林夜");
    const hit = out.find((d) => d.kind === "avoided_word_used");
    expect(hit).toBeUndefined();
  });
});

describe("checkAddressConsistency", () => {
  test("returns empty when fewer than 2 characters", () => {
    const out = checkAddressConsistency(_db, "一些对白", []);
    expect(out).toEqual([]);
  });
});

describe("formatOutput", () => {
  test("returns Chinese OK message when no deviations", () => {
    const out = formatOutput([], [], "ch-1", []);
    expect(out).toContain("未发现");
    expect(out).toContain("角色语音检查");
  });

  test("renders voice deviations with severity emoji", () => {
    const out = formatOutput(
      [
        {
          character_id: "c1",
          character_name: "林夜",
          type: "voice",
          deviations: [
            {
              kind: "avoided_word_used",
              severity: "warning",
              message: "测试消息",
              evidence: "测试证据",
              suggestion: "测试建议",
            },
          ],
        },
      ],
      [],
      "ch-1",
      [
        {
          id: "c1",
          name: "林夜",
          aliases: [],
          voice_fingerprint: "",
          address_chain: "",
        },
      ],
    );
    expect(out).toContain("林夜");
    expect(out).toContain("🟡");
    expect(out).toContain("测试消息");
    expect(out).toContain("整体评价");
  });

  test("renders address deviations", () => {
    const out = formatOutput(
      [],
      [
        {
          character_id: "c1",
          character_name: "林夜",
          type: "address",
          deviations: [
            {
              kind: "wrong_address",
              severity: "warning",
              message: "称呼不一致",
              evidence: "原台词",
              suggestion: "改回标准称呼",
            },
          ],
        },
      ],
      "ch-1",
      [
        {
          id: "c1",
          name: "林夜",
          aliases: [],
          voice_fingerprint: "",
          address_chain: "",
        },
        {
          id: "c2",
          name: "师父",
          aliases: [],
          voice_fingerprint: "",
          address_chain: "",
        },
      ],
    );
    expect(out).toContain("称呼不一致");
    expect(out).toContain("address");
  });
});

// ---------------------------------------------------------------------------
// Tool-level integration tests
// ---------------------------------------------------------------------------

describe("novel_character_voice_check (tool)", () => {
  test("returns 'no dialog' when chapter has no characters", async () => {
    const result = await runTool({
      chapter_content: "这是一些叙述段落，没有任何角色对白和提及。",
    });
    expect(result.output).toContain("未提及");
  });

  test("returns 'empty content' when chapter content is empty", async () => {
    const result = await runTool({ chapter_content: "" });
    expect(result.output).toContain("章节内容为空");
  });

  test("returns 'id or content required' when both missing", async () => {
    const result = await runTool({});
    expect(result.output).toContain("chapter_id");
  });

  test("returns DB-not-initialised error when getDatabase returns null", async () => {
    _dbAvailable = false;
    try {
      const result = await runTool({ chapter_content: "一些内容。" });
      expect(result.output).toContain("数据库未初始化");
    } finally {
      _dbAvailable = true;
    }
  });

  test("detects avoided word usage in dialog", async () => {
    insertCharacter({
      name: "林夜",
      voiceFingerprint: {
        catchphrases: ["哼"],
        sentenceStyle: "short",
        avoidWords: ["在下"],
        emotionStyle: "冷峻",
      },
    });
    const content = "林夜冷声道：「在下不才，今日领教。」";
    const result = await runTool({ chapter_content: content });
    expect(result.output).toContain("避讳词");
  });

  test("detects missing catchphrase via metadata", async () => {
    insertCharacter({
      name: "林夜",
      voiceFingerprint: {
        catchphrases: ["这是我一定不会用的专属口头禅"],
        sentenceStyle: "short",
        avoidWords: [],
        emotionStyle: "冷峻",
      },
    });
    const dialog = [
      "林夜说：「好。」",
      "林夜说：「来。」",
      "林夜说：「战。」",
      "林夜说：「去。」",
      "林夜说：「破。」",
    ];
    const result = await runTool({ chapter_content: dialog.join("\n") });
    expect(result.metadata.voice_deviation_count).toBeGreaterThanOrEqual(1);
    const meta = result.metadata.voice_deviations?.[0]?.deviations ?? [];
    expect(meta.some((d: { kind: string }) => d.kind === "catchphrase_missing")).toBe(true);
  });

  test("detects tone mismatch via metadata", async () => {
    insertCharacter({
      name: "林夜",
      voiceFingerprint: {
        catchphrases: [],
        sentenceStyle: "short",
        avoidWords: [],
        emotionStyle: "冷峻",
      },
    });
    const longLine =
      "林夜缓缓道：「我林夜向来不喜欢与人争辩但是今日若你不给我一个合理的解释那就别怪我不客气了！」";
    const dialog = [longLine, longLine, longLine];
    const result = await runTool({ chapter_content: dialog.join("\n") });
    const meta = result.metadata.voice_deviations?.[0]?.deviations ?? [];
    expect(meta.some((d: { kind: string }) => d.kind === "tone_mismatch")).toBe(true);
  });

  test("handles malformed voice_fingerprint JSON gracefully", async () => {
    _db.run(
      `INSERT INTO characters (id, name, voice_fingerprint) VALUES (?, ?, ?)`,
      ["char-林夜", "林夜", "{not valid json"],
    );
    const content = "林夜说：「好。」";
    const result = await runTool({ chapter_content: content });
    // Should not throw — tool returns either empty deviations or a clean OK
    expect(typeof result.output).toBe("string");
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("output is in Chinese", async () => {
    const result = await runTool({ chapter_content: "无对白内容。" });
    expect(result.output).toMatch(/[\u4e00-\u9fff]/);
  });

  test("returns proper metadata structure", async () => {
    insertCharacter({
      name: "林夜",
      voiceFingerprint: {
        catchphrases: ["哼"],
        sentenceStyle: "short",
        avoidWords: [],
        emotionStyle: "冷峻",
      },
    });
    const content = "林夜冷声道：「哼，来吧。」";
    const result = await runTool({ chapter_content: content });
    expect(result.metadata).toBeDefined();
    expect(result.metadata.character_count).toBe(1);
    expect(result.metadata.voice_deviation_count).toBe(0);
    expect(result.metadata.address_deviation_count).toBe(0);
  });
});
