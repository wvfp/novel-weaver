export interface ChapterSummary {
  id: string;
  chapter_id: string;
  summary_level: 1 | 2 | 3;
  summary_text: string;
  key_events: string;
  cliffhangers: string | null;
  character_end_states: string | null;
  next_chapter_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryGenerateResult {
  summary: ChapterSummary;
  action: "created" | "updated";
}
