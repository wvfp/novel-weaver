const API_BASE = "/api"

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface ProjectInfo {
  name: string
  genre: string
  stats: {
    worlds: number
    characters: number
    arcs: number
    chapters: number
    totalWords: number
  }
}

export interface PipelineState {
  current_phase: string
  phases_completed: string[]
  status: string
  started_at: string
  updated_at: string
}

export interface ChapterInfo {
  id: string
  title: string
  chapter_num: number
  volume_num: number
  word_count: number
  status: string
}

export interface WorldInfo {
  id: string
  name: string
  type: string
  status: string
}

export interface CharacterInfo {
  id: string
  name: string
  role_type: string
  world_name: string
}

export interface ArcInfo {
  id: string
  name: string
  arc_type: string
  theme: string
  status: string
}

export interface ReviewInfo {
  id: string
  chapter_id: string
  reviewer: string
  verdict: string
  issues: unknown[]
  reviewed_at: string
}

export const novelApi = {
  health: () => fetchApi<{ status: string; version: string }>("/health"),
  project: () => fetchApi<ProjectInfo>("/project"),
  pipeline: () => fetchApi<PipelineState>("/pipeline"),
  chapters: (page = 1, limit = 50) => fetchApi<{ items: ChapterInfo[]; total: number }>(`/chapters?page=${page}&limit=${limit}`),
  chapter: (id: string) => fetchApi<ChapterInfo & { content: string }>(`/chapters/${id}`),
  worlds: (page = 1, limit = 50) => fetchApi<{ items: WorldInfo[]; total: number }>(`/worlds?page=${page}&limit=${limit}`),
  world: (id: string) => fetchApi<WorldInfo>(`/worlds/${id}`),
  characters: (page = 1, limit = 50) => fetchApi<{ items: CharacterInfo[]; total: number }>(`/characters?page=${page}&limit=${limit}`),
  character: (id: string) => fetchApi<CharacterInfo>(`/characters/${id}`),
  reviews: (chapterId: string) => fetchApi<ReviewInfo[]>(`/chapters/${chapterId}`),
  arcs: (page = 1, limit = 50) => fetchApi<{ items: ArcInfo[]; total: number }>(`/arcs?page=${page}&limit=${limit}`),
  arc: (id: string) => fetchApi<ArcInfo>(`/arcs/${id}`),
  stats: () => fetchApi<Record<string, unknown>>("/stats"),
}
