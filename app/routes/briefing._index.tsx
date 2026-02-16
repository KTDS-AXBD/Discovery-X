import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { Button } from "~/components/ui/Button";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);

  let user;
  try {
    user = await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }

  const projBuilder = new ProjectionBuilder(db);
  const briefing = await projBuilder.getProjection("user", user.id, "BRIEFING.md");

  // 서버에서 날짜 포맷팅 (hydration mismatch 방지)
  let formattedDate: string | null = null;
  if (briefing?.generatedAt) {
    const d = briefing.generatedAt;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    formattedDate = `${y}-${m}-${day} ${h}:${min}`;
  }

  return json({
    content: briefing?.content ?? null,
    generatedAt: formattedDate,
  });
}

function renderMarkdownLine(line: string, i: number) {
  if (line.startsWith("## ")) {
    return (
      <h2
        key={i}
        className="mt-6 mb-2 text-lg font-semibold text-[var(--axis-text-primary)]"
      >
        {line.slice(3)}
      </h2>
    );
  }
  if (line.startsWith("### ")) {
    return (
      <h3
        key={i}
        className="mt-4 mb-1 text-sm font-semibold text-[var(--axis-text-primary)]"
      >
        {line.slice(4)}
      </h3>
    );
  }
  if (line.startsWith("> ")) {
    return (
      <blockquote
        key={i}
        className="border-l-2 border-[var(--axis-text-brand)] pl-3 text-xs text-[var(--axis-text-secondary)]"
      >
        {line.slice(2)}
      </blockquote>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <li key={i} className="ml-4 text-sm text-[var(--axis-text-secondary)]">
        {line.slice(2)}
      </li>
    );
  }
  if (line.trim() === "") {
    return <div key={i} className="h-2" />;
  }
  return (
    <p key={i} className="text-sm text-[var(--axis-text-secondary)]">
      {line}
    </p>
  );
}

export default function BriefingIndex() {
  const { content, generatedAt } = useLoaderData<typeof loader>();
  const refreshFetcher = useFetcher();
  const revalidator = useRevalidator();

  // POST 완료 후 loader 재실행으로 최신 데이터 반영
  useEffect(() => {
    if (refreshFetcher.state === "idle" && refreshFetcher.data) {
      revalidator.revalidate();
    }
  }, [refreshFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    refreshFetcher.submit(null, { method: "post", action: "/api/briefing" });
  };

  const isRefreshing =
    refreshFetcher.state !== "idle" || revalidator.state === "loading";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">
            일간 브리핑
          </h1>
          {generatedAt && (
            <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
              마지막 갱신: {generatedAt}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "생성 중..." : "새로고침"}
        </Button>
      </div>

      {content ? (
        <div className="max-w-none">
          {content.split("\n").map((line, i) => renderMarkdownLine(line, i))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--axis-border-default)] p-8 text-center">
          <p className="text-sm text-[var(--axis-text-tertiary)]">
            아직 생성된 브리핑이 없습니다
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="mt-4"
            disabled={isRefreshing}
          >
            {isRefreshing ? "생성 중..." : "브리핑 생성"}
          </Button>
        </div>
      )}
    </div>
  );
}
