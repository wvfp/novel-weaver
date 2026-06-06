/**
 * Obsidian Markdown file generation — composes frontmatter + body + wikilinks
 * into complete .md file content strings.
 *
 * This module does NOT write to disk (that is the Tool layer's responsibility).
 */

import { generateFrontmatter, type Frontmatter } from './frontmatter.js'
import { parseWikilinks, generateWikilink, type Wikilink } from './wikilink.js'
import { applyWorldTemplate } from './templates/world.js'

export { generateFrontmatter, parseWikilinks, generateWikilink, applyWorldTemplate }
export type { Frontmatter, Wikilink }

// ─── Types ────────────────────────────────────────────────────────────────

export interface ChapterData {
  title: string
  chapterNum: number
  arcId?: string
  status?: string
  tags?: string[]
  wordCount?: number
  created?: string
  modified?: string
  /** Chapter body content (may contain wikilinks). */
  body: string
  /** Related character names for "相关角色" section. */
  relatedCharacters?: string[]
  /** Related arc names for "相关篇章" section. */
  relatedArcs?: string[]
}

export interface ArcData {
  title: string
  arcType?: string
  difficulty?: string
  status?: string
  tags?: string[]
  created?: string
  modified?: string
  description: string
  rules?: string
  rewards?: string
  relatedCharacterNames?: string[]
  relatedChapterRefs?: string[]
}

export interface CharacterData {
  title: string
  aliases?: string[]
  status?: string
  role?: string
  tags?: string[]
  created?: string
  modified?: string
  worldId?: string
  description: string
  appearance?: string
  personality?: string
  abilities?: string
  background?: string
  relatedCharacterNames?: string[]
  relatedChapterRefs?: string[]
}

// ─── Generate World/Setting File ───────────────────────────────────────────

export interface WorldData {
  title: string
  status?: string
  tags?: string[]
  created?: string
  modified?: string
  description: string
  powerSystem?: string
  factions?: string
  locations?: string
  history?: string
  characters?: string
  arcs?: string
}

/**
 * Generate the full content of a world/setting Markdown file.
 *
 * Uses the world template from templates/world.ts which includes
 * YAML frontmatter + structured body sections (概述/力量体系/势力/地点/历史/角色/副本).
 */
export function generateWorldFile(data: WorldData): string {
  return applyWorldTemplate({
    title: data.title,
    status: data.status ?? 'active',
    tags: data.tags?.join(', ') ?? '',
    created: data.created ?? today(),
    modified: data.modified ?? today(),
    description: data.description,
    power_system: data.powerSystem ?? '',
    factions: data.factions ?? '',
    locations: data.locations ?? '',
    history: data.history ?? '',
    characters: data.characters ?? '',
    arcs: data.arcs ?? '',
  })
}

// ─── Generate Chapter File ────────────────────────────────────────────────

/**
 * Generate the full content of a chapter Markdown file.
 *
 * @example
 * generateChapterFile({
 *   title: '开端',
 *   chapterNum: 1,
 *   body: '[[张三]]走进了[[新手村]]...',
 *   tags: ['无限流', '开局'],
 * })
 */
export function generateChapterFile(data: ChapterData): string {
  const meta: Frontmatter = {
    title: data.title,
    type: 'chapter',
    chapter_num: data.chapterNum,
    arc_id: data.arcId,
    word_count: data.wordCount,
    status: data.status ?? 'draft',
    tags: data.tags,
    created: data.created ?? today(),
    modified: data.modified ?? today(),
  }

  const parts: string[] = [
    generateFrontmatter(meta),
    '',
    `## ${data.title}`,
    '',
    data.body,
    '',
  ]

  // Related links section
  const relatedLinks: string[] = []

  if (data.relatedCharacters?.length) {
    relatedLinks.push('### 相关角色')
    relatedLinks.push('')
    relatedLinks.push(data.relatedCharacters.map((n) => `- ${generateWikilink(n)}`).join('\n'))
    relatedLinks.push('')
  }

  if (data.relatedArcs?.length) {
    relatedLinks.push('### 相关篇章')
    relatedLinks.push('')
    relatedLinks.push(data.relatedArcs.map((n) => `- ${generateWikilink(n)}`).join('\n'))
    relatedLinks.push('')
  }

  if (relatedLinks.length > 0) {
    parts.push('---')
    parts.push('')
    parts.push(...relatedLinks)
  }

  return parts.join('\n')
}

