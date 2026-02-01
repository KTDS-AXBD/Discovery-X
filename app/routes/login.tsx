import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { createSession, createSessionStorage, getSessionSecret } from "~/lib/auth/session.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/Card";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";

export async function loader({ request: _request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);

  // Get all users for selection, excluding system users
  const allUsers = await db.select().from(users);
  const humanUsers = allUsers.filter((u) => !u.email.endsWith("@system"));

  return json({ users: humanUsers });
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
    <div className="flex min-h-screen items-center justify-center bg-[var(--axis-surface-secondary)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Discovery-X</CardTitle>
          <CardDescription>내부 실험 중심 사고 시스템</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6">
            <FormField label="사용자 선택" htmlFor="userId" required>
              <Select id="userId" name="userId" required>
                <option value="">선택하세요</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </Select>
            </FormField>

            <Button type="submit" className="w-full">
              로그인
            </Button>
          </Form>

          <p className="mt-6 text-center text-xs text-[var(--axis-text-tertiary)]">
            Prototype 버전 — 5명 테스트 사용자
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
