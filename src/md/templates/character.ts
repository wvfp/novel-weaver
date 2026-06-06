/**
 * Character template — generates the structure for a character file.
 *
 * Placeholders:
 *   {{title}}        — character name
 *   {{aliases}}      — alternative names / nicknames
 *   {{status}}       — alive / deceased / unknown
 *   {{role}}         — protagonist / antagonist / supporting / npc
 *   {{tags}}         — comma-separated tags
 *   {{created}}      — creation date
 *   {{modified}}     — last modified date
 *   {{world_id}}     — home world / setting ID
 *   {{description}}  — character description
 *   {{appearance}}   — physical description
 *   {{personality}}  — personality traits
 *   {{abilities}}    — special abilities
 *   {{background}}   — backstory
 *   {{relationships}} — wikilinks to related characters
 *   {{appearances}}  — chapter wikilinks where character appears
 */

export const CHARACTER_TEMPLATE = `---
title: {{title}}
type: character
aliases: [{{aliases}}]
status: {{status}}
role: {{role}}
tags: [{{tags}}]
created: {{created}}
modified: {{modified}}
world_id: {{world_id}}
---

# {{title}}

## 描述

{{description}}

## 外貌

{{appearance}}

## 性格

{{personality}}

## 能力

{{abilities}}

## 背景

{{background}}

## 关系

{{relationships}}

## 出场章节

{{appearances}}
`

/**
 * Apply the character template with given data.
 */
export function applyCharacterTemplate(data: Record<string, string>): string {
  let result = CHARACTER_TEMPLATE
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}
