const BASE_URL = "https://dx.minu.best";

const DECISION_LABELS: Record<string, string> = {
  NEXT: "전진 (NEXT)",
  NOT_NOW: "보류 (NOT NOW)",
  DEAD_END: "중단 (DEAD END)",
  EXTENSION_REQUESTED: "연장 요청",
};

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 18px; color: #2563eb; margin: 0; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-red { background: #fef2f2; color: #991b1b; }
    .badge-yellow { background: #fffbeb; color: #92400e; }
    .badge-blue { background: #eff6ff; color: #1e40af; }
    .btn { display: inline-block; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Discovery-X</h1>
  </div>
  ${content}
  <div class="footer">
    <p>이 메일은 Discovery-X 시스템에서 자동 발송되었습니다.</p>
    <p><a href="${BASE_URL}">Discovery-X 열기</a></p>
  </div>
</body>
</html>`;
}

export interface OverdueDiscovery {
  id: string;
  title: string;
  dueDate: string;
  ownerName: string;
  daysOverdue: number;
}

export interface RevisitDiscovery {
  id: string;
  title: string;
  revisitDate: string;
  triggerType: string;
  triggerCondition: string;
}

export interface ExpiringDiscovery {
  id: string;
  title: string;
  dueDate: string;
  ownerName: string;
  daysRemaining: number;
}

export function buildOverdueEmail(discoveries: OverdueDiscovery[]): { subject: string; html: string } {
  const items = discoveries
    .map(
      (d) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${d.title}</strong>
        <span class="badge badge-red">${d.daysOverdue}일 초과</span>
      </div>
      <p style="margin: 4px 0; font-size: 14px; color: #6b7280;">Owner: ${d.ownerName} | 마감: ${d.dueDate}</p>
      <a href="${BASE_URL}/discoveries/${d.id}" class="btn" style="color: white;">확인하기</a>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] 기한 초과 ${discoveries.length}건 — 즉시 결정 필요`,
    html: layout(`
      <h2 style="color: #991b1b;">기한 초과 Discovery</h2>
      <p>아래 Discovery가 기한을 초과했습니다. 즉시 결정(NEXT/NOT_NOW/DEAD_END)을 내려주세요.</p>
      ${items}
      <p><a href="${BASE_URL}/review" class="btn" style="color: white;">Weekly Review 열기</a></p>
    `),
  };
}

export function buildRevisitEmail(discoveries: RevisitDiscovery[]): { subject: string; html: string } {
  const items = discoveries
    .map(
      (d) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${d.title}</strong>
        <span class="badge badge-blue">재검토</span>
      </div>
      <p style="margin: 4px 0; font-size: 14px; color: #6b7280;">트리거: ${d.triggerType} — ${d.triggerCondition}</p>
      <a href="${BASE_URL}/discoveries/${d.id}" class="btn" style="color: white;">재검토하기</a>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] 재검토 대상 ${discoveries.length}건 — Recall Queue`,
    html: layout(`
      <h2 style="color: #1e40af;">재검토 대상 Discovery</h2>
      <p>아래 Discovery의 재검토 날짜가 도래했습니다. 트리거 조건을 확인하고 재평가해주세요.</p>
      ${items}
      <p><a href="${BASE_URL}/recall" class="btn" style="color: white;">Recall Queue 열기</a></p>
    `),
  };
}

export function buildDueSoonEmail(discoveries: ExpiringDiscovery[]): { subject: string; html: string } {
  const items = discoveries
    .map(
      (d) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${d.title}</strong>
        <span class="badge badge-yellow">${d.daysRemaining}일 남음</span>
      </div>
      <p style="margin: 4px 0; font-size: 14px; color: #6b7280;">Owner: ${d.ownerName} | 마감: ${d.dueDate}</p>
      <a href="${BASE_URL}/discoveries/${d.id}" class="btn" style="color: white;">확인하기</a>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] 마감 임박 ${discoveries.length}건 — 3일 이내`,
    html: layout(`
      <h2 style="color: #92400e;">마감 임박 Discovery</h2>
      <p>아래 Discovery의 마감이 3일 이내입니다. 결정을 준비해주세요.</p>
      ${items}
    `),
  };
}

