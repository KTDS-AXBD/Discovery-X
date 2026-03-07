/**
 * 계획 전환 다이얼로그 — 반영(ACCEPTED) → 계획(PLANNED)
 * 표준 분류 체계 메타데이터 입력: 유형, 도메인, 영향도, 긴급도, SPEC 연동, 마일스톤
 */

import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "~/components/ui/Dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/Select";
import type { RequestWithReview } from "../types";
import {
  TYPE_LABELS,
  DOMAIN_LABELS,
  computePriorityLevel,
  PRIORITY_LEVEL_LABELS,
} from "../constants";

interface PlanDialogProps {
  request: RequestWithReview | null;
  open: boolean;
  onClose: () => void;
}

export function PlanDialog({ request, open, onClose }: PlanDialogProps) {
  const fetcher = useFetcher();
  const [type, setType] = useState("feature");
  const [domain, setDomain] = useState("");
  const [impactLevel, setImpactLevel] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState("");
  const [specItemId, setSpecItemId] = useState("");
  const [milestoneVersion, setMilestoneVersion] = useState("");

  const priorityLevel = computePriorityLevel(impactLevel, urgencyLevel);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;

    fetcher.submit(
      JSON.stringify({
        lifecycleAction: "plan",
        type,
        domain: domain || undefined,
        impactLevel: impactLevel || undefined,
        urgencyLevel: urgencyLevel || undefined,
        specItemId: specItemId.trim() || undefined,
        milestoneVersion: milestoneVersion.trim() || undefined,
      }),
      { method: "PATCH", action: `/api/requests/${request.id}`, encType: "application/json" },
    );
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>계획 전환</DialogTitle>
          <DialogDescription>
            {request?.reqCode ?? request?.title} — 표준 분류 메타데이터를 입력하세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 유형 x 도메인 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">유형</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">도메인</label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOMAIN_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 영향도 x 긴급도 → P-level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">영향도</label>
              <Select value={impactLevel} onValueChange={setImpactLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">긴급도</label>
              <Select value={urgencyLevel} onValueChange={setUrgencyLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* P-level 표시 */}
          {priorityLevel && (
            <div className="rounded-md bg-surface-secondary px-3 py-2 text-sm font-medium text-fg font-mono-dx">
              {PRIORITY_LEVEL_LABELS[priorityLevel]}
            </div>
          )}

          {/* SPEC 연동 + 마일스톤 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">SPEC F항목</label>
              <Input
                placeholder="예: F31"
                value={specItemId}
                onChange={(e) => setSpecItemId(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-secondary">마일스톤</label>
              <Input
                placeholder="예: 0.6.0"
                value={milestoneVersion}
                onChange={(e) => setMilestoneVersion(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">취소</Button>
            </DialogClose>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? "전환 중..." : "계획으로 전환"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
