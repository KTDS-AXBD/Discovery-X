---
code: DX-DSGN-014
title: Radar 폴더 시스템 고도화 — 채널↔폴더 연결 + 편집 + 색상 + 순서 + 필터
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-12
updated: 2026-03-12
author: Sinclair Seo
---

# Radar 폴더 시스템 고도화 — 설계 문서

> F41 Phase 4 | DX-REQ-012 | [[DX-PLAN-009]] §7 항목 22~27
>
> Plan v0.4의 Phase 4 범위를 구현 수준으로 상세화한다.

---

## 0. Design Scope

이 문서는 DX-PLAN-009의 **Phase 4** 범위를 다룬다:

| 포함 | 제외 (완료됨) |
|------|-------------|
| ChannelFormModal에 폴더 선택 UI 추가 | `radar_folders` / `radar_source_folders` 테이블 (0061 ✅) |
| `api.radar.sources` intent=update-full에 folderIds 처리 | 폴더 CRUD 서비스 (listFolders/createFolder/deleteFolder ✅) |
| 폴더 편집 UI (이름/설명/색상) | `/api/radar/folders` GET/POST intent=create/update/delete ✅ |
| 프리셋 컬러 팔레트 | 접이식 그룹 뷰 (도메인별/폴더별/유형별 ✅) |
| 폴더 순서 관리 (sortOrder + reorder API) | 인라인 폴더 생성/삭제 ✅ |
| 필터 바에 폴더 드롭다운 | getRadarData 폴더 매핑 ✅ |

### Phase 4 기반 (구현 완료 상태)

- **DB**: `radar_folders` (id, name, description, color, sort_order, tenant_id, created_at) + `radar_source_folders` (id, source_id, folder_id, UNIQUE) — 0061 마이그레이션, 프로덕션 적용
- **서비스**: `RadarService.listFolders()`, `createFolder()`, `updateFolder()`, `deleteFolder()`, `setSourceFolders()`, `listSourcesWithFolders()` — 전부 구현 완료
- **API**: `/api/radar/folders` — GET 목록 / POST intent=create|update|delete — 구현 완료
- **UI**: ChannelManagementTab에 "폴더별" 그룹핑 + 인라인 생성/삭제 — 구현 완료
- **Gap**: 채널↔폴더 연결 UI 없음, 폴더 편집 UI 없음, 색상 지정 없음, 순서 관리 없음, 폴더 필터 없음

---

## 1. 변경 요약

**DB 변경: 없음** — 기존 스키마로 충분

**서비스 변경: 1개 추가**
- `api.radar.folders` intent=reorder 핸들러 추가

**타입 변경: 1개 확장**
- `UpdateSourceFullInput`에 `folderIds?: string[]` 추가

**UI 변경: 4개 파일**

| 파일 | 변경 |
|------|------|
| `ChannelFormModal.tsx` | 폴더 선택 UI 추가 (`FolderTagSelect`) |
| `ChannelManagementTab.tsx` | 폴더 필터 드롭다운 + 폴더 편집 인라인 UI + 순서 ↑↓ 버튼 |
| `FolderTagSelect.tsx` | **신규** — DomainTagSelect 패턴 재사용, 폴더 멀티 선택 |
| `ColorPicker.tsx` | **신규** — 프리셋 컬러 팔레트 (도메인/폴더 공용) |

---

## 2. 서비스 레이어 변경

### 2.1 UpdateSourceFullInput 확장

```typescript
// app/features/radar/service/radar.service.ts

interface UpdateSourceFullInput {
  id: string;
  name?: string;
  url?: string;
  sourceType?: string;
  keywords?: string[];
  radarTags?: string[];
  crawlInterval?: number;
  domainIds?: string[];
  folderIds?: string[];   // ★ 추가
}
```

`updateSourceFull()` 메서드에 폴더 동기화 추가:

```typescript
async updateSourceFull(input: UpdateSourceFullInput): Promise<void> {
  // ... 기존 필드 업데이트 ...

  // 도메인 동기화 (기존)
  if (input.domainIds !== undefined) {
    await this.setSourceDomains(input.id, input.domainIds);
  }

  // ★ 폴더 동기화 (추가)
  if (input.folderIds !== undefined) {
    await this.setSourceFolders(input.id, input.folderIds);
  }
}
```

