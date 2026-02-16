export default function AgentIndex() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--axis-surface-brand)]">
          <svg className="h-8 w-8 text-[var(--axis-text-brand)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
          Discovery-X Agent
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
          새 대화를 시작하거나 이전 세션을 선택하세요.
        </p>

        <div className="mt-6 space-y-3 text-left">
          <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--axis-text-primary)]">
              Graph 기반 맞춤 응답
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--axis-text-tertiary)]">
              SOUL &middot; USER &middot; TOPIC &middot; BRIEFING Projection을 통해
              사용자와 맥락에 최적화된 응답을 제공합니다.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--axis-text-primary)]">
              세션 히스토리
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--axis-text-tertiary)]">
              이전 대화 기록과 토큰 사용량을 확인하고,
              과거 세션을 이어서 대화할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
