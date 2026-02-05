# Design: Discovery-X 잔여 작업 (F6~F10)

> **Feature**: dx-remaining-tasks
> **Created**: 2026-02-04
> **Phase**: Design
> **Plan Reference**: `docs/01-plan/features/dx-remaining-tasks.plan.md`

---

## 1. Implementation Order

```
F6 → F8 → F10 → F7 → F9
```

각 항목은 독립적으로 구현/배포 가능. F9만 DB 마이그레이션이 필요하므로 마지막.

---

## 2. F6: 응답 요약 헤더

### 2.1 개요

500자 이상의 Agent 응답 상단에 1-2줄 요약을 자동 삽입한다.

### 2.2 수정 파일

| # | 파일 | 변경 | 라인 범위 |
|---|------|------|----------|
| 1 | `app/lib/agent/executor.ts` | 응답 후처리 함수 추가 | 268-269 사이 |
| 2 | `app/components/chat/MessageBubble.tsx` | blockquote 요약 스타일 | 150-160 근처 |

### 2.3 상세 설계

#### executor.ts — 요약 삽입 함수

응답 저장 직전(272행, 496행)에 후처리를 적용한다.

```typescript
// 새 유틸 함수 (파일 상단 또는 하단)
function addSummaryHeader(text: string): string {
  if (text.length < 500) return text;
  // 첫 문장 추출 (마침표/물음표/느낌표 기준)
  const firstSentence = text.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
  if (!firstSentence || firstSentence.length > 120) return text;
  return `> **요약**: ${firstSentence}\n\n${text}`;
}
```

**적용 위치 1 — 비스트리밍 (272행 근처)**:
```typescript
// 기존: content: assistantText,
// 변경: content: addSummaryHeader(assistantText),
```

**적용 위치 2 — 스트리밍 (496행 근처)**:
```typescript
// 기존: content: assistantText,
// 변경: content: addSummaryHeader(assistantText),
```

#### MessageBubble.tsx — 요약 blockquote 스타일

ReactMarkdown의 `blockquote` 커스텀 렌더러(`BlockquoteBlock`)에서 요약 blockquote를 구분한다.

```typescript
// BlockquoteBlock 컴포넌트 수정 (기존 커스텀 렌더러 위치)
const BlockquoteBlock = ({ children }: { children: React.ReactNode }) => {
  const text = String(children);
  const isSummary = text.startsWith("요약:");
  return (
    <blockquote
      className={cn(
        "border-l-4 pl-4 my-3",
        isSummary
          ? "border-[var(--axis-text-brand)] bg-[var(--dx-surface-card-hover)] rounded-r-lg py-2 text-sm font-medium not-italic"
          : "border-[var(--axis-border-default)] italic text-[var(--axis-text-secondary)]"
      )}
    >
      {children}
    </blockquote>
  );
};
```

### 2.4 적용 규칙

- 500자 미만 → 그대로
- 첫 문장 120자 초과 → 그대로 (너무 긴 요약은 비효과적)
- 도구 실행 결과 포함 메시지에도 적용 (최종 assistantText 기준)
- 추가 API 호출 없음

---

## 3. F8: Discovery 비교 테이블 도구

### 3.1 개요

Agent 채팅에서 2~5개 Discovery를 나란히 비교하는 마크다운 테이블을 생성하는 도구.

### 3.2 수정 파일

| # | 파일 | 변경 | 라인 범위 |
|---|------|------|----------|
| 1 | `app/lib/agent/tools/query-tools.ts` | `compareDiscoveries` 함수 추가 | 파일 끝 |
| 2 | `app/lib/agent/tool-registry.ts` | AGENT_TOOLS에 도구 정의 추가 | 762행 근처 |
| 3 | `app/lib/agent/tool-registry.ts` | TOOL_MIN_AUTONOMY에 항목 추가 | 10-64행 내 |
| 4 | `app/lib/agent/executor.ts` | executeTool case 추가 | 198-205행 사이 |

### 3.3 상세 설계

