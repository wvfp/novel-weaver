import initSqlJs from "sql.js";
import * as fs from "node:fs";

const buf = fs.readFileSync(".novel-weaver/novel-weaver.db");
const SQL = await initSqlJs();
const db = new SQL.Database(buf);

const r = db.exec("SELECT id, name, role_type FROM characters");
for (const row of r[0]?.values ?? []) {
  console.log(row[0], row[1], row[2]);
}
db.close();
