import * as fs from "node:fs";
import * as path from "node:path";
import { getDatabase } from "../db/index.js";

export interface GenerateOptions {
  projectRoot: string;
  force?: boolean;
}

export interface GenerateResult {
  path: string;
  size: number;
}

export async function generateDashboard(options: GenerateOptions): Promise<GenerateResult> {
  const { projectRoot, force = false } = options;
  const dashDir = path.join(projectRoot, ".novel-weaver", "dashboard");
  const indexPath = path.join(dashDir, "index.html");

  if (!force && fs.existsSync(indexPath)) {
    const stat = fs.statSync(indexPath);
    return { path: indexPath, size: stat.size };
  }

  fs.mkdirSync(dashDir, { recursive: true });

  const context = loadProjectContext(projectRoot);
  const html = buildDashboardHtml(context, projectRoot);
  fs.writeFileSync(indexPath, html, "utf-8");
  const stat = fs.statSync(indexPath);
  return { path: indexPath, size: stat.size };
}

export async function regenerateDashboard(projectRoot: string): Promise<GenerateResult> {
  return generateDashboard({ projectRoot, force: true });
}

interface ProjectContext {
  projectName: string;
  genre: string;
  worlds: { name: string; type: string }[];
  characters: { name: string; role_type: string; description: string }[];
  arcs: { name: string; theme: string }[];
  chapters: { title: string; chapter_num: number; volume_num: number; word_count: number }[];
  totalWords: number;
  chapterCount: number;
  styleAnchor: Record<string, unknown> | null;
}

function loadProjectContext(projectRoot: string): ProjectContext {
  const db = getDatabase();
  const ctx: ProjectContext = {
    projectName: "Novel Weaver Project",
    genre: "fantasy",
    worlds: [],
    characters: [],
    arcs: [],
    chapters: [],
    totalWords: 0,
    chapterCount: 0,
    styleAnchor: null,
  };

  if (!db) return ctx;

  try {
    const proj = db.exec("SELECT name, genre FROM projects LIMIT 1");
    if (proj.length > 0 && proj[0].values.length > 0) {
      ctx.projectName = String(proj[0].values[0][0] ?? ctx.projectName);
      ctx.genre = String(proj[0].values[0][1] ?? ctx.genre);
    }

    const worlds = db.exec("SELECT name, type FROM worlds");
    if (worlds.length > 0) {
      ctx.worlds = worlds[0].values.map(r => ({ name: String(r[0]), type: String(r[1]) }));
    }

    const chars = db.exec("SELECT name, role_type, COALESCE(description,'') FROM characters");
    if (chars.length > 0) {
      ctx.characters = chars[0].values.map(r => ({
        name: String(r[0]), role_type: String(r[1]), description: String(r[2]),
      }));
    }

    const arcs = db.exec("SELECT name, theme FROM arcs");
    if (arcs.length > 0) {
      ctx.arcs = arcs[0].values.map(r => ({ name: String(r[0]), theme: String(r[1]) }));
    }

    const chaps = db.exec("SELECT title, chapter_num, volume_num, word_count FROM chapters ORDER BY volume_num, chapter_num");
    if (chaps.length > 0) {
      ctx.chapters = chaps[0].values.map(r => ({
        title: String(r[0]), chapter_num: Number(r[1]), volume_num: Number(r[2]), word_count: Number(r[3]),
      }));
      ctx.chapterCount = ctx.chapters.length;
      ctx.totalWords = ctx.chapters.reduce((s, c) => s + c.word_count, 0);
    }
  } catch { /* db may be empty */ }

  const anchorPath = path.join(projectRoot, ".novel-weaver", "style-anchors", "anchor-profile.json");
  try {
    if (fs.existsSync(anchorPath)) {
      ctx.styleAnchor = JSON.parse(fs.readFileSync(anchorPath, "utf-8"));
    }
  } catch { /* ignore */ }

  return ctx;
}

const GENRE_THEMES: Record<string, { colors: string; accent: string; icon: string; bg: string }> = {
  xianxia: { colors: "#8b5cf6, #6366f1", accent: "#a78bfa", icon: "🏔", bg: "#1a0a2e" },
  "sci-fi": { colors: "#06b6d4, #3b82f6", accent: "#22d3ee", icon: "🚀", bg: "#0a1628" },
  horror: { colors: "#dc2626, #991b1b", accent: "#f87171", icon: "👻", bg: "#1a0a0a" },
  urban: { colors: "#f59e0b, #d97706", accent: "#fbbf24", icon: "🏙", bg: "#1a1408" },
  apocalypse: { colors: "#84cc16, #65a30d", accent: "#a3e635", icon: "☢", bg: "#0f1a0a" },
  fantasy: { colors: "#8b5cf6, #ec4899", accent: "#c084fc", icon: "⚔", bg: "#1a0a1e" },
};

