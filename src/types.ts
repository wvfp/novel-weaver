/**
 * Novel Weaver Plugin — Type Definitions
 *
 * Config interface and shared types for the novel-weaver plugin.
 */

/** Plugin-level configuration options */
export interface NovelWeaverConfig {
  /** Directory for persistent plugin data (e.g., agent state, caches) */
  dataDir?: string;
  /** Default literary genre when none is specified by the user */
  defaultGenre?: string;
  /** Path to the SQLite database file */
  dbPath?: string;
}

/** Tool handler input (generic envelope used by the plugin system) */
export interface ToolInput {
  /** Arbitrary arguments keyed by name */
  [key: string]: unknown;
}

/** Tool handler output (generic envelope used by the plugin system) */
export interface ToolOutput {
  /** Human-readable result text */
  output: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================
// New Schema Types (Wave 1 — Long-Form Consistency)
// ============================================================

/** Fact types for structured chapter fact extraction */
export type FactType =
  | 'new_character' | 'location_change' | 'item_acquire' | 'plot_advance'
  | 'combat_result' | 'relationship_change' | 'state_change' | 'hook_set' | 'hook_payoff';

/** A single extracted fact from a chapter */
export interface ChapterFact {
  id: string;
  chapter_id: string;
  fact_type: FactType;
  entity_ref?: string;
  description: string;
  chapter_num: number;
  created_at: string;
}

/** Per-chapter character state snapshot */
export interface CharacterState {
  id: string;
  character_id: string;
  chapter_id: string;
  chapter_num: number;
  status_tags?: string[];       // JSON array
  power_level?: string;
  location?: string;
  items?: string[];             // JSON array
  relationships?: Array<{ target: string; type: string; change: string }>;
  narrative_state?: string;
  context?: string;             // 'core' or 'arc:{arc_id}'
  created_at: string;
}

/** Outline type hierarchy */
export type OutlineType = 'master' | 'volume' | 'chapter' | 'blueprint';
export type OutlineStatus = 'draft' | 'active' | 'completed';

/** Multi-level outline entry */
export interface Outline {
  id: string;
  arc_id: string;
  outline_type: OutlineType;
  level: number;
  title: string;
  summary?: string;
  content?: string;
  status: OutlineStatus;
  order_num: number;
  created_at: string;
}

/** Entity type for alias resolution */
export type EntityType = 'character' | 'world' | 'arc' | 'item';

/** An alias mapping for entity name resolution */
export interface Alias {
  id: string;
  entity_id: string;
  alias: string;
  entity_type: EntityType;
  confidence: number;
  created_at: string;
}

// ============================================================
// Wave 1 — Genre & Config Types
// ============================================================

/** Genre template for guided writing */
export interface GenreTemplate {
  id: string;
  name: string;
  description: string;
  targetWordCount: { min: number; max: number };
  styleGuidelines: string[];
  styleRules: string[];
  forbiddenPatterns: string[];
  recommendedPatterns: string[];
  specialRules: string[];
}

/** Genre profile — computed from genre name/tokens */
export interface GenreProfile {
  genre: string;
  tokens: string[];
  dominantTone: string;
  pacing: string;
  focusAreas: string[];
}

/** .novel-weaverrc.json configuration interface */
export interface NovelWeaverRc {
  genre?: string;
  author?: string;
  temperature?: Record<string, number>;
  antiAi?: { enabled?: boolean; layers?: number[] };
  dashboard?: { port?: number; host?: string };
  [key: string]: unknown;
}
