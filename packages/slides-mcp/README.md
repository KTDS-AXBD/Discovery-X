# slides-mcp — PPT 슬라이드 생성 MCP 서버

마크다운 문서 또는 섹션 구조를 슬라이드 JSON으로 변환하고, .pptx 파일로 내보내는 MCP 서버.

## 설치 & 등록

```bash
# 빌드 (최초 1회)
cd packages/slides-mcp
npm install && npm run build

# Claude Code에서 MCP 서버 등록
claude mcp add slides-mcp -- node /path/to/packages/slides-mcp/dist/server.js
```

또는 `.mcp.json`에 직접 추가:

```json
{
  "mcpServers": {
    "slides-mcp": {
      "command": "node",
      "args": ["/path/to/packages/slides-mcp/dist/server.js"]
    }
  }
}
```

## 사용 가능한 도구 (4개)

| 도구 | 용도 | 필수 입력 |
|------|------|----------|
| `generate_slides` | 마크다운/섹션 → 슬라이드 JSON | mode, title |
| `export_pptx` | 슬라이드 JSON → .pptx 파일 | slides, title |
| `parse_markdown` | 마크다운 구조 분석 (디버깅용) | markdown |
| `list_layouts` | 레이아웃/포맷/섹션 정보 조회 | 없음 |

## 기본 사용 흐름

AI Agent에게 자연어로 요청:

```
"이 기획서를 PPT로 만들어줘"
→ Agent가 자동으로 generate_slides + export_pptx 호출

"이 마크다운 문서를 경영진 요약 슬라이드로 변환해줘"
→ generate_slides(mode: "markdown", format: "executive") + export_pptx
```

## generate_slides

### markdown 모드 (범용)

아무 마크다운 문서를 넣으면 `##` H2 헤딩 기준으로 자동 섹션 분할.

```json
{
  "mode": "markdown",
  "title": "AI 사업 전략",
  "format": "pitch",
  "author": "홍길동",
  "markdown": "# AI 사업 전략\n\n## 사업 개요\n\n- 항목1\n- 항목2\n\n## 타겟 시장\n\n시장 규모 30조원..."
}
```

헤딩 키워드 → 섹션 타입 자동 추론:

| 헤딩 키워드 | 매핑 타입 |
|------------|----------|
| 개요, 소개, 배경, overview | overview |
| 시장, market | target_market |
| 고객, 사용자, customer | target_customer |
| 가치, 차별화, value | value_proposition |
| 수익, 비용, 비즈니스, revenue | revenue_model |
| 가설, hypothesis | hypothesis |
| 시나리오, scenario | scenario |
| mvp, 프로토타입 | mvp |
| 실행, 로드맵, 일정, 계획 | execution_plan |
| (미매칭) | content |

### sections 모드 (사업제안 특화)

10개 섹션 타입을 직접 지정:

```json
{
  "mode": "sections",
  "title": "신규 사업 제안서",
  "format": "internal",
  "sections": [
    { "type": "overview", "title": "사업 개요", "content": "마크다운 내용..." },
    { "type": "target_market", "title": "타겟 시장", "content": "..." },
    { "type": "value_proposition", "title": "가치 제안", "content": "..." }
  ]
}
```

### 포맷 3종

| 포맷 | 슬라이드 수 | 특징 |
|------|-----------|------|
| `executive` | ~7장 | 핵심 섹션만, section_header 없음 |
| `pitch` | ~12장 | 전체 섹션 + section_header + key_insight |
| `internal` | 13장+ | pitch와 동일 구조, 내부 검토용 |

## export_pptx

```json
{
  "slides": [...],
  "title": "파일 제목",
  "outputPath": "/path/to/output.pptx",
  "design": {
    "primaryColor": "#0C2340",
    "accentColor": "#0066CC",
    "fontFamily": "Malgun Gothic"
  }
}
```

- `outputPath` 미지정 시 `/tmp/`에 자동 생성
- `design` 미지정 시 KPMG/McKinsey 스타일 기본 디자인 (네이비 + 블루 악센트)

### 커스텀 디자인 토큰

| 속성 | 기본값 | 설명 |
|------|--------|------|
| `primaryColor` | `#0C2340` | 네이비 (헤더, 커버 배경) |
| `accentColor` | `#0066CC` | 블루 (악센트 라인, 번호 배지) |
| `fontFamily` | `Malgun Gothic` | 폰트 (한글 지원) |

## 자동 생성 슬라이드 구조

```
Cover → Agenda → [사업개요 요약표]
  → Section Header → Key Insight → Content (자동 분할)
  → [마크다운 테이블 → Table 슬라이드]
  → [섹션 쌍 비교표 (시장&고객, 수익&시나리오, 가설&가치)]
  → [실행계획 → Process Flow]
  → [마일스톤 → Timeline]
  → Key Metrics (Two Column)
  → Closing
```

### 10개 레이아웃

| 레이아웃 | 설명 |
|---------|------|
| `cover` | 표지 (네이비 배경, 좌측 악센트) |
| `agenda` | 목차 (번호 카드 배지) |
| `section_header` | 섹션 구분 (네이비 배경) |
| `key_insight` | 핵심 인사이트 (따옴표, 틸 배경) |
| `content` | 본문 (번호 불릿 + 하위항목, 자동 페이징) |
| `two_column` | 핵심 수치 (최대 4개 메트릭 카드) |
| `table` | 표 (교차 행 색상, 네이비 헤더) |
| `process` | 프로세스 플로우 (수평 화살표) |
| `timeline` | 타임라인 (세로 마일스톤) |
| `closing` | 마무리 (네이비 배경) |

## 다른 프로젝트에서 사용

```bash
# 1) 다른 프로젝트 디렉토리에서
cd ~/other-project

# 2) MCP 서버 등록
claude mcp add slides-mcp -- node ~/work/axbd/Discovery-X/packages/slides-mcp/dist/server.js

# 3) Claude Code에서 자연어 요청
# "README.md를 투자 피치 PPT로 만들어줘"
# "이 기획 문서를 경영진 보고용 슬라이드로 변환해줘"
```

## 테스트

```bash
cd packages/slides-mcp
node test-mcp.mjs    # 12 시나리오 × 60 assertions
```

## 패키지 구조

```
packages/slides-mcp/
├── src/
│   ├── server.ts              # MCP 서버 (stdio transport)
│   ├── types.ts               # 공유 타입
│   ├── engine/
│   │   ├── index.ts           # 엔진 public API
│   │   ├── markdown-parser.ts # 마크다운 → 구조화 블록
│   │   ├── slide-builder.ts   # 섹션 → Slide[] 변환
│   │   ├── pptx-renderer.ts   # Slide[] → .pptx 파일
│   │   └── section-groups.ts  # 섹션 그룹/템플릿 상수
│   └── tools/
│       ├── generate-slides.ts # generate_slides tool
│       ├── export-pptx.ts     # export_pptx tool
│       ├── parse-markdown.ts  # parse_markdown tool
│       └── list-layouts.ts    # list_layouts tool
├── dist/                      # 빌드 결과
├── test-mcp.mjs              # E2E 테스트
├── package.json
└── tsconfig.json
```
