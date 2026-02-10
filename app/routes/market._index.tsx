export default function MarketIndex() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <svg className="mx-auto h-12 w-12 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <h3 className="mt-3 text-base font-semibold text-[var(--axis-text-primary)]">
          시장 탐색 항목을 선택하세요
        </h3>
        <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
          좌측 목록에서 분석할 항목을 선택하면 시장 분석 결과를 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
