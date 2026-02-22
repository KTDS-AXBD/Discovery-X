import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { Badge } from "~/components/ui/Badge";
import type { TenantSettings } from "~/db/schema";

interface TenantSettingsFormProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    settings: TenantSettings | null;
  };
  isOwner: boolean;
}

export function TenantSettingsForm({ tenant, isOwner }: TenantSettingsFormProps) {
  const features = tenant.settings?.features || {};

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Form method="post">
        <input type="hidden" name="_action" value="updateTenant" />
        <div className="space-y-4">
          <FormField label="Organization Name">
            <Input
              name="name"
              defaultValue={tenant.name}
              disabled={!isOwner}
            />
          </FormField>
          <FormField label="Slug">
            <Input
              name="slug"
              defaultValue={tenant.slug}
              disabled
              className="opacity-60"
            />
          </FormField>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-secondary">Plan:</span>
            <Badge variant="purple">{tenant.plan}</Badge>
            <span className="text-sm text-fg-secondary">Status:</span>
            <Badge variant={tenant.status === "active" ? "success" : "warning"}>
              {tenant.status}
            </Badge>
          </div>
          {isOwner && (
            <Button type="submit" size="sm">
              Save
            </Button>
          )}
        </div>
      </Form>

      {/* Feature Toggles */}
      <div>
        <h4 className="mb-3 text-sm font-medium text-fg">
          Features
        </h4>
        <div className="space-y-2">
          {[
            { key: "radarEnabled", label: "Radar" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-md border border-surface-tertiary px-3 py-2">
              <span className="text-sm text-fg-secondary">{label}</span>
              <Badge variant={(features as Record<string, unknown>)[key] ? "success" : "secondary"}>
                {(features as Record<string, unknown>)[key] ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
