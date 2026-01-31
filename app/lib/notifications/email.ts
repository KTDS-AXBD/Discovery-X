import { Resend } from "resend";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export function createEmailClient(apiKey: string) {
  const resend = new Resend(apiKey);

  return {
    async send(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
      try {
        const { error } = await resend.emails.send({
          from: "Discovery-X <noreply@ideaonaction.ai>",
          to: options.to,
          subject: options.subject,
          html: options.html,
        });

        if (error) {
          console.error("[Email] Send failed:", error);
          return { success: false, error: error.message };
        }

        return { success: true };
      } catch (err) {
        console.error("[Email] Unexpected error:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}

export type EmailClient = ReturnType<typeof createEmailClient>;