### 2.2 폴더 순서 관리

기존 `updateFolder()` 메서드가 sortOrder를 이미 지원하므로, reorder는 **배치 업데이트**만 추가:

```typescript
/** 폴더 순서 일괄 변경 */
async reorderFolders(orderedIds: string[]): Promise<void> {
  // orderedIds[0]이 sortOrder=0, [1]이 1, ...
  for (let i = 0; i < orderedIds.length; i++) {
    await this.db
      .update(radarFolders)
      .set({ sortOrder: i })
      .where(eq(radarFolders.id, orderedIds[i]));
  }
}
```

---

## 3. API 라우트 변경

### 3.1 `api.radar.sources.ts` — intent=update-full 확장

```typescript
// intent=update-full 블록에 추가:

const folderIdsRaw = formData.get("folderIds");
let folderIds: string[] | undefined;
if (folderIdsRaw !== null) {
  try { folderIds = JSON.parse(String(folderIdsRaw)); } catch { folderIds = []; }
}

await service.updateSourceFull({
  id, name, url, sourceType, keywords, radarTags, crawlInterval,
  domainIds,
  folderIds,   // ★ 추가
});
```

### 3.2 `api.radar.sources.ts` — intent=create 확장

```typescript
// intent=create 블록의 domainIds 처리 다음에 추가:

const folderIdsRaw = formData.get("folderIds");
if (folderIdsRaw !== null) {
  let folderIds: string[] = [];
  try { folderIds = JSON.parse(String(folderIdsRaw)); } catch { folderIds = []; }
  if (folderIds.length > 0) {
    await service.setSourceFolders(id, folderIds);
  }
}
```

### 3.3 `api.radar.folders.ts` — intent=reorder 추가

```typescript
if (intent === "reorder") {
  const idsRaw = String(formData.get("orderedIds") || "");
  let orderedIds: string[] = [];
  try { orderedIds = JSON.parse(idsRaw); } catch { /* */ }
  if (orderedIds.length === 0) {
    return json({ error: "orderedIds는 필수입니다." }, { status: 400 });
  }
  await service.reorderFolders(orderedIds);
  return json({ success: true });
}
```

---

## 4. UI 설계

### 4.1 FolderTagSelect (신규 — DomainTagSelect 패턴)

`DomainTagSelect`와 동일한 UX 패턴으로, 폴더 멀티 선택 컴포넌트:

```
app/features/radar/ui/FolderTagSelect.tsx
```

```
┌─ 폴더 (선택) ────────────────────────────────┐
│  [리서치 ×] [경쟁사 ×]                         │
│                                                │
│  [폴더 검색 또는 추가...            ]          │
│  ┌────────────────────────────────┐            │
│  │ ● 주요 채널                    │            │
│  │ ● 보류 중                      │            │
│  │ + "새폴더" 폴더 생성            │            │
│  └────────────────────────────────┘            │
│  ※ 폴더 분류는 선택사항이에요                   │
└────────────────────────────────────────────────┘
```

Props:
```typescript
interface FolderTagSelectProps {
  folders: SerializedRadarFolder[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateFolder?: (name: string) => void;
}
```

### 4.2 ColorPicker (신규 — 프리셋 팔레트)

도메인과 폴더 모두에서 사용할 수 있는 공용 컬러 선택 컴포넌트:

```
app/features/radar/ui/ColorPicker.tsx
```

```
┌─ 색상 ───────────────────┐
│  ● ● ● ● ● ● ● ●        │
│  (8색 프리셋 원형 버튼)    │
│  선택: ● #3B82F6          │
└───────────────────────────┘
```

프리셋 팔레트 (8색):
```typescript
const PRESET_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6B7280", // gray
] as const;
```

Props:
```typescript
interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
}
```

### 4.3 ChannelFormModal 변경

**추가 필드**: 도메인 선택 아래에 폴더 선택 추가

```diff
  <FormField label="도메인 (선택)" htmlFor="channel-domains">
    <DomainTagSelect ... />
  </FormField>

+ <FormField label="폴더 (선택)" htmlFor="channel-folders">
+   <FolderTagSelect
+     folders={folders}
+     selectedIds={selectedFolderIds}
+     onChange={setSelectedFolderIds}
+     onCreateFolder={onFolderCreate}
+   />
+ </FormField>
```

