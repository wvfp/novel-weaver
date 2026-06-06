/**
 * World (世界观) template — generates the structure for a world/setting file.
 *
 * Placeholders:
 *   {{title}}        — world / setting name
 *   {{status}}       — draft / review / published
 *   {{tags}}         — comma-separated tags
 *   {{created}}      — creation date
 *   {{modified}}     — last modified date
 *   {{description}}  — world overview
 *   {{power_system}} — power / magic system description
 *   {{factions}}     — major factions wikilinks
 *   {{locations}}    — important locations wikilinks
 *   {{history}}      — historical timeline
 *   {{characters}}   — character wikilinks in this world
 *   {{arcs}}         — arc wikilinks in this world
 */

export const WORLD_TEMPLATE = `---
title: {{title}}
type: setting
status: {{status}}
tags: [{{tags}}]
created: {{created}}
modified: {{modified}}
---

# {{title}}

## 概述

{{description}}

## 力量体系

{{power_system}}

## 势力

{{factions}}

## 地点

{{locations}}

## 历史

{{history}}

## 角色

{{characters}}

## 篇章

{{arcs}}
`

/**
 * Apply the world template with given data.
 */
export function applyWorldTemplate(data: Record<string, string>): string {
  let result = WORLD_TEMPLATE
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}
