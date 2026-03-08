---
code: DX-PLAN-006
title: 슬라이드 MCP 서버 — PPT 생성 엔진 외부 공개
version: "1.0"
status: Active
category: PLAN
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
system-version: 0.5.1
---

# DX-PLAN-006: 슬라이드 MCP 서버

## 1. 개요

Discovery-X의 F35 사업제안 PPT 슬라이드 자동 생성 기능을 **MCP(Model Context Protocol) 서버**로 추출하여, 다른 프로젝트에서 Claude Code / AI Agent가 도구(tool)로 호출할 수 있게 한다.

### 의사결정 요약

| 항목 | 선택 |
|------|------|
| 사용 방식 | MCP 서버 (stdio transport) |
| 입력 형식 | 범용 마크다운 + 섹션 구조 양쪽 지원 |
| 패키지 위치 | `packages/slides-mcp/` (모노레포 내) |
| 출력 범위 | JSON 구조 + .pptx 파일 생성 |
| Discovery-X 원본 | 유지 (독립 복사본으로 추출) |

## 2. 원본 소스 매핑

| 추출 대상 | 원본 파일 | 원본 라인 | 변경 사항 |
|-----------|----------|----------|----------|
| `markdown-parser.ts` | `features/proposals/service/slides.ts` | L99-245 | DB 의존 제거, 순수 함수화 |
| `slide-builder.ts` | `features/proposals/service/slides.ts` | L289-556 | DB 쿼리 → 입력 파라미터 전환 |
| `pptx-renderer.ts` | `features/proposals/ui/export-pptx.ts` | 전체 708줄 | 브라우저 → Node.js (Blob→Buffer) |
| `section-groups.ts` | `features/proposals/service/slides.ts` | L52-93 | 상수 그대로 추출 |
| `types.ts` | `features/proposals/service/slides.ts` | L22-46 | 타입 추출 + InputMode 추가 |

## 3. 패키지 구조

```
packages/slides-mcp/
├── src/
│   ├── server.ts              # MCP 서버 엔트리 (stdio transport)
│   ├── tools/
│   │   ├── generate-slides.ts # generate_slides tool
│   │   ├── export-pptx.ts     # export_pptx tool
│   │   ├── parse-markdown.ts  # parse_markdown tool
│   │   └── list-layouts.ts    # list_layouts tool
│   ├── engine/
│   │   ├── index.ts           # 엔진 public API
│   │   ├── markdown-parser.ts # 마크다운 → 구조화 블록
│   │   ├── slide-builder.ts   # 섹션 → 슬라이드 배열
│   │   ├── pptx-renderer.ts   # 슬라이드 → .pptx 파일
│   │   └── section-groups.ts  # 섹션 그룹/템플릿 상수
│   └── types.ts               # 공유 타입
├── package.json
├── tsconfig.json
└── README.md
```

## 4. MCP Tools 설계 (4개)

### 4.1 generate_slides

핵심 도구. 콘텐츠를 슬라이드 JSON 구조로 변환.

```typescript
{
  name: "generate_slides",
  description: "마크다운 문서 또는 섹션 구조를 슬라이드 덱으로 변환합니다. " +
    "markdown 모드는 아무 마크다운 문서를, sections 모드는 사업제안 섹션을 입력받습니다.",
  inputSchema: {
    type: "object",
    properties: {
      mode: { enum: ["markdown", "sections"], description: "입력 모드" },
      markdown: { type: "string", description: "범용 마크다운 (mode=markdown)" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            content: { type: "string" }
          }
        },
        description: "섹션 배열 (mode=sections)"
      },
      title: { type: "string", description: "덱 제목" },
      author: { type: "string", description: "작성자 (선택)" },
      format: { enum: ["executive", "pitch", "internal"], default: "pitch" }
    },
    required: ["mode", "title"]
  }
}
// 출력: { slides: Slide[], metadata: { slideCount, format, generatedAt } }
```

### 4.2 export_pptx

Slide[] JSON을 .pptx 파일로 렌더링.

```typescript
{
  name: "export_pptx",
  inputSchema: {
    slides: Slide[],          // generate_slides 결과
    title: string,
    outputPath?: string,      // 기본: /tmp/slides-{timestamp}.pptx
    design?: {
      primaryColor?: string,  // 기본: #1B2A4A (네이비)
      accentColor?: string,   // 기본: #2D5AA0 (블루)
      fontFamily?: string     // 기본: Malgun Gothic
    }
  }
}
// 출력: { filePath: string, fileSize: number }
```

### 4.3 parse_markdown

마크다운을 구조화 블록으로 파싱 (디버깅/커스터마이징용).

```typescript
{
  name: "parse_markdown",
  inputSchema: { markdown: string }
}
// 출력: { blocks: ContentBlock[], tables: TableData[], insights: string[] }
```

### 4.4 list_layouts

사용 가능한 레이아웃과 포맷 정보 조회.

```typescript
{
  name: "list_layouts",
  inputSchema: {}
}
// 출력: { layouts: LayoutInfo[], formats: FormatInfo[], sectionTypes: string[] }
```

## 5. markdown 모드 설계

범용 마크다운 입력 시 자동 섹션화 로직:

1. `#` H1 → 덱 제목으로 사용 (이미 title 있으면 무시)
2. `##` H2 → 섹션 분할 경계, 각 H2가 하나의 섹션
3. 섹션 내부: 기존 `parseMarkdown()` 로직 적용 (불릿, 테이블, Key Insight 추출)
4. 섹션 타입 자동 추론:
   - 키워드 매칭: "시장" → `target_market`, "고객" → `target_customer`, "수익" → `revenue_model` 등
   - 매칭 실패 시 → `content` 기본값
5. 섹션 그룹핑: 추론된 타입 기반 SECTION_GROUPS 적용, 미분류는 "기타" 그룹

## 6. 구현 단계

| 단계 | 작업 | 산출물 | Worker 배정 |
|------|------|--------|------------|
| S1 | 스캐폴딩 + 의존성 | package.json, tsconfig | 리더 |
| S2 | types.ts + section-groups.ts | 타입/상수 | Worker A |
| S3 | markdown-parser.ts + 헤딩 분할 | 파서 엔진 | Worker A |
| S4 | slide-builder.ts + 입력 전환 | 빌더 엔진 | Worker B |
| S5 | pptx-renderer.ts (Node.js) | PPTX 렌더러 | Worker B |
| S6 | MCP 서버 + 4 tools | 서버 | 리더 |
| S7 | workspace 설정 + 빌드 | 검증 | 리더 |

## 7. 사용 예시

```bash
# MCP 서버 등록
claude mcp add slides-mcp -- node packages/slides-mcp/dist/server.js

# 다른 프로젝트에서 AI Agent 사용
# "이 기획서를 PPT로 만들어줘" → generate_slides(markdown) + export_pptx 자동 호출
```

## 8. 의존성

| 패키지 | 용도 | 비고 |
|--------|------|------|
| `@modelcontextprotocol/sdk` | MCP 서버 프레임워크 | stdio transport |
| `pptxgenjs` | .pptx 파일 생성 | Node.js 호환 |
| `zod` | 입력 스키마 검증 | MCP SDK 권장 |
| `typescript` | 빌드 | |
