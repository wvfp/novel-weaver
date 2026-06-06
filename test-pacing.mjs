import initSqlJs from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";

const SQL = await initSqlJs();
const buf = fs.readFileSync(".novel-weaver/novel-weaver.db");
const db = new SQL.Database(buf);

// Check DB state
function query(sql) {
  const r = db.exec(sql);
  return r?.[0]?.values ?? [];
}

console.log("=== DB State ===");

// Tables
const tables = query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log("Tables:", tables.map((v) => v[0]).join(", "));

// Projects
const projects = query("SELECT id, name, genre_pack_id FROM projects");
console.log("Projects:", JSON.stringify(projects));

// Chapters
const chapters = query("SELECT id, chapter_num, volume_num, title, word_count FROM chapters");
console.log("Chapters (" + chapters.length + "):");
for (const c of chapters) {
  console.log("  ", c[1], c[2], c[3], "| id:", c[0], "| words:", c[4]);
}

// Test the loadChapterRow function
function loadChapterRow(db2, chapterId) {
  const stmt = db2.prepare(
    "SELECT id, chapter_num, volume_num, title, word_count FROM chapters WHERE id = ?"
  );
  stmt.bind([chapterId]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    id: String(row.id),
    chapter_num: Number(row.chapter_num),
    volume_num: Number(row.volume_num),
    title: String(row.title),
    word_count: Number(row.word_count),
  };
}

// Test with first chapter
if (chapters.length > 0) {
  const chId = chapters[0][0];
  const row = loadChapterRow(db, chId);
  console.log("\n=== LoadChapterRow ===");
  console.log("Row:", JSON.stringify(row));

  // Test readChapterBody
  function buildChapterFilename(num, title) {
    const slug = title.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
    return "ch" + String(num).padStart(2, "0") + "-" + slug + ".md";
  }

  function readChapterBody(projectRoot, volumeNum, chapterNum, title) {
    const dir = path.join(
      projectRoot,
      ".novel-weaver",
      "content",
      "chapters",
      "vol-" + volumeNum
    );
    const fp = path.join(dir, buildChapterFilename(chapterNum, title));
    console.log("Looking for file:", fp);
    try {
      const text = fs.readFileSync(fp, "utf-8");
      return text.replace(/^---[\s\S]*?---\n?/, "").trim();
    } catch (e) {
      console.log("File not found:", e.message);
      return null;
    }
  }

  const body = readChapterBody(process.cwd(), row.volume_num, row.chapter_num, row.title);
  console.log("Body length:", body?.length);
  console.log("Body preview:", body?.substring(0, 100));
}

db.close();
