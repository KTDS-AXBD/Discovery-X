export interface Slide {
  order: number;
  layout:
    | "cover"
    | "section_header"
    | "content"
    | "two_column"
    | "agenda"
    | "key_insight"
    | "closing"
    | "table"
    | "process"
    | "timeline";
  title: string;
  subtitle?: string;
  bullets?: string[];
  subBullets?: Record<number, string[]>;
  keyInsight?: string;
  notes?: string;
  tableData?: { headers: string[]; rows: string[][] };
  processSteps?: Array<{ label: string; description?: string }>;
}

export type SlideFormat = "executive" | "pitch" | "internal";
export type InputMode = "markdown" | "sections";

export interface SectionInput {
  type: string;
  title: string;
  content: string;
}

export interface GenerateOptions {
  mode: InputMode;
  title: string;
  author?: string;
  format?: SlideFormat;
  markdown?: string;
  sections?: SectionInput[];
}

export interface GenerateResult {
  slides: Slide[];
  metadata: {
    slideCount: number;
    format: SlideFormat;
    generatedAt: string;
  };
}

export interface ParsedContent {
  keyInsight: string;
  blocks: ContentBlock[];
  tables: ParsedTable[];
}

export interface ContentBlock {
  heading?: string;
  bullets: string[];
  subBullets: Record<number, string[]>;
}

export interface ParsedTable {
  heading?: string;
  headers: string[];
  rows: string[][];
}

export interface DesignTokens {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}
