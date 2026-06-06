/**
 * Arc (篇章) template — generates the structure for an arc file.
 *
 * Placeholders:
 *   {{title}}        — arc name
 *   {{arc_type}}     — arc type (dungeon, trial, quest, storyline, campaign)
 *   {{difficulty}}   — difficulty rating
 *   {{status}}       — draft / review / published
 *   {{tags}}         — comma-separated tags
 *   {{created}}      — creation date
 *   {{modified}}     — last modified date
 *   {{description}}  — arc overview
 *   {{rules}}        — special rules
 *   {{rewards}}      — completion rewards
 *   {{characters}}   — related character wikilinks
 *   {{chapters}}     — related chapter wikilinks
 */

export const ARC_TEMPLATE = `---
title: {{title}}
type: arc
arc_type: {{arc_type}}
difficulty: {{difficulty}}
status: {{status}}
tags: [{{tags}}]
created: {{created}}
modified: {{modified}}
---

# {{title}}

## 概述

{{description}}

## 规则

{{rules}}

## 奖励

{{rewards}}

## 相关角色

{{characters}}

## 相关章节

{{chapters}}
`

/**
 * Apply the arc template with given data.
 */
export function applyArcTemplate(data: Record<string, string>): string {
  let result = ARC_TEMPLATE
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}
