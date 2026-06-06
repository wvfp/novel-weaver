/**
 * Scene Dispatcher Engine
 *
 * Orchestrates scene-by-scene chapter composition when usePlotWriter is active.
 * Since Agent(PlotWriter) LLM calls are unavailable from tool context directly,
 * this implements a scene composition mode:
 *   - Decompose chapter body into 2-4 scenes based on emotion blueprint
 *   - Generate scene guidance annotations (emotion, pacing, technique)
 *   - Run rhythm check after each scene
 *   - Assemble final chapter with scene structure
 *
 * Flow: dispatchFullChapter → decomposeBody → per-scene: dispatchSceneWrite + checkBreathing → assemble
 */

import { type EmotionBlueprint, generateEmotionBlueprint } from './emotion-blueprint.js';
import { checkBreathing } from './rhythm-checker.js';
import { loadGenreConfig, type GenreConfig } from '../config-utils.js';

// ============================================================
// Types
// ============================================================

/** A single scene blueprint derived from the emotion blueprint. */
export interface SceneBlueprint {
  sceneNum: number;
  mood: string;
  pacing: string;
  sensoryFocus: string;
  tensionTechnique: string;
}

/** Input metadata for a chapter being dispatched. */
export interface ChapterRequest {
  arcId: string;
  chapterNum: number;
  volumeNum: number;
  title: string;
  outline?: string;
}

/** Result of dispatching a full chapter through scene composition. */
export interface ChapterResult {
  /** The scene blueprints that were generated/used. */
  scenes: SceneBlueprint[];
  /** The assembled chapter body with scene guidance markers interleaved. */
  assembledBody: string;
  /** Human-readable rhythm issues found per scene. */
  rhythmIssues: string[];
  /** The raw (un-annotated) body segments per scene. */
  sceneSegments: string[];
  /** Genre pack context injected into the writing, if available. */
  genreContext: GenreContext | null;
}

/** Genre pack context injected into chapter writing. */
export interface GenreContext {
  /** Power system name and levels for character capability constraints. */
  powerSystem: GenreConfig['powerSystem'];
  /** Writing rules to inject as scene guidance. */
  writingRules: GenreConfig['writingRules'];
}

// ============================================================
// Scene composition helpers
// ============================================================

/**
 * Generate scene composition guidance text.
 *
 * Since we can't call Agent(PlotWriter) from tool context, this returns
 * structured scene guidance as HTML-comment markers that guide scene writing:
 *   - Emotion/mood tone
 *   - Pacing direction
 *   - Sensory focus
 *   - Tension technique
 *   - Genre-specific writing rules and power system constraints (if available)
 *
 * @param scene - The scene blueprint
 * @param genreCtx - Optional genre pack context for writing constraints
 * @returns Guidance text with HTML-comment markers
 */
export function dispatchSceneWrite(scene: SceneBlueprint, genreCtx?: GenreContext | null): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`<!-- ═══ Scene ${scene.sceneNum}: ${scene.mood} · ${scene.pacing} ═══ -->`);
  lines.push(`<!--   Focus: ${scene.sensoryFocus} -->`);
  lines.push(`<!--   Technique: ${scene.tensionTechnique} -->`);

  if (genreCtx) {
    lines.push(`<!--   力量体系: ${genreCtx.powerSystem.name} (${genreCtx.powerSystem.levels.join(' → ')}) -->`);
    lines.push(`<!--   段落风格: ${genreCtx.writingRules.paragraphStyle} -->`);
    lines.push(`<!--   对话风格: ${genreCtx.writingRules.dialogueStyle} -->`);
    if (genreCtx.writingRules.forbiddenPatterns.length > 0) {
      lines.push(`<!--   禁止手法: ${genreCtx.writingRules.forbiddenPatterns.join('、')} -->`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Orchestrate scene-by-scene chapter composition.
 *
 * Steps:
 * 1. Generate emotion blueprint from the chapter outline (or default template)
 * 2. Decompose the body text into proportional scene segments
 * 3. Run rhythm check (checkBreathing) on each scene segment
 * 4. Interleave scene guidance markers
 * 5. Return assembled result with rhythm issues
 *
 * @param chapter - Chapter metadata (title, number, outline, etc.)
 * @param body - Full chapter body text to decompose
 * @returns Composed chapter result with scenes, assembled text, and rhythm issues
 */
export function dispatchFullChapter(
  chapter: ChapterRequest,
  body: string,
): ChapterResult {
  const contextStr = `第${chapter.chapterNum}章 「${chapter.title}」`;
  const outline = chapter.outline ?? '';

  // 0. Load genre pack from DB
  const genreConfig = loadGenreConfig();
  const genreCtx: GenreContext | null = genreConfig
    ? { powerSystem: genreConfig.powerSystem, writingRules: genreConfig.writingRules }
    : null;

  // 1. Generate emotion blueprint from outline
  const blueprint: EmotionBlueprint = generateEmotionBlueprint(outline, contextStr);

  // 2. Create scene blueprints from emotion blueprint
  const scenes: SceneBlueprint[] = blueprint.sceneEmotions.map((se) => ({
    sceneNum: se.sceneNum,
    mood: se.mood,
    pacing: se.pacing,
    sensoryFocus: se.sensoryFocus,
    tensionTechnique: se.tensionTechnique,
  }));

  // 3. Decompose body into scene segments
  const sceneSegments = decomposeBody(body, scenes.length);

  // 4. Per-scene: generate guidance + run rhythm check
  const rhythmIssues: string[] = [];
  const assembledParts: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const segText = sceneSegments[i] ?? '';

    // Scene guidance header (with genre context)
    const guidance = dispatchSceneWrite(scene, genreCtx);

    // Rhythm check on this scene segment
    if (segText.trim().length > 0) {
      try {
        const issues = checkBreathing(segText);
        for (const issue of issues) {
          rhythmIssues.push(
            `场景${scene.sceneNum} [${issue.severity}]: ${issue.description} — ${issue.suggestion}`,
          );
        }
      } catch {
        // rhythm check failures are non-fatal
      }
    }

    assembledParts.push(guidance + segText);
  }

  // 5. Assemble final body
  const assembledBody = assembledParts.join('\n');

  return {
    scenes,
    assembledBody,
    rhythmIssues,
    sceneSegments,
    genreContext: genreCtx,
  };
}

/**
 * Decompose body text into roughly equal scene segments.
 *
 * Strategy:
 *   - If body paragraphs > scene count: distribute paragraphs evenly
 *   - If body paragraphs <= scene count: split by character proportion
 *   - Single scene: return the whole body
 *
 * @param body - The full chapter body text
 * @param sceneCount - Number of scenes to decompose into
 * @returns Array of text segments, one per scene
 */
function decomposeBody(body: string, sceneCount: number): string[] {
  if (sceneCount <= 1) return [body];

  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Not enough paragraphs → split by character count
  if (paragraphs.length <= sceneCount) {
    const segLen = Math.ceil(body.length / sceneCount);
    const segments: string[] = [];
    for (let i = 0; i < sceneCount; i++) {
      segments.push(body.slice(i * segLen, (i + 1) * segLen));
    }
    return segments;
  }

  // Distribute paragraphs among scenes
  const basePerScene = Math.floor(paragraphs.length / sceneCount);
  const remainder = paragraphs.length % sceneCount;
  const segments: string[] = [];
  let start = 0;

  for (let i = 0; i < sceneCount; i++) {
    const count = basePerScene + (i < remainder ? 1 : 0);
    segments.push(paragraphs.slice(start, start + count).join('\n\n'));
    start += count;
  }

  return segments;
}
