import initSqlJs from "sql.js";
import * as fs from "node:fs";

const buf = fs.readFileSync(
  "W:/WorldSpec/诸天模拟：我能抽取金手指/.novel-weaver/novel-weaver.db"
);
const SQL = await initSqlJs();
const db = new SQL.Database(buf);

// Project info
const proj = db.exec(
  "SELECT id, name, genre_pack_id, author, status FROM projects"
);
console.log("Projects:", JSON.stringify(proj, null, 2));

// Tables
const tables = db.exec(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
);
console.log("\nTables:", tables[0]?.values?.map((v) => v[0]));

// Stats
const count = (sql) => {
  const r = db.exec(sql);
  return r?.[0]?.values?.[0]?.[0] ?? 0;
};
console.log("\nStats:");
console.log("  worlds:", count("SELECT COUNT(*) FROM worlds"));
console.log("  characters:", count("SELECT COUNT(*) FROM characters"));
console.log("  arcs:", count("SELECT COUNT(*) FROM arcs"));
console.log("  chapters:", count("SELECT COUNT(*) FROM chapters"));
console.log("  reviews:", count("SELECT COUNT(*) FROM reviews"));
console.log("  schema_version:", count("SELECT MAX(version) FROM schema_version"));

// List worlds
const w = db.exec("SELECT id, name, type FROM worlds LIMIT 10");
if (w[0]?.values?.length) {
  console.log("\nWorlds:");
  w[0].values.forEach((v) => console.log("  ", v[0], v[1], "[" + v[2] + "]"));
}

// List arcs
const a = db.exec("SELECT id, name, arc_type, difficulty FROM arcs LIMIT 10");
if (a[0]?.values?.length) {
  console.log("\nArcs:");
  a[0].values.forEach((v) => console.log("  ", v[0], v[1], v[2], "Lv." + v[3]));
}

// List characters
const c = db.exec(
  "SELECT id, name, role_type FROM characters LIMIT 10"
);
if (c[0]?.values?.length) {
  console.log("\nCharacters:");
  c[0].values.forEach((v) =>
    console.log("  ", v[0], v[1], "[" + v[2] + "]")
  );
}

db.close();
