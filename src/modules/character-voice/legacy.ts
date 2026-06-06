/**
 * 角色语音模块 — 旧版 API 兼容垫片
 *
 * `character-voice-check.ts` 等旧工具原本基于以下「扁平式」数据结构：
 *  - `VoiceFingerprint`: 包含 avgSentenceLength / emotionalStyle / emotionWordDensity / updatedAt
 *  - `AddressChain`: `Record<speakerId, Record<targetId, string>>`（无 current/history 包装）
 *  - `extractDialogue`, `loadAllCharacterRefs`, `loadVoiceFingerprint`, `loadAddressChain`,
 *    `findAddressDeviations`, `trackAddresses` 这些函数
 *
 * 新版模块（spec'd）使用了不同的结构。为不破坏现有工具，本文件重新实现
 * 旧版 API 并保留与原签名一致的行为；从同一列读取 JSON 并尝试解析为旧版
 * 字段；新格式的数据会被忽略（fallback 到默认值），保证工具在数据迁移期
 * 间仍能运行。
 *
 * 新代码请勿再 import 此文件 — 使用 `./index.js` 中的新 API。
 */

import type { Database } from "../../db/index.js";

// ---------------------------------------------------------------------------
// 类型（与旧版保持一致）
// ---------------------------------------------------------------------------

export interface CharacterRef {
  id: string;
  name: string;
  aliases: string[];
}

export interface VoiceFingerprint {
  catchphrases: string[];
  sentenceStyle: "short" | "medium" | "long" | "mixed";
  avgSentenceLength: number;
  emotionalStyle: "克制" | "细腻" | "激烈" | "平淡";
  emotionWordDensity: { positive: number; negative: number };
  updatedAt: string;
  /** 旧版同时支持 avoidedWords 别名 */
  avoidedWords?: string[];
  avoidWords?: string[];
}

export type AddressChain = Record<string, Record<string, string>>;

export interface DialogueLine {
  characterId: string | null;
  text: string;
  attribution: string;
  index: number;
}

export interface ObservedAddress {
  speakerId: string;
  targetId: string;
  address: string;
  dialogueIndex: number;
}

export interface AddressDeviation {
  speakerId: string;
  speakerName: string;
  targetId: string;
  targetName: string;
  observed: string;
  canonical: string;
  severity: "warning" | "high";
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
}

function queryAll(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown>[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      rows.push(row);
    }
    stmt.free();
    return rows;
  } catch {
    return [];
  }
}

function queryOne(
  db: Database,
  sql: string,
  params: unknown[],
): Record<string, unknown> | null {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      stmt.free();
      return row;
    }
    stmt.free();
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// 旧版 API 实现
// ---------------------------------------------------------------------------

/** 在引号文本中找对白。优先识别「」/『』，其次 ASCII 双引号。 */
function findDialogueSpans(
  text: string,
): Array<{ start: number; end: number; text: string; attribution: string }> {
  const spans: Array<{ start: number; end: number; text: string; attribution: string }> = [];
  const PAIRS: Array<[string, string]> = [
    ["「", "」"],
    ["『", "』"],
    ["\u201c", "\u201d"],
    ['"', '"'],
  ];
  for (const [open, close] of PAIRS) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(open, from);
      if (start === -1) break;
      const end = text.indexOf(close, start + open.length);
      if (end === -1) break;
      const inner = text.slice(start + open.length, end).trim();
      if (inner.length > 0) {
        const before = text.slice(Math.max(0, start - 24), start);
        const after = text.slice(end + close.length, Math.min(text.length, end + close.length + 24));
        spans.push({
          start,
          end: end + close.length,
          text: inner,
          attribution: (before + after).slice(0, 60),
        });
      }
      from = end + close.length;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function matchCharacter(
  attribution: string,
  characters: CharacterRef[],
): CharacterRef | null {
  const sorted = [...characters].sort(
    (a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name, "zh-CN"),
  );
  for (const ch of sorted) {
    for (const candidate of [ch.name, ...ch.aliases]) {
      if (candidate && candidate.length >= 2 && attribution.includes(candidate)) {
        return ch;
      }
    }
  }
  return null;
}

export function extractDialogue(
  content: string,
  characters: CharacterRef[],
): DialogueLine[] {
  const spans = findDialogueSpans(content);
  return spans.map((span) => {
    const before = content.slice(Math.max(0, span.start - 24), span.start);
    const after = content.slice(span.end, Math.min(content.length, span.end + 24));
    const attributionText = before + after;
    const matched = matchCharacter(attributionText, characters);
    return {
      characterId: matched?.id ?? null,
      text: span.text,
      attribution: span.attribution,
      index: span.start,
    };
  });
}

export function loadAllCharacterRefs(db: Database): CharacterRef[] {
  const rows = queryAll(db, "SELECT id, name, aliases FROM characters", []);
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    aliases: parseAliases(row.aliases),
  }));
}

