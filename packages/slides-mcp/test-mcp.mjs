/**
 * slides-mcp E2E 테스트 — 12개 시나리오
 * 엔진 직접 호출 + MCP 프로토콜 양쪽 검증
 *
 * 실행: node test-mcp.mjs
 */

import { existsSync, unlinkSync } from "node:fs";

const PASS = "\x1b[32m✅ PASS\x1b[0m";
const FAIL = "\x1b[31m❌ FAIL\x1b[0m";
let passed = 0;
let failed = 0;

function assert(condition, name, detail = "") {
  if (condition) {
    console.log(`  ${PASS} ${name}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name} — ${detail}`);
    failed++;
  }
}

// Engine direct import
const { parseMarkdown, flattenBlocks, splitByHeadings, splitIntoSentences } = await import("./dist/engine/markdown-parser.js");
const { buildSlides } = await import("./dist/engine/slide-builder.js");
const { renderToPptx } = await import("./dist/engine/pptx-renderer.js");
const { executeGenerateSlides } = await import("./dist/tools/generate-slides.js");
const { executeExportPptx } = await import("./dist/tools/export-pptx.js");
const { executeListLayouts } = await import("./dist/tools/list-layouts.js");
const { executeParseMarkdown } = await import("./dist/tools/parse-markdown.js");

// ============================================================================
console.log("\n\x1b[1m═══ T1: list_layouts — 도구 메타데이터 검증 ═══\x1b[0m");
// ============================================================================
const layouts = executeListLayouts();
assert(layouts.layouts.length === 10, `레이아웃 10종 (got ${layouts.layouts.length})`);
assert(layouts.formats.length === 3, `포맷 3종 (got ${layouts.formats.length})`);
assert(layouts.sectionTypes.length >= 10, `섹션 타입 10종 이상 (got ${layouts.sectionTypes.length})`);
assert(layouts.sectionGroups.length === 5, `섹션 그룹 5개 (got ${layouts.sectionGroups.length})`);

const layoutNames = layouts.layouts.map(l => l.name);
for (const expected of ["cover", "agenda", "section_header", "key_insight", "content", "two_column", "table", "process", "timeline", "closing"]) {
  assert(layoutNames.includes(expected), `레이아웃 ${expected} 존재`);
}

// ============================================================================
console.log("\n\x1b[1m═══ T2: generate_slides — markdown 모드 (범용) ═══\x1b[0m");
// ============================================================================
const md1 = `# AI 스타트업 사업계획

## 사업 개요

인공지능 기반 문서 자동화 솔루션을 개발합니다.

- 기업 문서 자동 생성
- 리포트 템플릿 관리
- 다국어 번역 지원

## 타겟 시장

국내 중소기업 B2B 시장이 주요 타겟입니다.

- 시장 규모: 30조원 (2025년 기준)
- CAGR: 12.5%
- 주요 경쟁사: A사, B사, C사

## 가치 제안

기존 수작업 대비 70% 시간 절감, 30% 비용 절감을 달성합니다.

- 자동화율 95% 이상
- 품질 일관성 보장
- 24시간 무중단 서비스

## 수익 구조

SaaS 월 구독 모델을 기반으로 합니다.

- Basic: 월 29,000원
- Pro: 월 99,000원
- Enterprise: 맞춤형

## 실행 계획

3단계로 나눠 진행합니다.

- Phase 1: MVP 개발 (3개월)
- Phase 2: 베타 테스트 (2개월)
- Phase 3: 정식 출시 (1개월)`;

const result2 = executeGenerateSlides({
  mode: "markdown",
  title: "AI 스타트업 사업계획",
  format: "pitch",
  author: "홍길동",
  markdown: md1,
});

assert(result2.slides.length >= 8, `슬라이드 8장 이상 (got ${result2.slides.length})`);
assert(result2.slides[0].layout === "cover", "첫 슬라이드 = cover");
assert(result2.slides[0].title === "AI 스타트업 사업계획", "제목 일치");
assert(result2.slides[0].keyInsight === "홍길동", "작성자 표시");
assert(result2.slides[result2.slides.length - 1].layout === "closing", "마지막 = closing");
assert(result2.metadata.format === "pitch", "포맷 = pitch");

