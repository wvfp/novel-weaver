/**
 * 角色语音指纹提取器
 *
 * 从章节正文中提取对白并构建角色语言指纹
 * （口头禅、句式、情感风格等），用于后续在新章节中
 * 检测角色语言一致性。
 *
 * 设计目标：
 *  - 纯启发式（正则 + 频率统计），不调用 LLM，毫秒级返回
 *  - 依赖 `characters` 表中已存在的角色 id/name/aliases 做归属
 *  - 写入 `characters.voice_fingerprint` 字段为 JSON 字符串
 */

import type { Database } from "../../db/index.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 角色语言指纹（与 characters.voice_fingerprint 列对应） */
export interface VoiceFingerprint {
  /** 口头禅列表：角色常用的口头语 */
  catchphrases: string[];
  /** 句式偏好：短句 / 长句 / 混合 */
  sentenceStyle: "short" | "long" | "mixed";
  /** 避讳词列表：角色不使用的词 */
  avoidWords: string[];
  /** 情感表达方式 */
  emotionStyle: "含蓄" | "直接" | "幽默" | "冷峻";
  /** 自动提取的元数据 */
  metadata?: {
    extractedAt: string;
    sampleChapterIds: string[];
    totalDialogLines: number;
  };
}

/** 单个角色的提取结果 */
export interface ExtractionResult {
  characterId: string;
  fingerprint: VoiceFingerprint;
  evidence: Array<{
    type: "catchphrase" | "sentence" | "emotion";
    text: string;
    context: string;
  }>;
}

/** 章节内已归属的对白 */
interface AttributedDialogue {
  characterId: string;
  text: string;
  context: string;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/**
 * 归属用引号集合（中英文 + 弯引号）。
 * 与 `findQuotes` 配对时优先使用「」这类封闭式引号。
 */
const QUOTE_PAIRS: Array<[string, string]> = [
  ["「", "」"],
  ["『", "』"],
  ["\u201c", "\u201d"],
  ['"', '"'],
];

/** 中文句末标点（用于分句统计） */
const SENTENCE_DELIMITERS = /[。！？!?]/;

/** 匹配 `角色名：「台词」` 形式的兜底正则（用于非主路径的快速归属） */
const ATTRIBUTION_LINE_RE = /^([^「」\n]{1,20})[：:]\s*「([^」]+)」/gm;

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 从 JSON 字符串中安全解析 alias 数组 */
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

/** 转义正则元字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 计算中文字符串的字数（不计空白与 ASCII 标点） */
function countChars(text: string): number {
  const stripped = text.replace(/[\s.,!?;:'"`()\[\]{}]/g, "");
  return [...stripped].length;
}

/** 提取章节中所有引号对白 */
function findQuotedDialogue(
  text: string,
): Array<{ text: string; context: string; index: number }> {
  const results: Array<{ text: string; context: string; index: number }> = [];
  for (const [open, close] of QUOTE_PAIRS) {
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
        results.push({
          text: inner,
          context: (before + after).slice(0, 60),
          index: start,
        });
      }
      from = end + close.length;
    }
  }
  return results.sort((a, b) => a.index - b.index);
}

/**
 * 用 `角色名：「台词」` 行首格式快速归属。
 * 找不到归属时再回退到「上下文窗口 + 已知角色名」。
 */
function attributeDialogue(
  dialogue: Array<{ text: string; context: string; index: number }>,
  characters: Array<{ id: string; name: string; aliases: string[] }>,
  fullText: string,
): AttributedDialogue[] {
  if (characters.length === 0) return [];

  // 构造「名字 / 别名 → characterId」映射，按长度倒序便于优先匹配长名
  const nameIndex = new Map<string, string>();
  const sortedChars = [...characters].sort(
    (a, b) =>
      Math.max(b.name.length, ...b.aliases.map((x) => x.length)) -
      Math.max(a.name.length, ...a.aliases.map((x) => x.length)),
  );
  for (const ch of sortedChars) {
    for (const candidate of [ch.name, ...ch.aliases]) {
      if (candidate && !nameIndex.has(candidate)) {
        nameIndex.set(candidate, ch.id);
      }
    }
  }

  const attributed: AttributedDialogue[] = [];

  for (const d of dialogue) {
    // 1) 先试 `名：「台词」` 行首格式：用该行在前 20 字符里找
    //    收集的是全局归属，但每个 dialogue 都有自己的 index，用上下文窗口
    const startInText = Math.max(0, d.index - 24);
    const window = fullText.slice(startInText, d.index + 20);
    let matched: string | null = null;
    for (const [name, id] of nameIndex) {
      if (window.includes(name)) {
        matched = id;
        break;
      }
    }
    if (matched) {
      attributed.push({ characterId: matched, text: d.text, context: d.context });
      continue;
    }
    // 2) 兜底：行首正则（多行场景）
    ATTRIBUTION_LINE_RE.lastIndex = 0;
    let lineMatch: RegExpExecArray | null;
    const lineStart = fullText.lastIndexOf("\n", d.index) + 1;
    const lineEnd = fullText.indexOf("\n", d.index);
    const line = fullText.slice(lineStart, lineEnd === -1 ? fullText.length : lineEnd);
    ATTRIBUTION_LINE_RE.lastIndex = 0;
    while ((lineMatch = ATTRIBUTION_LINE_RE.exec(line)) !== null) {
      const candidateName = lineMatch[1].trim();
      if (nameIndex.has(candidateName)) {
        attributed.push({
          characterId: nameIndex.get(candidateName) as string,
          text: d.text,
          context: d.context,
        });
        break;
      }
    }
  }

  return attributed;
}

/** 按 `。！？` 切分对白为句子，并返回每句字符数 */
function splitSentences(text: string): number[] {
  const parts = text.split(SENTENCE_DELIMITERS).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.map(countChars);
}

/** 统计候选 N-gram（2..4 字）在对白中的出现次数 */
function findCatchphraseHits(lines: AttributedDialogue[]): Map<string, number> {
  const hits = new Map<string, number>();
  for (const line of lines) {
    const chars = [...line.text.replace(/\s+/g, "")];
    if (chars.length < 2) continue;
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= chars.length; i++) {
        const gram = chars.slice(i, i + n).join("");
        // 过滤：必须至少含一个中文字（第一层过滤；同时保证不会全是数字/标点）
        if (!/[\u4e00-\u9fff]/.test(gram)) continue;
        hits.set(gram, (hits.get(gram) ?? 0) + 1);
      }
    }
  }
  return hits;
}

