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

// ============================================================================
// GATE TIMEOUT EMAILS
// ============================================================================

export interface GateExpiredEmailData {
  expiredCount: number;
  holdCount: number;
  items: Array<{ gatePackageId: string; reviewerId: string }>;
}

export function buildGateExpiredEmail(data: GateExpiredEmailData): { subject: string; html: string } {
  const cards = data.items
    .map(
      (item) => `
    <div class="card">
      <p>Gate 패키지: <strong>${item.gatePackageId.slice(0, 8)}...</strong></p>
      <p style="font-size: 14px; color: #6b7280;">리뷰어 ID: ${item.reviewerId.slice(0, 8)}...</p>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] Gate 승인 SLA 만료 ${data.expiredCount}건 — 자동 거부 처리`,
    html: layout(`
      <h2 style="color: #991b1b;">Gate 승인 SLA 만료</h2>
      <p>${data.expiredCount}건의 Gate 승인 요청이 SLA 기한을 초과하여 자동 거부되었습니다.</p>
      ${data.holdCount > 0 ? `<p><span class="badge badge-yellow">${data.holdCount}건</span>의 Discovery가 HOLD 상태로 전환되었습니다.</p>` : ""}
      ${cards}
      <p><a href="${BASE_URL}/dashboard" class="btn" style="color: white;">대시보드 확인</a></p>
    `),
  };
}

export interface GateReminderEmailData {
  reminderCount: number;
  items: Array<{ gatePackageId: string; reviewerId: string; hoursLeft: number }>;
}

export function buildGateReminderEmail(data: GateReminderEmailData): { subject: string; html: string } {
  const cards = data.items
    .map(
      (item) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Gate 패키지: <strong>${item.gatePackageId.slice(0, 8)}...</strong></span>
        <span class="badge badge-yellow">${item.hoursLeft}시간 남음</span>
      </div>
      <p style="font-size: 14px; color: #6b7280;">리뷰어 ID: ${item.reviewerId.slice(0, 8)}...</p>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] Gate 승인 마감 임박 ${data.reminderCount}건 — 24시간 이내`,
    html: layout(`
      <h2 style="color: #92400e;">Gate 승인 마감 임박</h2>
      <p>${data.reminderCount}건의 Gate 승인 요청이 24시간 이내에 마감됩니다. 기한 내 응답하지 않으면 자동 거부됩니다.</p>
      ${cards}
      <p><a href="${BASE_URL}/dashboard" class="btn" style="color: white;">대시보드에서 승인 처리</a></p>
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

// ============================================================================
// STALLED STAGE EMAIL
// ============================================================================

export interface StalledStageDiscovery {
  id: string;
  title: string;
  status: string;
  ownerName: string;
  daysInStage: number;
}

export function buildStalledStageEmail(items: StalledStageDiscovery[]): { subject: string; html: string } {
  const cards = items
    .map(
      (d) => `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${d.title}</strong>
        <span class="badge badge-red">${d.daysInStage}일 체류</span>
      </div>
      <p style="margin: 4px 0; font-size: 14px; color: #6b7280;">단계: ${d.status} | Owner: ${d.ownerName}</p>
      <a href="${BASE_URL}/discoveries/${d.id}" class="btn" style="color: white;">확인하기</a>
    </div>`
    )
    .join("");

  return {
    subject: `[Discovery-X] 단계 체류 SLA 초과 ${items.length}건`,
    html: layout(`
      <h2 style="color: #991b1b;">단계 체류 SLA 초과</h2>
      <p>아래 Discovery가 현재 단계에 14일 이상 머물고 있습니다. 상태를 점검하고 필요한 조치를 취해주세요.</p>
      ${cards}
      <p><a href="${BASE_URL}/review" class="btn" style="color: white;">Weekly Review 열기</a></p>
    `),
  };
}

// ============================================================================
// WEEKLY SUMMARY EMAIL
// ============================================================================

export interface WeeklySummaryData {
  totalActive: number;
  statusCounts: Record<string, number>;
  overdueCount: number;
  stalledCount: number;
  newThisWeek: number;
  completedThisWeek: number;
}

export function buildWeeklySummaryEmail(data: WeeklySummaryData): { subject: string; html: string } {
  const statusRows = Object.entries(data.statusCounts)
    .map(([status, count]) => `<tr><td style="padding: 4px 12px;">${status}</td><td style="padding: 4px 12px; text-align: right; font-weight: 600;">${count}</td></tr>`)
    .join("");

  return {
    subject: `[Discovery-X] 주간 요약 — Active ${data.totalActive}건`,
    html: layout(`
      <h2 style="color: #2563eb;">주간 요약 리포트</h2>

      <div class="card">
        <h3 style="margin-top: 0;">파이프라인 현황</h3>
        <table style="width: 100%; font-size: 14px;">
          <thead><tr><th style="padding: 4px 12px; text-align: left;">단계</th><th style="padding: 4px 12px; text-align: right;">건수</th></tr></thead>
          <tbody>${statusRows}</tbody>
        </table>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">
        <div class="card" style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${data.totalActive}</div>
          <div style="font-size: 12px; color: #6b7280;">Active</div>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${data.overdueCount > 0 ? "#dc2626" : "#059669"};">${data.overdueCount}</div>
          <div style="font-size: 12px; color: #6b7280;">기한 초과</div>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${data.stalledCount > 0 ? "#f59e0b" : "#059669"};">${data.stalledCount}</div>
          <div style="font-size: 12px; color: #6b7280;">단계 체류 초과</div>
        </div>
        <div class="card" style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #059669;">+${data.newThisWeek} / ${data.completedThisWeek}</div>
          <div style="font-size: 12px; color: #6b7280;">신규 / 완료</div>
        </div>
      </div>

      <p><a href="${BASE_URL}/dashboard" class="btn" style="color: white;">대시보드 열기</a></p>
    `),
  };
}

// ============================================================================
// AI CREDIT EXHAUSTION EMAIL
// ============================================================================

export interface CreditExhaustionData {
  exhaustedProvider: string;
  switchedToProvider: string;
  remainingChain: string[];
  timestamp: string;
}

export function buildCreditExhaustionEmail(data: CreditExhaustionData): { subject: string; html: string } {
  const remainingList = data.remainingChain.length > 0
    ? data.remainingChain.map((p) => `<li>${p}</li>`).join("")
    : "<li>없음 (모든 프로바이더 소진)</li>";

  return {
    subject: `[Discovery-X] AI 크레딧 소진 — 자동 전환: ${data.exhaustedProvider} → ${data.switchedToProvider}`,
    html: layout(`
      <h2 style="color: #dc2626;">AI 프로바이더 크레딧 소진</h2>
      <div class="card">
        <p><strong>${data.exhaustedProvider}</strong> 프로바이더의 API 크레딧이 소진되어
        <span class="badge badge-blue">${data.switchedToProvider}</span>으로 자동 전환되었습니다.</p>
        <p style="font-size: 14px; color: #6b7280;">전환 시각: ${data.timestamp}</p>
      </div>

      <div class="card">
        <h3 style="margin-top: 0; font-size: 14px;">남은 폴백 체인</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px;">${remainingList}</ul>
      </div>

      <p style="font-size: 14px; color: #6b7280;">
        소진된 프로바이더의 크레딧을 충전한 후 /settings에서 수동 전환할 수 있습니다.
      </p>
      <p><a href="${BASE_URL}/settings" class="btn" style="color: white;">설정 페이지 열기</a></p>
    `),
  };
}