const hasAgenda = result2.slides.some(s => s.layout === "agenda");
assert(hasAgenda, "agenda 슬라이드 존재");

const hasSectionHeader = result2.slides.some(s => s.layout === "section_header");
assert(hasSectionHeader, "section_header 슬라이드 존재");

const hasProcess = result2.slides.some(s => s.layout === "process");
assert(hasProcess, "process 슬라이드 존재 (실행 계획)");

// ============================================================================
console.log("\n\x1b[1m═══ T3: generate_slides — sections 모드 (사업제안 특화) ═══\x1b[0m");
// ============================================================================
const result3 = executeGenerateSlides({
  mode: "sections",
  title: "신규 사업 제안서",
  format: "internal",
  sections: [
    { type: "overview", title: "사업 개요", content: "## 핵심\n\n- 클라우드 기반 HR 솔루션\n- 중소기업 특화\n- AI 추천 엔진 탑재" },
    { type: "target_market", title: "타겟 시장", content: "## 시장 분석\n\n- 국내 HR SaaS 시장 5조원\n- 연 20% 성장\n- 중소기업 니즈 급증" },
    { type: "value_proposition", title: "가치 제안", content: "## 차별화\n\n기존 솔루션 대비 50% 저렴하면서도 AI 기반 맞춤 추천을 제공합니다.\n\n- 자동 성과 분석\n- 맞춤형 교육 추천\n- 실시간 대시보드" },
    { type: "revenue_model", title: "수익 모델", content: "## 수익 구조\n\n| 플랜 | 가격 | 기능 |\n|------|------|------|\n| Starter | 무료 | 기본 HR |\n| Pro | 5만원/월 | AI 추천 |\n| Enterprise | 문의 | 전체 |\n" },
    { type: "execution_plan", title: "실행 계획", content: "- 1분기: 설계 + 프로토타입\n- 2분기: MVP 개발\n- 3분기: 베타 테스트\n- 4분기: 정식 출시" },
  ],
});

assert(result3.slides.length >= 10, `슬라이드 10장 이상 (got ${result3.slides.length})`);
assert(result3.metadata.format === "internal", "포맷 = internal");

const hasTable = result3.slides.some(s => s.layout === "table");
assert(hasTable, "table 슬라이드 존재 (수익 모델 표)");

const hasInsight = result3.slides.some(s => s.layout === "key_insight");
assert(hasInsight, "key_insight 슬라이드 존재");

// ============================================================================
console.log("\n\x1b[1m═══ T4: generate_slides — executive 포맷 (간결 모드) ═══\x1b[0m");
// ============================================================================
const result4 = executeGenerateSlides({
  mode: "markdown",
  title: "경영진 요약",
  format: "executive",
  markdown: md1,
});

assert(result4.slides.length < result2.slides.length, `executive < pitch (${result4.slides.length} < ${result2.slides.length})`);
assert(result4.metadata.format === "executive", "포맷 = executive");
const execHasSectionHeader = result4.slides.some(s => s.layout === "section_header");
assert(!execHasSectionHeader, "executive에서 section_header 없음");

// ============================================================================
console.log("\n\x1b[1m═══ T5: parse_markdown — 테이블 포함 마크다운 ═══\x1b[0m");
// ============================================================================
const mdWithTable = `## 시장 분석

국내 AI 시장은 빠르게 성장하고 있습니다.

- 시장 규모: 30조원
- 성장률: 15%

| 분야 | 규모 | 성장률 |
|------|------|--------|
| NLP | 5조 | 20% |
| CV | 8조 | 18% |
| GenAI | 3조 | 45% |

### 핵심 인사이트

AI 시장에서 GenAI가 가장 빠르게 성장하고 있습니다.`;

