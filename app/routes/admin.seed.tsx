import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useActionData } from "@remix-run/react";
import { seedDatabase } from "~/db/seed";
import { getDb } from "~/db";

export async function action({ context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div>
          <h2 className="text-center text-2xl font-bold text-gray-900">
            Seed 데이터 생성
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            테스트용 사용자 5명과 샘플 Discovery 2개를 생성합니다
          </p>
        </div>

        {actionData?.success && (
          <div className="rounded-md bg-green-50 p-4">
            <p className="text-sm text-green-800">{actionData.message}</p>
            <a
              href="/login"
              className="mt-2 block text-sm font-medium text-green-600 hover:text-green-500"
            >
              로그인 페이지로 이동 →
            </a>
          </div>
        )}

        {actionData && !actionData.success && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post">
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Seed 데이터 생성
          </button>
        </Form>

        <div className="text-xs text-gray-500">
          <p className="font-semibold">생성되는 데이터:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>사용자 5명: 김탐험, 이실험, 박근거, 최검토, 정큐레이터</li>
            <li>샘플 Discovery 2건 (INBOX 상태)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