**Props 확장**:
```typescript
export interface ChannelFormModalProps {
  // ... 기존 props ...
  folders?: SerializedRadarFolder[];          // ★ 추가
  editFolders?: SerializedRadarFolder[];      // ★ 추가
  onFolderCreate?: (name: string) => void;    // ★ 추가
}
```

**handleSubmit 확장**:
```typescript
formData.append("folderIds", JSON.stringify(selectedFolderIds));
```

### 4.4 ChannelManagementTab 변경

#### 4.4.1 폴더 필터 드롭다운

도메인 필터 옆에 폴더 필터 추가:

```diff
  {/* 도메인 필터 */}
  {domains.length > 0 && (
    <Select value={filterDomainId} onValueChange={setFilterDomainId}>
      ...
    </Select>
  )}

+ {/* 폴더 필터 */}
+ {folders.length > 0 && (
+   <Select value={filterFolderId} onValueChange={setFilterFolderId}>
+     <SelectTrigger className="w-36 h-8 text-sm">
+       <SelectValue placeholder="전체 폴더" />
+     </SelectTrigger>
+     <SelectContent>
+       <SelectItem value="all">전체 폴더</SelectItem>
+       {folders.map((f) => (
+         <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
+       ))}
+     </SelectContent>
+   </Select>
+ )}
```

**필터 로직 추가**:
```typescript
const [filterFolderId, setFilterFolderId] = useState<string>("all");

// filtered에 조건 추가:
if (filterFolderId !== "all" && !(item.folders ?? []).some((f) => f.id === filterFolderId)) return false;
```

#### 4.4.2 폴더 편집 인라인 UI

폴더별 그룹핑 시, 그룹 헤더에 편집 버튼 추가 (삭제 버튼 옆):

```
┌─ 리서치 ● ──────── (5) [✏️] [🗑] ─────────────┐
```

편집 클릭 시 인라인 폼 전환:

```
┌─ [리서치____] [● 색상] [확인] [취소] ──────────┐
```

```typescript
// 그룹 헤더 편집 모드 상태
const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
const [editFolderName, setEditFolderName] = useState("");
const [editFolderColor, setEditFolderColor] = useState("");
```

편집 submit:
```typescript
const handleFolderUpdate = (id: string) => {
  folderFetcher.submit(
    { intent: "update", id, name: editFolderName, color: editFolderColor },
    { method: "post", action: "/api/radar/folders" },
  );
  setEditingFolderId(null);
};
```

#### 4.4.3 폴더 순서 ↑↓ 버튼

폴더별 그룹핑 시, 그룹 헤더에 순서 이동 버튼:

```
┌─ 리서치 ● ──── (5) [↑] [↓] [✏️] [🗑] ────────┐
```

```typescript
const handleFolderReorder = (folderId: string, direction: "up" | "down") => {
  const currentFolders = [...folders].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = currentFolders.findIndex((f) => f.id === folderId);
  if (direction === "up" && idx <= 0) return;
  if (direction === "down" && idx >= currentFolders.length - 1) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  [currentFolders[idx], currentFolders[swapIdx]] = [currentFolders[swapIdx], currentFolders[idx]];

  const orderedIds = currentFolders.map((f) => f.id);
  folderFetcher.submit(
    { intent: "reorder", orderedIds: JSON.stringify(orderedIds) },
    { method: "post", action: "/api/radar/folders" },
  );
};
```

#### 4.4.4 폴더 인라인 생성 — 색상 포함

기존 `AddInline`을 확장하여 생성 시 색상도 선택 가능:

```diff
- <AddInline label="+ 폴더" placeholder="폴더 이름" onAdd={handleFolderCreate} />
+ <AddFolderInline onAdd={handleFolderCreateWithColor} />
```

`handleFolderCreateWithColor(name, color)` → folderFetcher에 color 포함 전송.

### 4.5 ChannelManagementTab에 editFolders 전달

ChannelManagementTab → ChannelFormModal 호출 시, 현재 소스에 연결된 폴더 정보도 전달:

