import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { eq, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { featureRequests } from "~/features/requests/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "~/components/ui/Dialog";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "접수",
  IN_REVIEW: "검토 중",
  ACCEPTED: "반영",
  REJECTED: "보류",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  OPEN: "default",
  IN_REVIEW: "secondary",
  ACCEPTED: "success",
  REJECTED: "destructive",
};

const PRIORITY_BADGE_VARIANT: Record<string, "destructive" | "warning" | "subtle"> = {
  high: "destructive",
  medium: "warning",
  low: "subtle",
};

interface FeatureRequestRow {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  reason: string | null;
  submitterId: string;
  reviewerId: string | null;
  linkedDiscoveryId: string | null;
  linkedIdeaId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  submitterName: string | null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const rows = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      description: featureRequests.description,
      priority: featureRequests.priority,
      status: featureRequests.status,
      reason: featureRequests.reason,
      submitterId: featureRequests.submitterId,
      reviewerId: featureRequests.reviewerId,
      linkedDiscoveryId: featureRequests.linkedDiscoveryId,
      linkedIdeaId: featureRequests.linkedIdeaId,
      createdAt: featureRequests.createdAt,
      reviewedAt: featureRequests.reviewedAt,
      submitterName: users.name,
    })
    .from(featureRequests)
    .leftJoin(users, eq(featureRequests.submitterId, users.id))
    .orderBy(desc(featureRequests.createdAt));

  return json({
    requests: rows,
    user: ctx.user,
    tenantRole: ctx.tenantRole,
  });
}

function daysAgo(dateStr: string): string {
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "오늘";
  return `${days}일 전`;
}

export default function RequestsPage() {
  const { requests, user, tenantRole } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher();
  const statusFetcher = useFetcher();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<FeatureRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isReviewer = tenantRole === "admin" || tenantRole === "gatekeeper" || tenantRole === "owner";

  const filtered = (requests as FeatureRequestRow[]).filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
    return true;
  });

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const priority = form.get("priority") as string;

    if (!title?.trim() || !description?.trim()) return;

    createFetcher.submit(
      JSON.stringify({ title: title.trim(), description: description.trim(), priority }),
      { method: "POST", action: "/api/requests", encType: "application/json" },
    );
    setCreateOpen(false);
  }

  function handleStatusChange(id: string, newStatus: string) {
    const payload: Record<string, string> = { status: newStatus };
    if (newStatus === "REJECTED" && rejectReason.trim()) {
      payload.reason = rejectReason.trim();
    }
    statusFetcher.submit(JSON.stringify(payload), {
      method: "PATCH",
      action: `/api/requests/${id}`,
      encType: "application/json",
    });
    setDetailItem(null);
    setRejectReason("");
  }

  function handleDelete(id: string) {
    statusFetcher.submit(null, {
      method: "DELETE",
      action: `/api/requests/${id}`,
    });
    setDetailItem(null);
  }

  return (
    <AppShell user={user} hideSidebar>
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-fg">요구사항</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            요구사항 등록
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="OPEN">접수</SelectItem>
              <SelectItem value="IN_REVIEW">검토 중</SelectItem>
              <SelectItem value="ACCEPTED">반영</SelectItem>
              <SelectItem value="REJECTED">보류</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="우선순위" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 우선순위</SelectItem>
              <SelectItem value="high">높음</SelectItem>
              <SelectItem value="medium">보통</SelectItem>
              <SelectItem value="low">낮음</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-fg-tertiary">
            {requests.length === 0 ? "등록된 요구사항이 없습니다." : "필터 조건에 맞는 요구사항이 없습니다."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetailItem(r)}
                className="w-full rounded-lg border border-line bg-surface-card p-4 text-left transition-colors hover:bg-surface-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{r.title}</span>
                      <Badge variant={PRIORITY_BADGE_VARIANT[r.priority] ?? "subtle"} className="shrink-0 text-[10px]">
                        {PRIORITY_LABELS[r.priority] ?? r.priority}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-fg-secondary">{r.description}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-fg-tertiary">
                      <span>{r.submitterName ?? "알 수 없음"}</span>
                      <span>{daysAgo(r.createdAt)}</span>
                    </div>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[r.status] ?? "default"} className="shrink-0">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>요구사항 등록</DialogTitle>
              <DialogDescription>기능 개선 요청을 등록합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="req-title" className="mb-1 block text-sm font-medium text-fg">제목</label>
                <Input id="req-title" name="title" placeholder="요구사항 제목" required />
              </div>
              <div>
                <label htmlFor="req-desc" className="mb-1 block text-sm font-medium text-fg">설명</label>
                <Textarea id="req-desc" name="description" rows={4} placeholder="상세 설명을 작성하세요" required />
              </div>
              <div>
                <label htmlFor="req-priority" className="mb-1 block text-sm font-medium text-fg">우선순위</label>
                <select
                  id="req-priority"
                  name="priority"
                  defaultValue="medium"
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
                >
                  <option value="high">높음</option>
                  <option value="medium">보통</option>
                  <option value="low">낮음</option>
                </select>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" type="button">취소</Button>
                </DialogClose>
                <Button type="submit" disabled={createFetcher.state !== "idle"}>
                  {createFetcher.state !== "idle" ? "등록 중..." : "등록"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) { setDetailItem(null); setRejectReason(""); } }}>
          <DialogContent>
            {detailItem && (
              <>
                <DialogHeader>
                  <DialogTitle>{detailItem.title}</DialogTitle>
                  <DialogDescription>
                    <span className="mr-2">{detailItem.submitterName ?? "알 수 없음"}</span>
                    <span>{daysAgo(detailItem.createdAt)}</span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Badge variant={PRIORITY_BADGE_VARIANT[detailItem.priority] ?? "subtle"}>
                      {PRIORITY_LABELS[detailItem.priority] ?? detailItem.priority}
                    </Badge>
                    <Badge variant={STATUS_BADGE_VARIANT[detailItem.status] ?? "default"}>
                      {STATUS_LABELS[detailItem.status] ?? detailItem.status}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-fg-secondary">{detailItem.description}</p>
                  {detailItem.reason && (
                    <div className="rounded-md bg-surface-secondary p-3 text-sm">
                      <span className="font-medium text-fg">보류 사유: </span>
                      <span className="text-fg-secondary">{detailItem.reason}</span>
                    </div>
                  )}

                  {/* Reviewer actions */}
                  {isReviewer && detailItem.status !== "ACCEPTED" && detailItem.status !== "REJECTED" && (
                    <div className="space-y-3 border-t border-line pt-3">
                      <p className="text-xs font-medium text-fg-tertiary">상태 변경</p>
                      <div className="flex flex-wrap gap-2">
                        {detailItem.status === "OPEN" && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(detailItem.id, "IN_REVIEW")}>
                            검토 시작
                          </Button>
                        )}
                        <Button size="sm" variant="success" onClick={() => handleStatusChange(detailItem.id, "ACCEPTED")}>
                          반영
                        </Button>
                        <div className="flex w-full items-end gap-2">
                          <div className="flex-1">
                            <Input
                              placeholder="보류 사유 (선택)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                            />
                          </div>
                          <Button size="sm" variant="destructive" onClick={() => handleStatusChange(detailItem.id, "REJECTED")}>
                            보류
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delete (submitter only, OPEN status) */}
                  {detailItem.submitterId === user.id && detailItem.status === "OPEN" && (
                    <div className="border-t border-line pt-3">
                      <Button size="sm" variant="ghost" className="text-fg-danger" onClick={() => handleDelete(detailItem.id)}>
                        삭제
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
