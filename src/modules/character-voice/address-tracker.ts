/**
 * 角色称呼链追踪器
 *
 * 追踪角色 A 在对话中称呼角色 B 时使用的称谓。
 * 用于：
 *  - 初次建立人物的称呼关系
 *  - 检测后续章节中称呼是否发生重大变化（如「师父」→「师兄」）
 *  - 在 novel_character_voice_check 类工具中作为一致性检查的输入
 *
 * 数据结构（存于 characters.address_chain JSON 字段）：
 *   {
 *     "addresses": {
 *       "<toCharacterId>": {
 *         "current": "师父",
 *         "history": [
 *           { "chapter": 5, "address": "师父", "reason": "拜师" },
 *           { "chapter": 30, "address": "师兄", "reason": "晋升" }
 *         ]
 *       }
 *     }
 *   }
 */

import type { Database } from "../../db/index.js";
import { parseAddressChainJson } from "./voice-extractor.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 称呼链（与 characters.address_chain 列对应） */
export interface AddressChain {
  /** 角色对其他人的称呼：key = 对方角色 ID，value = 称呼详情 */
  addresses: Record<
    string,
    {
      /** 当前称呼 */
      current: string;
      /** 历史称呼：按章节号排序 */
      history: Array<{
        chapter: number;
        address: string;
        reason?: string;
      }>;
    }
  >;
}

/** 检测到的单次称呼变化 */
export interface AddressChange {
  /** 说话者角色 ID */
  fromCharacterId: string;
  /** 被称呼者角色 ID */
  toCharacterId: string;
  /** 变化所在的章节号 */
  chapterNum: number;
  /** 旧称呼 */
  oldAddress: string;
  /** 新称呼 */
  newAddress: string;
  /** 触发变化的章节上下文 */
  context: string;
}

/** `diffAddressChain` 输出的单条变化 */
export interface AddressDiffEntry {
  targetCharacterId: string;
  oldCurrent: string;
  newCurrent: string;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 转义正则元字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 从 `fromCharacterId` 的对白中找称呼 `toCharacterId` 时使用的具体称谓 */
function findAddressForTarget(
  lines: Array<{ text: string; context: string }>,
  target: { id: string; name: string; aliases: string[] },
): { address: string; context: string } | null {
  // 优先用角色名 / 别名（按长度倒序）匹配第一个出现的「name + 敬称」片段
  const candidates = [target.name, ...target.aliases]
    .filter((n) => n && n.length >= 1)
    .sort((a, b) => b.length - a.length);

  for (const line of lines) {
    for (const name of candidates) {
      const idx = line.text.indexOf(name);
      if (idx === -1) continue;
      // 抓取称谓短语：名字 + 后续 1-2 个汉字（前辈/师兄/师父/姑娘 等）
      const tail = line.text.slice(idx, idx + name.length + 2);
      // 若后续是普通汉字而不是常见敬称后缀，只返回 name 本身
      const honorificMatch = tail.match(/^[\u4e00-\u9fff]{2,4}$/);
      return { address: honorificMatch ? tail : name, context: line.context };
    }
  }

  // 兜底：toCharacterId 名字未出现在对白中时，
  // 取该行首 2-4 个汉字作为推断的称呼（适用于「师兄，今日有何指教？」这类省略主语的敬称）
  for (const line of lines) {
    const match = line.text.match(/^[\u4e00-\u9fff]{2,4}/);
    if (match) {
      return { address: match[0], context: line.context };
    }
  }

  return null;
}

/** 从 DB 读出 `fromCharacterId` 当前的 address_chain */
function readChainFromDb(db: Database, fromCharacterId: string): AddressChain {
  try {
    const stmt = db.prepare(
      "SELECT address_chain FROM characters WHERE id = ?",
    );
    stmt.bind([fromCharacterId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      const raw = (row.address_chain as string | null) ?? null;
      stmt.free();
      return parseAddressChainJson(raw);
    }
    stmt.free();
  } catch {
    // ignore
  }
  return { addresses: {} };
}

/** 从 DB 读出 `toCharacterId` 的元数据（id/name/aliases） */
function readTargetRef(
  db: Database,
  toCharacterId: string,
): { id: string; name: string; aliases: string[] } | null {
  try {
    const stmt = db.prepare(
      "SELECT id, name, aliases FROM characters WHERE id = ?",
    );
    stmt.bind([toCharacterId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      stmt.free();
      const raw = (row.aliases as string | null) ?? null;
      let aliases: string[] = [];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) aliases = parsed.map(String);
      } catch {
        if (raw) aliases = [raw];
      }
      return {
        id: String(row.id ?? toCharacterId),
        name: String(row.name ?? ""),
        aliases,
      };
    }
    stmt.free();
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 扫描章节对白，检测 `fromCharacterId` 称呼 `toCharacterId` 的方式
 * 相对于已有称呼链是否发生变化。
 *
 * 处理流程：
 *  1) 在章节正文中找 `fromCharacterId` 相关的对白（行首归属 / 上下文窗口）
 *  2) 找 `toCharacterId` 名字 / 别名第一次出现的称谓
 *  3) 与已有 chain 中 `addresses[toCharacterId].current` 比较
 *  4) 若不同则产生 `AddressChange` 记录
 *
 * 例子：师父 → 师兄（晋升后）、姑娘 → 娘子（婚后）、你 → 主人（被奴役后）
 */