const parsed5 = executeParseMarkdown({ markdown: mdWithTable });
assert(parsed5.blocks.length >= 1, `블록 1개 이상 (got ${parsed5.blocks.length})`);
assert(parsed5.tables.length >= 1, `테이블 1개 이상 (got ${parsed5.tables.length})`);
assert(parsed5.tables[0].headers.length === 3, `테이블 헤더 3컬럼 (got ${parsed5.tables[0]?.headers?.length})`);
assert(parsed5.tables[0].rows.length === 3, `테이블 행 3개 (got ${parsed5.tables[0]?.rows?.length})`);
assert(parsed5.keyInsight.length > 0, `keyInsight 추출됨`);

// ============================================================================
console.log("\n\x1b[1m═══ T6: export_pptx — 기본 PPTX 파일 생성 ═══\x1b[0m");
// ============================================================================
const pptxResult = await executeExportPptx({
  slides: result2.slides,
  title: "테스트 PPTX 생성",
});

assert(existsSync(pptxResult.filePath), `파일 존재: ${pptxResult.filePath}`);
assert(pptxResult.fileSize > 10000, `파일 크기 > 10KB (got ${(pptxResult.fileSize / 1024).toFixed(1)}KB)`);
if (existsSync(pptxResult.filePath)) unlinkSync(pptxResult.filePath);

// ============================================================================
console.log("\n\x1b[1m═══ T7: export_pptx — 커스텀 디자인 토큰 ═══\x1b[0m");
// ============================================================================
const customPptx = await executeExportPptx({
  slides: result4.slides,
  title: "커스텀 디자인 테스트",
  design: {
    primaryColor: "#1a1a2e",
    accentColor: "#e94560",
    fontFamily: "Arial",
  },
});

assert(existsSync(customPptx.filePath), "커스텀 디자인 PPTX 생성됨");
assert(customPptx.fileSize > 5000, `크기 > 5KB (got ${(customPptx.fileSize / 1024).toFixed(1)}KB)`);
if (existsSync(customPptx.filePath)) unlinkSync(customPptx.filePath);

// ============================================================================
console.log("\n\x1b[1m═══ T8: export_pptx — outputPath 지정 ═══\x1b[0m");
// ============================================================================
const targetPath = "/tmp/slides-mcp-test-output.pptx";
if (existsSync(targetPath)) unlinkSync(targetPath);

const pathPptx = await executeExportPptx({
  slides: result4.slides,
  title: "경로 지정 테스트",
  outputPath: targetPath,
});

assert(pathPptx.filePath === targetPath, "outputPath 정확히 반영");
assert(existsSync(targetPath), "지정 경로에 파일 존재");
if (existsSync(targetPath)) unlinkSync(targetPath);

// ============================================================================
console.log("\n\x1b[1m═══ T9: E2E 파이프라인 — generate → export ═══\x1b[0m");
// ============================================================================
const genResult = executeGenerateSlides({
  mode: "markdown",
  title: "E2E 파이프라인 테스트",
  format: "executive",
  markdown: "## 개요\n\n테스트 문서입니다.\n\n- 항목 1\n- 항목 2\n- 항목 3\n\n## 시장\n\n시장 분석 내용.\n\n- 규모: 10조\n- 성장률: 10%\n\n## 가치\n\n차별화 포인트입니다.\n\n- 핵심 가치 1\n- 핵심 가치 2",
});

assert(genResult.slides.length >= 4, `E2E 슬라이드 4장 이상 (got ${genResult.slides.length})`);
assert(genResult.metadata.generatedAt.length > 0, "generatedAt 타임스탬프 존재");

const e2ePptx = await executeExportPptx({
  slides: genResult.slides,
  title: "E2E 파이프라인",
});

assert(existsSync(e2ePptx.filePath), "E2E PPTX 생성됨");
assert(e2ePptx.fileSize > 5000, `E2E 크기 > 5KB (got ${(e2ePptx.fileSize / 1024).toFixed(1)}KB)`);
if (existsSync(e2ePptx.filePath)) unlinkSync(e2ePptx.filePath);

