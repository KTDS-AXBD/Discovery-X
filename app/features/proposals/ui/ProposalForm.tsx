import { Form, useNavigation } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { SECTION_CONFIG, SECTION_GROUPS } from "~/features/proposals/constants";
import { CategoryInput } from "./CategoryInput";

interface ProposalFormProps {
  defaultValues?: {
    title?: string;
    description?: string;
    category?: string;
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
      <h1 className="mb-6 text-xl font-bold text-fg">
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
            className="w-full rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none"
            rows={3}
          />
        </FormField>
        <FormField label="분야" htmlFor="category">
          <CategoryInput defaultValue={defaultValues?.category} />
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

      {/* Sections grouped */}
      <div className="mb-6 space-y-6">
        <h2 className="text-sm font-semibold text-fg">제안 섹션</h2>
        {SECTION_GROUPS.map((group) => (
          <div key={group.name}>
            <h3 className="mb-2 text-xs font-semibold text-fg-tertiary uppercase tracking-wider">
              {group.name}
            </h3>
            <div className="space-y-3">
              {group.types.map((type) => {
                const sec = SECTION_CONFIG.find((s) => s.type === type);
                if (!sec) return null;
                return (
                  <div key={sec.type}>
                    <label
                      htmlFor={`section_${sec.type}`}
                      className="mb-1 flex items-center gap-1.5 text-sm font-medium text-fg"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-secondary text-[10px] font-bold text-fg-tertiary">
                        {sec.icon}
                      </span>
                      {sec.label}
                    </label>
                    <textarea
                      name={`section_${sec.type}`}
                      id={`section_${sec.type}`}
                      defaultValue={defaultValues?.sections?.[sec.type]}
                      placeholder={sec.placeholder}
                      className="w-full rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none"
                      rows={4}
                    />
                  </div>
                );
              })}
            </div>
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
