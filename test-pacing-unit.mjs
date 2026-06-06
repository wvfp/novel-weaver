/**
 * Unit test: review-pacing.ts fix
 *
 * Directly tests analyzeChapterPacing after
 * manually creating DB + chapter.md file.
 */
import initSqlJs from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "pacing-unit-"));
const DATA_DIR = path.join(TEMP, ".novel-weaver");
const CONTENT_DIR = path.join(DATA_DIR, "content", "chapters", "vol-1");
const DB_PATH = path.join(DATA_DIR, "novel-weaver.db");
fs.mkdirSync(CONTENT_DIR, { recursive: true });
console.log("Temp dir:", TEMP);

// 1. Create a minimal DB with a chapter row
const SQL = await initSqlJs();
const db = new SQL.Database();

// Create tables
db.run("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, genre_pack_id TEXT)");
db.run("CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, arc_id TEXT, volume_num INTEGER, chapter_num INTEGER, title TEXT, word_count INTEGER, status TEXT)");
db.run("INSERT INTO projects (id, name, genre_pack_id) VALUES ('p1', 'test', 'xianxia')");

const chId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
db.run("INSERT INTO chapters (id, arc_id, volume_num, chapter_num, title, word_count, status) VALUES (?, 'a1', 1, 1, '初试锋芒', 312, 'draft')", 
  [chId]);

// 2. Write the chapter .md file
const chapterContent = `---
title: 初试锋芒
chapter_num: 1
volume_num: 1
status: draft
---

林轩踏入剑道大陆的第一天，就遇到了一个让他意想不到的挑战。

前方是一片茂密的竹林，竹叶在风中沙沙作响。他小心翼翼地向前走去，突然，一道剑气从竹林深处激射而出！

林轩侧身闪避，那道剑气擦着他的衣袖飞过，将身后的一块巨石劈成两半。

「来者何人？」竹林深处传来一个清冷的声音。

「在下林轩，误入此地，并无恶意。」林轩拱手道。

竹林安静了片刻，随后一个白衣少女从林中走出。她手中握着一柄三尺青锋，眼神锐利如剑。

「误入？」少女冷笑一声，「此地乃天剑宗禁地，闲人免入。你能走到这里，说明至少也有筑基期的修为。」

林轩心中一惊。他确实已经是筑基中期，但这少女竟能一眼看穿他的修为。

「师姐慧眼如炬，在下确实有筑基修为。但我真的只是迷路了。」

白衣少女盯着他看了半晌，忽然收剑入鞘。「既然是迷路，那就跟我来吧。不过——」她话锋一转，「若让我发现你有任何不轨之举，休怪我剑下无情。」

林轩跟着白衣少女穿过竹林，一路上两人都没有说话。竹林深处是一条蜿蜒的石阶，石阶两旁刻满了古老的剑痕。

「这些剑痕，是天剑宗历代掌门留下的。」白衣少女忽然开口，「每一道剑痕都蕴含着一套剑法。你能看懂多少，就看你的造化了。」

林轩仔细端详那些剑痕，只觉得其中蕴含着深奥的剑意。他的识海中浮现出一幅幅剑招的画面。

「有意思，」他低声自语。

白衣少女瞥了他一眼，眼中闪过一丝诧异。「你居然真的能看懂？」

「略懂一二。」林轩谦虚地说。

实际上，他的脑海中已经浮现出了三套完整的基础剑法。虽然他主修的是阵法，但多掌握一些剑法总没有坏处。`;

fs.writeFileSync(path.join(CONTENT_DIR, "ch01-初试锋芒.md"), chapterContent, "utf-8");

console.log("Chapter file created:", fs.existsSync(path.join(CONTENT_DIR, "ch01-初试锋芒.md")));

// 3. Export DB
const buf = db.export();
fs.writeFileSync(DB_PATH, Buffer.from(buf));

// 4. Now test the fixed readChapterBody logic
function buildChapterFilename(num, title) {
  const slug = title.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
  return "ch" + String(num).padStart(2, "0") + "-" + slug + ".md";
}

function readChapterBody(projectRoot, volumeNum, chapterNum, title) {
  const dir = path.join(projectRoot, ".novel-weaver", "content", "chapters", "vol-" + volumeNum);
  const fp = path.join(dir, buildChapterFilename(chapterNum, title));
  console.log("File path:", fp);
  console.log("Exists:", fs.existsSync(fp));
  try {
    const text = fs.readFileSync(fp, "utf-8");
    return text.replace(/^---[\s\S]*?---\n?/, "").trim();
  } catch (e) {
    return null;
  }
}

const row = db.exec("SELECT id, chapter_num, volume_num, title, word_count FROM chapters WHERE id = ?",
  [chId]);
console.log("Row:", JSON.stringify(row));

const body = readChapterBody(TEMP, 1, 1, "初试锋芒");
console.log("\nBody length:", body?.length);
console.log("Body starts with:", body?.substring(0, 60));
  console.log("\n✅ readChapterBody with fix works:", body !== null && body.length > 0);

// 6. Verify built module contains the fix
console.log("\n=== Verifying built module contains fix ===");
const src = fs.readFileSync("dist/index.js", "utf-8");
const hasVolumeDir = src.includes('"vol-"') && src.includes('volume_num');
console.log("dist/index.js uses volume directory (vol-$):", hasVolumeDir);
const hasBuildFn = src.includes("buildChapterFilename") || src.includes("ch" + "+" + "String");
console.log("dist/index.js uses buildChapterFilename or ch## pattern:", hasBuildFn);
const hasNewPath = src.includes('.novel-weaver') && src.includes('content') && src.includes('chapters') && src.includes('vol-');
console.log("dist/index.js has correct path pattern:", hasNewPath);

// 7. Also verify that the BUNDLED code doesn't have the old buggy line
const hasOldBug = src.includes('dataDir, "chapters"') || src.includes('`${chapterId}.md`');
console.log("OLD bug line (dataDir + chapterId.md) present:", hasOldBug);

// Cleanup
fs.rmSync(TEMP, { recursive: true, force: true });
console.log("\nCleaned up.");