function buildDashboardHtml(ctx: ProjectContext, _projectRoot: string): string {
  const theme = GENRE_THEMES[ctx.genre] || GENRE_THEMES.fantasy;
  const wordCount = ctx.totalWords.toLocaleString();

  const worldCards = ctx.worlds.map(w =>
    `<div class="entity-card"><span class="entity-icon">${w.type === 'arc' ? '🏰' : '🌍'}</span><div class="entity-name">${esc(w.name)}</div><div class="entity-meta">${esc(w.type)}</div></div>`
  ).join("");

  const charCards = ctx.characters.map(c =>
    `<div class="entity-card"><span class="entity-icon">${c.role_type === 'protagonist' ? '⭐' : '👤'}</span><div class="entity-name">${esc(c.name)}</div><div class="entity-meta">${esc(c.role_type)}</div></div>`
  ).join("");

  const arcCards = ctx.arcs.map(a =>
    `<div class="entity-card"><span class="entity-icon">⚔</span><div class="entity-name">${esc(a.name)}</div><div class="entity-meta">${esc(a.theme)}</div></div>`
  ).join("");

  const chapterRows = ctx.chapters.map(ch =>
    `<tr><td>${ch.volume_num}-${ch.chapter_num}</td><td>${esc(ch.title)}</td><td>${ch.word_count.toLocaleString()}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(ctx.projectName)} — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:${theme.bg};color:#e2e8f0;min-height:100vh}
.container{max-width:1100px;margin:0 auto;padding:1.5rem}
h1{font-size:1.75rem;margin-bottom:.5rem;background:linear-gradient(135deg,${theme.colors});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.subtitle{color:#94a3b8;margin-bottom:1.5rem;font-size:.9rem}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-bottom:2rem}
.stat-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:.75rem;padding:1rem;text-align:center;backdrop-filter:blur(8px)}
.stat-value{font-size:1.75rem;font-weight:700;color:${theme.accent}}
.stat-label{font-size:.75rem;color:#94a3b8;margin-top:.25rem}
.section{margin-bottom:2rem}
.section-title{font-size:1.1rem;font-weight:600;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1px solid rgba(255,255,255,.1)}
.entity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.5rem}
.entity-card{background:rgba(255,255,255,.05);border-radius:.5rem;padding:.75rem;display:flex;align-items:center;gap:.5rem;border:1px solid rgba(255,255,255,.05)}
.entity-icon{font-size:1.25rem}
.entity-name{font-size:.875rem;font-weight:500}
.entity-meta{font-size:.7rem;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th{text-align:left;padding:.5rem;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,.1)}
td{padding:.5rem;border-bottom:1px solid rgba(255,255,255,.05)}
.tab-nav{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap}
.tab-btn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#94a3b8;padding:.4rem .8rem;border-radius:.5rem;cursor:pointer;font-size:.8rem}
.tab-btn.active{background:${theme.accent};color:#000;border-color:${theme.accent}}
.tab-panel{display:none}
.tab-panel.active{display:block}
.health-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:.5rem}
.footer{text-align:center;color:#475569;font-size:.7rem;margin-top:2rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.05)}
@media(max-width:640px){.container{padding:1rem}.stats-grid{grid-template-columns:repeat(2,1fr)}.entity-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="container">
<h1>${theme.icon} ${esc(ctx.projectName)}</h1>
<p class="subtitle">${esc(ctx.genre)} · <span class="health-dot"></span><span id="health-status">检测中...</span></p>

<div class="stats-grid">
  <div class="stat-card"><div class="stat-value">${ctx.worlds.length}</div><div class="stat-label">世界观</div></div>
  <div class="stat-card"><div class="stat-value">${ctx.characters.length}</div><div class="stat-label">角色</div></div>
  <div class="stat-card"><div class="stat-value">${ctx.arcs.length}</div><div class="stat-label">篇章</div></div>
  <div class="stat-card"><div class="stat-value">${ctx.chapterCount}</div><div class="stat-label">章节</div></div>
  <div class="stat-card"><div class="stat-value">${wordCount}</div><div class="stat-label">总字数</div></div>
</div>

<div class="tab-nav">
  <button class="tab-btn active" data-tab="worlds">世界观</button>
  <button class="tab-btn" data-tab="characters">角色</button>
  <button class="tab-btn" data-tab="arcs">篇章</button>
  <button class="tab-btn" data-tab="chapters">章节</button>
</div>

<div id="worlds" class="tab-panel active">
  <div class="section-title">世界观设定</div>
  <div class="entity-grid">${worldCards || '<p style="color:#64748b">暂无世界观</p>'}</div>
</div>

<div id="characters" class="tab-panel">
  <div class="section-title">角色列表</div>
  <div class="entity-grid">${charCards || '<p style="color:#64748b">暂无角色</p>'}</div>
</div>

<div id="arcs" class="tab-panel">
  <div class="section-title">篇章</div>
  <div class="entity-grid">${arcCards || '<p style="color:#64748b">暂无篇章</p>'}</div>
</div>

<div id="chapters" class="tab-panel">
  <div class="section-title">章节列表</div>
  <table><thead><tr><th>编号</th><th>标题</th><th>字数</th></tr></thead><tbody>${chapterRows || '<tr><td colspan="3" style="color:#64748b">暂无章节</td></tr>'}</tbody></table>
</div>

<div class="footer">Novel Weaver · AI Generated Dashboard</div>
</div>
<script>
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});
fetch('/api/health').then(r=>r.json()).then(d=>{
  document.getElementById('health-status').textContent='运行中 · 端口 '+d.port;
}).catch(()=>{
  document.getElementById('health-status').textContent='离线';
});
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildDashboardPrompt(context: ProjectContext): string {
  return `你是这个小说项目的专属网页设计师。根据以下项目数据，生成一个自包含的HTML仪表盘。

项目名称: ${context.projectName}
题材: ${context.genre}
世界观数量: ${context.worlds.length}
角色数量: ${context.characters.length}
篇章数量: ${context.arcs.length}
章节数量: ${context.chapterCount}
总字数: ${context.totalWords}

要求:
1. 自包含HTML（内联CSS+JS，无外部依赖）
2. 移动端适配，触控友好
3. 所有数据从 /api/* 获取
4. 根据题材决定视觉风格
5. 不要生成占位内容`;
}
