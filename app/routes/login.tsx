import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { createSession, createSessionStorage, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);

  // Get all users for selection
  const allUsers = await db.select().from(users);

  return json({ users: allUsers });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const formData = await request.formData();
  const userId = formData.get("userId");

  if (!userId || typeof userId !== "string") {
    return json({ error: "사용자를 선택해주세요" }, { status: 400 });
  }

  // Create session
  const sessionId = await createSession(userId, db);

  // Set session cookie
  const secret = getSessionSecret(context.cloudflare.env);
  const sessionStorage = createSessionStorage(secret);
  const session = await sessionStorage.getSession();
  session.set("sessionId", sessionId);

  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export default function Login() {
  const { users } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Discovery-X
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            내부 실험 중심 사고 시스템
          </p>
        </div>

        <Form method="post" className="mt-8 space-y-6">
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium text-gray-700"
            >
              사용자 선택
            </label>
            <select
              id="userId"
              name="userId"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            로그인
          </button>
        </Form>

        <p className="text-center text-xs text-gray-500">
          Prototype 버전 — 5명 테스트 사용자
        </p>
      </div>
    </div>
  );
}
