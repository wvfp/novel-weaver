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
import { GenrePackRegistry } from './registry.js';
import { loadGenrePacks } from './loader.js';

/** 全局题材包注册表单例 */
let _registry: GenrePackRegistry | null = null;

/** 获取全局题材包注册表（懒加载） */
export function getRegistry(): GenrePackRegistry {
  if (!_registry) {
    _registry = new GenrePackRegistry();
    // __dirname 在 ESM bundler 模式下指向当前文件所在目录
    loadGenrePacks(__dirname, _registry);
  }
  return _registry;
}

/** 重置全局注册表（主要用于测试） */
export function resetRegistry(): void {
  _registry = null;
}
