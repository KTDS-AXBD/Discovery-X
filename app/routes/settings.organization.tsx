/**
 * /settings/organization — Organization settings page.
 * Multi-Tenant F6: Manage tenant info, members, and feature settings.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData } from "@remix-run/react";
import { useState } from "react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SettingsService } from "~/features/settings/service";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MemberList } from "~/features/settings/ui/MemberList";
import { InviteMemberDialog } from "~/features/settings/ui/InviteMemberDialog";
import { TenantSettingsForm } from "~/features/settings/ui/TenantSettingsForm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const service = new SettingsService(db);
  const tenant = await service.getTenant(ctx.tenantId);
  if (!tenant) return redirect("/onboarding");

  const members = await service.getMembers(ctx.tenantId);

  return json({
    user: ctx.user,
    tenantRole: ctx.tenantRole,
    tenant,
    members,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const service = new SettingsService(db);
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  switch (actionType) {
    case "updateTenant": {
      const name = formData.get("name") as string;
      const result = await service.updateTenantName(ctx.tenantId, ctx.user.id, name);
      if (!result.success) return json({ error: result.error });
      return json({ success: true, message: "Organization updated." });
    }

    case "inviteMember": {
      const email = formData.get("email") as string;
      const role = (formData.get("role") as string) || "member";
      const result = await service.inviteMember(ctx.tenantId, email, role, ctx.user.id);
      if (!result.success) return json({ error: result.error });
      return json({ success: true, message: result.message });
    }

    case "removeMember": {
      const userId = formData.get("userId") as string;
      const result = await service.removeMember(ctx.tenantId, userId);
      if (!result.success) return json({ error: result.error });
      return json({ success: true, message: result.message });
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
        <h1 className="mb-6 text-xl font-bold text-fg">
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
