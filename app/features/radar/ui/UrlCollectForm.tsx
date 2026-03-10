import { useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card, CardContent } from "~/components/ui/Card";

interface UrlCollectFormProps {
  onSuccess?: (item: unknown) => void;
}

export function UrlCollectForm({ onSuccess }: UrlCollectFormProps) {
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
          <input type="hidden" name="intent" value="url" />
          {error && (
            <AlertBanner variant="destructive">{error}</AlertBanner>
          )}
          <FormField label="URL" htmlFor="collect-url" required>
            <Input
              id="collect-url"
              name="url"
              type="url"
              required
              placeholder="https://..."
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
