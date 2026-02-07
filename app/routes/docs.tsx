/**
 * /docs — Project documentation viewer + GitHub Project board.
 */

import { useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent } from "~/components/ui/Card";
import { getAllDocs, getDocBySlug } from "~/lib/docs/registry";
import { DocsSidebar } from "~/components/docs/DocsSidebar";
import { MarkdownViewer } from "~/components/docs/MarkdownViewer";

const GITHUB_PROJECT_URL =
  "https://github.com/orgs/AX-BD-Team/projects/4";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const docs = getAllDocs().map(({ slug, title, description, category }) => ({
    slug,
    title,
    description,
    category,
  }));

  return json({ user, docs });
}

type Tab = "docs" | "github";

export default function DocsPage() {
  const { user, docs } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get("tab") as Tab) || "docs";
  const activeSlug = searchParams.get("doc") || docs[0]?.slug || "v1.4";

  const activeDoc = getDocBySlug(activeSlug);

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", newTab);
        return next;
      });
    },
    [setSearchParams]
  );

  const handleDocSelect = useCallback(
    (slug: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "docs");
        next.set("doc", slug);
        return next;
      });
    },
    [setSearchParams]
  );

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
          Docs
        </h1>
        <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
          프로젝트 기획서 및 운영 문서
        </p>
      </div>

      {/* Tab bar — pill/segment style */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-[var(--axis-surface-secondary)] p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "docs"}
          onClick={() => handleTabChange("docs")}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-[var(--dx-transition-normal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-button-border-focus)] focus-visible:ring-offset-1 ${
            tab === "docs"
              ? "bg-[var(--axis-surface-default)] text-[var(--axis-text-primary)] shadow-sm"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          }`}
        >
          기획서
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "github"}
          onClick={() => handleTabChange("github")}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-[var(--dx-transition-normal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-button-border-focus)] focus-visible:ring-offset-1 ${
            tab === "github"
              ? "bg-[var(--axis-surface-default)] text-[var(--axis-text-primary)] shadow-sm"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          }`}
        >
          GitHub Project
        </button>
      </div>

      {/* Docs tab */}
      {tab === "docs" && (
        <div className="flex gap-6">
          {/* Sidebar — desktop */}
          <aside className="hidden w-56 shrink-0 lg:block">
            <Card>
              <CardContent className="p-3">
                <DocsSidebar
                  docs={docs}
                  activeSlug={activeSlug}
                  onSelect={handleDocSelect}
                />
              </CardContent>
            </Card>
          </aside>

          {/* Content area */}
          <div className="min-w-0 flex-1">
            {/* Mobile doc selector */}
            <div className="mb-4 lg:hidden">
              <select
                value={activeSlug}
                onChange={(e) => handleDocSelect(e.target.value)}
                className="w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-3 py-2 text-sm text-[var(--axis-text-primary)]"
              >
                {docs.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            <Card>
              <CardContent className="p-6 md:p-8">
                {activeDoc ? (
                  <MarkdownViewer content={activeDoc.content} />
                ) : (
                  <p className="text-sm text-[var(--axis-text-secondary)]">
                    문서를 선택해주세요.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* GitHub Project tab */}
      {tab === "github" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--axis-surface-secondary)]">
              <svg
                className="h-8 w-8 text-[var(--axis-text-secondary)]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">
                GitHub Project Board
              </h3>
              <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
                프로젝트 백로그, 진행 상황, 이슈를 GitHub에서 관리합니다.
              </p>
            </div>
            <a
              href={GITHUB_PROJECT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--axis-surface-default)] border border-[var(--axis-border-default)] px-4 py-2 text-sm font-medium text-[var(--axis-text-primary)] hover:bg-[var(--axis-surface-secondary)] transition-colors"
            >
              GitHub에서 열기
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
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