```typescript
const handleEdit = (source: SerializedRadarSource, srcDomains: SerializedRadarDomain[]) => {
  setEditSource(source);
  setEditDomains(srcDomains);
  // ★ 추가: 해당 소스의 폴더 정보
  const srcFolders = sourcesWithDomains.find(s => s.source.id === source.id)?.folders ?? [];
  setEditFolders(srcFolders);
  setModalOpen(true);
};
```

---

## 5. 데이터 흐름

### 5.1 채널 생성 + 폴더 연결

```
사용자 → [+ 채널 추가]
  → ChannelFormModal (기존 필드 + 폴더 선택)
  → POST api.radar.sources (intent=create, folderIds=[...])
  → RadarService.createSource() + setSourceDomains() + setSourceFolders()
  → Remix revalidation → 폴더별 그룹에 즉시 반영
```

### 5.2 채널 편집 + 폴더 변경

```
채널 카드 [편집] → ChannelFormModal (editFolders 포함)
  → POST api.radar.sources (intent=update-full, folderIds=[...])
  → RadarService.updateSourceFull() → setSourceFolders()
  → Remix revalidation
```

### 5.3 폴더 편집 (인라인)

```
그룹 헤더 [✏️] → 인라인 폼 (이름 + 색상)
  → POST api.radar.folders (intent=update, id, name, color)
  → RadarService.updateFolder()
  → Remix revalidation → 그룹 헤더 즉시 갱신
```

### 5.4 폴더 순서 변경

```
그룹 헤더 [↑][↓] → handleFolderReorder()
  → POST api.radar.folders (intent=reorder, orderedIds=[...])
  → RadarService.reorderFolders()
  → Remix revalidation → 그룹 순서 즉시 반영
```

---

## 6. 구현 순서

```
1. FolderTagSelect 컴포넌트 (신규)
   └── DomainTagSelect 패턴 복제 → 폴더용 수정

2. ColorPicker 컴포넌트 (신규)
   └── 8색 프리셋 원형 버튼

3. ChannelFormModal 확장
   ├── Props에 folders/editFolders/onFolderCreate 추가
   ├── FolderTagSelect 배치 (도메인 선택 아래)
   └── handleSubmit에 folderIds append

4. api.radar.sources.ts 확장
   ├── intent=create에 folderIds 처리 추가
   └── intent=update-full에 folderIds 처리 추가

5. RadarService.updateSourceFull() 확장
   └── folderIds → setSourceFolders() 연결

6. api.radar.folders.ts 확장
   └── intent=reorder 핸들러 추가

7. RadarService.reorderFolders() 추가

8. ChannelManagementTab 확장
   ├── 폴더 필터 드롭다운 (filterFolderId)
   ├── 폴더 편집 인라인 UI (이름 + ColorPicker)
   ├── 폴더 순서 ↑↓ 버튼
   ├── 인라인 폴더 생성에 색상 포함
   └── editFolders 상태 + ChannelFormModal 전달

9. 검증
   └── /ax-04-verify all
```

---

## 7. 테스트 계획

| 영역 | 테스트 | 파일 |
|------|--------|------|
| reorderFolders | 순서 변경, 빈 배열, 존재하지 않는 ID | 기존 `radar-service.test.ts` 확장 |
| updateSourceFull + folderIds | 폴더 동기화, 기존 도메인 유지 확인 | 기존 `radar-service.test.ts` 확장 |
| API intent=create + folderIds | 생성 시 폴더 연결 검증 | 기존 API 통합 테스트 확장 |
| API intent=reorder | 정상 순서 + 에러 케이스 | 기존 API 통합 테스트 확장 |

예상 테스트 수: 10~15개 추가

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| reorderFolders N회 UPDATE | 폴더 수가 적어 (< 20) 성능 무관 | 필요 시 CASE WHEN 단일 쿼리로 최적화 |
| FolderTagSelect ↔ DomainTagSelect 중복 | 코드 중복 | 공통 TagSelect 추출은 Phase 5+로 보류 (YAGNI) |
| 인라인 편집 UX 복잡도 | 그룹 헤더에 버튼 4개 (↑↓✏️🗑) | 화면 폭 부족 시 ⋮ 메뉴로 전환 검토 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-12 | Initial — Phase 4 설계 (폴더↔채널 연결, 편집, 색상, 순서, 필터) | Sinclair Seo |
