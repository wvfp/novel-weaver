import * as fs from "node:fs";
import * as path from "node:path";
import type { StyleImprint } from "./imprint-schema.js";

const SAFE_NAME = /^[a-zA-Z0-9_\u4e00-\u9fff-]+$/;

function validateName(name: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`Invalid imprint name: "${name}". Only letters, digits, underscores, hyphens, and Chinese characters allowed.`);
  }
}

function safePath(projectRoot: string, name: string): string {
  validateName(name);
  const dir = imprintDir(projectRoot);
  const resolved = path.resolve(dir, `${name}.json`);
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function imprintDir(projectRoot: string): string {
  return path.join(projectRoot, ".novel-weaver", "style-imprints");
}

function activeFilePath(projectRoot: string): string {
  return path.join(imprintDir(projectRoot), ".active");
}

export function saveImprint(projectRoot: string, imprint: StyleImprint): void {
  const dir = imprintDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = safePath(projectRoot, imprint.name);
  fs.writeFileSync(filePath, JSON.stringify(imprint, null, 2), "utf-8");
}

export function loadImprint(projectRoot: string, name: string): StyleImprint | null {
  const filePath = safePath(projectRoot, name);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as StyleImprint;
  } catch {
    return null;
  }
}

export function listImprints(projectRoot: string): StyleImprint[] {
  const dir = imprintDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  const activeName = getActiveName(projectRoot);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as StyleImprint;
        data.active = f.replace(/\.json$/, "") === activeName;
        return data;
      } catch {
        return null;
      }
    })
    .filter((i): i is StyleImprint => i !== null);
}

export function deleteImprint(projectRoot: string, name: string): boolean {
  const filePath = safePath(projectRoot, name);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  const activeName = getActiveName(projectRoot);
  if (activeName === name) {
    try { fs.unlinkSync(activeFilePath(projectRoot)); } catch { /* ignore */ }
  }
  return true;
}

function getActiveName(projectRoot: string): string | null {
  const activePath = activeFilePath(projectRoot);
  if (!fs.existsSync(activePath)) return null;
  try {
    return fs.readFileSync(activePath, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

export function getActiveImprint(projectRoot: string): StyleImprint | null {
  const name = getActiveName(projectRoot);
  if (!name) return null;
  return loadImprint(projectRoot, name);
}

export function setActiveImprint(projectRoot: string, name: string | null): boolean {
  const dir = imprintDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  if (name === null) {
    try { fs.unlinkSync(activeFilePath(projectRoot)); } catch { /* ignore */ }
    return true;
  }
  const filePath = safePath(projectRoot, name);
  if (!fs.existsSync(filePath)) return false;
  fs.writeFileSync(activeFilePath(projectRoot), name, "utf-8");
  return true;
}
