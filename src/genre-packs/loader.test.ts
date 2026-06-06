import { describe, test, expect, beforeEach } from "bun:test"
import * as path from "node:path"
import * as fs from "node:fs"
import * as os from "node:os"
import { GenrePackRegistry } from "./registry"
import { loadGenrePacks } from "./loader"
import type { GenrePack, ArcTemplate } from "./types"

describe("GenrePackRegistry", () => {
  let registry: GenrePackRegistry

  beforeEach(() => {
    registry = new GenrePackRegistry()
  })

  describe("register and resolve", () => {
    const testPack: GenrePack = {
      id: "test-pack",
      name: "测试题材",
      version: "1.0.0",
      description: "A test pack",
      subGenres: ["测试", "试炼"],
      defaultArcType: "dungeon",
      supportedArcTypes: ["dungeon", "quest"],
      worldTypes: ["primary"],
      characterRoles: [],
      powerSystem: { name: "test", levels: ["1"], breakthroughMethod: "test", coreResource: "test" },
      writingRules: { forbiddenWords: [], recommendedPatterns: [], forbiddenPatterns: [], paragraphStyle: "", dialogueStyle: "" },
      antiAiOverrides: { layers: [], extraForbidden: [], genreSpecificPatterns: [] },
    }

    test("exact match", () => {
      registry.register(testPack)
      const resolved = registry.resolve("test-pack")
      expect(resolved.id).toBe("test-pack")
    })

    test("sub-genre match", () => {
      registry.register(testPack)
      const resolved = registry.resolve("测试")
      expect(resolved.id).toBe("test-pack")
    })

    test("fuzzy match", () => {
      registry.register(testPack)
      const resolved = registry.resolve("测试题材包")
      expect(resolved.id).toBe("test-pack")
    })

    test("no match throws", () => {
      expect(() => registry.resolve("nonexistent")).toThrow()
    })
  })
})

describe("loadGenrePacks", () => {
  const genrePacksDir = path.join(__dirname)

  test("loads all packs from the genre-packs directory", () => {
    const registry = new GenrePackRegistry()
    loadGenrePacks(genrePacksDir, registry)

    const all = registry.listAll()
    const ids = all.map((p) => p.id)

    expect(ids).toContain("infinite-flow")
    expect(ids).toContain("xianxia")
    expect(ids).toContain("urban")
    expect(ids).toContain("_default")
  })

  test("each pack has required fields", () => {
    const registry = new GenrePackRegistry()
    loadGenrePacks(genrePacksDir, registry)

    for (const summary of registry.listAll()) {
      expect(summary.id).toBeTruthy()
      expect(summary.name).toBeTruthy()
      expect(summary.subGenres).toBeDefined()
      expect(summary.supportedArcTypes.length).toBeGreaterThan(0)
    }
  })

  test("arc templates loaded for infinite-flow pack", () => {
    const registry = new GenrePackRegistry()
    loadGenrePacks(genrePacksDir, registry)

    const dungeonTmpl = registry.getArcTemplate("infinite-flow", "dungeon")
    expect(dungeonTmpl).toBeDefined()
    expect(dungeonTmpl!.arcType).toBe("dungeon")
    expect(dungeonTmpl!.id).toBeTruthy()
    expect(dungeonTmpl!.name).toBeTruthy()
    expect(dungeonTmpl!.defaultRules.length).toBeGreaterThan(0)
    expect(dungeonTmpl!.rewardPool.length).toBeGreaterThan(0)
    expect(dungeonTmpl!.npcTemplates.length).toBeGreaterThan(0)
  })

  test("_default pack has storyline arc template", () => {
    const registry = new GenrePackRegistry()
    loadGenrePacks(genrePacksDir, registry)

    const tmpl = registry.getArcTemplate("_default", "storyline")
    expect(tmpl).toBeDefined()
    expect(tmpl!.arcType).toBe("storyline")
  })

  test("non-existent directory — no packs loaded", () => {
    const registry = new GenrePackRegistry()
    loadGenrePacks(path.join(os.tmpdir(), "nonexistent-genre-packs-" + Date.now()), registry)

    expect(registry.listAll()).toHaveLength(0)
  })
})