// ─── Generate Arc File ────────────────────────────────────────────────

/**
 * Generate the full content of an arc (篇章) Markdown file.
 */
export function generateArcFile(data: ArcData): string {
  const meta: Frontmatter = {
    title: data.title,
    type: 'arc',
    arc_type: data.arcType,
    difficulty: data.difficulty,
    status: data.status ?? 'draft',
    tags: data.tags,
    created: data.created ?? today(),
    modified: data.modified ?? today(),
  }

  const parts: string[] = [
    generateFrontmatter(meta),
    '',
    `# ${data.title}`,
    '',
    '## 概述',
    '',
    data.description,
    '',
  ]

  if (data.rules) {
    parts.push('## 规则', '', data.rules, '')
  }
  if (data.rewards) {
    parts.push('## 奖励', '', data.rewards, '')
  }
  if (data.relatedCharacterNames?.length) {
    parts.push(
      '## 相关角色',
      '',
      data.relatedCharacterNames.map((n) => `- ${generateWikilink(n)}`).join('\n'),
      '',
    )
  }
  if (data.relatedChapterRefs?.length) {
    parts.push(
      '## 相关章节',
      '',
      data.relatedChapterRefs.map((r) => `- ${generateWikilink(r)}`).join('\n'),
      '',
    )
  }

  return parts.join('\n')
}

// ─── Generate Character File ──────────────────────────────────────────────

/**
 * Generate the full content of a character Markdown file.
 */
export function generateCharacterFile(data: CharacterData): string {
  const meta: Frontmatter = {
    title: data.title,
    type: 'character',
    aliases: data.aliases,
    status: data.status ?? 'unknown',
    role: data.role ?? 'npc',
    tags: data.tags,
    created: data.created ?? today(),
    modified: data.modified ?? today(),
    world_id: data.worldId,
  }

  const parts: string[] = [
    generateFrontmatter(meta),
    '',
    `# ${data.title}`,
    '',
    '## 描述',
    '',
    data.description,
    '',
  ]

  if (data.appearance) {
    parts.push('## 外貌', '', data.appearance, '')
  }
  if (data.personality) {
    parts.push('## 性格', '', data.personality, '')
  }
  if (data.abilities) {
    parts.push('## 能力', '', data.abilities, '')
  }
  if (data.background) {
    parts.push('## 背景', '', data.background, '')
  }
  if (data.relatedCharacterNames?.length) {
    parts.push(
      '## 关系',
      '',
      data.relatedCharacterNames.map((n) => `- ${generateWikilink(n)}`).join('\n'),
      '',
    )
  }
  if (data.relatedChapterRefs?.length) {
    parts.push(
      '## 出场章节',
      '',
      data.relatedChapterRefs.map((r) => `- ${generateWikilink(r)}`).join('\n'),
      '',
    )
  }

  return parts.join('\n')
}

// ─── Extract All Links ────────────────────────────────────────────────────

/**
 * Extract all unique wikilink targets from Markdown content.
 *
 * Unlike `parseWikilinks` which returns duplicates-per-position,
 * this returns a deduplicated array of unique targets.
 *
 * @example
 * extractAllLinks('[[A]] and [[A]] and [[B|c]]')
 * // → [{ target: 'A' }, { target: 'B', alias: 'c' }]
 */
export function extractAllLinks(content: string): Wikilink[] {
  const seen = new Set<string>()
  const links = parseWikilinks(content)
  const unique: Wikilink[] = []

  for (const link of links) {
    const key = link.alias ? `${link.target}|${link.alias}` : link.target
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(link)
    }
  }

  return unique
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Get today's date as YYYY-MM-DD string. */
function today(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
