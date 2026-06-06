import * as fs from "node:fs";
import type { StyleImprint } from "./imprint-schema.js";

const SENTENCE_END = /[。！？…]+/;
const CHAPTER_SPLIT = /(?:^|\n)(第[零一二三四五六七八九十百千\d]+章|Chapter\s+\d+)/;
const DIALOGUE_CN = /[「\u201c]([^」\u201d]*)[」\u201d]/g;

export async function analyzeNovel(filePath: string): Promise<Partial<StyleImprint>> {
  const stat = fs.statSync(filePath);
  if (stat.size > 100 * 1024 * 1024) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum supported size is 100MB.`);
  }
  const text = fs.readFileSync(filePath, "utf-8");
  const charCount = text.length;

  const chapters = splitChapters(text);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);

  const sentenceLengths = sentences.map(s => s.length);
  const paragraphLengths = paragraphs.map(p => p.length);

  const sentenceLengthDist = computeDistribution(sentenceLengths, [10, 20, 30, 50]);
  const paragraphCharDist = computeDistribution(paragraphLengths, [50, 100, 200, 500]);

  const avgSentenceLength = average(sentenceLengths);
  const avgParagraphLength = average(paragraphLengths);

  const dialogueChars = countDialogueChars(text);
  const dialogueRatio = charCount > 0 ? dialogueChars / charCount : 0;

  const bigramFreq = computeBigrams(text);
  const topBigrams = topN(bigramFreq, 50);

  const wordFreq = computeWordFreq(text);
  const topWords = topN(wordFreq, 100);

  const punctuationFreq = computePunctuationFreq(text);

  const chapterStartPatterns = chapters.slice(0, 10).map(ch => detectPattern(ch.slice(0, 200)));
  const chapterEndPatterns = chapters.slice(0, 10).map(ch => detectPattern(ch.slice(-200)));

  const representativePassages = extractRepresentativePassages(paragraphs);

  return {
    charCount,
    analyzedAt: new Date().toISOString(),
    styleProfile: {
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      avgParagraphLength: Math.round(avgParagraphLength * 10) / 10,
      dialogueRatio: Math.round(dialogueRatio * 1000) / 1000,
      topBigrams,
      topWords,
      chapterStartPatterns: [...new Set(chapterStartPatterns)],
      chapterEndPatterns: [...new Set(chapterEndPatterns)],
      sentenceLengthDist,
      paragraphCharDist,
      punctuationFreq,
    },
    representativePassages,
    aiStyleSummary: "",
    active: false,
  };
}

function splitChapters(text: string): string[] {
  const parts = text.split(CHAPTER_SPLIT);
  return parts.filter(p => p.trim().length > 100);
}

function splitSentences(text: string): string[] {
  return text.split(SENTENCE_END).map(s => s.trim()).filter(s => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
}

function computeDistribution(values: number[], bins: number[]): number[] {
  const result = new Array(bins.length + 1).fill(0);
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (v < bins[i]) { result[i]++; placed = true; break; }
    }
    if (!placed) result[bins.length]++;
  }
  return result;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function countDialogueChars(text: string): number {
  let total = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(DIALOGUE_CN.source, "g");
  while ((match = re.exec(text)) !== null) {
    total += match[1].length;
  }
  return total;
}

function computeBigrams(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const clean = text.replace(/\s+/g, "").replace(/[a-zA-Z0-9]/g, "");
  for (let i = 0; i < clean.length - 1; i++) {
    const bigram = clean.slice(i, i + 2);
    if (/^[\u4e00-\u9fff]{2}$/.test(bigram)) {
      freq.set(bigram, (freq.get(bigram) || 0) + 1);
    }
  }
  return freq;
}

function computeWordFreq(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }
  }
  return freq;
}

function topN(freq: Map<string, number>, n: number): [string, number][] {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function computePunctuationFreq(text: string): Record<string, number> {
  const freq: Record<string, number> = {};
  const puncts = /[，。！？、：；""''「」——……《》（）]/g;
  let match: RegExpExecArray | null;
  while ((match = puncts.exec(text)) !== null) {
    freq[match[0]] = (freq[match[0]] || 0) + 1;
  }
  return freq;
}

function detectPattern(text: string): string {
  const trimmed = text.trim();
  if (/^[「\u201c]/.test(trimmed)) return "对话开头";
  if (/^[\u4e00-\u9fff].*[。！？]/.test(trimmed)) return "叙述开头";
  return "描写开头";
}

function extractRepresentativePassages(paragraphs: string[]): { label: string; text: string; tags: string[] }[] {
  const passages: { label: string; text: string; tags: string[] }[] = [];

  const dialogueHeavy = paragraphs.filter(p => {
    const ratio = (p.match(DIALOGUE_CN) || []).join("").length / p.length;
    return ratio > 0.4 && p.length >= 100 && p.length <= 500;
  });

  const actionLike = paragraphs.filter(p =>
    p.length >= 100 && p.length <= 500 && /[剑刀拳脚斩劈刺砍冲飞跑跃].{0,5}[了过着到]/.test(p)
  );

  const descriptive = paragraphs.filter(p =>
    p.length >= 150 && p.length <= 500 && /[天地山水风云日月星光暗明亮灭]/.test(p)
  );

  if (dialogueHeavy.length > 0) {
    passages.push({
      label: "对话密集段",
      text: dialogueHeavy[Math.floor(dialogueHeavy.length / 2)].slice(0, 400),
      tags: ["对话", "互动"],
    });
  }
  if (actionLike.length > 0) {
    passages.push({
      label: "动作描写段",
      text: actionLike[Math.floor(actionLike.length / 2)].slice(0, 400),
      tags: ["动作", "战斗"],
    });
  }
  if (descriptive.length > 0) {
    passages.push({
      label: "环境描写段",
      text: descriptive[Math.floor(descriptive.length / 2)].slice(0, 400),
      tags: ["描写", "环境"],
    });
  }

  return passages.slice(0, 5);
}
