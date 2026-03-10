import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";

interface SendToIdeaButtonProps {
  itemId: string;
  disabled?: boolean;
}

export function SendToIdeaButton({ itemId, disabled }: SendToIdeaButtonProps) {
  const fetcher = useFetcher<{ success?: boolean; error?: string; ideaId?: string }>();
  const isSubmitting = fetcher.state === "submitting";
  const isSuccess = fetcher.data?.success === true;

  return (
    <fetcher.Form
      method="post"
      action={`/api/radar/items/${itemId}/send-to-idea`}
    >
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled || isSubmitting || isSuccess}
        loading={isSubmitting}
      >
        {isSuccess ? "생성 완료!" : "💡 아이디어로 보내기"}
      </Button>
    </fetcher.Form>
  );
}
