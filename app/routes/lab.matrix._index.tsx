import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MatrixService } from "~/lib/services/matrix.service";
import type { HeatmapData } from "~/features/matrix/types";
import { HeatmapGrid } from "~/components/matrix/HeatmapGrid";
import { HeatmapLegend } from "~/components/matrix/HeatmapLegend";

// 최근 6개월 기간 옵션 생성
function generatePeriodOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    options.push({
      value: `${year}-${month}`,
      label: `${year}년 ${d.getMonth() + 1}월`,
    });
  }
  return options;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    throw json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? undefined;

  const service = new MatrixService(db);
  const data = await service.getHeatmapData(ctx.tenantId, period);

  return json({ data });
}

export default function MatrixHeatmapPage() {
  const { data } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // loader에서 직렬화된 data를 HeatmapData로 사용
  const heatmapData = data as unknown as HeatmapData;

  const periodOptions = generatePeriodOptions();
  const currentPeriod = searchParams.get("period") ?? heatmapData.period;

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPeriod = e.target.value;
    setSearchParams({ period: newPeriod });
  }

  function handleCellClick(cellId: string) {
    navigate(`/lab/matrix/${cellId}`);
  }

  return (
    <div className="space-y-4">
      {/* 상단 헤더 + 기간 선택 */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-fg font-mono-dx"
          >
            Framework Matrix
          </h2>
          <p
            className="mt-0.5 text-xs text-lab-accent font-mono-dx"
          >
            산업 × 기능 교차 스코어링 히트맵
          </p>
        </div>
        <select
          value={currentPeriod}
          onChange={handlePeriodChange}
          className="rounded border border-line-subtle bg-surface-secondary px-3 py-1.5 text-xs text-fg font-mono-dx"
        >
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 범례 */}
      <HeatmapLegend />

      {/* 히트맵 그리드 */}
      {heatmapData.industries.length === 0 || heatmapData.functions.length === 0 ? (
        <div
          className="flex min-h-[200px] items-center justify-center rounded border border-dashed border-line-subtle text-xs text-fg-tertiary font-mono-dx"
        >
          산업군 또는 기능이 등록되지 않았습니다. 데이터를 먼저 설정해주세요.
        </div>
      ) : (
        <HeatmapGrid data={heatmapData} onCellClick={handleCellClick} />
      )}
    </div>
  );
}
