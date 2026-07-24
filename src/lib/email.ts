import { createEmailSender } from "./email-delivery.mjs";
import { serverLog } from "./server-log";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let deliverEmail: ReturnType<typeof createEmailSender> | null = null;

export async function sendEmail(message: EmailMessage) {
  try {
    deliverEmail ??= createEmailSender();
    await deliverEmail(message);
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && isMissingConfiguration(error)) {
      serverLog("info", "email.preview.skipped", { transportConfigured: false });
      return;
    }
    throw error;
  }
}

function isMissingConfiguration(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string" && error.code.endsWith("_MISSING");
}