/** 推断句式偏好：平均句长 + 离散度 */
function inferSentenceStyle(sentenceLengths: number[]): VoiceFingerprint["sentenceStyle"] {
  if (sentenceLengths.length === 0) return "mixed";
  const avg = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const variance =
    sentenceLengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / sentenceLengths.length;
  const stddev = Math.sqrt(variance);
  // 离散度大 → mixed
  if (stddev > 8) return "mixed";
  if (avg < 8) return "short";
  if (avg > 20) return "long";
  // 平均在 8-20 之间但离散度小，仍按 mixed 处理以避免错判
  return "mixed";
}

/** 推断情感风格：基于感叹号密度 + 问号密度 + 平均句长 */
function inferEmotionStyle(
  text: string,
  sentenceLengths: number[],
): VoiceFingerprint["emotionStyle"] {
  if (sentenceLengths.length === 0) return "含蓄";
  const exclaims = (text.match(/[!！]/g) ?? []).length;
  const questions = (text.match(/[?？]/g) ?? []).length;
  const density = (exclaims + questions) / Math.max(1, sentenceLengths.length);
  const avg = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;

  // 冷峻：低密度 + 短句
  if (density < 0.1 && avg < 12) return "冷峻";
  // 幽默：问号密度高
  if (questions / Math.max(1, exclaims + questions) > 0.6) return "幽默";
  // 直接：高感叹号密度
  if (density > 0.5) return "直接";
  // 含蓄：默认
  return "含蓄";
}

