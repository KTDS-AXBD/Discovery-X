/**
 * PRD 분석 결과 파서 — claude -p JSON 응답 파싱
 *
 * markdown 래핑 제거, 유효성 검증, score clamp, snake_case 호환 처리.
 */

import type { ReviewFeedbackItem, ReviewScorecard } from "../types";

export interface ParsedPrdAnalysis {
  title: string;
  sections: Record<string, string>;
  review: {
    verdict: string;
    scorecard: ReviewScorecard;
    feedbackItems: ReviewFeedbackItem[];
  } | null;
}

const VALID_VERDICTS = new Set(["READY", "CONDITIONAL", "NOT_READY"]);

function stripMarkdownWrapper(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parsePrdAnalysisResult(raw: string): ParsedPrdAnalysis {
  const cleaned = stripMarkdownWrapper(raw);
  if (!cleaned) {
    throw new Error("파싱 실패: 빈 응답");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("파싱 실패: JSON 형식 오류");
  }

  // prd 객체 검증
  const prd = parsed.prd as { title?: string; sections?: Record<string, string> } | undefined;
  if (!prd?.sections || typeof prd.sections !== "object") {
    throw new Error("파싱 실패: prd.sections 누락");
  }

  const title = prd.title || "제목 없음";
  const sections = prd.sections;

  // review 파싱 (선택)
  const rawReview = parsed.review as Record<string, unknown> | undefined;
  if (!rawReview) {
    return { title, sections, review: null };
  }

  // verdict 정규화
  const rawVerdict = String(rawReview.verdict || "");
  const verdict = VALID_VERDICTS.has(rawVerdict) ? rawVerdict : "NOT_READY";

  // scorecard 파싱
  const rawScorecard = rawReview.scorecard as { totalScore?: number; items?: Array<Record<string, unknown>> } | undefined;
  const items: ReviewScorecard["items"] = (rawScorecard?.items ?? []).map((item) => ({
    criteria: String(item.criteria || ""),
    score: clamp(Number(item.score) || 0, 0, 10),
    maxScore: 10,
    comment: item.comment ? String(item.comment) : undefined,
  }));

  // totalScore 자동 계산 (items 합산 기반)
  const sumScore = items.reduce((acc, item) => acc + item.score, 0);
  const totalScore = items.length > 0 ? Math.round((sumScore * 100) / 80) : (rawScorecard?.totalScore ?? 0);

  const scorecard: ReviewScorecard = { totalScore, items };

  // feedbackItems (snake_case 호환)
  const rawFeedback = (rawReview.feedbackItems ?? rawReview.feedback_items ?? []) as Array<Record<string, unknown>>;
  const feedbackItems: ReviewFeedbackItem[] = rawFeedback.map((f) => ({
    section: f.section ? String(f.section) : undefined,
    severity: (["critical", "major", "minor", "suggestion"].includes(String(f.severity)) ? String(f.severity) : "suggestion") as ReviewFeedbackItem["severity"],
    message: String(f.message || ""),
    suggestion: f.suggestion ? String(f.suggestion) : undefined,
  }));

  return { title, sections, review: { verdict, scorecard, feedbackItems } };
}
