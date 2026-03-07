import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { UserRole } from "~/db";
import {
  getUserFromSession,
  getSessionSecret,
} from "~/lib/auth/session.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // 승인된 사용자는 메인으로 리다이렉트
  if (user.role !== UserRole.PENDING) {
    return redirect("/");
  }

  return { name: user.name, email: user.email };
}

export default function Pending() {
  const { name, email } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <svg
              className="h-8 w-8 text-amber-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <CardTitle className="text-xl">승인 대기 중</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-fg-secondary">
            <strong>{name}</strong> ({email})님의 가입 신청이 접수되었습니다.
          </p>
          <p className="text-sm text-fg-secondary">
            관리자 승인 후 Discovery-X를 이용하실 수 있습니다.
          </p>

          <div className="rounded-lg bg-surface-secondary p-4 text-left">
            <p className="text-xs font-medium text-fg-secondary">
              승인 문의
            </p>
            <p className="mt-1 text-sm text-fg">
              sinclairseo@gmail.com
              <span className="ml-1 text-xs text-fg-tertiary">
                (서비스 관리자)
              </span>
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Link to="/pending" reloadDocument>
              <Button variant="outline" className="w-full">
                승인 상태 확인
              </Button>
            </Link>
            <Form method="post" action="/logout">
              <Button type="submit" variant="secondary" className="w-full">
                로그아웃
              </Button>
            </Form>
          </div>
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-fg-tertiary">
        AX Lab &middot; 2026
      </p>
    </div>
  );
}
