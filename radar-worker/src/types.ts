export interface Env {
  DB: D1Database;
  AI: Ai; // Workers AI binding
  ANTHROPIC_API_KEY?: string; // 1st priority
  OPENAI_API_KEY?: string; // 2nd fallback
  GOOGLE_AI_API_KEY?: string; // 3rd fallback (Gemini)
  CRON_SECRET?: string;
  RELEVANCE_THRESHOLD: string;
  MAX_SEEDS_PER_RUN: string;
}

export interface RadarSource {
  id: string;
  name: string;
  source_type: string;
  url: string;
  config: string | null;
  enabled: number;
}

export interface CollectedItem {
  sourceId: string;
  url: string;
  title: string;
  summary: string | null;
}

export interface ScoredItem extends CollectedItem {
  titleKo: string;
  summaryKo: string;
  relevanceScore: number;
}

export interface RunStats {
  sourcesChecked: number;
  itemsCollected: number;
  itemsDeduplicated: number;
  seedsCreated: number;
  errors: string[];
}
