/**
 * 称谓链追踪器单元测试
 *
 * 覆盖：
 *  1) 章节内 `from → to` 称呼首次出现
 *  2) 后章称呼变化检测（师父 → 师兄）
 *  3) 无变化章节返回空数组
 *  4) diffAddressChain 基本 diff
 *  5) AddressChain.history 数组结构保留
 */

import { describe, test, expect, afterEach } from "bun:test";
import { initDatabase, getDatabase, closeDatabase, generateId } from "../../db/index";
import {
  trackAddressChanges,
  diffAddressChain,
  recordAddressChange,
  type AddressChain,
  type AddressDiffEntry,
} from "./address-tracker";

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

/** 在 from 角色的 address_chain 字段中预设 to 角色的 current 称呼 */
function presetAddress(
  db: ReturnType<typeof getDatabase>,
  fromId: string,
  toId: string,
  current: string,
  history: Array<{ chapter: number; address: string; reason?: string }> = [],
) {
  if (!db) return;
  const chain: AddressChain = {
    addresses: {
      [toId]: { current, history },
    },
  };
  db.run("UPDATE characters SET address_chain = ? WHERE id = ?", [
    JSON.stringify(chain),
    fromId,
  ]);
}

describe("trackAddressChanges", () => {
  afterEach(() => {
    closeDatabase();
  });

  test("检测称呼变化：师父 → 师兄（晋升）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    presetAddress(db, linyiId, lisiId, "师父", [
      { chapter: 5, address: "师父", reason: "拜师入门" },
    ]);

    const content = '林逸：「师兄，今日有何指教？」';
    const changes = trackAddressChanges(content, 30, linyiId, lisiId, db);
    expect(changes).toHaveLength(1);
    expect(changes[0].oldAddress).toBe("师父");
    expect(changes[0].newAddress).toBe("师兄");
    expect(changes[0].chapterNum).toBe(30);
    expect(changes[0].fromCharacterId).toBe(linyiId);
    expect(changes[0].toCharacterId).toBe(lisiId);
    expect(changes[0].context).toBeTruthy();
  });

  test("称呼未变时返回空", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    presetAddress(db, linyiId, lisiId, "师兄");

    const content = '林逸：「师兄，来吧。」';
    const changes = trackAddressChanges(content, 10, linyiId, lisiId, db);
    expect(changes).toEqual([]);
  });

  test("from 角色没有对白时返回空", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    presetAddress(db, linyiId, lisiId, "师父");

    const content = '李四：「林逸，今日天气真好。」';
    const changes = trackAddressChanges(content, 10, linyiId, lisiId, db);
    expect(changes).toEqual([]);
  });

  test("没有预设 chain 时不产生变化（仅初始建立）", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    // 注意：未 presetAddress
    const content = '林逸：「师兄好。」';
    const changes = trackAddressChanges(content, 5, linyiId, lisiId, db);
    expect(changes).toEqual([]);
  });

  test("空章节内容返回空数组", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    presetAddress(db, linyiId, lisiId, "师兄");
    expect(trackAddressChanges("", 10, linyiId, lisiId, db)).toEqual([]);
  });

  test("toCharacterId 不存在时返回空", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId] = characterIds;
    const fakeId = "nonexistent-id";
    expect(trackAddressChanges("林逸：「随便」", 1, linyiId, fakeId, db)).toEqual([]);
  });

  test("fromCharacterId 不存在时返回空", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [, lisiId] = characterIds;
    const fakeId = "nonexistent-id";
    expect(trackAddressChanges("林逸：「师兄」", 1, fakeId, lisiId, db)).toEqual([]);
  });

  test("检测婚后的称呼变化：姑娘 → 娘子", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "张三" }, { name: "翠翠" }]);
    const [zhangsanId, cuicuiId] = characterIds;
    presetAddress(db, zhangsanId, cuicuiId, "姑娘", [
      { chapter: 1, address: "姑娘", reason: "初见" },
    ]);
    const content = '张三：「娘子，今后有我在。」';
    const changes = trackAddressChanges(content, 20, zhangsanId, cuicuiId, db);
    expect(changes).toHaveLength(1);
    expect(changes[0].oldAddress).toBe("姑娘");
    expect(changes[0].newAddress).toBe("娘子");
  });

  test("支持别名触发：toCharacterId 的别名出现在对白中", async () => {
    const { db, characterIds } = await seedDatabase([
      { name: "林逸", aliases: ["小逸"] },
      { name: "李四", aliases: ["四哥"] },
    ]);
    const [linyiId, lisiId] = characterIds;
    presetAddress(db, linyiId, lisiId, "四哥");
    // 改用李四这个名字称呼时，应该报告 newAddress = 李四
    const content = '林逸：「李四前辈，请。」';
    const changes = trackAddressChanges(content, 8, linyiId, lisiId, db);
    expect(changes).toHaveLength(1);
    expect(changes[0].oldAddress).toBe("四哥");
    // 新称呼可能是 "李四" 或 "李四前辈"
    expect(["李四", "李四前"]).toContain(changes[0].newAddress.slice(0, 2));
  });
});

