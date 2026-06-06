/**
 * End-to-end test of fix for review-pacing.ts
 *
 * 1. Creates a temp project directory
 * 2. Inits project via tools
 * 3. Creates world + arc + writes a chapter
 * 4. Runs pacing review
 * 5. Reports result
 */
import m from "./dist/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "pacing-test-"));
console.log("Test dir:", TEMP);
// DO NOT create .novel-weaver — novel_init will do it

const hooks = await m.server({}, {});
const ctx = { directory: TEMP };

// 1. Init
console.log("\n=== Step 1: Init ===");
const initR = await hooks.tool.novel_init.execute(
  { project_name: "节奏测试", genre: "xianxia", author: "tester" },
  ctx
);
console.log(initR.output?.substring(0, 120));

// 2. Create world
console.log("\n=== Step 2: World ===");
const worldR = await hooks.tool.novel_world_create.execute(
  { name: "剑道大陆", type: "primary", description: "测试世界" },
  ctx
);
console.log(worldR.output?.substring(0, 100));
const wid = worldR.metadata?.id;

// 3. Create arc
console.log("\n=== Step 3: Arc ===");
const arcR = await hooks.tool.novel_arc_generate.execute(
  { theme: "仙侠", arc_type: "trial", difficulty: 3, parent_world_id: wid },
  ctx
);
console.log(arcR.output?.substring(0, 100));
const aid = arcR.metadata?.id;

// 4. Write a chapter
console.log("\n=== Step 4: Write chapter ===");
const chR = await hooks.tool.novel_write_chapter.execute(
  {
    arc_id: aid,
    chapter_title: "初试锋芒",
    chapter_num: 1,
    body: "林轩踏入剑道大陆的第一天，就遇到了一个让他意想不到的挑战。\n\n" +
      "前方是一片茂密的竹林，竹叶在风中沙沙作响。他小心翼翼地向前走去，突然，一道剑气从竹林深处激射而出！\n\n" +
      "林轩侧身闪避，那道剑气擦着他的衣袖飞过，将身后的一块巨石劈成两半。\n\n" +
      "「来者何人？」竹林深处传来一个清冷的声音。\n\n" +
      "「在下林轩，误入此地，并无恶意。」林轩拱手道。\n\n" +
      "竹林安静了片刻，随后一个白衣少女从林中走出。她手中握着一柄三尺青锋，眼神锐利如剑。\n\n" +
      "「误入？」少女冷笑一声，「此地乃天剑宗禁地，闲人免入。你能走到这里，说明至少也有筑基期的修为。」\n\n" +
      "林轩心中一惊。他确实已经是筑基中期，但这少女竟能一眼看穿他的修为。\n\n" +
      "「师姐慧眼如炬，在下确实有筑基修为。但我真的只是迷路了。」\n\n" +
      "白衣少女盯着他看了半晌，忽然收剑入鞘。「既然是迷路，那就跟我来吧。不过——」她话锋一转，「若让我发现你有任何不轨之举，休怪我剑下无情。」"
  },
  ctx
);
console.log(chR.output?.substring(0, 200));
const chId = chR.metadata?.id || chR.output?.match(/ID[：:]\s*(\S+)/)?.[1];
console.log("Chapter ID:", chId);

// 5. Run default review
console.log("\n=== Step 5: Default Review ===");
if (chId) {
  const r1 = await hooks.tool.novel_review_chapter.execute(
    { chapter_id: chId, focus: "default" },
    ctx
  );
  console.log("Default review:", r1.output?.substring(0, 300));

  // 6. Run PACING review (THIS IS THE FIX WE'RE TESTING)
  console.log("\n=== Step 6: PACING REVIEW (the fix!) ===");
  const r2 = await hooks.tool.novel_review_chapter.execute(
    { chapter_id: chId, focus: "pacing" },
    ctx
  );
  console.log("PACING REVIEW OUTPUT:");
  console.log(r2.output?.substring(0, 2000));
  
  if (r2.output?.includes("爆点") || r2.output?.includes("爽点") || r2.output?.includes("钩子") || r2.output?.includes("节奏")) {
    console.log("\n✅ PASS: Pacing review produced expected output");
  } else if (r2.output?.includes("数据库未初始化") || r2.output?.includes("未找到章节")) {
    console.log("\n❌ FAIL: Pacing review reported error:", r2.output?.substring(0, 200));
  } else {
    console.log("\n⚠️  UNKNOWN: review returned but unexpected content");
  }
} else {
  console.log("❌ Could not determine chapter ID, cannot test");
}

// Cleanup
fs.rmSync(TEMP, { recursive: true, force: true });
console.log("\nCleaned up temp dir");
