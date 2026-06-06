/**
 * GenrePackRegistry — 题材包注册表
 *
 * 支持三种匹配策略：
 * 1. 精确匹配 — 输入等于 pack.id
 * 2. 子类型匹配 — 输入在 pack.subGenres 中
 * 3. 模糊匹配 — 输入包含 pack.name 或 pack.subGenres 中的某个值
 *
 * @packageDocumentation
 */

import type { GenrePack, ArcType, ArcTemplate } from './types.js';

export class GenrePackRegistry {
  private packs = new Map<string, GenrePack>();
  private arcTemplates = new Map<string, ArcTemplate[]>();

  /** 注册一个题材包 */
  register(pack: GenrePack): void {
    this.packs.set(pack.id, pack);
  }

  /** 注册题材包的篇章模板 */
  registerArcTemplates(genreId: string, templates: ArcTemplate[]): void {
    const pack = this.packs.get(genreId);
    if (!pack) return;

    for (const tmpl of templates) {
      const key = `${genreId}:${tmpl.arcType}`;
      const existing = this.arcTemplates.get(key) ?? [];
      existing.push(tmpl);
      this.arcTemplates.set(key, existing);
    }
  }

  /** 解析题材：精确匹配 → 子类型匹配 → 模糊匹配 → _default */
  resolve(input: string): GenrePack {
    const normalized = input.toLowerCase().trim();

    // 1. 精确匹配
    const exact = this.packs.get(normalized);
    if (exact) return exact;

    // 2. 子类型匹配（case-insensitive）
    for (const pack of this.packs.values()) {
      if (pack.subGenres.some(sg => sg.toLowerCase() === normalized)) {
        return pack;
      }
    }

    // 3. 模糊匹配：输入包含 pack.name/subGenre 或被其包含
    for (const pack of this.packs.values()) {
      const candidates = [pack.name, ...pack.subGenres];
      if (candidates.some(c => normalized.includes(c.toLowerCase()) || c.toLowerCase().includes(normalized))) {
        return pack;
      }
    }

    // 4. 回退到 _default
    const fallback = this.packs.get('_default');
    if (fallback) return fallback;

    throw new Error(`未找到题材包 "${input}"，且无 _default 题材包可用`);
  }

  /** 获取指定题材+篇章类型的模板 */
  getArcTemplate(genreId: string, arcType: ArcType): ArcTemplate | undefined {
    const key = `${genreId}:${arcType}`;
    const templates = this.arcTemplates.get(key);
    if (!templates || templates.length === 0) return undefined;
    return templates[0];
  }

  /** 列出所有已注册题材包摘要 */
  listAll(): Array<{ id: string; name: string; subGenres: string[]; supportedArcTypes: ArcType[] }> {
    return Array.from(this.packs.values()).map(pack => ({
      id: pack.id,
      name: pack.name,
      subGenres: pack.subGenres,
      supportedArcTypes: pack.supportedArcTypes,
    }));
  }

  /** 按ID获取题材包 */
  get(id: string): GenrePack | undefined {
    return this.packs.get(id);
  }
}