function emptyFingerprint(): VoiceFingerprint {
  return {
    catchphrases: [],
    sentenceStyle: "medium",
    avgSentenceLength: 0,
    emotionalStyle: "平淡",
    emotionWordDensity: { positive: 0, negative: 0 },
    updatedAt: new Date().toISOString(),
  };
}

export function loadVoiceFingerprint(
  db: Database,
  characterId: string,
): VoiceFingerprint | null {
  const row = queryOne(
    db,
    "SELECT voice_fingerprint FROM characters WHERE id = ?",
    [characterId],
  );
  if (!row) return null;
  const raw = row.voice_fingerprint as string | null;
  if (!raw || raw === "{}") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases : [],
      sentenceStyle:
        parsed.sentenceStyle === "short" ||
        parsed.sentenceStyle === "medium" ||
        parsed.sentenceStyle === "long" ||
        parsed.sentenceStyle === "mixed"
          ? parsed.sentenceStyle
          : "medium",
      avgSentenceLength:
        typeof parsed.avgSentenceLength === "number" ? parsed.avgSentenceLength : 0,
      emotionalStyle:
        parsed.emotionalStyle === "克制" ||
        parsed.emotionalStyle === "细腻" ||
        parsed.emotionalStyle === "激烈" ||
        parsed.emotionalStyle === "平淡"
          ? parsed.emotionalStyle
          : "平淡",
      emotionWordDensity: {
        positive: parsed.emotionWordDensity?.positive ?? 0,
        negative: parsed.emotionWordDensity?.negative ?? 0,
      },
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      avoidedWords: Array.isArray(parsed.avoidedWords) ? parsed.avoidedWords : undefined,
      avoidWords: Array.isArray(parsed.avoidWords) ? parsed.avoidWords : undefined,
    };
  } catch {
    return null;
  }
}

export function loadAddressChain(
  db: Database,
  characterId: string,
): AddressChain {
  const row = queryOne(
    db,
    "SELECT address_chain FROM characters WHERE id = ?",
    [characterId],
  );
  if (!row) return {};
  const raw = row.address_chain as string | null;
  if (!raw || raw === "{}") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as AddressChain;
    }
  } catch {
    // ignore
  }
  return {};
}

export function trackAddresses(
  lines: DialogueLine[],
  characters: CharacterRef[],
): ObservedAddress[] {
  const observed: ObservedAddress[] = [];
  for (const line of lines) {
    if (!line.characterId) continue;
    for (const ch of characters) {
      if (ch.id === line.characterId) continue;
      const candidates = [ch.name, ...ch.aliases].filter((n) => n && n.length >= 2);
      for (const name of candidates) {
        if (line.text.includes(name)) {
          observed.push({
            speakerId: line.characterId,
            targetId: ch.id,
            address: name,
            dialogueIndex: line.index,
          });
          break;
        }
      }
    }
  }
  return observed;
}

export function findAddressDeviations(
  chain: AddressChain,
  observed: ObservedAddress[],
  characters: CharacterRef[],
): AddressDeviation[] {
  const charMap = new Map(characters.map((c) => [c.id, c]));
  const deviations: AddressDeviation[] = [];
  for (const obs of observed) {
    const canonical = chain[obs.speakerId]?.[obs.targetId];
    if (!canonical) continue;
    if (canonical === obs.address) continue;
    const severity: "warning" | "high" =
      !canonical.includes(obs.address) && !obs.address.includes(canonical)
        ? "high"
        : "warning";
    deviations.push({
      speakerId: obs.speakerId,
      speakerName: charMap.get(obs.speakerId)?.name ?? obs.speakerId,
      targetId: obs.targetId,
      targetName: charMap.get(obs.targetId)?.name ?? obs.targetId,
      observed: obs.address,
      canonical,
      severity,
    });
  }
  return deviations;
}

// 重新导出 escapeRegex 以保留旧版模块的导出 API
export { escapeRegex };
