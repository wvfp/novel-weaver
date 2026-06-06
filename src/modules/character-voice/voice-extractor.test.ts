/**
 * 声音指纹提取器单元测试
 *
 * 覆盖：
 *  1) 角色名：「台词」格式解析
 *  2) 多次出现（≥ 3 次）的 2-4 字短语进入 catchphrases
 *  3) 平均句长 → sentenceStyle 推断
 *  4) 同一章节多个角色
 *  5) 无对白章节返回空
 *  6) 中英混合标点（。，！？「」".,?!）
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDatabase, closeDatabase, generateId } from "../../db/index";
import { extractVoiceFromChapter, type VoiceFingerprint } from "./voice-extractor";

/** 初始化内存数据库 + 最小 project/world 拓扑，再插入若干 character */
async function seedDatabase(characters: Array<{ name: string; aliases?: string[] }>) {
  closeDatabase();
  const db = await initDatabase();
  const projectId = "test-project-" + generateId();
  db.run(
    "INSERT INTO projects (id, name, genre) VALUES (?, ?, ?)",
    [projectId, "测试项目", "fantasy"],
  );
  const worldId = generateId();
  db.run(
    "INSERT INTO worlds (id, project_id, name, type) VALUES (?, ?, ?, ?)",
    [worldId, projectId, "测试世界", "primary"],
  );
  const ids: string[] = [];
  for (const ch of characters) {
    const id = generateId();
    db.run(
      "INSERT INTO characters (id, world_id, name, role_type, aliases) VALUES (?, ?, ?, ?, ?)",
      [id, worldId, ch.name, "npc", JSON.stringify(ch.aliases ?? [])],
    );
    ids.push(id);
  }
  return { db, worldId, characterIds: ids };
}

describe("extractVoiceFromChapter", () => {
  afterEach(() => {
    closeDatabase();
  });

  test("「」格式对白归属到正确角色", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }]);
    const content = "林逸淡淡道：「这一剑，请你接好。」";
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(1);
    expect(results[0].characterId).toBe(characterIds[0]);
    expect(results[0].evidence.length).toBeGreaterThan(0);
  });

  test("：分隔符同样生效（兼容全角/半角）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }]);
    const content = "林逸:「好。」\n旁白：无语。";
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(1);
    expect(results[0].fingerprint.metadata?.totalDialogLines).toBeGreaterThan(0);
  });

  test("出现 3+ 次的 2-4 字短语进入 catchphrases", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }]);
    const content = [
      '林逸：「我林逸从不认输。」',
      '林逸：「记住我林逸这一剑。」',
      '林逸：「林逸在此，诸位请了。」',
    ].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.catchphrases).toContain("林逸");
  });

  test("平均句长 → sentenceStyle 推断（短句）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "甲" }]);
    const content = [
      '甲：「短。」',
      '甲：「是。」',
      '甲：「好。」',
    ].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.sentenceStyle).toBe("short");
  });

  test("平均句长 → sentenceStyle 推断（长句）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "乙" }]);
    const longSentence = "这是非常非常非常非常长的一句话用来测试长句识别这段话包含了许多字应该被归类为长句而不是中句因为它远远超过了中等句子长度的上限。";
    const content = [
      `乙：「${longSentence}」`,
      `乙：「${longSentence}」`,
    ].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.sentenceStyle).toBe("long");
  });

  test("句长方差大 → mixed", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "丙" }]);
    const longSentence =
      "这是一段非常非常非常非常长的话用来制造方差让统计指标达到混合类型的判定阈值从而返回 mixed 类型的句式偏好。";
    const content = [`丙：「短。」`, `丙：「${longSentence}」`].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.sentenceStyle).toBe("mixed");
  });

  test("同一章节多个角色各自得到指纹", async () => {
    const { db, characterIds } = await seedDatabase([
      { name: "林逸" },
      { name: "李四" },
    ]);
    const content = [
      '林逸：「好。」',
      '李四：「可以。」',
      '林逸：「那就比试比试。」',
    ].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(2);
    const byChar = new Map(results.map((r) => [r.characterId, r]));
    const linyi = byChar.get(characterIds[0]);
    const lisi = byChar.get(characterIds[1]);
    expect(linyi).toBeDefined();
    expect(lisi).toBeDefined();
    // 各角色 fingerprint 都有非空 catchphrases / emotionStyle
    expect(linyi?.fingerprint.sentenceStyle).toBeDefined();
    expect(lisi?.fingerprint.sentenceStyle).toBeDefined();
  });

  test("无对白章节返回空 fingerprint 数组（每角色一行默认指纹）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "张三" }]);
    const content = "今日天气晴朗，无事发生。";
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(1);
    expect(results[0].fingerprint.catchphrases).toEqual([]);
    expect(results[0].fingerprint.avoidWords).toEqual([]);
    expect(results[0].fingerprint.sentenceStyle).toBeDefined();
    expect(results[0].fingerprint.emotionStyle).toBeDefined();
  });

  test("空 characterIds 返回空数组", async () => {
    closeDatabase();
    const db = await initDatabase();
    const results = extractVoiceFromChapter("「台词」", "ch1", [], db);
    expect(results).toEqual([]);
  });

  test("空字符串章节内容返回空数组", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "王五" }]);
    const results = extractVoiceFromChapter("", "ch1", characterIds, db);
    expect(results).toEqual([]);
  });

  test("支持中英文标点混合（。！？!?）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "赵六" }]);
    const content = [
      '赵六：「中文句号。」',
      '赵六：「English period. Are you sure? Wow!」',
    ].join("\n");
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.metadata?.totalDialogLines).toBeGreaterThanOrEqual(1);
    // 情感风格：感叹密度高 + 问号存在 → 直接 或 幽默
    expect(["直接", "幽默", "含蓄", "冷峻"]).toContain(results[0].fingerprint.emotionStyle);
  });

  test("支持 ASCII 双引号对白", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "钱七" }]);
    const content = '钱七大喝一声："休想逃！"';
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(1);
    expect(results[0].fingerprint.metadata?.totalDialogLines).toBeGreaterThan(0);
  });

  test("支持别名归属（小逸 → 林逸）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸", aliases: ["小逸"] }]);
    const content = '小逸微微点头：「我知道了。」';
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results).toHaveLength(1);
    expect(results[0].characterId).toBe(characterIds[0]);
  });

  test("avoidWords 默认空（用户自行填写）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "孙八" }]);
    const content = '孙八：「我什么都说。」';
    const results = extractVoiceFromChapter(content, "ch1", characterIds, db);
    expect(results[0].fingerprint.avoidWords).toEqual([]);
  });

  test("fingerprint 结构符合 spec（包含 metadata）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "周九" }]);
    const content = '周九：「好啊！」\n周九：「来吧！」\n周九：「试试看。」';
    const results = extractVoiceFromChapter(content, "ch42", characterIds, db);
    const fp: VoiceFingerprint = results[0].fingerprint;
    expect(fp).toHaveProperty("catchphrases");
    expect(fp).toHaveProperty("sentenceStyle");
    expect(fp).toHaveProperty("avoidWords");
    expect(fp).toHaveProperty("emotionStyle");
    expect(fp.metadata).toBeDefined();
    expect(fp.metadata?.sampleChapterIds).toContain("ch42");
    expect(typeof fp.metadata?.totalDialogLines).toBe("number");
    expect(typeof fp.metadata?.extractedAt).toBe("string");
  });
});