describe("diffAddressChain", () => {
  test("完全相同 → 返回空数组", () => {
    const oldChain: AddressChain = {
      addresses: { c1: { current: "师父", history: [] } },
    };
    const newChain: AddressChain = {
      addresses: { c1: { current: "师父", history: [] } },
    };
    const diffs = diffAddressChain(oldChain, newChain);
    expect(diffs).toEqual([]);
  });

  test("current 变化 → 返回单条 diff", () => {
    const oldChain: AddressChain = {
      addresses: { c1: { current: "老头子", history: [] } },
    };
    const newChain: AddressChain = {
      addresses: { c1: { current: "师父", history: [] } },
    };
    const diffs: AddressDiffEntry[] = diffAddressChain(oldChain, newChain);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].targetCharacterId).toBe("c1");
    expect(diffs[0].oldCurrent).toBe("老头子");
    expect(diffs[0].newCurrent).toBe("师父");
  });

  test("新增 target → 返回 oldCurrent 为空字符串的 diff", () => {
    const oldChain: AddressChain = { addresses: {} };
    const newChain: AddressChain = {
      addresses: { c2: { current: "师兄", history: [] } },
    };
    const diffs = diffAddressChain(oldChain, newChain);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].targetCharacterId).toBe("c2");
    expect(diffs[0].oldCurrent).toBe("");
    expect(diffs[0].newCurrent).toBe("师兄");
  });

  test("target 被移除 → 返回 newCurrent 为空字符串的 diff", () => {
    const oldChain: AddressChain = {
      addresses: { c3: { current: "师姐", history: [] } },
    };
    const newChain: AddressChain = { addresses: {} };
    const diffs = diffAddressChain(oldChain, newChain);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].targetCharacterId).toBe("c3");
    expect(diffs[0].oldCurrent).toBe("师姐");
    expect(diffs[0].newCurrent).toBe("");
  });

  test("history 数组结构保持不变", () => {
    const history = [
      { chapter: 5, address: "师姐", reason: "入门" },
      { chapter: 30, address: "师兄", reason: "晋升" },
    ];
    const oldChain: AddressChain = {
      addresses: { c1: { current: "师兄", history: history } },
    };
    const newChain: AddressChain = {
      addresses: { c1: { current: "师兄", history: history } },
    };
    // 拷贝后引用仍保留完整 history 数组
    expect(newChain.addresses.c1.history).toEqual(history);
    expect(newChain.addresses.c1.history).toHaveLength(2);
    // diff 为空（current 未变）
    expect(diffAddressChain(oldChain, newChain)).toEqual([]);
  });

  test("history 数组中元素结构正确（chapter / address / reason）", () => {
    const history = [
      { chapter: 5, address: "师姐" },
      { chapter: 30, address: "师兄", reason: "晋升" },
    ];
    const chain: AddressChain = {
      addresses: { c1: { current: "师兄", history: history } },
    };
    expect(chain.addresses.c1.history[0]).toMatchObject({ chapter: 5, address: "师姐" });
    expect(chain.addresses.c1.history[1]).toMatchObject({
      chapter: 30,
      address: "师兄",
      reason: "晋升",
    });
  });

  test("多个 target 中只有一个变化 → 仅返回该 diff", () => {
    const oldChain: AddressChain = {
      addresses: {
        c1: { current: "师父", history: [] },
        c2: { current: "师兄", history: [] },
      },
    };
    const newChain: AddressChain = {
      addresses: {
        c1: { current: "师父", history: [] },
        c2: { current: "师弟", history: [] },
      },
    };
    const diffs = diffAddressChain(oldChain, newChain);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].targetCharacterId).toBe("c2");
  });
});

describe("recordAddressChange", () => {
  afterEach(() => {
    closeDatabase();
  });

  test("首次记录时创建 entries", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    const chain = recordAddressChange(db, linyiId, lisiId, 5, "师父", "拜师");
    expect(chain.addresses[lisiId].current).toBe("师父");
    expect(chain.addresses[lisiId].history).toEqual([
      { chapter: 5, address: "师父", reason: "拜师" },
    ]);
  });

  test("再次记录时保留 history 数组", async () => {
    const { db, characterIds } = await seedDatabase([{ name: "林逸" }, { name: "李四" }]);
    const [linyiId, lisiId] = characterIds;
    recordAddressChange(db, linyiId, lisiId, 5, "师父", "拜师");
    const chain = recordAddressChange(db, linyiId, lisiId, 30, "师兄", "晋升");
    expect(chain.addresses[lisiId].current).toBe("师兄");
    // history 应包含旧 current 推送的条目
    expect(chain.addresses[lisiId].history.length).toBeGreaterThanOrEqual(1);
    const oldEntry = chain.addresses[lisiId].history[0];
    expect(oldEntry.address).toBe("师父");
  });
});
