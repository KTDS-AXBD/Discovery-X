import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { getDb } from "~/db";
import { users, tenantMembers, UserRole } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAdmin,
  getSessionSecret,
  createSessionStorage,
  isSecureCookie,
} from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { Select } from "~/components/ui/Select";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { formatDate } from "~/lib/format-date";

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
  const intent = formData.get("intent") as string;
  const userId = formData.get("userId") as string;

  if (!userId) {
    return json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (intent === "reject") {
    await db.delete(users).where(eq(users.id, userId));
    return json({ success: true, message: "사용자가 거부되었습니다." });
  }

  const newRole = formData.get("role") as string;
  const validRoles = [UserRole.ADMIN, UserRole.USER, UserRole.GATEKEEPER];
  if (!newRole || !validRoles.includes(newRole as typeof UserRole.ADMIN)) {
    return json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ role: newRole })
    .where(eq(users.id, userId));

  // 승인 시 tenant 멤버십 자동 추가
  if (intent !== "reject" && newRole !== "pending") {
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    const tenantId = session.get("tenantId");

    if (tenantId) {
      const existingMember = await db.query.tenantMembers.findFirst({
        where: and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, userId)
        ),
      });

      if (!existingMember) {
        await db.insert(tenantMembers).values({
          id: `tm-${crypto.randomUUID().slice(0, 8)}`,
          tenantId,
          userId,
          role: "member",
        });
      }
    }
  }

  return json({ success: true });
}

export default function AdminUsers() {
  const { currentUser, users: userList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const pendingUsers = userList.filter((u) => u.role === "pending");
  const activeUsers = userList.filter((u) => u.role !== "pending");

  return (
    <AppShell user={currentUser}>
      <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">사용자 관리</h1>
      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
        사용자 목록과 역할을 관리합니다.
      </p>

      {actionData && "success" in actionData && (
        <AlertBanner variant="success" className="mt-4">
          {"message" in actionData ? String(actionData.message) : "역할이 변경되었습니다."}
        </AlertBanner>
      )}

      {/* 승인 대기 섹션 */}
      {pendingUsers.length > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="text-base">
              승인 대기 ({pendingUsers.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-[var(--axis-border-default)]">
              {pendingUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--axis-surface-tertiary)] text-sm font-medium text-[var(--axis-text-secondary)]">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-[var(--axis-text-primary)]">{user.name}</p>
                      <p className="text-xs text-[var(--axis-text-tertiary)]">
                        {user.email}
                        {user.createdAt && (
                          <span className="ml-2">
                            &middot; 신청 {formatDate(user.createdAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">대기</Badge>
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="role" value="user" />
                      <Button type="submit" variant="default" size="sm">승인</Button>
                    </Form>
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="intent" value="reject" />
                      <Button type="submit" variant="destructive" size="sm">거부</Button>
                    </Form>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 활성 사용자 목록 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">사용자 목록 ({activeUsers.length}명)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-[var(--axis-border-default)]">
            {activeUsers.map((user) => (
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
                          &middot; 가입 {formatDate(user.createdAt)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.googleId && (
                    <Badge variant="secondary">Google 연동</Badge>
                  )}
                  <Badge variant={user.role === "admin" ? "default" : user.role === "gatekeeper" ? "purple" : "secondary"}>
                    {user.role === "admin" ? "Admin" : user.role === "gatekeeper" ? "Gatekeeper" : "User"}
                  </Badge>
                  {user.id !== currentUser.id && (
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={user.id} />
                      <Select name="role" defaultValue={user.role}>
                        <option value="admin">Admin</option>
                        <option value="gatekeeper">Gatekeeper</option>
                        <option value="user">User</option>
                      </Select>
                      <Button type="submit" variant="secondary" size="sm">변경</Button>
                    </Form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
