/**
 * YAML frontmatter generation and parsing for Obsidian-compatible Markdown.
 *
 * No external YAML dependency — pure string handling for a well-defined subset.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface Frontmatter {
  title?: string
  type?: string
  aliases?: string[]
  tags?: string[]
  status?: string
  created?: string
  modified?: string
  world_id?: string
  arc_id?: string
  [key: string]: unknown
}

// ─── Generate ─────────────────────────────────────────────────────────────

/** Format a single YAML value (strings, numbers, booleans, arrays). */
function formatYamlValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return `[${value.map(String).join(', ')}]`
  }
  if (typeof value === 'string') {
    // Quote if value contains special characters
    if (/[:#[\]{},"'&*!|>%@`]/.test(value) || /^\s/.test(value) || /\s$/.test(value)) {
      return `"${value.replace(/"/g, '\\"')}"`
    }
    return value
  }
  return String(value)
}

/**
 * Generate a YAML frontmatter string from a metadata object.
 *
 * @example
 * generateFrontmatter({ title: 'My Chapter', type: 'chapter', tags: ['fantasy'] })
 * // → "---\ntitle: My Chapter\ntype: chapter\ntags: [fantasy]\n---\n"
 */
export function generateFrontmatter(meta: Frontmatter): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined) continue
    const formatted = formatYamlValue(value)
    if (formatted === '') continue
    lines.push(`${key}: ${formatted}`)
  }

  lines.push('---')
  return lines.join('\n') + '\n'
}

// ─── Parse ────────────────────────────────────────────────────────────────

/**
 * Extract the YAML frontmatter block from raw Markdown content.
 * Returns the raw YAML string or null when no frontmatter is found.
 */
export function extractFrontmatterBlock(content: string): string | null {
  // Must start with --- on the very first line
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  return match ? match[1].trim() : null
}

/**
 * Parse a raw YAML key-value line into [key, value].
 * Handles: `key: value`, `key: [a, b]`, `key: "quoted"`.
 */
function parseYamlLine(line: string): [string, unknown] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const sepIndex = trimmed.indexOf(':')
  if (sepIndex === -1) return null

  const key = trimmed.slice(0, sepIndex).trim()
  const rawValue = trimmed.slice(sepIndex + 1).trim()

  if (!key) return null

  // Empty value
  if (rawValue === '' || rawValue === '""' || rawValue === "''") {
    return [key, '']
  }

  // Array: [item1, item2]
  const arrayMatch = rawValue.match(/^\[([\s\S]*)\]$/)
  if (arrayMatch) {
    const items = arrayMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
    return [key, items]
  }

  // Quoted string
  const quotedMatch = rawValue.match(/^"([^"]*)"$/) || rawValue.match(/^'([^']*)'$/)
  if (quotedMatch) {
    return [key, quotedMatch[1]]
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return [key, rawValue.includes('.') ? parseFloat(rawValue) : parseInt(rawValue, 10)]
  }

  // Boolean
  if (rawValue === 'true') return [key, true]
  if (rawValue === 'false') return [key, false]

  // Plain string
  return [key, rawValue]
}

/**
 * Parse YAML frontmatter from a Markdown string.
 *
 * @example
 * parseFrontmatter('---\ntitle: Hi\ntags: [a, b]\n---\n\nContent')
 * // → { title: 'Hi', tags: ['a', 'b'] }
 */
export function parseFrontmatter(content: string): Frontmatter {
  const block = extractFrontmatterBlock(content)
  if (!block) return {}

  const result: Frontmatter = {}
  const lines = block.split('\n')

  for (const line of lines) {
    const parsed = parseYamlLine(line)
    if (parsed) {
      const [key, value] = parsed
      result[key] = value
    }
  }

  return result
}
