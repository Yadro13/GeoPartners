export type EmailDeliveryMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailDeliveryResult = {
  transport: "smtp" | "brevo" | "resend";
  messageId?: string;
};

export type EmailEnvironment = Record<string, string | undefined>;

export function emailTransportMode(env?: EmailEnvironment): "smtp" | "brevo" | "resend";

export function createEmailSender(options?: {
  env?: EmailEnvironment;
  fetchImpl?: typeof fetch;
  mailerFactory?: (options: Record<string, unknown>) => {
    sendMail(message: EmailDeliveryMessage & { from: string }): Promise<unknown>;
  };
}): (message: EmailDeliveryMessage) => Promise<EmailDeliveryResult>;