#### query-tools.ts — compareDiscoveries 함수

```typescript
export async function compareDiscoveries(
  db: DB,
  input: { discoveryIds: string[] }
): Promise<string> {
  const ids = input.discoveryIds;
  if (ids.length < 2 || ids.length > 5) {
    return JSON.stringify({ error: "2~5개의 Discovery ID가 필요합니다." });
  }

  const results = await db
    .select({
      id: discoveries.id,
      title: discoveries.title,
      status: discoveries.status,
      ownerId: discoveries.ownerId,
      sourceType: discoveries.sourceType,
      createdAt: discoveries.createdAt,
      dueDate: discoveries.dueDate,
    })
    .from(discoveries)
    .where(inArray(discoveries.id, ids));

  // 실험 수, 근거 수 집계
  const expCounts = await db
    .select({
      discoveryId: experiments.discoveryId,
      count: sql<number>`count(*)`,
    })
    .from(experiments)
    .where(inArray(experiments.discoveryId, ids))
    .groupBy(experiments.discoveryId);

  const evCounts = await db
    .select({
      discoveryId: evidence.discoveryId,
      count: sql<number>`count(*)`,
    })
    .from(evidence)
    .where(inArray(evidence.discoveryId, ids))
    .groupBy(evidence.discoveryId);

  // ID → 행 매핑
  const rowMap = new Map(results.map((r) => [r.id, r]));
  const expMap = new Map(expCounts.map((e) => [e.discoveryId, e.count]));
  const evMap = new Map(evCounts.map((e) => [e.discoveryId, e.count]));

  // 마크다운 테이블 생성
  const header = "| 항목 | " + ids.map((id) => rowMap.get(id)?.title?.slice(0, 20) || "(not found)").join(" | ") + " |";
  const sep = "|------|" + ids.map(() => "------").join("|") + "|";
  const rows = [
    "| ID | " + ids.map((id) => id.slice(0, 8)).join(" | ") + " |",
    "| 상태 | " + ids.map((id) => rowMap.get(id)?.status || "-").join(" | ") + " |",
    "| 소유자 | " + ids.map((id) => rowMap.get(id)?.ownerId || "미지정").join(" | ") + " |",
    "| 소스타입 | " + ids.map((id) => rowMap.get(id)?.sourceType || "-").join(" | ") + " |",
    "| 실험 수 | " + ids.map((id) => String(expMap.get(id) || 0)).join(" | ") + " |",
    "| 근거 수 | " + ids.map((id) => String(evMap.get(id) || 0)).join(" | ") + " |",
    "| 생성일 | " + ids.map((id) => {
      const d = rowMap.get(id)?.createdAt;
      return d ? new Date(d).toISOString().slice(0, 10) : "-";
    }).join(" | ") + " |",
  ];

  return JSON.stringify({
    table: [header, sep, ...rows].join("\n"),
    found: results.length,
    notFound: ids.filter((id) => !rowMap.has(id)),
  });
}
```

#### tool-registry.ts — 도구 정의

```typescript
// TOOL_MIN_AUTONOMY에 추가
compare_discoveries: 1,

// AGENT_TOOLS 배열 끝에 추가
{
  name: "compare_discoveries",
  description: "여러 Discovery를 나란히 비교 테이블로 보여줍니다. 2~5개 ID를 지정하세요.",
  input_schema: {
    type: "object",
    required: ["discoveryIds"],
    properties: {
      discoveryIds: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 5,
        description: "비교할 Discovery ID 배열 (2~5개)",
      },
    },
  },
},
```

#### executor.ts — case 추가

```typescript
case "compare_discoveries":
  return compareDiscoveries(db, toolInput as Parameters<typeof compareDiscoveries>[1]);
```

---

## 4. F10: 관련 Discovery 추천

### 4.1 개요

Discovery 상세 페이지에서 Vectorize 기반 유사 Discovery 3~5건을 자동 표시.

### 4.2 수정 파일