export interface AutoClosedDiscovery {
  id: string;
  title: string;
  ownerName: string;
  daysOverdue: number;
}

export function buildAutoClosedEmail(items: AutoClosedDiscovery[]): { subject: string; html: string } {
  const cards = items
    .map(
      (d) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${d.title}</strong>
        <span class="badge badge-red">자동 종료</span>
      </div>
      <p style="margin: 4px 0; font-size: 14px; color: #6b7280;">Owner: ${d.ownerName} | ${d.daysOverdue}일 기한 초과</p>
      <a href="${BASE_URL}/discoveries/${d.id}" class="btn" style="color: white;">확인하기</a>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] 자동 종료 ${items.length}건 — 기한 초과 DEAD END`,
    html: layout(`
      <h2 style="color: #991b1b;">기한 초과 자동 종료</h2>
      <p>아래 Discovery가 기한 초과로 자동 DEAD END 처리되었습니다. 실패 패턴은 <strong>시간 제약</strong>으로 기록되었습니다.</p>
      ${cards}
      <p><a href="${BASE_URL}/review" class="btn" style="color: white;">Weekly Review 열기</a></p>
    `),
  };
}

export interface ApprovalRequestData {
  discoveryId: string;
  discoveryTitle: string;
  ownerName: string;
  decision: string;
}

export function buildApprovalRequestEmail(data: ApprovalRequestData): { subject: string; html: string } {
  const decisionLabel = DECISION_LABELS[data.decision] || data.decision;

  return {
    subject: `[Discovery-X] 승인 요청 — ${data.discoveryTitle}`,
    html: layout(`
      <h2 style="color: #7c3aed;">결정 승인 요청</h2>
      <div class="card">
        <p><strong>${data.ownerName}</strong>님이 <strong>"${data.discoveryTitle}"</strong>에 대해
        <span class="badge" style="background: #ede9fe; color: #5b21b6;">${decisionLabel}</span>
        결정을 제출했습니다.</p>
        <p style="margin-top: 12px;">Reviewer로서 이 결정을 검토하고 승인/거부해주세요.</p>
        <a href="${BASE_URL}/discoveries/${data.discoveryId}/approve" class="btn" style="color: white; margin-top: 12px;">승인/거부 처리하기</a>
      </div>
    `),
  };
}

export interface ApprovalResultData {
  discoveryId: string;
  discoveryTitle: string;
  reviewerName: string;
  decision: string;
  approved: boolean;
  comment?: string;
}

export function buildApprovalResultEmail(data: ApprovalResultData): { subject: string; html: string } {
  const decisionLabel = DECISION_LABELS[data.decision] || data.decision;
  const resultLabel = data.approved ? "승인" : "거부";
  const resultColor = data.approved ? "#059669" : "#dc2626";

  return {
    subject: `[Discovery-X] 결정 ${resultLabel}됨 — ${data.discoveryTitle}`,
    html: layout(`
      <h2 style="color: ${resultColor};">결정이 ${resultLabel}되었습니다</h2>
      <div class="card">
        <p><strong>"${data.discoveryTitle}"</strong>에 대한
        <span class="badge" style="background: #ede9fe; color: #5b21b6;">${decisionLabel}</span>
        결정이 <strong>${data.reviewerName}</strong>님에 의해
        <span style="color: ${resultColor}; font-weight: 600;">${resultLabel}</span>되었습니다.</p>
        ${data.comment ? `<p style="margin-top: 8px; padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 14px;">💬 ${data.comment}</p>` : ""}
        <a href="${BASE_URL}/discoveries/${data.discoveryId}" class="btn" style="color: white; margin-top: 12px;">Discovery 확인하기</a>
      </div>
    `),
  };
}
