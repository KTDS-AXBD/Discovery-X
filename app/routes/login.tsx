import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/Card";
import { AlertBanner } from "~/components/ui/AlertBanner";

export async function loader({ request, context: _context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const detail = url.searchParams.get("detail");
  return json({ error, detail });
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "인증 파라미터가 누락되었습니다.",
  invalid_state: "인증 상태가 유효하지 않습니다. 다시 시도해주세요.",
  token_exchange_failed: "Google 인증에 실패했습니다.",
  userinfo_failed: "사용자 정보를 가져올 수 없습니다.",
  user_creation_failed: "사용자 생성에 실패했습니다.",
  pending_approval: "관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.",
};

export default function Login() {
  const { error, detail } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-deep" style={{ background: "linear-gradient(135deg, var(--dx-surface-deep, var(--axis-surface-secondary)) 0%, var(--dx-surface-panel, var(--axis-surface-default)) 50%, var(--dx-surface-deep, var(--axis-surface-secondary)) 100%)" }}>
      <Card className="w-full max-w-md bg-surface-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-brand">
            <svg className="h-8 w-8 text-fg-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <CardTitle className="text-3xl">Discovery-X</CardTitle>
          <CardDescription>내부 실험 중심 사고 시스템</CardDescription>
          <span className="mt-2 inline-block rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
            v0.1.0
          </span>
        </CardHeader>
        <CardContent className="space-y-6 px-8 pb-8">
          {error && (
            <AlertBanner variant="destructive">
              {ERROR_MESSAGES[error] || "로그인 중 오류가 발생했습니다."}
              {detail && (
                <span className="mt-1 block text-xs opacity-70">{detail}</span>
              )}
            </AlertBanner>
          )}

          <Link to="/auth/google" className="block">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-sm transition-colors hover:bg-surface-secondary"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google로 로그인
            </button>
          </Link>

          <p className="text-center text-xs text-fg-tertiary">
            Google 계정으로 로그인합니다
          </p>
          <p className="text-center text-xs text-fg-tertiary">
            처음 방문하시나요? Google 로그인 후 관리자 승인을 거쳐 이용하실 수 있습니다.
          </p>
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-fg-tertiary">
        AX Lab &middot; 2026
      </p>
    </div>
  );
}
