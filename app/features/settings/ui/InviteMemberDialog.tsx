import { useState } from "react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";

interface InviteMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => void;
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "gatekeeper", label: "Gatekeeper" },
  { value: "viewer", label: "Viewer" },
];

export function InviteMemberDialog({ open, onClose, onInvite }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      onInvite(email.trim(), role);
      setEmail("");
      setRole("member");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
      />
      <div className="relative w-full max-w-md rounded-lg border border-surface-tertiary bg-surface-primary p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-fg">
          Invite Member
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <FormField label="Email">
              <Input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Role">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Send Invite
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
