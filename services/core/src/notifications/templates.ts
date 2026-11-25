export type NotificationTemplateId =
  | "org_invite"
  | "secondary_email_verify"
  | "comment_mention"
  | "primary_email_verify";

export type ResolvedNotification = {
  subject: string;
  text: string;
  html: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <h1 style="font-size:1.25rem">${esc(title)}</h1>
  ${bodyHtml}
  <p style="color:#666;font-size:0.85rem;margin-top:2rem">ENGen</p>
</body></html>`;
}

export function resolveNotificationTemplate(
  template: NotificationTemplateId | string | undefined,
  data: Record<string, unknown> | undefined,
  overrides?: { subject?: string; text?: string; html?: string }
): ResolvedNotification {
  const d = data || {};
  const site = String(
    d.siteUrl || process.env.PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");

  let subject = overrides?.subject || "";
  let text = overrides?.text || "";
  let html = overrides?.html || "";

  switch (template) {
    case "org_invite": {
      const role = String(d.role || "member");
      const acceptPath = String(d.acceptPath || "/");
      const acceptUrl = acceptPath.startsWith("http")
        ? acceptPath
        : `${site}${acceptPath.startsWith("/") ? "" : "/"}${acceptPath}`;
      subject = subject || "You're invited to an ENGen organization";
      text =
        text ||
        `You were invited to join an organization as ${role}.\n\nAccept the invite:\n${acceptUrl}\n`;
      html =
        html ||
        wrapHtml(
          "Organization invite",
          `<p>You were invited to join an organization as <strong>${esc(role)}</strong>.</p>
           <p><a href="${esc(acceptUrl)}">Accept invite</a></p>`
        );
      break;
    }
    case "secondary_email_verify": {
      const verifyUrl = String(d.verifyUrl || "");
      subject = subject || "Verify secondary email";
      text =
        text ||
        `Confirm this email for your ENGen account:\n${verifyUrl}\n`;
      html =
        html ||
        wrapHtml(
          "Verify secondary email",
          `<p>Confirm this email for your ENGen account.</p>
           <p><a href="${esc(verifyUrl)}">Verify email</a></p>`
        );
      break;
    }
    case "comment_mention": {
      const authorName = String(d.authorName || "Someone");
      const entryPathUrl = String(d.entryPathUrl || site);
      const snippet = String(d.snippet || "");
      subject = subject || "You were mentioned in a comment";
      text =
        text ||
        `${authorName} mentioned you on an entry: ${entryPathUrl}\n\n${snippet}\n`;
      html =
        html ||
        wrapHtml(
          "Comment mention",
          `<p><strong>${esc(authorName)}</strong> mentioned you on an entry.</p>
           <p><a href="${esc(entryPathUrl)}">Open entry</a></p>
           ${snippet ? `<blockquote>${esc(snippet)}</blockquote>` : ""}`
        );
      break;
    }
    case "primary_email_verify": {
      const verifyUrl = String(d.verifyUrl || "");
      subject = subject || "Verify your email";
      text =
        text ||
        `Verify your ENGen account email:\n${verifyUrl}\n`;
      html =
        html ||
        wrapHtml(
          "Verify your email",
          `<p>Confirm your ENGen account email.</p>
           <p><a href="${esc(verifyUrl)}">Verify email</a></p>`
        );
      break;
    }
    default: {
      subject = subject || "ENGen notification";
      text = text || "";
      html = html || (text ? wrapHtml(subject, `<pre style="white-space:pre-wrap">${esc(text)}</pre>`) : "");
      break;
    }
  }

  return { subject, text, html };
}
