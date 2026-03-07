import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form } from "@remix-run/react";
import { getDb } from "~/db";
import { tenants, tenantMembers } from "~/db";
import { eq } from "drizzle-orm";
import {
  getUserFromSession,
  getSessionSecret,
  createSessionStorage,
  isSecureCookie,
} from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) throw redirect("/login");

  // 이미 Tenant 멤버십이 있으면 홈으로
  const membership = await db.query.tenantMembers.findFirst({
    where: eq(tenantMembers.userId, user.id),
  });
  if (membership) throw redirect("/");

  return json({ user: { id: user.id, name: user.name, email: user.email } });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) throw redirect("/login");

  const formData = await request.formData();
  const orgName = String(formData.get("orgName") || "").trim();

  if (!orgName || orgName.length < 2) {
    return json({ error: "조직명은 2자 이상 필요합니다" }, { status: 400 });
  }

  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const tenantId = `tenant-${crypto.randomUUID().slice(0, 8)}`;

  await db.insert(tenants).values({
    id: tenantId,
    name: orgName,
    slug: slug || tenantId,
    plan: "free",
    status: "active",
    ownerUserId: user.id,
  });

  await db.insert(tenantMembers).values({
    id: `tm-${crypto.randomUUID().slice(0, 8)}`,
    tenantId,
    userId: user.id,
    role: "owner",
  });

  // 세션에 tenantId 설정
  const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  session.set("tenantId", tenantId);

  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export default function Onboarding() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-fg">
            Discovery-X에 오신 것을 환영합니다
          </h1>
          <p className="text-fg-muted">
            {user.name}님, 조직을 만들어 시작하세요.
          </p>
        </div>

        <Form method="post" className="space-y-4">
          <div>
            <label
              htmlFor="orgName"
              className="block text-sm font-medium text-fg mb-1"
            >
              조직명
            </label>
            <input
              id="orgName"
              name="orgName"
              type="text"
              required
              minLength={2}
              placeholder="예: AX BD팀"
              className="w-full px-3 py-2 border rounded-md bg-surface border-line text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg-brand"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 rounded-md bg-fg-brand text-white font-medium hover:opacity-90 transition-opacity"
          >
            조직 만들기
          </button>
        </Form>
      </div>
    </div>
  );
}
