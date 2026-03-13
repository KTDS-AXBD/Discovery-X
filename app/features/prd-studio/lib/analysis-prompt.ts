/**
 * PRD 분석 프롬프트 빌더 — claude -p 배치 분석용
 *
 * 소스 컨텍스트를 받아 PRD 생성 + 검토를 한 번에 수행하는 프롬프트를 생성한다.
 */

export interface SourceInput {
  title: string;
  summary: string;
  url?: string;
}

export function buildPrdAnalysisPrompt(sources: SourceInput[]): string {
  const sourceContext = sources
    .map(
      (s, i) =>
        `### 소스 ${i + 1}: ${s.title}${s.url ? ` (${s.url})` : ""}
요약: ${s.summary}`,
    )
    .join("\n\n");

  return `너는 PRD(Product Requirements Document) 전문 작성자이자 검토자야.

## Task 1: PRD 생성
아래 소스 자료를 바탕으로 8개 섹션의 PRD를 작성해.

## Task 2: PRD 검토
작성한 PRD를 8개 기준으로 자체 검토하고 점수를 매겨.

## 소스 자료

${sourceContext}

## 출력 형식 (반드시 JSON만 출력)

{
  "prd": {
    "title": "PRD 제목 (소스 기반 자동 생성)",
    "sections": {
      "summary": "## 프로젝트 요약\\n...",
      "background": "## 배경 & 문제\\n...",
      "objectives": "## 목표 & 성공 기준\\n...",
      "target_users": "## 대상 사용자\\n...",
      "requirements": "## 핵심 요구사항\\n...",
      "solution": "## 해결 방안\\n...",
      "risks": "## 리스크 & 제약\\n...",
      "timeline": "## 일정 & 마일스톤\\n..."
    }
  },
  "review": {
    "verdict": "READY | CONDITIONAL | NOT_READY",
    "scorecard": {
      "totalScore": 0,
      "items": [
        { "criteria": "문제 정의 명확성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "대상 사용자 구체성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "목표/성공기준 측정가능성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "요구사항 완성도", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "해결방안 실현가능성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "리스크 분석 충분성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "일정 현실성", "score": 0, "maxScore": 10, "comment": "..." },
        { "criteria": "전체 일관성", "score": 0, "maxScore": 10, "comment": "..." }
      ]
    },
    "feedbackItems": [
      { "section": "summary|background|...", "severity": "critical|major|minor|suggestion", "message": "...", "suggestion": "..." }
    ]
  }
}

## 규칙
- 각 섹션 200~500자, 마크다운 형식, 한국어
- 소스에 명시된 정보와 추론을 구분 ("소스 기반" vs "추정")
- 불확실한 내용은 "추정" 또는 "확인 필요"로 표기
- 구체적 수치, 기업명, 사례 포함
- totalScore = 각 criteria score 합계 × (100/80)로 100점 만점 환산
- verdict: totalScore ≥ 80 → READY, 60~79 → CONDITIONAL, < 60 → NOT_READY
- feedbackItems는 최소 3개, 최대 10개. severity별 구체적 개선 제안 포함`;
}
