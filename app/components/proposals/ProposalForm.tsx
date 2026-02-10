import { Form, useNavigation } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { SECTION_CONFIG } from "~/features/proposals/constants";

interface ProposalFormProps {
  defaultValues?: {
    title?: string;
    description?: string;
    teamSize?: number;
    startDate?: string;
    budget?: string;
    sections?: Record<string, string>;
  };
  action?: string;
}


export function ProposalForm({ defaultValues, action }: ProposalFormProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Form method="post" action={action} className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="mb-6 text-xl font-bold text-[var(--axis-text-primary)]">
        {defaultValues?.title ? "제안 수정" : "새 사업제안서"}
      </h1>

      {/* Basic info */}
      <div className="mb-6 space-y-4">
        <FormField label="제목" htmlFor="title" required>
          <Input
            name="title"
            id="title"
            required
            defaultValue={defaultValues?.title}
            placeholder="사업 제안 제목"
          />
        </FormField>
        <FormField label="설명" htmlFor="description">
          <textarea
            name="description"
            id="description"
            defaultValue={defaultValues?.description}
            placeholder="사업 제안에 대한 간략한 설명..."
            className="w-full rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
            rows={3}
          />
        </FormField>
      </div>

      {/* Meta fields */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="팀 규모 (명)" htmlFor="teamSize">
          <Input
            type="number"
            name="teamSize"
            id="teamSize"
            min={1}
            defaultValue={defaultValues?.teamSize}
            placeholder="3"
          />
        </FormField>
        <FormField label="예상 시작일" htmlFor="startDate">
          <Input
            type="date"
            name="startDate"
            id="startDate"
            defaultValue={defaultValues?.startDate}
          />
        </FormField>
        <FormField label="예상 예산" htmlFor="budget">
          <Input
            name="budget"
            id="budget"
            defaultValue={defaultValues?.budget}
            placeholder="1,000만원"
          />
        </FormField>
      </div>

      {/* Sections */}
      <div className="mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">제안 섹션</h2>
        {SECTION_CONFIG.map((sec) => (
          <div key={sec.type}>
            <label
              htmlFor={`section_${sec.type}`}
              className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--axis-text-primary)]"
            >
              <span>{sec.icon}</span>
              {sec.label}
            </label>
            <textarea
              name={`section_${sec.type}`}
              id={`section_${sec.type}`}
              defaultValue={defaultValues?.sections?.[sec.type]}
              placeholder={sec.placeholder}
              className="w-full rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
              rows={4}
            />
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "저장 중..." : defaultValues?.title ? "수정" : "제안 작성"}
        </Button>
      </div>
    </Form>
  );
}
