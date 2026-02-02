import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useActionData } from "@remix-run/react";
import { seedDatabase } from "~/db/seed";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  await requireAdmin(request, db, secret);
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  await requireAdmin(request, db, secret);

  try {
    await seedDatabase(db);
    return json({ success: true as const, message: "Seed 데이터가 생성되었습니다!" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "오류가 발생했습니다";
    return json(
      { success: false as const, error: message },
      { status: 500 }
    );
  }
}

export default function AdminSeed() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--axis-surface-secondary)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Seed 데이터 생성</CardTitle>
          <CardDescription>
            테스트용 사용자 5명과 샘플 Discovery 2개를 생성합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {actionData?.success && (
            <AlertBanner variant="success">
              <p className="text-sm">{actionData.message}</p>
              <a
                href="/login"
                className="mt-2 block text-sm font-medium text-[var(--axis-text-brand)] hover:underline"
              >
                로그인 페이지로 이동 →
              </a>
            </AlertBanner>
          )}

          {actionData && !actionData.success && (
            <AlertBanner variant="destructive">
              <p className="text-sm">{actionData.error}</p>
            </AlertBanner>
          )}

          <Form method="post">
            <Button type="submit" className="w-full">
              Seed 데이터 생성
            </Button>
          </Form>

          <div className="text-xs text-[var(--axis-text-tertiary)]">
            <p className="font-semibold">생성되는 데이터:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>사용자 5명: 김탐험, 이실험, 박근거, 최검토, 정큐레이터</li>
              <li>샘플 Discovery 2건 (INBOX 상태)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
