/**
 * Lean Canvas 에디터 컴포넌트
 *
 * 9블록 그리드 레이아웃으로 Lean Canvas를 표시/편집
 */

import { useState, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import {
  type LeanCanvasContent,
  type LeanCanvasBlockKey,
  LEAN_CANVAS_BLOCKS,
  createEmptyLeanCanvas,
  calculateLeanCanvasCompleteness,
} from "../schemas/opportunity.schema";

// ============================================================================
// 타입
// ============================================================================

interface LeanCanvasEditorProps {
  artifactId?: string;
  opportunityId: string;
  initialContent?: LeanCanvasContent;
  readOnly?: boolean;
  onClose?: () => void;
}

// ============================================================================
// 블록별 한글 라벨
// ============================================================================

const BLOCK_LABELS_KO: Record<LeanCanvasBlockKey, { title: string; description: string }> = {
  problem: {
    title: "문제",
    description: "고객의 상위 3가지 문제",
  },
  existingAlternatives: {
    title: "기존 대안",
    description: "현재 고객이 사용하는 대안",
  },
  solution: {
    title: "솔루션",
    description: "각 문제에 대한 해결책",
  },
  keyMetrics: {
    title: "핵심 지표",
    description: "성공을 측정할 핵심 KPI",
  },
  uniqueValueProposition: {
    title: "가치 제안",
    description: "명확하고 차별화된 가치",
  },
  highLevelConcept: {
    title: "컨셉",
    description: "'X for Y' 형태로 설명",
  },
  unfairAdvantage: {
    title: "경쟁 우위",
    description: "쉽게 복제할 수 없는 것",
  },
  channels: {
    title: "채널",
    description: "고객에게 도달하는 방법",
  },
  customerSegments: {
    title: "고객 세그먼트",
    description: "타겟 고객 정의",
  },
  earlyAdopters: {
    title: "얼리어답터",
    description: "첫 번째 고객 특성",
  },
  costStructure: {
    title: "비용 구조",
    description: "고정비/변동비",
  },
  revenueStreams: {
    title: "수익 모델",
    description: "가격 전략 및 수익원",
  },
};

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function LeanCanvasEditor({
  artifactId,
  opportunityId,
  initialContent,
  readOnly = false,
  onClose,
}: LeanCanvasEditorProps) {
  const [content, setContent] = useState<LeanCanvasContent>(
    initialContent ?? createEmptyLeanCanvas()
  );
  const [activeBlock, setActiveBlock] = useState<LeanCanvasBlockKey | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";

  const completeness = calculateLeanCanvasCompleteness(content);

  // 블록 업데이트
  const updateBlock = useCallback(
    (blockKey: LeanCanvasBlockKey, items: string[], notes?: string) => {
      setContent((prev) => ({
        ...prev,
        [blockKey]: { items, notes: notes ?? prev[blockKey].notes },
      }));
      setHasChanges(true);
    },
    []
  );

  // 노트 업데이트
  const updateNotes = useCallback(
    (blockKey: LeanCanvasBlockKey, notes: string) => {
      setContent((prev) => ({
        ...prev,
        [blockKey]: { ...prev[blockKey], notes },
      }));
      setHasChanges(true);
    },
    []
  );

  // 저장
  const handleSave = useCallback(() => {
    fetcher.submit(
      {
        intent: artifactId ? "updateLeanCanvas" : "createLeanCanvas",
        opportunityId,
        artifactId: artifactId ?? "",
        content: JSON.stringify(content),
      },
      { method: "post" }
    );
    setHasChanges(false);
  }, [fetcher, artifactId, opportunityId, content]);

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
            Lean Canvas
          </h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-[var(--axis-text-tertiary)]">
            <span>완성도</span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--axis-surface-tertiary)]">
              <div
                className="h-full bg-[var(--axis-surface-brand)] transition-all"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span>{completeness}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              size="sm"
            >
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          )}
          {onClose && (
            <Button variant="secondary" size="sm" onClick={onClose}>
              닫기
            </Button>
          )}
        </div>
      </div>

      {/* Canvas 그리드 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid min-w-[900px] grid-cols-5 gap-2">
          {/* Row 1: Problem, Solution, UVP, Unfair Advantage, Customer Segments */}
          <CanvasBlock
            blockKey="problem"
            content={content.problem}
            labels={BLOCK_LABELS_KO.problem}
            isActive={activeBlock === "problem"}
            onActivate={() => setActiveBlock("problem")}
            onUpdate={(items, notes) => updateBlock("problem", items, notes)}
            onNotesChange={(notes) => updateNotes("problem", notes)}
            readOnly={readOnly}
            rowSpan={2}
          />
          <CanvasBlock
            blockKey="solution"
            content={content.solution}
            labels={BLOCK_LABELS_KO.solution}
            isActive={activeBlock === "solution"}
            onActivate={() => setActiveBlock("solution")}
            onUpdate={(items, notes) => updateBlock("solution", items, notes)}
            onNotesChange={(notes) => updateNotes("solution", notes)}
            readOnly={readOnly}
          />
          <CanvasBlock
            blockKey="uniqueValueProposition"
            content={content.uniqueValueProposition}
            labels={BLOCK_LABELS_KO.uniqueValueProposition}
            isActive={activeBlock === "uniqueValueProposition"}
            onActivate={() => setActiveBlock("uniqueValueProposition")}
            onUpdate={(items, notes) => updateBlock("uniqueValueProposition", items, notes)}
            onNotesChange={(notes) => updateNotes("uniqueValueProposition", notes)}
            readOnly={readOnly}
            rowSpan={2}
            highlight
          />
          <CanvasBlock
            blockKey="unfairAdvantage"
            content={content.unfairAdvantage}
            labels={BLOCK_LABELS_KO.unfairAdvantage}
            isActive={activeBlock === "unfairAdvantage"}
            onActivate={() => setActiveBlock("unfairAdvantage")}
            onUpdate={(items, notes) => updateBlock("unfairAdvantage", items, notes)}
            onNotesChange={(notes) => updateNotes("unfairAdvantage", notes)}
            readOnly={readOnly}
          />
          <CanvasBlock
            blockKey="customerSegments"
            content={content.customerSegments}
            labels={BLOCK_LABELS_KO.customerSegments}
            isActive={activeBlock === "customerSegments"}
            onActivate={() => setActiveBlock("customerSegments")}
            onUpdate={(items, notes) => updateBlock("customerSegments", items, notes)}
            onNotesChange={(notes) => updateNotes("customerSegments", notes)}
            readOnly={readOnly}
            rowSpan={2}
          />

          {/* Row 2: (Problem spans), Key Metrics, (UVP spans), Channels, (Customer Segments spans) */}
          <CanvasBlock
            blockKey="keyMetrics"
            content={content.keyMetrics}
            labels={BLOCK_LABELS_KO.keyMetrics}
            isActive={activeBlock === "keyMetrics"}
            onActivate={() => setActiveBlock("keyMetrics")}
            onUpdate={(items, notes) => updateBlock("keyMetrics", items, notes)}
            onNotesChange={(notes) => updateNotes("keyMetrics", notes)}
            readOnly={readOnly}
          />
          <CanvasBlock
            blockKey="channels"
            content={content.channels}
            labels={BLOCK_LABELS_KO.channels}
            isActive={activeBlock === "channels"}
            onActivate={() => setActiveBlock("channels")}
            onUpdate={(items, notes) => updateBlock("channels", items, notes)}
            onNotesChange={(notes) => updateNotes("channels", notes)}
            readOnly={readOnly}
          />

          {/* Row 3: Cost Structure, Revenue Streams */}
          <div className="col-span-2">
            <CanvasBlock
              blockKey="costStructure"
              content={content.costStructure}
              labels={BLOCK_LABELS_KO.costStructure}
              isActive={activeBlock === "costStructure"}
              onActivate={() => setActiveBlock("costStructure")}
              onUpdate={(items, notes) => updateBlock("costStructure", items, notes)}
              onNotesChange={(notes) => updateNotes("costStructure", notes)}
              readOnly={readOnly}
            />
          </div>
          <div className="col-span-3">
            <CanvasBlock
              blockKey="revenueStreams"
              content={content.revenueStreams}
              labels={BLOCK_LABELS_KO.revenueStreams}
              isActive={activeBlock === "revenueStreams"}
              onActivate={() => setActiveBlock("revenueStreams")}
              onUpdate={(items, notes) => updateBlock("revenueStreams", items, notes)}
              onNotesChange={(notes) => updateNotes("revenueStreams", notes)}
              readOnly={readOnly}
            />
          </div>
        </div>

        {/* 추가 블록: 기존 대안, 얼리어답터, 컨셉 */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <CanvasBlock
            blockKey="existingAlternatives"
            content={content.existingAlternatives}
            labels={BLOCK_LABELS_KO.existingAlternatives}
            isActive={activeBlock === "existingAlternatives"}
            onActivate={() => setActiveBlock("existingAlternatives")}
            onUpdate={(items, notes) => updateBlock("existingAlternatives", items, notes)}
            onNotesChange={(notes) => updateNotes("existingAlternatives", notes)}
            readOnly={readOnly}
            secondary
          />
          <CanvasBlock
            blockKey="highLevelConcept"
            content={content.highLevelConcept}
            labels={BLOCK_LABELS_KO.highLevelConcept}
            isActive={activeBlock === "highLevelConcept"}
            onActivate={() => setActiveBlock("highLevelConcept")}
            onUpdate={(items, notes) => updateBlock("highLevelConcept", items, notes)}
            onNotesChange={(notes) => updateNotes("highLevelConcept", notes)}
            readOnly={readOnly}
            secondary
          />
          <CanvasBlock
            blockKey="earlyAdopters"
            content={content.earlyAdopters}
            labels={BLOCK_LABELS_KO.earlyAdopters}
            isActive={activeBlock === "earlyAdopters"}
            onActivate={() => setActiveBlock("earlyAdopters")}
            onUpdate={(items, notes) => updateBlock("earlyAdopters", items, notes)}
            onNotesChange={(notes) => updateNotes("earlyAdopters", notes)}
            readOnly={readOnly}
            secondary
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Canvas 블록 컴포넌트
// ============================================================================

interface CanvasBlockProps {
  blockKey: LeanCanvasBlockKey;
  content: { items: string[]; notes?: string };
  labels: { title: string; description: string };
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (items: string[], notes?: string) => void;
  onNotesChange: (notes: string) => void;
  readOnly: boolean;
  rowSpan?: number;
  highlight?: boolean;
  secondary?: boolean;
}

function CanvasBlock({
  blockKey: _blockKey,
  content,
  labels,
  isActive,
  onActivate,
  onUpdate,
  onNotesChange,
  readOnly,
  rowSpan = 1,
  highlight = false,
  secondary = false,
}: CanvasBlockProps) {
  const [newItem, setNewItem] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const handleAddItem = () => {
    if (newItem.trim()) {
      onUpdate([...content.items, newItem.trim()]);
      setNewItem("");
    }
  };

  const handleRemoveItem = (index: number) => {
    onUpdate(content.items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddItem();
    }
  };

  return (
    <div
      className={`flex flex-col rounded-lg border p-3 transition-colors ${
        highlight
          ? "border-[var(--axis-border-brand)] bg-[var(--axis-surface-brand-subtle)]"
          : secondary
            ? "border-[var(--axis-border-default)] bg-[var(--axis-surface-tertiary)]"
            : "border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
      } ${isActive ? "ring-2 ring-[var(--axis-border-brand)]" : ""} ${
        rowSpan === 2 ? "row-span-2" : ""
      }`}
      onClick={onActivate}
    >
      {/* 블록 헤더 */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          {labels.title}
        </h3>
        <p className="text-xs text-[var(--axis-text-tertiary)]">{labels.description}</p>
      </div>

      {/* 아이템 목록 */}
      <div className="flex-1 space-y-1">
        {content.items.length === 0 && !isEditing ? (
          <p className="text-xs italic text-[var(--axis-text-tertiary)]">
            {readOnly ? "내용 없음" : "클릭하여 추가"}
          </p>
        ) : (
          <ul className="space-y-1">
            {content.items.map((item, index) => (
              <li
                key={index}
                className="group flex items-start gap-1 text-sm text-[var(--axis-text-secondary)]"
              >
                <span className="shrink-0 text-[var(--axis-text-tertiary)]">•</span>
                <span className="flex-1 break-words">{item}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveItem(index);
                    }}
                    className="shrink-0 text-[var(--axis-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--axis-text-destructive)] group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 입력 필드 */}
      {!readOnly && isActive && (
        <div className="mt-2 border-t border-[var(--axis-border-default)] pt-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            placeholder="새 항목 입력 후 Enter"
            className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-sm placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
          />
          {/* 노트 입력 */}
          <textarea
            value={content.notes ?? ""}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="mt-2 w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-xs placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
          />
        </div>
      )}

      {/* 노트 표시 (읽기 전용 또는 비활성 상태) */}
      {content.notes && !isActive && (
        <div className="mt-2 border-t border-[var(--axis-border-default)] pt-2">
          <p className="text-xs italic text-[var(--axis-text-tertiary)]">{content.notes}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Lean Canvas 뷰어 (읽기 전용 요약)
// ============================================================================

interface LeanCanvasViewerProps {
  content: LeanCanvasContent;
  onEdit?: () => void;
}

export function LeanCanvasViewer({ content, onEdit }: LeanCanvasViewerProps) {
  const completeness = calculateLeanCanvasCompleteness(content);
  const filledBlocks = LEAN_CANVAS_BLOCKS.filter((block) => {
    const blockContent = content[block.key as LeanCanvasBlockKey];
    return blockContent.items.length > 0 || (blockContent.notes && blockContent.notes.trim());
  });

  return (
    <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-[var(--axis-text-primary)]">Lean Canvas</h4>
          <span className="text-sm text-[var(--axis-text-tertiary)]">{completeness}% 완성</span>
        </div>
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            편집
          </Button>
        )}
      </div>

      {filledBlocks.length === 0 ? (
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          아직 작성된 내용이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {filledBlocks.slice(0, 6).map((block) => {
            const blockContent = content[block.key as LeanCanvasBlockKey];
            return (
              <div
                key={block.key}
                className="rounded-md bg-[var(--axis-surface-tertiary)] p-2"
              >
                <span className="text-xs font-medium text-[var(--axis-text-tertiary)]">
                  {BLOCK_LABELS_KO[block.key as LeanCanvasBlockKey].title}
                </span>
                <p className="mt-1 text-sm text-[var(--axis-text-secondary)] line-clamp-2">
                  {blockContent.items.slice(0, 2).join(", ") || blockContent.notes}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {filledBlocks.length > 6 && (
        <p className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
          +{filledBlocks.length - 6}개 더 작성됨
        </p>
      )}
    </div>
  );
}
