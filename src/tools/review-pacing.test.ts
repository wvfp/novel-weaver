/**
 * novel-weaver Pacing Consultant — Tests
 *
 * Covers the 5 detectors in `analyzePacing`:
 *   1. climax detection (with/without keywords)
 *   2. satisfaction density
 *   3. suffering timing rule
 *   4. golden 3-chapter score (chapters 1-3 vs 4+)
 *   5. chapter-ending hook score
 *   6. genre pack rules loaded from the registry
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { initDatabase, closeDatabase, generateId, getDatabase } from "../db/index.js";
import { DEFAULT_CONFIG } from "../config.js";
import {
  analyzePacing,
  analyzeChapterPacing,
  type ChapterPacingRuleSet,
} from "./review-pacing.js";
import { getRegistry, resetRegistry } from "../genre-packs/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A baseline rule set matching the infinite-flow pack defaults. */
const RULES: ChapterPacingRuleSet = {
  climaxKeywords: ["打脸", "揭露", "反转", "突破", "决裂", "揭穿", "真相", "报仇"],
  satisfactionKeywords: ["打脸", "升级", "揭露", "装逼", "碾压", "通关", "反败为胜"],
  sufferingKeywords: ["失败", "受伤", "死亡", "冤枉", "背叛", "牺牲", "失忆", "误会"],
  sweetPointDensity: { min: 3, max: 8 },
  conflictDensity: { min: 2, window: 3 },
  goldenChapters: { range: "1-3", minHooks: 2, requiredTraits: 2 },
  chapterHook: { minLength: 80, required: true },
  hookScoreThreshold: 6,
  golden3ScoreThreshold: 70,
  climaxGapWarning: 3,
};

const GENRE_NAME = "无限流";

// ---------------------------------------------------------------------------
// 1. Climax detection — with keywords
// ---------------------------------------------------------------------------

describe("analyzePacing — climax detection", () => {
  test("detects climax keywords present in chapter", () => {
    const content =
      "主角在副本中被打脸，随后他揭露了真相，反转了局面，最终突破成功。".repeat(20);
    const report = analyzePacing(
      "ch-1",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      1,
      "黑塔降临",
    );

    expect(report.metadata.climax.detected).toBe(true);
    expect(report.metadata.climax.keywords_found.length).toBeGreaterThan(0);
    expect(report.metadata.climax.keywords_found).toContain("打脸");
    expect(report.metadata.climax.keywords_found).toContain("揭露");
    expect(report.metadata.climax.keywords_found).toContain("反转");
    expect(report.metadata.climax.keywords_found).toContain("突破");
    expect(report.metadata.climax.status).toBe("🟢");
  });

  test("reports no climax when keywords are absent", () => {
    const content = "今天天气很好, 主角出门散步, 看了看风景, 喝了一杯茶。".repeat(30);
    const report = analyzePacing(
      "ch-2",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      2,
      "平静的一天",
    );

    expect(report.metadata.climax.detected).toBe(false);
    expect(report.metadata.climax.keywords_found).toHaveLength(0);
    expect(report.metadata.climax.status).toBe("🟡");
  });
});

// ---------------------------------------------------------------------------
// 2. Satisfaction density
// ---------------------------------------------------------------------------

describe("analyzePacing — satisfaction density", () => {
  test("computes per-1000-chars density", () => {
    // 5 occurrences in 1000 chars = 5.0 / 千字
    const text = "打脸".repeat(2) + "升级".repeat(2) + "碾压";
    const padding = "平常的叙述".repeat(100); // ~600 chars
    const content = text + padding;
    const wordCount = content.length;
    const report = analyzePacing(
      "ch-3",
      content,
      wordCount,
      RULES,
      GENRE_NAME,
      3,
      "高光时刻",
    );

    expect(report.metadata.satisfaction.count).toBe(5);
    // 5 hits / (wordCount / 1000) — exact value depends on padding length
    expect(report.metadata.satisfaction.per_1k).toBeGreaterThan(0);
    expect(report.metadata.satisfaction.baseline).toBe("3-8");
  });

  test("marks low density as 🟡", () => {
    const content = "平静的叙述, 风景描写, 角色对望, 没有冲突也没有收获。".repeat(50);
    const report = analyzePacing(
      "ch-4",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      4,
      "低潮",
    );

    expect(report.metadata.satisfaction.per_1k).toBeLessThan(3);
    expect(report.metadata.satisfaction.status).toBe("🟡");
  });
});

// ---------------------------------------------------------------------------
// 3. Suffering timing rule
// ---------------------------------------------------------------------------

