/**
 * Obsidian [[wikilink]] parsing, resolution, and generation.
 *
 * Supports:
 *   [[target]]          — simple link
 *   [[target|alias]]    — link with display alias
 *   [[path/target]]     — multi-level / folder path
 *   [[中文目标]]         — Chinese/Unicode characters
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface Wikilink {
  target: string
  alias?: string
}

// ─── Patterns ─────────────────────────────────────────────────────────────

/**
 * Regex to match Obsidian wikilinks.
 *
 * - `\[\[` — literal opening
 * - `([^\]|]+?)` — target (non-empty, no ] or |)
 * - `(?:\|([^\]]+?))?` — optional alias after |
 * - `\]\]` — literal closing
 *
 * Uses `+?` (lazy) to avoid over-matching on malformed content.
 * Supports any Unicode character including CJK, spaces, slashes.
 */
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

/**
 * Match a single wikilink (no `g` flag) for validation.
 */
const WIKILINK_SINGLE_RE = /^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]$/

// ─── Parse ────────────────────────────────────────────────────────────────

/**
 * Extract all wikilinks from Markdown content.
 *
 * @example
 * parseWikilinks('Hello [[张三]] and [[地点|别名]]')
 * // → [{ target: '张三' }, { target: '地点', alias: '别名' }]
 */
export function parseWikilinks(content: string): Wikilink[] {
  const results: Wikilink[] = []
  let match: RegExpExecArray | null

  // Reset regex state
  WIKILINK_RE.lastIndex = 0

  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const target = match[1].trim()
    if (!target) continue

    const alias = match[2]?.trim() || undefined

    results.push({ target, alias })
  }

  return results
}

// ─── Resolve ──────────────────────────────────────────────────────────────

/**
 * Naming convention prefixes used to build canonical file names.
 */
export const FILE_PREFIXES = {
  character: 'char',
  arc: 'arc',
  chapter: 'ch',
  setting: 'setting',
} as const

/**
 * Resolve a wikilink target to a file path using the provided file map.
 *
 * The `fileMap` maps display names (or partial names) to file paths.
 * Resolution order:
 * 1. Exact match in fileMap
 * 2. Lookup by naming convention (char-{name}, arc-{name}, etc.)
 * 3. Case-insensitive fallback
 *
 * @param target - The wikilink target (e.g. "张三", "新手村")
 * @param fileMap - Record mapping names → file paths
 * @returns The resolved file path, or null if not found
 *
 * @example
 * resolveWikilink('张三', { '张三': 'char-张三.md' })
 * // → 'char-张三.md'
 */
export function resolveWikilink(
  target: string,
  fileMap: Record<string, string>,
): string | null {
  // 1. Exact match
  if (fileMap[target]) return fileMap[target]

  // 2. Check by naming convention
  for (const [key, value] of Object.entries(fileMap)) {
    if (key === target) return value
  }

  // 3. Strip extension and compare base name
  const normalizedTarget = target.replace(/\.md$/i, '')
  for (const [key, value] of Object.entries(fileMap)) {
    const normalizedKey = key.replace(/\.md$/i, '')
    if (normalizedKey === normalizedTarget) return value
    // Check if value ends with the target
    const valueBase = value.replace(/\.md$/i, '').replace(/^.*[/\\]/, '')
    if (valueBase === normalizedTarget || valueBase === target) return value
  }

  // 4. Case-insensitive fallback
  const targetLower = target.toLowerCase()
  for (const [key, value] of Object.entries(fileMap)) {
    if (key.toLowerCase() === targetLower) return value
    const valueBase = value.replace(/\.md$/i, '').replace(/^.*[/\\]/, '').toLowerCase()
    if (valueBase === targetLower) return value
  }

  return null
}

// ─── Naming helpers ───────────────────────────────────────────────────────

/**
 * Build a canonical filename for a character.
 *
 * @example buildCharacterFilename('张三') → 'char-张三.md'
 */
export function buildCharacterFilename(name: string): string {
  return `char-${name}.md`
}

/**
 * Build a canonical filename for an arc (篇章).
 *
 * @example buildArcFilename('新手村') → 'arc-新手村.md'
 */
export function buildArcFilename(name: string): string {
  return `arc-${name}.md`
}

/**
 * Build a canonical filename for a chapter.
 *
 * @example buildChapterFilename(1, '开端') → 'ch01-开端.md'
 */
export function buildChapterFilename(num: number, title: string): string {
  const padded = String(num).padStart(2, '0')
  return `ch${padded}-${title}.md`
}

/**
 * Build a canonical filename for a setting document.
 *
 * @example buildSettingFilename('世界观') → 'setting-世界观.md'
 */
export function buildSettingFilename(name: string): string {
  return `setting-${name}.md`
}

// ─── Generate ─────────────────────────────────────────────────────────────

/**
 * Generate a wikilink string.
 *
 * @example
 * generateWikilink('张三')          // → '[[张三]]'
 * generateWikilink('地点', '别名')  // → '[[地点|别名]]'
 */
export function generateWikilink(target: string, alias?: string): string {
  if (alias && alias !== target) {
    return `[[${target}|${alias}]]`
  }
  return `[[${target}]]`
}