// ============================================================================
console.log("\n\x1b[1m═══ T10: 에러 처리 — 필수 필드 누락 ═══\x1b[0m");
// ============================================================================
try {
  executeGenerateSlides({ mode: "markdown", title: "에러 테스트" });
  assert(false, "markdown 누락 시 에러", "에러가 발생하지 않음");
} catch (e) {
  assert(e.message.includes("markdown"), `markdown 누락 에러: ${e.message}`);
}

try {
  executeGenerateSlides({ mode: "sections", title: "에러 테스트" });
  assert(false, "sections 누락 시 에러", "에러가 발생하지 않음");
} catch (e) {
  assert(e.message.includes("sections"), `sections 누락 에러: ${e.message}`);
}

try {
  executeParseMarkdown({ markdown: "" });
  assert(true, "빈 마크다운 → 빈 결과 (에러 아님)");
} catch (e) {
  assert(false, "빈 마크다운 처리", e.message);
}

// ============================================================================
console.log("\n\x1b[1m═══ T11: splitByHeadings — 키워드 섹션 추론 ═══\x1b[0m");
// ============================================================================
const sections11 = splitByHeadings("# 제목\n\n## 개요\n\n내용1\n\n## 시장 분석\n\n- 항목A\n- 항목B\n\n## 고객 세그먼트\n\n타겟 고객 설명.");
assert(sections11.length === 3, `3개 섹션 (got ${sections11.length})`);
assert(sections11[0].type === "overview", `첫 섹션 = overview (got ${sections11[0].type})`);
assert(sections11[1].type === "target_market", `둘째 = target_market (got ${sections11[1].type})`);
assert(sections11[2].type === "target_customer", `셋째 = target_customer (got ${sections11[2].type})`);

// 키워드 없는 헤딩 → content 기본값
const unknownSections = splitByHeadings("## 소개\n\n소개 내용\n\n## 알 수 없는 섹션\n\n뭔가 내용");
const unknownType = unknownSections.find(s => s.title === "알 수 없는 섹션");
assert(unknownType?.type === "content", `미인식 헤딩 → content (got ${unknownType?.type})`);

// ============================================================================
console.log("\n\x1b[1m═══ T12: splitIntoSentences + flattenBlocks ═══\x1b[0m");
// ============================================================================
const sentences = splitIntoSentences("AI 기술은 빠르게 발전하고 있습니다. 시장 규모는 매년 20%씩 성장하고 있어요. 특히 GenAI 분야가 주목받고 있습니다.");
assert(sentences.length === 3, `3개 문장 (got ${sentences.length})`);
assert(sentences[0].includes("AI 기술"), "첫 문장 매칭");

const emptyS = splitIntoSentences("");
assert(emptyS.length === 0, "빈 입력 → 빈 배열");

const nullS = splitIntoSentences(null);
assert(nullS.length === 0, "null 입력 → 빈 배열");

// flattenBlocks 테스트
const parsed = parseMarkdown("## 섹션 A\n\n- 불릿1\n- 불릿2\n- 불릿3\n- 불릿4\n- 불릿5\n- 불릿6\n- 불릿7\n- 불릿8\n- 불릿9");
const pages = flattenBlocks(parsed.blocks, 5);
assert(pages.length === 2, `5개씩 페이징 → 2페이지 (got ${pages.length})`);
assert(pages[0].bullets.length === 5, `첫 페이지 5개 (got ${pages[0].bullets.length})`);
assert(pages[1].bullets.length === 4, `둘째 페이지 4개 (got ${pages[1].bullets.length})`);

// ============================================================================
// Summary
// ============================================================================
console.log(`\n\x1b[1m${"═".repeat(50)}`);
console.log(`테스트 결과: ${passed} passed, ${failed} failed (총 ${passed + failed}개)`);
console.log(`${"═".repeat(50)}\x1b[0m\n`);

process.exit(failed > 0 ? 1 : 0);
