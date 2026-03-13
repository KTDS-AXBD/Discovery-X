import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/Dialog";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
// Note: 네이티브 <select> 사용 — Radix Select는 Dialog 내에서 compose-refs 충돌 발생
import { DomainTagSelect } from "./DomainTagSelect";
import { FolderTagSelect } from "./FolderTagSelect";
import type { RadarSource, RadarDomain, RadarFolder } from "~/features/radar/db/schema";

// ============================================================================
// Types
// Loader에서 JSON 직렬화 후 Date가 string이 되므로 직렬화 호환 타입 사용
// ============================================================================

type SerializedRadarSource = Omit<RadarSource, "createdAt" | "updatedAt" | "lastCollectedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  lastCollectedAt: string | Date | null;
};

type SerializedRadarDomain = Omit<RadarDomain, "createdAt"> & {
  createdAt: string | Date;
};

type SerializedRadarFolder = Omit<RadarFolder, "createdAt"> & {
  createdAt: string | Date;
};

export interface ChannelFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null이면 신규 생성, 값이 있으면 편집 모드 */
  editSource?: SerializedRadarSource | null;
  editDomains?: SerializedRadarDomain[];
  domains: SerializedRadarDomain[];
  /** 현재 미사용 (서버에서 세션으로 처리) */
  tenantId?: string;
  onSuccess?: () => void;
  onDomainCreate?: (name: string) => void;
  folders?: SerializedRadarFolder[];
  editFolders?: SerializedRadarFolder[];
  onFolderCreate?: (name: string) => void;
}

// ============================================================================
// 수집 간격 옵션
// ============================================================================

const CRAWL_INTERVAL_OPTIONS = [
  { label: "1시간", value: 3600 },
  { label: "6시간", value: 21600 },
  { label: "12시간", value: 43200 },
  { label: "24시간", value: 86400 },
  { label: "3일", value: 259200 },
  { label: "7일", value: 604800 },
];

// ============================================================================
// Component
// ============================================================================

export function ChannelFormModal({
  open,
  onOpenChange,
  editSource,
  editDomains = [],
  domains,
  tenantId: _tenantId,
  onSuccess,
  onDomainCreate,
  folders = [],
  editFolders = [],
  onFolderCreate,
}: ChannelFormModalProps) {
  const isEdit = editSource != null;
  const fetcher = useFetcher();
  const [closing, setClosing] = useState(false);

  // 편집 모드이면 editSource 값을, 아니면 기본값을 사용
  const initialName = editSource?.name ?? "";
  const initialUrl = editSource?.url ?? "";
  const initialSourceType = editSource?.sourceType ?? "rss";
  const initialCrawlInterval = editSource?.crawlInterval ?? 86400;
  const initialKeywords = (editSource?.keywords ?? []).join(", ");
  const initialRadarTags = (editSource?.radarTags ?? []).join(", ");
  const initialDomainIds = editDomains.map((d) => d.id);
  const initialFolderIds = editFolders.map((f) => f.id);

  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [sourceType, setSourceType] = useState(initialSourceType);
  const [crawlInterval, setCrawlInterval] = useState(initialCrawlInterval);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [radarTags, setRadarTags] = useState(initialRadarTags);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>(initialDomainIds);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(initialFolderIds);

  // open 상태가 바뀔 때 (모달이 열릴 때) 폼 값 초기화
  useEffect(() => {
    if (!open) return;
    setName(editSource?.name ?? "");
    setUrl(editSource?.url ?? "");
    setSourceType(editSource?.sourceType ?? "rss");
    setCrawlInterval(editSource?.crawlInterval ?? 86400);
    setKeywords((editSource?.keywords ?? []).join(", "));
    setRadarTags((editSource?.radarTags ?? []).join(", "));
    setSelectedDomainIds(editDomains.map((d) => d.id));
    setSelectedFolderIds(editFolders.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 성공 시 모달 닫기 — Select를 먼저 언마운트한 후 Dialog를 닫음 (Radix compose-refs 루프 방지)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as { success?: boolean };
      if (data.success && !closing) {
        setClosing(true);
      }
    }
  }, [fetcher.state, fetcher.data, closing]);

  useEffect(() => {
    if (closing) {
      const t = setTimeout(() => {
        onOpenChange(false);
        onSuccess?.();
        setClosing(false);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [closing, onOpenChange, onSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();
    if (isEdit) {
      formData.append("intent", "update-full");
      formData.append("id", editSource!.id);
    } else {
      formData.append("intent", "create");
      formData.append("userId", ""); // loader에서 user.id를 실제로 넣어야 하지만 서버에서 처리
    }
    formData.append("name", name);
    formData.append("url", url);
    formData.append("sourceType", sourceType);
    formData.append("crawlInterval", String(crawlInterval));
    formData.append("keywords", keywords);
    formData.append("radarTags", radarTags);
    formData.append("domainIds", JSON.stringify(selectedDomainIds));
    formData.append("folderIds", JSON.stringify(selectedFolderIds));

    fetcher.submit(formData, {
      method: "post",
      action: "/api/radar/sources",
    });
  };

  const isSubmitting = fetcher.state !== "idle";
  const error = fetcher.data && "error" in (fetcher.data as { error?: string })
    ? (fetcher.data as { error: string }).error
    : null;

  return (
    <Dialog open={open && !closing} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "채널 편집" : "채널 추가"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <FormField label="이름" htmlFor="channel-name" required>
              <Input
                id="channel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GeekNews"
                required
              />
            </FormField>

            <FormField label="URL" htmlFor="channel-url" required>
              <Input
                id="channel-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://news.hada.io/rss"
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="유형" htmlFor="channel-type" required>
                <select
                  id="channel-type"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-bg-secondary px-3 py-1 text-sm text-fg shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-fg-brand"
                >
                  <option value="rss">RSS</option>
                  <option value="site">사이트</option>
                  <option value="youtube">YouTube</option>
                  <option value="sns">SNS</option>
                </select>
              </FormField>

              <FormField label="수집 간격" htmlFor="channel-interval">
                <select
                  id="channel-interval"
                  value={String(crawlInterval)}
                  onChange={(e) => setCrawlInterval(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-border bg-bg-secondary px-3 py-1 text-sm text-fg shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-fg-brand"
                >
                  {CRAWL_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="키워드" htmlFor="channel-keywords">
              <Input
                id="channel-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="AI, SaaS, 제조업 (쉼표 구분)"
              />
            </FormField>

            <FormField label="태그" htmlFor="channel-tags">
              <Input
                id="channel-tags"
                value={radarTags}
                onChange={(e) => setRadarTags(e.target.value)}
                placeholder="시장분석, 경쟁사 (쉼표 구분)"
              />
            </FormField>

            <FormField label="도메인 (선택)" htmlFor="channel-domains">
              <DomainTagSelect
                domains={domains}
                selectedIds={selectedDomainIds}
                onChange={setSelectedDomainIds}
                onCreateDomain={onDomainCreate}
              />
            </FormField>

            <FormField label="폴더 (선택)" htmlFor="channel-folders">
              <FolderTagSelect
                folders={folders}
                selectedIds={selectedFolderIds}
                onChange={setSelectedFolderIds}
                onCreateFolder={onFolderCreate}
              />
            </FormField>

            {error && (
              <p className="text-xs text-fg-error">{error}</p>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting || !name || !url}>
              {isSubmitting ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