| # | 파일 | 변경 | 라인 범위 |
|---|------|------|----------|
| 1 | `app/routes/discoveries.$id.tsx` | loader에 추천 조회 추가 | 57-66행 근처 |
| 2 | `app/routes/discoveries.$id.tsx` | UI에 추천 섹션 추가 | 카드 영역 하단 |
| 3 | `app/components/discovery/RelatedDiscoveries.tsx` | 신규 컴포넌트 | 전체 신규 |

### 4.3 상세 설계

#### discoveries.$id.tsx — loader 수정

```typescript
// 기존 experiments/evidence 조회 블록 아래에 추가
let relatedDiscoveries: Array<{ id: string; score: number; title?: string }> = [];
try {
  const embeddingEnv = {
    OPENAI_API_KEY: (context.cloudflare.env as unknown as Record<string, string>).OPENAI_API_KEY,
    VECTORIZE_DISCOVERIES: (context.cloudflare.env as unknown as Record<string, unknown>).VECTORIZE_DISCOVERIES,
  };
  const { findSimilarDiscoveries } = await import("~/lib/embeddings/embedding-service");
  const queryText = `${discovery.title}\n${discovery.seedSummary || ""}`;
  relatedDiscoveries = (await findSimilarDiscoveries(embeddingEnv, queryText, id, 5))
    .filter((r) => r.score >= 0.7);
} catch {
  // 실패 시 빈 배열 유지
}

// return json({...})에 relatedDiscoveries 추가
```

#### RelatedDiscoveries.tsx — 신규 컴포넌트

```typescript
// app/components/discovery/RelatedDiscoveries.tsx

import { Link } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";

interface RelatedDiscoveriesProps {
  items: Array<{ id: string; score: number; title?: string }>;
}

export function RelatedDiscoveries({ items }: RelatedDiscoveriesProps) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-secondary)]">
          관련 Discovery
        </h3>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/discoveries/${item.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm
                  hover:bg-[var(--dx-surface-card-hover)]
                  text-[var(--axis-text-primary)]"
              >
                <span className="truncate">{item.title || item.id.slice(0, 8)}</span>
                <span className="ml-2 shrink-0 text-xs text-[var(--dx-text-muted)]">
                  {Math.round(item.score * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

**배치**: discoveries.$id.tsx 의 Evidence/KPI 카드 블록 아래, Activity Log 위에 삽입.

---

## 5. F7: Experiment 타임라인 간트차트

### 5.1 개요

Discovery 상세 페이지의 Experiment 섹션에 시간축 기반 SVG 간트차트를 추가한다.

### 5.2 수정 파일

| # | 파일 | 변경 | 라인 범위 |
|---|------|------|----------|
| 1 | `app/components/charts/ExperimentGantt.tsx` | 신규 컴포넌트 | 전체 신규 |
| 2 | `app/routes/discoveries.$id.tsx` | Experiment 섹션에 차트 삽입 | 실험 목록 상단 |

### 5.3 상세 설계

#### ExperimentGantt.tsx — 신규 컴포넌트

```typescript
// app/components/charts/ExperimentGantt.tsx

interface Experiment {
  id: string;
  hypothesis: string;
  status: string;
  createdAt: Date | number | null;
  deadline: Date | number | null;
  updatedAt: Date | number | null;
}

interface ExperimentGanttProps {
  experiments: Experiment[];
}

// 상태별 색상 매핑
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "var(--axis-chart-bar)",           // 진행중
  COMPLETED: "var(--axis-text-success)",     // 완료
  CANCELLED: "var(--axis-text-tertiary)",    // 취소
};

