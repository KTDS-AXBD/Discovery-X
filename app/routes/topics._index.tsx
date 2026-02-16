export default function TopicsIndex() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--axis-surface-brand)]">
          <svg
            className="h-8 w-8 text-[var(--axis-text-brand)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
          Topics
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
          아직 Topic이 없습니다.
          <br />
          Topic은 팀 내 주제별 협업 공간입니다.
        </p>

        <div className="mt-6">
          <a
            href="/topics/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--axis-button-primary-bg-default)] px-4 py-2.5 text-sm font-medium text-[var(--axis-button-primary-text-default)] transition-colors hover:bg-[var(--axis-button-primary-bg-hover)]"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Topic 만들기
          </a>
        </div>
      </div>
    </div>
  );
}
