/**
 * One-shot setup: import all settings into novel-weaver
 */
import m from "./dist/index.js";
import initSqlJs from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";

const DIR = "G:/Code/novel-plugin";
const hooks = await m.server({}, {});
const ctx = { directory: DIR };

// 1. Init
console.log("=== 1. Init ===");
const initR = await hooks.tool.novel_init.execute(
  { project_name: "诸天模拟：我能抽取金手指", genre: "infinite-flow", author: "匿名" },
  ctx
);
console.log(initR.output?.substring(0, 100));

// Check DB state
const SQL = await initSqlJs();
async function verifyDB(label) {
  try {
    const buf = fs.readFileSync(path.join(DIR, ".novel-weaver/novel-weaver.db"));
    const d = new SQL.Database(buf);
    const tables = d.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const proj = d.exec("SELECT id,name FROM projects");
    const worlds = d.exec("SELECT id,name FROM worlds");
    const chars = d.exec("SELECT id,name FROM characters");
    const arcs = d.exec("SELECT id,name FROM arcs");
    console.log(`  ${label} — tables:${tables[0]?.values?.length||0} proj:${proj[0]?.values?.length||0} worlds:${worlds[0]?.values?.length||0} chars:${chars[0]?.values?.length||0} arcs:${arcs[0]?.values?.length||0}`);
    d.close();
  } catch(e) {
    console.log(`  ${label} — error: ${e.message}`);
  }
}
verifyDB("after init");

// 2. Create worlds
console.log("\n=== 2. Worlds ===");
const w1 = await hooks.tool.novel_world_create.execute({
  name: "苍玄界", type: "primary",
  description: "以光年计量的超级大陆。五域（中央仙域/西荒/北地/东海/南境）共同组成繁荣修炼文明。",
  tags: ["仙侠", "高魔", "五域"],
  power_system: "五道九境：仙道（练气→筑基→金丹→元婴→化神→炼虚→大乘→渡劫→仙），武道（铜皮→铁骨→银血→金身→玉髓→不灭→通神→归真→武神），心道（凝神→定念→意动→心观→念力→意化→心界→念合→心至极），鬼道（养魂→凝阴→聚煞→驭鬼→化冥→通幽→掌界→冥王→轮回），神道（开光→供奉→显灵→塑身→敕封→凝格→掌域→天敕→合道）。仙境九转：仙→一转→…→九转→超脱",
  factions: "中央仙域（仙道为主/宗门林立）、西荒（武道为主/弱肉强食）、北地（鬼道/幽冥之地）、东海（器修/铸器胜地）、南境（神道/古神遗迹）",
  locations: "中央仙域南陲·落星城（主角初始地）、五域各主城、碎界走廊、域外星空",
  history: "五域有共享的道统渊源。仙庭（大型宗门联合）负责跨域传送阵维护和边境监视。域外星空另有星辰道统。",
}, ctx);
console.log("苍玄界:", w1.output?.substring(0, 60));

const w2 = await hooks.tool.novel_world_create.execute({
  name: "青山界", type: "secondary",
  description: "一阶异界模拟世界。低武江湖，力量上限≈先天大宗师（筑基以下）。主角第一个模拟世界。",
  tags: ["一阶", "低武", "江湖", "模拟世界"],
  power_system: "不入流→三流→二流→一流→先天→宗师→大宗师（≈主世界练气~筑基）",
  locations: "云州城、苍龙山秘境、无名山脉洞穴",
}, ctx);
console.log("青山界:", w2.output?.substring(0, 60));

const wid1 = w1.metadata?.id;
const wid2 = w2.metadata?.id;
verifyDB("after worlds");

// 3. Create character (林柒玖)
console.log("\n=== 3. Character ===");
const chR = await hooks.tool.novel_character_create.execute({
  world_id: wid1, name: "林柒玖", role_type: "protagonist",
  description: "15-17岁胎穿至苍玄界的孤儿，中央仙域南陲·落星城外城西北角棚户区长大的底层少年。相貌顶级美少年但长期被邋遢掩盖。修炼资质极差（下下品杂灵根/经脉堵塞/丹田极小），全靠诸天模拟器逆天改命。性格乐观自娱，随心所欲，先观察再判断。",
  aliases: ["林柒玖", "小七", "林七（异界用名）"],
  voice_fingerprint: {
    catchphrases: ["有意思", "好家伙", "这不……吗"],
    speechStyle: "嘴上贫，想到什么说什么。经常跟自己说话。喜欢给事物起外号、给自己解说。紧张时话更多，大场面话变少",
    emotionStyle: "轻松吐槽型，压力越大话越多，真到生死关头反而安静",
    tone: "现代口语风，前世网络用语会不自觉冒出来但仅限独处时",
    narratorRelation: "叙述者=戴了第三人称面具的主角本人。吐槽是主角的吐槽不是叙述者另立的吐槽席"
  },
  address_chain: {
    addresses: {
      "林柒玖": "自称/本名",
      "柒玖": "被好友称呼",
      "林小子": "被长辈称呼",
      "小七师傅": "青石镇上尊称",
      "玉面郎君": "江湖绰号（青山界）"
    },
    updatedAt: "2026-06-06",
    sourceChapters: []
  }
}, ctx);
console.log("林柒玖:", chR.output?.substring(0, 100));

verifyDB("after character");

// 4. Create arcs
console.log("\n=== 4. Arcs ===");
const a1 = await hooks.tool.novel_arc_generate.execute({
  theme: "仙侠", arc_type: "storyline", difficulty: 2,
  parent_world_id: wid1, name: "觉醒篇"
}, ctx);
console.log("觉醒篇:", a1.output?.substring(0, 60));

const a2 = await hooks.tool.novel_arc_generate.execute({
  theme: "仙侠", arc_type: "storyline", difficulty: 3,
  parent_world_id: wid1, name: "崛起篇"
}, ctx);
console.log("崛起篇:", a2.output?.substring(0, 60));

// 5. Create the first simulation world as a dungeon arc
const a3 = await hooks.tool.novel_arc_generate.execute({
  theme: "仙侠", arc_type: "dungeon", difficulty: 2,
  parent_world_id: wid2, name: "青山界·异界模拟"
}, ctx);
console.log("青山界·异界模拟:", a3.output?.substring(0, 60));

// 6. Link character to world
console.log("\n=== 5. Links ===");
const link1 = await hooks.tool.novel_world_link.execute({
  source_file: "settings/world-苍玄界.md",
  target_file: "char-林柒玖.md",
  link_type: "character_in"
}, ctx);
console.log("Link 1:", link1.output?.substring(0, 60));

const link2 = await hooks.tool.novel_world_link.execute({
  source_file: "settings/world-苍玄界.md",
  target_file: "settings/world-青山界.md",
  link_type: "reference"
}, ctx);
console.log("Link 2:", link2.output?.substring(0, 60));

// Final verification
console.log("\n=== Final DB State ===");
verifyDB("final");

// List what we've created
console.log("\n=== Summary ===");
const files = (d) => { try { return fs.readdirSync(d).length; } catch { return 0; } };
console.log("Settings files:", files(path.join(DIR, ".novel-weaver/content/settings")));
console.log("World files:", files(path.join(DIR, ".novel-weaver/content/settings/worlds")));
console.log("Plans files:", files(path.join(DIR, ".novel-weaver/content/plans")));
console.log("Characters files:", files(path.join(DIR, ".novel-weaver/content/characters")));

console.log("\n✅ Setup complete!");
