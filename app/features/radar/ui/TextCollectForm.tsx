import { useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card, CardContent } from "~/components/ui/Card";

interface TextCollectFormProps {
  onSuccess?: (item: unknown) => void;
}

export function TextCollectForm({ onSuccess }: TextCollectFormProps) {
  const fetcher = useFetcher<{ error?: string; item?: unknown }>();
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state === "submitting";
  const error = fetcher.data?.error;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.item) {
      formRef.current?.reset();
      onSuccess?.(fetcher.data.item);
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  return (
    <Card>
      <CardContent className="pt-4">
        <fetcher.Form
          ref={formRef}
          method="post"
          action="/api/radar/manual-collect"
          className="space-y-3"
        >
          <input type="hidden" name="intent" value="text" />
          {error && (
            <AlertBanner variant="destructive">{error}</AlertBanner>
          )}
          <FormField label="제목" htmlFor="collect-title" required>
            <Input
              id="collect-title"
              name="title"
              required
              placeholder="메모 제목"
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="내용" htmlFor="collect-content" required>
            <Textarea
              id="collect-content"
              name="content"
              required
              rows={6}
              placeholder="수집할 내용을 입력하세요..."
              disabled={isSubmitting}
            />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
              등록
            </Button>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
