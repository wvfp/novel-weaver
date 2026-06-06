/**
 * Genre Pack 文件系统加载器
 *
 * 从指定目录加载所有题材包。每个题材包目录结构：
 *   {genre-id}/
 *     pack.json        — GenrePack 配置
 *     arc-templates/   — 篇章模板 JSON 文件
 *     prompts/         — 提示词片段（可选）
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenrePack, ArcTemplate } from './types.js';
import { GenrePackRegistry } from './registry.js';

/** 从 baseDir 加载所有题材包并注册到 registry */
export function loadGenrePacks(baseDir: string, registry: GenrePackRegistry): void {
  if (!fs.existsSync(baseDir)) return;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = path.join(baseDir, entry.name);
    const packPath = path.join(dirPath, 'pack.json');

    // 跳过无 pack.json 的目录（_ 前缀目录若含 pack.json 仍加载，如 _default）
    if (!fs.existsSync(packPath)) continue;

    const pack = readJsonFile<GenrePack>(packPath);
    if (!pack || !pack.id) {
      console.warn(`[genre-packs] 跳过无效题材包: ${dirPath}（缺少 id 字段）`);
      continue;
    }

    registry.register(pack);

    // 加载 arc-templates/ 下的篇章模板
    const arcDir = path.join(dirPath, 'arc-templates');
    if (fs.existsSync(arcDir)) {
      const arcFiles = fs.readdirSync(arcDir).filter(f => f.endsWith('.json'));
      const templates: ArcTemplate[] = [];

      for (const file of arcFiles) {
        const tmpl = readJsonFile<ArcTemplate>(path.join(arcDir, file));
        if (tmpl && tmpl.id && tmpl.arcType) {
          templates.push(tmpl);
        } else {
          console.warn(`[genre-packs] 跳过无效篇章模板: ${path.join(arcDir, file)}`);
        }
      }

      if (templates.length > 0) {
        registry.registerArcTemplates(pack.id, templates);
      }
    }
  }
}

/** 读取并解析 JSON 文件，解析失败返回 null */
function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    console.warn(`[genre-packs] 无法解析 JSON: ${filePath}`);
    return null;
  }
}