export function ExperimentGantt({ experiments }: ExperimentGanttProps) {
  if (experiments.length === 0) return null;

  // 시간 범위 계산
  const timestamps = experiments.flatMap((e) => [
    e.createdAt ? new Date(e.createdAt).getTime() : null,
    e.deadline ? new Date(e.deadline).getTime() : null,
  ]).filter(Boolean) as number[];

  if (timestamps.length < 2) return null;

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const range = maxTime - minTime || 1;

  // SVG 치수 (WeeklyBar 패턴)
  const barHeight = 24;
  const gap = 8;
  const labelWidth = 120;
  const chartWidth = 400;
  const svgHeight = experiments.length * (barHeight + gap) + gap;

  const toX = (time: number) => labelWidth + ((time - minTime) / range) * chartWidth;

  return (
    <svg
      viewBox={`0 0 ${labelWidth + chartWidth + 40} ${svgHeight}`}
      width="100%"
      height={svgHeight}
      className="overflow-visible"
    >
      {experiments.map((exp, i) => {
        const y = i * (barHeight + gap) + gap;
        const startX = exp.createdAt ? toX(new Date(exp.createdAt).getTime()) : labelWidth;
        const endX = exp.deadline ? toX(new Date(exp.deadline).getTime()) : labelWidth + chartWidth;
        const barWidth = Math.max(endX - startX, 4);
        const color = STATUS_COLORS[exp.status] || "var(--axis-chart-bar)";

        return (
          <g key={exp.id}>
            {/* 가설 레이블 (truncate) */}
            <text
              x={labelWidth - 8}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
              style={{ fill: "var(--axis-text-tertiary)" }}
              fontSize="11"
            >
              {(exp.hypothesis || "실험").slice(0, 12)}
            </text>
            {/* 막대 */}
            <rect
              x={startX}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              style={{ fill: color, opacity: 0.8 }}
            />
            {/* 오늘 마커: 진행 중인 경우 현재 위치 표시 */}
            {exp.status === "ACTIVE" && (
              <line
                x1={toX(Date.now())}
                y1={y - 2}
                x2={toX(Date.now())}
                y2={y + barHeight + 2}
                stroke="var(--axis-text-brand)"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

**디자인 토큰**: 기존 WeeklyBar.tsx와 동일한 `--axis-*` + `--dx-*` 토큰 사용.

---

## 6. F9: Discovery 태그 시스템

### 6.1 개요

discoveries 테이블에 `tags` JSON 컬럼을 추가하고, Agent 도구로 태깅/해제 기능을 제공한다.

### 6.2 수정 파일

| # | 파일 | 변경 | 라인 범위 |
|---|------|------|----------|
| 1 | `app/db/schema.ts` | discoveries 테이블에 `tags` 컬럼 추가 | 168행 근처 |
| 2 | 마이그레이션 SQL (신규) | ALTER TABLE ADD COLUMN | 신규 파일 |
| 3 | `tests/helpers/db.ts` | 마이그레이션 SQL 추가 | 마이그레이션 배열 끝 |
| 4 | `app/lib/agent/tools/discovery-tools.ts` | `tagDiscovery`, `removeDiscoveryTag` 함수 | 파일 끝 |
| 5 | `app/lib/agent/tool-registry.ts` | AGENT_TOOLS 2개 + TOOL_MIN_AUTONOMY 2개 | 배열 끝 |
| 6 | `app/lib/agent/executor.ts` | executeTool case 2개 추가 | 198-205행 사이 |
| 7 | `app/lib/agent/system-prompt.ts` | 태깅 지침 추가 | 시스템 프롬프트 끝 |

### 6.3 상세 설계

#### schema.ts — 컬럼 추가

```typescript
// discoveries 테이블 정의 내, embeddingUpdatedAt 아래에 추가
tags: text("tags", { mode: "json" }).$type<string[]>().default(sql`'[]'`),
```

#### 마이그레이션 SQL

```sql
-- 0014_add_discovery_tags.sql
ALTER TABLE discoveries ADD COLUMN tags TEXT DEFAULT '[]';
```

#### discovery-tools.ts — tagDiscovery 함수

```typescript
export async function tagDiscovery(
  db: DB,
  input: { discoveryId: string; tags: string[] }
): Promise<string> {
  const disc = await db
    .select({ id: discoveries.id, tags: discoveries.tags })
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!disc[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  // 태그 정규화: 소문자, 공백→하이픈, 20자 제한
  const normalize = (t: string) => t.toLowerCase().replace(/\s+/g, "-").slice(0, 20);
  const currentTags: string[] = (disc[0].tags as string[]) || [];
  const newTags = input.tags.map(normalize).filter((t) => t.length > 0);
  const merged = [...new Set([...currentTags, ...newTags])].slice(0, 10);

  await db
    .update(discoveries)
    .set({ tags: merged, updatedAt: new Date() })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "tags_updated", {
    source: "agent",
    added: newTags,
    total: merged.length,
  });

  return JSON.stringify({ success: true, tags: merged });
}

export async function removeDiscoveryTag(
  db: DB,
  input: { discoveryId: string; tags: string[] }
): Promise<string> {
  const disc = await db
    .select({ id: discoveries.id, tags: discoveries.tags })
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!disc[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  const currentTags: string[] = (disc[0].tags as string[]) || [];
  const toRemove = new Set(input.tags.map((t) => t.toLowerCase()));
  const remaining = currentTags.filter((t) => !toRemove.has(t));

  await db
    .update(discoveries)
    .set({ tags: remaining, updatedAt: new Date() })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "tags_updated", {
    source: "agent",
    removed: input.tags,
    total: remaining.length,
  });

  return JSON.stringify({ success: true, tags: remaining });
}
```

#### tool-registry.ts — 도구 정의

```typescript
// TOOL_MIN_AUTONOMY
tag_discovery: 2,
remove_discovery_tag: 2,

// AGENT_TOOLS
{
  name: "tag_discovery",
  description: "Discovery에 태그를 추가합니다. 최대 10개, 소문자 하이픈 형식.",
  input_schema: {
    type: "object",
    required: ["discoveryId", "tags"],
    properties: {
      discoveryId: { type: "string", description: "Discovery ID" },
      tags: {
        type: "array",
        items: { type: "string", maxLength: 20 },
        description: "추가할 태그 배열",
      },
    },
  },
},
{
  name: "remove_discovery_tag",
  description: "Discovery에서 태그를 제거합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId", "tags"],
    properties: {
      discoveryId: { type: "string", description: "Discovery ID" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "제거할 태그 배열",
      },
    },
  },
},
```

#### system-prompt.ts — 태깅 지침

시스템 프롬프트 끝에 추가:
```
### 태깅 지침
Discovery를 생성하거나 업데이트할 때, 내용에 맞는 태그를 2~4개 자동으로 제안하세요.
태그 형식: 소문자, 공백은 하이픈으로 대체, 20자 이내.
예: "ai-헬스케어", "b2b-saas", "내부-비효율", "시장-검증"
```

---

## 7. 전체 수정 파일 매트릭스

| 파일 | F6 | F7 | F8 | F9 | F10 |
|------|:--:|:--:|:--:|:--:|:---:|
| `executor.ts` | M | | M | M | |
| `MessageBubble.tsx` | M | | | | |
| `tool-registry.ts` | | | M | M | |
| `query-tools.ts` | | | M | | |
| `discovery-tools.ts` | | | | M | |
| `schema.ts` | | | | M | |
| `system-prompt.ts` | | | | M | |
| `tests/helpers/db.ts` | | | | M | |
| `discoveries.$id.tsx` | | M | | | M |
| `ExperimentGantt.tsx` | | N | | | |
| `RelatedDiscoveries.tsx` | | | | | N |
| 마이그레이션 SQL | | | | N | |

M = 수정, N = 신규

**총 수정**: 8개 기존 파일 + 3개 신규 파일 + 1개 마이그레이션

---

## 8. 검증 체크리스트

각 항목 구현 후 실행:

```bash
pnpm typecheck    # TypeScript 에러 0
pnpm lint         # ESLint 에러 0
pnpm test         # 561+ 테스트 통과
pnpm build        # 빌드 성공
```

F9 추가 검증:
```bash
pnpm db:generate  # 마이그레이션 생성
pnpm db:migrate   # 로컬 D1 적용
# tests/helpers/db.ts에 SQL 추가 확인
pnpm test         # 마이그레이션 포함 테스트
```
