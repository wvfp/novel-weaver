/**
 * Chapter template — generates the structure for a novel chapter file.
 *
 * Simple string-replacement template (no handlebars dependency).
 *
 * Placeholders:
 *   {{title}}        — chapter title
 *   {{chapter_num}}  — chapter number
 *   {{arc_id}}      — associated arc/篇章 ID
 *   {{status}}       — draft / review / published
 *   {{tags}}         — comma-separated tags
 *   {{created}}      — creation date
 *   {{modified}}     — last modified date
 *   {{content}}      — chapter body text
 *   {{wikilinks}}    — example wikilinks section
 */

export const CHAPTER_TEMPLATE = `---
title: {{title}}
type: chapter
chapter_num: {{chapter_num}}
arc_id: {{arc_id}}
status: {{status}}
tags: [{{tags}}]
created: {{created}}
modified: {{modified}}
---

## {{title}}

{{content}}

---

## 相关链接

{{wikilinks}}
`

/**
 * Apply the chapter template with given data.
 */
export function applyChapterTemplate(data: Record<string, string>): string {
  let result = CHAPTER_TEMPLATE
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}
