/**
 * Genre Pack 模块入口
 *
 * 导出所有类型、注册表和加载器，并提供全局单例注册表。
 *
 * @packageDocumentation
 */

export * from './types.js';
export * from './registry.js';
export * from './loader.js';

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenrePackRegistry } from './registry.js';
import { loadGenrePacks } from './loader.js';

/** 全局题材包注册表单例 */
let _registry: GenrePackRegistry | null = null;

/**
 * Get the directory containing genre packs.
 * In bundled ESM output, __dirname is not available — fall back to import.meta.url.
 */
function getGenrePacksDir(): string {
  // Prefer import.meta.url (ESM modules), fall back to __dirname (CJS or node -e).
  // In node -e context, __dirname is '.' so we must prefer import.meta.url.
  // The genre-pack data directories (xianxia/, urban/, infinite-flow/, _default/)
  // are siblings of this file, not in a 'genre-packs' subdirectory.
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
}

/** 获取全局题材包注册表（懒加载） */
export function getRegistry(): GenrePackRegistry {
  if (!_registry) {
    _registry = new GenrePackRegistry();
    loadGenrePacks(getGenrePacksDir(), _registry);
  }
  return _registry;
}

/** 重置全局注册表（主要用于测试） */
export function resetRegistry(): void {
  _registry = null;
}
