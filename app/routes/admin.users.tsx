import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { getDb } from "~/db";
import { users, UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { AlertBanner } from "~/components/ui/AlertBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const currentUser = await requireAdmin(request, db, secret);

  const allUsers = await db.select().from(users);
  const humanUsers = allUsers.filter((u) => !u.email.endsWith("@system"));

  return json({ currentUser, users: humanUsers });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  await requireAdmin(request, db, secret);

  const formData = await request.formData();
  const userId = formData.get("userId") as string;
  const newRole = formData.get("role") as string;

  if (!userId || !newRole || ![UserRole.ADMIN, UserRole.USER].includes(newRole as typeof UserRole.ADMIN)) {
    return json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId));

  return json({ success: true });
}

export default function AdminUsers() {
  const { currentUser, users: userList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <PageLayout user={currentUser}>
      <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">사용자 관리</h1>
      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
        사용자 목록과 역할을 관리합니다.
      </p>

      {actionData && "success" in actionData && (
        <AlertBanner variant="success" className="mt-4">
          역할이 변경되었습니다.
        </AlertBanner>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">사용자 목록 ({userList.length}명)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-[var(--axis-border-default)]">
            {userList.map((user) => (
              <div key={user.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--axis-surface-tertiary)] text-sm font-medium text-[var(--axis-text-secondary)]">
                      {user.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--axis-text-primary)]">
                      {user.name}
                      {user.id === currentUser.id && (
                        <span className="ml-1.5 text-xs font-normal text-[var(--axis-text-tertiary)]">(나)</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--axis-text-tertiary)]">
                      {user.email}
                      {user.createdAt && (
                        <span className="ml-2">
                          &middot; 가입 {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.googleId && (
                    <Badge variant="secondary">Google 연동</Badge>
                  )}
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </Badge>
                  {user.id !== currentUser.id && (
                    <Form method="post">
                      <input type="hidden" name="userId" value={user.id} />
                      <input
                        type="hidden"
                        name="role"
                        value={user.role === "admin" ? "user" : "admin"}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        {user.role === "admin" ? "User로 변경" : "Admin으로 변경"}
                      </Button>
                    </Form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
