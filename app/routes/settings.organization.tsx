/**
 * /settings/organization — Organization settings page.
 * Multi-Tenant F6: Manage tenant info, members, and feature settings.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData } from "@remix-run/react";
import { useState } from "react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { tenants, tenantMembers, users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MemberList } from "~/components/tenant/MemberList";
import { InviteMemberDialog } from "~/components/tenant/InviteMemberDialog";
import { TenantSettingsForm } from "~/components/tenant/TenantSettingsForm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  if (!tenant[0]) return redirect("/onboarding");

  const members = await db
    .select({
      id: tenantMembers.id,
      userId: tenantMembers.userId,
      role: tenantMembers.role,
      joinedAt: tenantMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .where(eq(tenantMembers.tenantId, ctx.tenantId));

  return json({
    user: ctx.user,
    tenantRole: ctx.tenantRole,
    tenant: {
      id: tenant[0].id,
      name: tenant[0].name,
      slug: tenant[0].slug,
      plan: tenant[0].plan,
      status: tenant[0].status,
      settings: tenant[0].settings,
      ownerUserId: tenant[0].ownerUserId,
    },
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name || "",
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt?.toISOString() || null,
    })),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  switch (actionType) {
    case "updateTenant": {
      // Only owner can update
      const tenant = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      if (tenant[0]?.ownerUserId !== ctx.user.id) {
        return json({ error: "Only the owner can update organization settings." });
      }

      const name = formData.get("name") as string;
      if (name?.trim()) {
        await db
          .update(tenants)
          .set({ name: name.trim(), updatedAt: new Date() })
          .where(eq(tenants.id, ctx.tenantId));
      }
      return json({ success: true, message: "Organization updated." });
    }

    case "inviteMember": {
      const email = formData.get("email") as string;
      const role = (formData.get("role") as string) || "member";

      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user[0]) {
        return json({ error: `User ${email} not found. They must sign up first.` });
      }

      const existing = await db
        .select()
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, ctx.tenantId), eq(tenantMembers.userId, user[0].id)))
        .limit(1);

      if (existing[0]) {
        return json({ error: `${email} is already a member.` });
      }

      await db.insert(tenantMembers).values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId: user[0].id,
        role,
        invitedBy: ctx.user.id,
      });

      return json({ success: true, message: `Invited ${user[0].name || email} as ${role}.` });
    }

    case "removeMember": {
      const userId = formData.get("userId") as string;
      const tenant = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);

      if (tenant[0]?.ownerUserId === userId) {
        return json({ error: "Cannot remove the organization owner." });
      }

      await db
        .delete(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, ctx.tenantId), eq(tenantMembers.userId, userId)));

      return json({ success: true, message: "Member removed." });
    }

    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
}

export default function SettingsOrganization() {
  const { user, tenantRole, tenant, members } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [inviteOpen, setInviteOpen] = useState(false);

  const isOwner = tenant.ownerUserId === user.id;
  const isAdmin = isOwner || tenantRole === "admin";

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[800px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-xl font-bold text-[var(--axis-text-primary)]">
          Organization Settings
        </h1>

        {actionData && "error" in actionData && actionData.error && (
          <AlertBanner variant="destructive" className="mb-4">
            {actionData.error}
          </AlertBanner>
        )}
        {actionData && "success" in actionData && actionData.success && (
          <AlertBanner variant="success" className="mb-4">
            {actionData.message}
          </AlertBanner>
        )}

        {/* Tenant Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Basic Info</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantSettingsForm tenant={tenant} isOwner={isOwner} />
          </CardContent>
        </Card>

        {/* Member Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Members ({members.length})</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                  + Invite
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <MemberList
              members={members}
              currentUserId={user.id}
              ownerUserId={tenant.ownerUserId}
              onRemove={(userId) => {
                const form = document.createElement("form");
                form.method = "post";
                form.style.display = "none";

                const actionInput = document.createElement("input");
                actionInput.name = "_action";
                actionInput.value = "removeMember";
                form.appendChild(actionInput);

                const userIdInput = document.createElement("input");
                userIdInput.name = "userId";
                userIdInput.value = userId;
                form.appendChild(userIdInput);

                document.body.appendChild(form);
                form.submit();
              }}
            />
          </CardContent>
        </Card>

        <InviteMemberDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onInvite={(email, role) => {
            const form = document.createElement("form");
            form.method = "post";
            form.style.display = "none";

            const actionInput = document.createElement("input");
            actionInput.name = "_action";
            actionInput.value = "inviteMember";
            form.appendChild(actionInput);

            const emailInput = document.createElement("input");
            emailInput.name = "email";
            emailInput.value = email;
            form.appendChild(emailInput);

            const roleInput = document.createElement("input");
            roleInput.name = "role";
            roleInput.value = role;
            form.appendChild(roleInput);

            document.body.appendChild(form);
            form.submit();
          }}
        />
      </div>
    </AppShell>
  );
}
