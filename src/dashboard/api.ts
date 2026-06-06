import { Router, type Request, type Response } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { getDatabase, generateId } from "../db/index.js";
import { queryAll, queryOne, persistDb } from "../db/helpers.js";
import {
  getModelResolver,
  initModelResolver,
  type ModelResolution,
} from "../services/model-resolver.js";
import { ConfigFileService } from "../services/config-file.js";

interface PaginatedQuery {
  page: number;
  limit: number;
}

function parsePagination(req: Request): PaginatedQuery {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  return { page, limit };
}

function paginate<T>(items: T[], { page, limit }: PaginatedQuery) {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    pages: Math.ceil(items.length / limit),
  };
}

function numField(row: Record<string, unknown> | null, field: string): number {
  return Number((row as any)?.[field]) || 0;
}

export function apiRouter(projectRoot: string): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version: "2.0.0" });
  });

  router.get("/project", (_req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    const project = queryOne("SELECT * FROM projects LIMIT 1");
    if (!project) return res.status(404).json({ error: "No project found" });
    res.json({
      ...project,
      stats: {
        worlds: numField(queryOne("SELECT COUNT(*) as c FROM worlds"), "c"),
        characters: numField(queryOne("SELECT COUNT(*) as c FROM characters"), "c"),
        arcs: numField(queryOne("SELECT COUNT(*) as c FROM arcs"), "c"),
        chapters: numField(queryOne("SELECT COUNT(*) as c FROM chapters"), "c"),
        totalWords: numField(queryOne("SELECT COALESCE(SUM(word_count), 0) as total FROM chapters"), "total"),
      },
    });
  });

  router.get("/worlds", (req: Request, res: Response) => {
    res.json(paginate(queryAll("SELECT * FROM worlds ORDER BY name"), parsePagination(req)));
  });

  router.get("/worlds/:id", (req: Request, res: Response) => {
    const world = queryOne("SELECT * FROM worlds WHERE id = ?", [req.params.id]);
    if (!world) return res.status(404).json({ error: "World not found" });
    res.json({
      ...world,
      characters: queryAll("SELECT * FROM characters WHERE world_id = ?", [req.params.id]),
      arcs: queryAll("SELECT * FROM arcs WHERE world_id = ?", [req.params.id]),
    });
  });

  router.get("/arcs", (req: Request, res: Response) => {
    res.json(paginate(queryAll(
      "SELECT a.*, w.name as world_name FROM arcs a LEFT JOIN worlds w ON a.world_id = w.id ORDER BY a.name"
    ), parsePagination(req)));
  });

  router.get("/arcs/:id", (req: Request, res: Response) => {
    const arc = queryOne("SELECT * FROM arcs WHERE id = ?", [req.params.id]);
    if (!arc) return res.status(404).json({ error: "Arc not found" });
    res.json({
      ...arc,
      chapters: queryAll("SELECT * FROM chapters WHERE arc_id = ? ORDER BY volume_num, chapter_num", [req.params.id]),
      progress: queryAll("SELECT * FROM progress WHERE arc_id = ?", [req.params.id]),
    });
  });

  router.get("/chapters", (req: Request, res: Response) => {
    res.json(paginate(queryAll(
      `SELECT c.*, a.name as arc_name FROM chapters c LEFT JOIN arcs a ON c.arc_id = a.id ORDER BY c.volume_num, c.chapter_num`
    ), parsePagination(req)));
  });

  router.get("/chapters/:id", (req: Request, res: Response) => {
    const chapter = queryOne("SELECT * FROM chapters WHERE id = ?", [req.params.id]);
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });
    const facts = queryAll("SELECT * FROM chapter_facts WHERE chapter_id = ? ORDER BY id", [req.params.id]);
    const charStates = queryAll(
      `SELECT cs.*, c.name as character_name FROM character_states cs LEFT JOIN characters c ON cs.character_id = c.id WHERE cs.chapter_id = ?`,
      [req.params.id]
    );
    let content = "";
    try {
      const vol = Number(chapter.volume_num) || 1;
      const num = Number(chapter.chapter_num) || 1;
      const chapterDir = path.join(projectRoot, ".novel-weaver", "content", "chapters", `vol-${vol}`);
      if (fs.existsSync(chapterDir)) {
        const files = fs.readdirSync(chapterDir).filter(f => f.startsWith(`ch${num}`));
        if (files.length > 0) content = fs.readFileSync(path.join(chapterDir, files[0]), "utf-8");
      }
    } catch { /* chapter file may not exist */ }
    res.json({ ...chapter, content, facts, characterStates: charStates });
  });

  router.get("/characters", (req: Request, res: Response) => {
    res.json(paginate(queryAll(
      `SELECT c.*, w.name as world_name FROM characters c LEFT JOIN worlds w ON c.world_id = w.id ORDER BY c.name`
    ), parsePagination(req)));
  });

  router.get("/characters/:id", (req: Request, res: Response) => {
    const character = queryOne("SELECT * FROM characters WHERE id = ?", [req.params.id]);
    if (!character) return res.status(404).json({ error: "Character not found" });
    res.json({
      ...character,
      states: queryAll("SELECT * FROM character_states WHERE character_id = ? ORDER BY chapter_num", [req.params.id]),
      aliases: queryAll("SELECT * FROM aliases WHERE entity_id = ?", [req.params.id]),
    });
  });

  router.get("/stats", (_req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    res.json({
      totalWords: numField(queryOne("SELECT COALESCE(SUM(word_count), 0) as total FROM chapters"), "total"),
      chapters: {
        total: numField(queryOne("SELECT COUNT(*) as c FROM chapters"), "c"),
        draft: numField(queryOne("SELECT COUNT(*) as c FROM chapters WHERE status='draft'"), "c"),
        completed: numField(queryOne("SELECT COUNT(*) as c FROM chapters WHERE status='completed'"), "c"),
      },
      reviews: numField(queryOne("SELECT COUNT(*) as c FROM reviews"), "c"),
      worlds: numField(queryOne("SELECT COUNT(*) as c FROM worlds"), "c"),
      characters: numField(queryOne("SELECT COUNT(*) as c FROM characters"), "c"),
      arcs: numField(queryOne("SELECT COUNT(*) as c FROM arcs"), "c"),
    });
  });

  router.get("/graph", (_req: Request, res: Response) => {
    const worlds = queryAll("SELECT id, name, type FROM worlds");
    const characters = queryAll("SELECT id, name, world_id, role_type FROM characters");
    const arcs = queryAll("SELECT id, name, world_id, theme FROM arcs");
    const chapters = queryAll("SELECT id, title, arc_id FROM chapters");

    const nodes = [
      ...worlds.map(w => ({ id: w.id, label: w.name, type: "world", subtype: w.type })),
      ...characters.map(c => ({ id: c.id, label: c.name, type: "character", subtype: c.role_type })),
      ...arcs.map(a => ({ id: a.id, label: a.name, type: "arc", subtype: a.theme })),
      ...chapters.map(ch => ({ id: ch.id, label: ch.title, type: "chapter" })),
    ];

    const edges = [
      ...characters.map(c => ({ source: c.world_id, target: c.id, type: "belongs_to" })),
      ...arcs.map(a => ({ source: a.world_id, target: a.id, type: "contains" })),
      ...chapters.map(ch => ({ source: ch.arc_id, target: ch.id, type: "has_chapter" })),
    ].filter(e => e.source && e.target);

    res.json({ nodes, edges });
  });

  router.get("/project-context", (_req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    const project = queryOne("SELECT * FROM projects LIMIT 1");
    const worlds = queryAll("SELECT * FROM worlds");
    const characters = queryAll("SELECT * FROM characters");
    const arcs = queryAll("SELECT * FROM arcs");
    const chapters = queryAll("SELECT id, arc_id, volume_num, chapter_num, title, word_count, status FROM chapters ORDER BY volume_num, chapter_num");
    const chapterFacts = queryAll("SELECT * FROM chapter_facts ORDER BY chapter_num");
    const characterStates = queryAll("SELECT * FROM character_states ORDER BY chapter_num");
    const outlines = queryAll("SELECT * FROM outlines ORDER BY order_num");

    const anchorPath = path.join(projectRoot, ".novel-weaver", "style-anchors", "anchor-profile.json");
    let styleAnchor = null;
    try {
      if (fs.existsSync(anchorPath)) styleAnchor = JSON.parse(fs.readFileSync(anchorPath, "utf-8"));
    } catch { /* ignore */ }

    res.json({
      project,
      worlds,
      characters,
      arcs,
      chapters,
      chapterFacts,
      characterStates,
      outlines,
      stats: { totalWords: chapters.reduce((sum, ch) => sum + (Number(ch.word_count) || 0), 0), chapterCount: chapters.length },
      styleAnchor,
    });
  });

  // ── Pipeline State ────────────────────────────────────────────────────

  router.get("/pipeline", (_req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    try {
      const state = queryOne("SELECT * FROM pipeline_state WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1");
      if (!state) return res.json({ current_phase: null, phases_completed: [], status: "idle", started_at: null, updated_at: null });
      const phasesCompleted = typeof state.phases_json === "string"
        ? JSON.parse(state.phases_json)
        : [];
      res.json({
        current_phase: state.current_phase,
        phases_completed: phasesCompleted,
        status: state.status,
        started_at: state.started_at,
        updated_at: state.updated_at,
      });
    } catch {
      res.json({ current_phase: null, phases_completed: [], status: "idle", started_at: null, updated_at: null });
    }
  });

  // ── Annotations CRUD ──────────────────────────────────────────────────

  router.get("/annotations", (req: Request, res: Response) => {
    const chapterId = req.query.chapter_id as string;
    if (!chapterId) return res.status(400).json({ error: "chapter_id required" });
    try {
      res.json(queryAll("SELECT * FROM annotations WHERE chapter_id = ? ORDER BY paragraph_index", [chapterId]));
    } catch {
      res.json([]);
    }
  });

  router.post("/annotations", (req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    const { chapter_id, paragraph_index, text, page_url } = req.body;
    if (!chapter_id || paragraph_index === undefined || !text) {
      return res.status(400).json({ error: "chapter_id, paragraph_index, text required" });
    }
    if (typeof paragraph_index !== "number" || paragraph_index < 0) {
      return res.status(400).json({ error: "paragraph_index must be a non-negative integer" });
    }
    if (typeof text !== "string" || text.length > 5000) {
      return res.status(400).json({ error: "text must be a string under 5000 characters" });
    }
    const id = generateId();
    try {
      db.run(
        "INSERT INTO annotations (id, chapter_id, paragraph_index, text, page_url, resolved, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))",
        [id, chapter_id, paragraph_index, text, page_url || null]
      );
      persistDb(projectRoot);
      res.status(201).json({ id, chapter_id, paragraph_index, text, page_url, resolved: false });
    } catch (err) {
      console.error(`[novel-weaver] annotation create error: ${err}`);
      res.status(500).json({ error: "Failed to create annotation" });
    }
  });

  router.put("/annotations/:id", (req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.length > 5000) {
      return res.status(400).json({ error: "text must be a string under 5000 characters" });
    }
    try {
      db.run("UPDATE annotations SET text = ? WHERE id = ?", [text, req.params.id]);
      persistDb(projectRoot);
      res.json({ id: req.params.id, text });
    } catch (err) {
      console.error(`[novel-weaver] annotation update error: ${err}`);
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  router.delete("/annotations/:id", (req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });
    try {
      db.run("DELETE FROM annotations WHERE id = ?", [req.params.id]);
      persistDb(projectRoot);
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      console.error(`[novel-weaver] annotation delete error: ${err}`);
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  // ── Pacing Map (lightweight heuristics) ────────────────────────────────

  const CLIMAX_KEYWORDS = [
    "打脸", "揭露", "反转", "突破", "决裂", "揭穿", "真相", "报仇",
    "碾压", "逆袭", "翻盘", "反杀", "秒杀", "崩溃", "觉醒", "突破",
  ];
  const SATISFACTION_KEYWORDS = [
    "打脸", "升级", "揭露", "装逼", "碾压", "逆袭", "翻盘", "得到", "获得", "拿下", "成就",
  ];
  const SUFFERING_KEYWORDS = [
    "失败", "受伤", "死亡", "冤枉", "背叛", "牺牲", "失忆", "误会", "重伤",
  ];
  const HOOK_INDICATORS = [
    "?", "?", "!", "…", "——",
    "忽然", "突然", "就在这时", "没想到", "竟然", "就在", "原来", "难道", "可是",
  ];

  function countHits(text: string, keywords: string[]): number {
    if (!text) return 0;
    let total = 0;
    for (const kw of keywords) {
      if (!kw) continue;
      let offset = 0;
      while ((offset = text.indexOf(kw, offset)) !== -1) {
        total++;
        offset += kw.length;
      }
    }
    return total;
  }

  function statusFromScore(score: number, good: number, warn: number): "🟢" | "🟡" | "🔴" {
    if (score >= good) return "🟢";
    if (score >= warn) return "🟡";
    return "🔴";
  }

  function readChapterBody(chapterId: string, vol: number, num: number): string {
    const candidates = [
      path.join(projectRoot, ".novel-weaver", "data", "chapters", `${chapterId}.md`),
      path.join(projectRoot, ".novel-weaver", "content", "chapters", `vol-${vol}`, `ch${num}`),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          return fs.readFileSync(c, "utf-8");
        }
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
          const files = fs.readdirSync(c).filter((f) => f.startsWith(`ch${num}`));
          if (files.length > 0) return fs.readFileSync(path.join(c, files[0]), "utf-8");
        }
      } catch {
        // try next candidate
      }
    }
    return "";
  }

  router.get("/pacing", (_req: Request, res: Response) => {
    const db = getDatabase();
    if (!db) return res.status(503).json({ error: "Database not initialized" });

    const project = queryOne("SELECT genre FROM projects LIMIT 1") as { genre?: string | null } | null;
    const genre = project?.genre ?? null;

    const chapterRows = queryAll(
      `SELECT id, volume_num, chapter_num, title, word_count, status
       FROM chapters
       ORDER BY volume_num, chapter_num`
    );
    if (chapterRows.length === 0) {
      return res.json({
        volumes: [],
        meta: { totalChapters: 0, totalWords: 0, genre },
      });
    }

    // Pre-aggregate chapter_facts for hook_set/hook_payoff lookup
    const facts = queryAll(
      `SELECT chapter_id, fact_type FROM chapter_facts`
    );
    const factsByChapter: Record<string, Set<string>> = {};
    for (const f of facts) {
      const cid = String(f.chapter_id);
      if (!factsByChapter[cid]) factsByChapter[cid] = new Set();
      factsByChapter[cid].add(String(f.fact_type));
    }

    const volumesMap = new Map<number, {
      volume_num: number,
      name: string,
      chapters: Array<Record<string, unknown>>,
    }>();

    let totalWords = 0;

    for (const row of chapterRows) {
      const vol = Number(row.volume_num) || 1;
      const num = Number(row.chapter_num) || 1;
      const id = String(row.id);
      const title = String(row.title || "");
      const wordCount = Number(row.word_count) || 0;
      const status = String(row.status || "draft");
      totalWords += wordCount;

      const body = readChapterBody(id, vol, num);
      const bodyStripped = body.replace(/^---[\s\S]*?---\n?/, "").trim();

      // Climax
      const climaxHits = countHits(bodyStripped, CLIMAX_KEYWORDS);
      const climaxDetected = climaxHits > 0;
      const climaxScore = Math.min(10, climaxHits * 3);
      const climaxStatus: "🟢" | "🟡" | "🔴" | "⚪" = climaxDetected
        ? (climaxHits >= 2 ? "🟢" : "🟡")
        : "⚪";

      // Satisfaction density (per 1k)
      const satHits = countHits(bodyStripped, SATISFACTION_KEYWORDS);
      const kchar = Math.max(1, wordCount) / 1000;
      const satDensity = Number((satHits / kchar).toFixed(2));
      const satStatus = satDensity >= 1 ? "🟢" : satDensity >= 0.4 ? "🟡" : "🔴";

      // Hook — tail 100 chars + fact-based check
      const tail = bodyStripped.slice(-100);
      let hookScore = 0;
      if (/[…——？！?!]$/.test(bodyStripped.trim())) hookScore += 4;
      hookScore += Math.min(3, countHits(tail, HOOK_INDICATORS));
      if (/[?？][^a-zA-Z0-9]*$/.test(bodyStripped.trim())) hookScore += 2;
      if (/[!！][^a-zA-Z0-9]*$/.test(bodyStripped.trim())) hookScore += 1;
      if (!bodyStripped) hookScore = 0;
      hookScore = Math.min(10, hookScore);

      const factsSet = factsByChapter[id];
      const hasHookFact = factsSet?.has("hook_set") || factsSet?.has("hook_payoff");
      if (hasHookFact) hookScore = Math.min(10, hookScore + 1);

      const hookStatus = statusFromScore(hookScore, 6, 4);

      // Suffering hits — surfaced in points but not a top-level status block
      const sufferingHits = countHits(bodyStripped, SUFFERING_KEYWORDS);

      // Aggregate "points"
      const points: Array<"climax" | "satisfaction" | "suffering" | "hook"> = [];
      if (climaxDetected) points.push("climax");
      if (satHits > 0) points.push("satisfaction");
      if (sufferingHits > 0) points.push("suffering");
      if (hookScore >= 4) points.push("hook");

      // Overall status — worst of the four
      const ordered: Array<"🟢" | "🟡" | "🔴" | "⚪"> = [
        climaxStatus === "⚪" ? "🔴" : climaxStatus,
        satStatus,
        hookStatus,
      ];
      let overall: "🟢" | "🟡" | "🔴" = "🟢";
      if (ordered.includes("🔴")) overall = "🔴";
      else if (ordered.filter((s) => s === "🟡").length >= 2) overall = "🟡";

      const chapterEntry = {
        id,
        chapter_num: num,
        title,
        word_count: wordCount,
        status,
        pacing: {
          status: overall,
          climax: { detected: climaxDetected, score: climaxScore },
          satisfaction: { density: satDensity, status: satStatus },
          hook: { score: hookScore, status: hookStatus },
          points,
        },
      };

      if (!volumesMap.has(vol)) {
        volumesMap.set(vol, {
          volume_num: vol,
          name: `第${vol}卷`,
          chapters: [],
        });
      }
      volumesMap.get(vol)!.chapters.push(chapterEntry);
    }

    const volumes = Array.from(volumesMap.values()).sort(
      (a, b) => a.volume_num - b.volume_num
    );

    res.json({
      volumes,
      meta: { totalChapters: chapterRows.length, totalWords, genre },
    });
  });

  // ── Config ─────────────────────────────────────────────────────────────

  router.get("/config", async (_req: Request, res: Response) => {
    let resolver;
    try {
      resolver = getModelResolver();
    } catch {
      // Resolver not yet bound — initialise against this project root.
      // init() is async (file I/O), but getAllResolutions() is sync — we
      // trigger init() and proceed; the file layer may lag by one tick.
      resolver = initModelResolver(projectRoot);
      try {
        await resolver.init();
      } catch {
        // ignore — file layer may be absent
      }
    }

    const resolutions: ModelResolution[] = resolver.getAllResolutions();
    const taskModel: Record<string, { model: string; source: "default" | "config" | "session" }> = {};
    for (const r of resolutions) {
      taskModel[r.task] = { model: r.model, source: r.source };
    }

    let temperature: Record<string, number> = {};
    let maxTokens: Record<string, number> | undefined;
    try {
      const cfg = await new ConfigFileService(projectRoot).load();
      if (cfg.temperature && typeof cfg.temperature === "object") {
        temperature = cfg.temperature as Record<string, number>;
      }
      if (cfg.maxTokens && typeof cfg.maxTokens === "object") {
        maxTokens = cfg.maxTokens as Record<string, number>;
      }
    } catch {
      // missing / malformed file — return what we have
    }

    res.json({ taskModel, temperature, maxTokens });
  });

  router.post("/config/model", (req: Request, res: Response) => {
    const { task, model } = req.body ?? {};
    if (typeof task !== "string" || !task) {
      return res.status(400).json({ error: "task is required" });
    }
    if (typeof model !== "string" || !model) {
      return res.status(400).json({ error: "model is required" });
    }

    let resolver;
    try {
      resolver = getModelResolver();
    } catch {
      resolver = initModelResolver(projectRoot);
    }

    try {
      resolver.setSessionOverride(task, model);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }

    res.json({ success: true, task, model, source: "session" });
  });

  router.delete("/config/model/:task", (req: Request, res: Response) => {
    const task = String(req.params.task ?? "");
    if (!task) return res.status(400).json({ error: "task is required" });

    let resolver;
    try {
      resolver = getModelResolver();
    } catch {
      return res.status(503).json({ error: "ModelResolver not initialized" });
    }

    if (task === "all") {
      const before = resolver.getSessionOverrides();
      const cleared = Object.keys(before).length;
      resolver.clearAllSessionOverrides();
      return res.json({ success: true, task, cleared });
    }

    const before = resolver.getSessionOverrides();
    const had = Object.prototype.hasOwnProperty.call(before, task);
    resolver.clearSessionOverride(task);
    res.json({ success: true, task, cleared: had ? 1 : 0 });
  });

  return router;
}