export function trackAddressChanges(
  chapterContent: string,
  chapterNum: number,
  fromCharacterId: string,
  toCharacterId: string,
  db: Database,
): AddressChange[] {
  if (!chapterContent.trim()) return [];

  const target = readTargetRef(db, toCharacterId);
  if (!target) return [];

  // 收集 fromCharacterId 角色在此章中说的对白
  const fromRef = readTargetRef(db, fromCharacterId);
  if (!fromRef) return [];

  // 行首归属：查找「fromRef.name/aliases：「台词」」形式
  const lines: Array<{ text: string; context: string }> = [];
  const nameAlts = [fromRef.name, ...fromRef.aliases]
    .filter((n) => n && n.length > 0)
    .map(escapeRegex)
    .join("|");
  // 注意：当没有别名时必须避免出现 `name|` 这种空交替，否则会匹配零字符的 speaker
  const attributionPattern = nameAlts
    ? `(${nameAlts})[：:]\\s*「([^」]+)」`
    : `(?:${escapeRegex(fromRef.name)})[：:]\\s*「([^」]+)」`;
  const attributionRe = new RegExp(attributionPattern, "g");
  let match: RegExpExecArray | null;
  while ((match = attributionRe.exec(chapterContent)) !== null) {
    const text = match[2];
    const start = match.index;
    const before = chapterContent.slice(Math.max(0, start - 24), start);
    const after = chapterContent.slice(
      attributionRe.lastIndex,
      Math.min(chapterContent.length, attributionRe.lastIndex + 24),
    );
    // 上下文若全空（行首归属、首章等情况），用 speaker + 台词本身兜底
    const ctx = (before + after).slice(0, 60);
    lines.push({
      text,
      context: ctx || `${fromRef.name}：「${text}」`,
    });
  }

  if (lines.length === 0) return [];

  const found = findAddressForTarget(lines, target);
  if (!found) return [];

  const chain = readChainFromDb(db, fromCharacterId);
  const existing = chain.addresses[toCharacterId];
  if (!existing) return [];
  if (existing.current === found.address) return [];

  return [
    {
      fromCharacterId,
      toCharacterId,
      chapterNum,
      oldAddress: existing.current,
      newAddress: found.address,
      context: found.context,
    },
  ];
}

/**
 * 比较两个 AddressChain 快照，返回 `current` 不同的目标列表。
 */
export function diffAddressChain(
  oldChain: AddressChain,
  newChain: AddressChain,
): AddressDiffEntry[] {
  const diffs: AddressDiffEntry[] = [];
  const targets = new Set([
    ...Object.keys(oldChain.addresses),
    ...Object.keys(newChain.addresses),
  ]);
  for (const targetId of targets) {
    const oldCurrent = oldChain.addresses[targetId]?.current ?? "";
    const newCurrent = newChain.addresses[targetId]?.current ?? "";
    if (oldCurrent !== newCurrent) {
      diffs.push({
        targetCharacterId: targetId,
        oldCurrent,
        newCurrent,
      });
    }
  }
  return diffs;
}

/**
 * 把新的称呼变化写入 `fromCharacterId` 的 address_chain 字段。
 * - 若 `toCharacterId` 已有 `current`，则把旧值 push 到 history 并替换
 * - 若没有则新建条目
 */
export function recordAddressChange(
  db: Database,
  fromCharacterId: string,
  toCharacterId: string,
  chapterNum: number,
  newAddress: string,
  reason?: string,
): AddressChain {
  const chain = readChainFromDb(db, fromCharacterId);
  const existing = chain.addresses[toCharacterId];
  const historyEntry = { chapter: chapterNum, address: newAddress, reason };
  if (existing) {
    if (existing.current === newAddress) return chain;
    existing.history = [...existing.history, { chapter: chapterNum, address: existing.current }];
    existing.current = newAddress;
  } else {
    chain.addresses[toCharacterId] = {
      current: newAddress,
      history: [{ chapter: chapterNum, address: newAddress, reason }],
    };
  }
  try {
    db.run(
      "UPDATE characters SET address_chain = ? WHERE id = ?",
      [JSON.stringify(chain), fromCharacterId],
    );
  } catch (err) {
    console.error(
      `[novel-weaver] recordAddressChange failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return chain;
}
