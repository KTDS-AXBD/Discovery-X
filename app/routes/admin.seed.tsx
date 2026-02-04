import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { seedDatabase } from "~/db/seed";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const currentUser = await requireAdmin(request, db, secret);
  return json({ currentUser });
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
  const { currentUser } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={currentUser}>
      <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">Seed 데이터 생성</h1>
      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
        테스트용 사용자 5명과 샘플 Discovery 2개를 생성합니다.
      </p>

      <Card className="mt-6 max-w-md">
        <CardContent className="space-y-6 pt-6">
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
    </AppShell>
  );
}
