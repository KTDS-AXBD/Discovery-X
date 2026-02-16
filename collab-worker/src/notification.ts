/**
 * 시그널 라우팅 알림 — 기본 구현.
 *
 * 시그널이 라우팅되면 대상 사용자에게 알림을 전송.
 * v1: DB 기반 알림 (notification_queue 테이블 insert).
 * 향후: 이메일/Slack 연동 확장.
 */
import type { Env } from "./types";

export interface Notification {
  userId: string;
  type: "signal_routed" | "briefing_ready" | "memory_compacted";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * 알림 전송 — D1 기반 notification_queue에 저장.
 * 사용자가 다음 접속 시 미확인 알림을 표시.
 */
export async function sendNotification(
  env: Env,
  notification: Notification,
): Promise<void> {
  try {
    const stmt = env.DB.prepare(`
      INSERT INTO notification_queue (user_id, type, title, body, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, unixepoch())
    `);
    await stmt
      .bind(
        notification.userId,
        notification.type,
        notification.title,
        notification.body,
        notification.metadata ? JSON.stringify(notification.metadata) : null,
      )
      .run();
  } catch (err) {
    // 알림 실패는 Cron 전체를 중단하지 않음
    console.error(
      `[notification] 전송 실패: userId=${notification.userId}, type=${notification.type}`,
      err,
    );
  }
}

/** 시그널 라우팅 알림 일괄 전송 */
export async function notifySignalRouted(
  env: Env,
  topicId: string,
  signalCount: number,
): Promise<void> {
  // Topic 멤버 조회
  const stmt = env.DB.prepare(`
    SELECT user_id FROM topic_members
    WHERE topic_id = ? AND role IN ('owner', 'editor')
  `);
  const { results } = await stmt.bind(topicId).all();

  if (!results) return;

  for (const row of results) {
    await sendNotification(env, {
      userId: row.user_id as string,
      type: "signal_routed",
      title: "새 시그널이 도착했습니다",
      body: `${signalCount}개의 시그널이 토픽에 라우팅되었습니다.`,
      metadata: { topicId, signalCount },
    });
  }
}