/** 把已有 fingerprint 字符串解析为对象；解析失败返回空 fingerprint */
function parseFingerprint(raw: string | null | undefined): VoiceFingerprint {
  const empty: VoiceFingerprint = {
    catchphrases: [],
    sentenceStyle: "mixed",
    avoidWords: [],
    emotionStyle: "含蓄",
  };
  if (!raw || raw === "{}") return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceFingerprint>;
    return {
      catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases : [],
      sentenceStyle:
        parsed.sentenceStyle === "short" || parsed.sentenceStyle === "long" || parsed.sentenceStyle === "mixed"
          ? parsed.sentenceStyle
          : "mixed",
      avoidWords: Array.isArray(parsed.avoidWords) ? parsed.avoidWords : [],
      emotionStyle:
        parsed.emotionStyle === "含蓄" ||
        parsed.emotionStyle === "直接" ||
        parsed.emotionStyle === "幽默" ||
        parsed.emotionStyle === "冷峻"
          ? parsed.emotionStyle
          : "含蓄",
      metadata: parsed.metadata,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 加载章节内已知角色元数据。
 */
function loadCharactersByIds(db: Database, ids: string[]): Array<{
  id: string;
  name: string;
  aliases: string[];
}> {
  if (ids.length === 0) return [];
  try {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT id, name, aliases FROM characters WHERE id IN (${placeholders})`,
    );
    stmt.bind(ids);
    const out: Array<{ id: string; name: string; aliases: string[] }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      out.push({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        aliases: parseAliases(row.aliases),
      });
    }
    stmt.free();
    return out;
  } catch {
    return [];
  }
}

/**
 * 从单章正文中提取所有指定角色的声音指纹。
 *
 * 处理流程：
 *  1) 解析章节中所有引号对白
 *  2) 按「行首 角色名：「台词」」或上下文窗口做角色归属
 *  3) 对每个角色做句长 / 口头禅 / 情感风格统计
 *  4) 与数据库中已有 fingerprint 合并（catchphrases 取并集去重、metadata 累加）
 *
 * 启发式（毫秒级，无 LLM 调用）：
 *  - 口头禅：2-4 字 N-gram，出现 ≥ 3 次入选
 *  - 句式：按平均句长 + 标准差
 *  - 情感风格：按感叹号 / 问号密度 + 平均句长
 *  - 避讳词：保持空（用户自行填写）
 */
export function extractVoiceFromChapter(
  chapterContent: string,
  chapterId: string,
  characterIds: string[],
  db: Database,
): ExtractionResult[] {
  if (characterIds.length === 0 || !chapterContent.trim()) return [];

  const characters = loadCharactersByIds(db, characterIds);
  if (characters.length === 0) return [];

  const dialogue = findQuotedDialogue(chapterContent);
  const attributed = attributeDialogue(dialogue, characters, chapterContent);

  const byCharacter = new Map<string, AttributedDialogue[]>();
  for (const id of characterIds) byCharacter.set(id, []);
  for (const d of attributed) {
    if (!byCharacter.has(d.characterId)) continue;
    byCharacter.get(d.characterId)!.push(d);
  }

  return characterIds.map((id) => {
    const lines = byCharacter.get(id) ?? [];
    const allText = lines.map((l) => l.text).join("");
    const sentenceLengths = lines.flatMap((l) => splitSentences(l.text));
    const catchphraseHits = findCatchphraseHits(lines);

    // 读旧 fingerprint，做合并
    const oldFingerprint = readFingerprintFromDb(db, id);
    const existingCatchphrases = new Set(oldFingerprint.catchphrases);

    const newCatchphrases: string[] = [];
    const evidence: ExtractionResult["evidence"] = [];
    for (const [phrase, count] of catchphraseHits) {
      if (count >= 3 && phrase.length >= 2 && phrase.length <= 4) {
        if (!existingCatchphrases.has(phrase)) newCatchphrases.push(phrase);
        const sample = lines.find((l) => l.text.includes(phrase));
        if (sample) {
          evidence.push({ type: "catchphrase", text: phrase, context: sample.context });
        }
      }
    }

    // 句式 / 情感：用本次对白推断
    const sentenceStyle = inferSentenceStyle(sentenceLengths);
    const emotionStyle = inferEmotionStyle(allText, sentenceLengths);

    // 句长 evidence：列出 3 条代表句
    const sampleSentences = lines.slice(0, 3);
    for (const s of sampleSentences) {
      evidence.push({ type: "sentence", text: s.text.slice(0, 40), context: s.context });
    }
    // 情感 evidence：用感叹 / 问号密度
    if (lines.length > 0) {
      evidence.push({
        type: "emotion",
        text: `${emotionStyle} (${lines.length} 句对白)`,
        context: chapterId,
      });
    }

    const merged: VoiceFingerprint = {
      catchphrases: [...oldFingerprint.catchphrases, ...newCatchphrases].slice(0, 20),
      sentenceStyle,
      avoidWords: oldFingerprint.avoidWords,
      emotionStyle,
      metadata: {
        extractedAt: new Date().toISOString(),
        sampleChapterIds: [
          ...new Set([...(oldFingerprint.metadata?.sampleChapterIds ?? []), chapterId]),
        ].slice(-20),
        totalDialogLines:
          (oldFingerprint.metadata?.totalDialogLines ?? 0) + lines.length,
      },
    };

    return { characterId: id, fingerprint: merged, evidence };
  });
}

/** 从 DB 读取单个角色的 fingerprint JSON 字符串 */
function readFingerprintFromDb(db: Database, characterId: string): VoiceFingerprint {
  try {
    const stmt = db.prepare(
      "SELECT voice_fingerprint FROM characters WHERE id = ?",
    );
    stmt.bind([characterId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() ?? {};
      const raw = (row.voice_fingerprint as string | null) ?? null;
      stmt.free();
      return parseFingerprint(raw);
    }
    stmt.free();
  } catch {
    // ignore
  }
  return parseFingerprint(null);
}

/**
 * 解析 address_chain JSON 字符串为 AddressChain 对象；
 * 暴露为内部工具供 address-tracker 共用。
 */
export function parseAddressChainJson(raw: string | null | undefined): {
  addresses: Record<
    string,
    { current: string; history: Array<{ chapter: number; address: string; reason?: string }> }
  >;
} {
  if (!raw || raw === "{}") return { addresses: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.addresses) {
      return parsed as {
        addresses: Record<
          string,
          {
            current: string;
            history: Array<{ chapter: number; address: string; reason?: string }>;
          }
        >;
      };
    }
  } catch {
    // fall through
  }
  return { addresses: {} };
}