describe("analyzePacing — suffering timing", () => {
  test("flags severe suffering (死亡) before chapter 30 as 🔴", () => {
    const content = "主角的师兄死亡了, 他悲伤不已, 心中充满愤怒。".repeat(10);
    const report = analyzePacing(
      "ch-5",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      5,
      "师兄之死",
    );

    expect(report.metadata.suffering.events).toContain("死亡");
    expect(report.metadata.suffering.status).toBe("🔴");
  });

  test("does not flag severe suffering at chapter 30+", () => {
    const content = "主角的师兄死亡了, 他悲伤不已, 心中充满愤怒。".repeat(10);
    const report = analyzePacing(
      "ch-6",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      35,
      "后期悲剧",
    );

    expect(report.metadata.suffering.events).toContain("死亡");
    expect(report.metadata.suffering.status).toBe("🟢");
  });
});

// ---------------------------------------------------------------------------
// 4. Golden 3-chapter score
// ---------------------------------------------------------------------------

describe("analyzePacing — golden 3-chapter score", () => {
  test("scores golden 3 chapter (chapter 1) when it has all 4 sub-scores", () => {
    const content = [
      "我是李逍遥, 一个坚定的少年, 性格机智勇敢。",
      "故事开始, 灵气复苏, 修炼境界分为九重天。",
      "系统发布任务, 我需要通关副本。",
      "师兄背叛了我, 我们发生冲突, 追杀开始了!",
      "我决定复仇, 反转局面, 揭露真相!",
      "就在这时, 门突然被撞开了——他到底是谁？",
    ].join("\n");
    const wordCount = content.length * 3; // simulate longer content
    const report = analyzePacing(
      "ch-7",
      content,
      wordCount,
      RULES,
      GENRE_NAME,
      1,
      "开篇",
    );

    expect(report.metadata.golden3).toBeDefined();
    expect(report.metadata.golden3!.score).toBeGreaterThan(0);
    expect(report.metadata.golden3!.subscores.hookDensity).toBeGreaterThanOrEqual(0);
    expect(report.metadata.golden3!.subscores.protagonistClarity).toBeGreaterThan(0);
    expect(report.metadata.golden3!.subscores.settingEstablishment).toBeGreaterThan(0);
    expect(report.metadata.golden3!.subscores.conflictStart).toBeGreaterThan(0);
  });

  test("returns golden3 = undefined for chapter 4+", () => {
    const content = "这是第四章的内容, 主角继续冒险。".repeat(20);
    const report = analyzePacing(
      "ch-8",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      4,
      "中段",
    );

    expect(report.metadata.golden3).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Hook scoring
// ---------------------------------------------------------------------------

describe("analyzePacing — chapter hook", () => {
  test("scores high when chapter ends on suspense punctuation", () => {
    const content = "他被追杀了一路, 终于来到了悬崖边, 突然——";
    const report = analyzePacing(
      "ch-9",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      5,
      "悬崖",
    );

    expect(report.metadata.hook.score).toBeGreaterThanOrEqual(4);
    expect(report.metadata.hook.suggestion).toBeDefined();
    expect(report.metadata.hook.status).toMatch(/🟢|🟡|🔴/);
  });

  test("scores low when chapter ends with a weak ending phrase", () => {
    const content = "今天的故事就到这里, 我们下章再见。本章完。".repeat(5);
    const report = analyzePacing(
      "ch-10",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      5,
      "平淡",
    );

    expect(report.metadata.hook.score).toBeLessThanOrEqual(2);
    expect(report.metadata.hook.status).toBe("🔴");
  });

  test("question mark at the end contributes to hook score", () => {
    const content = "他到底是谁? 为什么会出现这里? 没人知道答案。";
    const report = analyzePacing(
      "ch-11",
      content,
      content.length,
      RULES,
      GENRE_NAME,
      5,
      "谜题",
    );

    expect(report.metadata.hook.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Genre pack rules loaded from the registry
// ---------------------------------------------------------------------------

describe("genre pack rules", () => {
  test("infinite-flow pack has expected pacing keywords", () => {
    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("infinite-flow");
    expect(pack).toBeDefined();
    expect(pack!.pacingRules).toBeDefined();

    const rules = pack!.pacingRules!;
    expect(rules.climaxKeywords).toContain("打脸");
    expect(rules.climaxKeywords).toContain("升级");
    expect(rules.satisfactionKeywords).toContain("打脸");
    expect(rules.sufferingKeywords).toContain("死亡");
    expect(rules.hookScoreThreshold).toBe(6);
    expect(rules.golden3ScoreThreshold).toBe(70);
    expect(rules.climaxGapWarning).toBe(3);
  });

  test("xianxia pack has genre-specific climax keywords (突破/渡劫)", () => {
    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("xianxia");
    expect(pack).toBeDefined();
    const rules = pack!.pacingRules!;
    expect(rules.climaxKeywords).toContain("突破");
    expect(rules.climaxKeywords).toContain("渡劫");
  });

  test("_default pack loads with conservative thresholds", () => {
    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("_default");
    expect(pack).toBeDefined();
    const rules = pack!.pacingRules!;
    expect(rules.climaxKeywords).toBeDefined();
    expect(rules.satisfactionKeywords).toBeDefined();
    expect(rules.sufferingKeywords).toBeDefined();
    // _default has the lowest threshold (5)
    expect(rules.hookScoreThreshold).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 7. analyzeChapterPacing (DB-bound variant) — integration
// ---------------------------------------------------------------------------

describe("analyzeChapterPacing — DB integration", () => {
  let projectDir: string;
  let projectId: string;

  beforeEach(async () => {
    closeDatabase();
    await initDatabase();
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "novel-pacing-test-"));
    // Create project record
    const db = getDatabase()!;
    projectId = generateId();
    db.run(
      `INSERT INTO projects (id, name, genre_pack_id) VALUES (?, ?, ?)`,
      [projectId, "Test Project", "infinite-flow"],
    );
  });

  afterEach(() => {
    closeDatabase();
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("returns null when chapter is missing", () => {
    const db = getDatabase()!;
    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("infinite-flow")!;
    const report = analyzeChapterPacing(
      db,
      "nonexistent",
      projectDir,
      pack.pacingRules!,
      pack.name,
    );
    expect(report).toBeNull();
  });

  test("returns null when chapter file is missing on disk", () => {
    const db = getDatabase()!;
    const chapterId = generateId();
    // Need an arc first (FK requirement)
    const worldId = generateId();
    db.run(`INSERT INTO worlds (id, project_id, name, type) VALUES (?, ?, ?, ?)`, [
      worldId,
      projectId,
      "Test World",
      "primary",
    ]);
    const arcId = generateId();
    db.run(
      `INSERT INTO arcs (id, world_id, name, arc_type) VALUES (?, ?, ?, ?)`,
      [arcId, worldId, "Test Arc", "dungeon"],
    );
    db.run(
      `INSERT INTO chapters (id, arc_id, volume_num, chapter_num, title, word_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chapterId, arcId, 1, 1, "Missing File Chapter", 1000, "draft"],
    );

    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("infinite-flow")!;
    const report = analyzeChapterPacing(
      db,
      chapterId,
      projectDir,
      pack.pacingRules!,
      pack.name,
    );
    expect(report).toBeNull();
  });

  test("returns full report when chapter and file are present", () => {
    const db = getDatabase()!;
    const worldId = generateId();
    db.run(`INSERT INTO worlds (id, project_id, name, type) VALUES (?, ?, ?, ?)`, [
      worldId,
      projectId,
      "Test World",
      "primary",
    ]);
    const arcId = generateId();
    db.run(
      `INSERT INTO arcs (id, world_id, name, arc_type) VALUES (?, ?, ?, ?)`,
      [arcId, worldId, "Test Arc", "dungeon"],
    );
    const chapterId = generateId();
    const body = "他揭露了真相, 完成了突破, 揭穿了对手的阴谋, 成功打脸了反派!";
    db.run(
      `INSERT INTO chapters (id, arc_id, volume_num, chapter_num, title, word_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chapterId, arcId, 1, 2, "高潮反转", body.length, "draft"],
    );

    // Write chapter .md file
    const chapterDir = path.join(projectDir, DEFAULT_CONFIG.dataDir, "chapters");
    fs.mkdirSync(chapterDir, { recursive: true });
    fs.writeFileSync(path.join(chapterDir, `${chapterId}.md`), body, "utf-8");

    resetRegistry();
    const registry = getRegistry();
    const pack = registry.get("infinite-flow")!;
    const report = analyzeChapterPacing(
      db,
      chapterId,
      projectDir,
      pack.pacingRules!,
      pack.name,
    );

    expect(report).not.toBeNull();
    expect(report!.output).toContain("【节奏分析】");
    expect(report!.metadata.climax.detected).toBe(true);
    expect(report!.metadata.chapter_num).toBe(2);
  });
});
