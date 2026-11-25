import {
  resolveNotificationTemplate,
  type NotificationTemplateId,
} from "./templates.js";

export type NotificationMessage = {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  template?: NotificationTemplateId | string;
  data?: Record<string, unknown>;
};

export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}

function resolveMessage(message: NotificationMessage) {
  const resolved = resolveNotificationTemplate(message.template, message.data, {
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return {
    to: message.to,
    subject: resolved.subject,
    text: resolved.text,
    html: resolved.html,
    template: message.template || "-",
  };
}

export class ConsoleNotificationAdapter implements NotificationPort {
  async send(message: NotificationMessage): Promise<void> {
    const resolved = resolveMessage(message);
    console.log(
      `[notify] to=${resolved.to} subject=${JSON.stringify(resolved.subject)} template=${resolved.template}`
    );
    if (resolved.text) console.log(`[notify] body=${resolved.text.slice(0, 500)}`);
  }
}

export class ResendNotificationAdapter implements NotificationPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: NotificationMessage): Promise<void> {
    const resolved = resolveMessage(message);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [resolved.to],
        subject: resolved.subject,
        text: resolved.text,
        html: resolved.html || undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`resend ${res.status}: ${text}`);
    }
  }
}

export function createNotificationPort(): NotificationPort {
  const provider = (process.env.NOTIFICATION_PROVIDER || "console").toLowerCase().trim();
  if (provider === "none") {
    return {
      async send() {
        /* no-op */
      },
    };
  }
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.warn(
        "[notify] NOTIFICATION_PROVIDER=resend but RESEND_API_KEY missing; falling back to console"
      );
      return new ConsoleNotificationAdapter();
    }
    const from =
      process.env.RESEND_FROM?.trim() || "ENGen <onboarding@resend.dev>";
    return new ResendNotificationAdapter(apiKey, from);
  }
  return new ConsoleNotificationAdapter();
}
