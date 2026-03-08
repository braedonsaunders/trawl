interface MailtoOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string | null;
  body?: string | null;
}

function normalizeRecipients(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => entry.trim()).filter(Boolean);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function getEmailPlainText(input: {
  body_text?: string | null;
  body_html?: string | null;
}): string {
  if (typeof input.body_text === "string" && input.body_text.trim().length > 0) {
    return input.body_text.trim();
  }

  if (typeof input.body_html === "string" && input.body_html.trim().length > 0) {
    return htmlToPlainText(input.body_html);
  }

  return "";
}

export function buildMailtoUrl(options: MailtoOptions): string {
  const to = normalizeRecipients(options.to).join(",");
  const cc = normalizeRecipients(options.cc);
  const bcc = normalizeRecipients(options.bcc);
  const params: Array<[string, string]> = [];

  if (cc.length > 0) {
    params.push(["cc", cc.join(",")]);
  }

  if (bcc.length > 0) {
    params.push(["bcc", bcc.join(",")]);
  }

  if (typeof options.subject === "string" && options.subject.trim().length > 0) {
    params.push(["subject", options.subject.trim()]);
  }

  if (typeof options.body === "string" && options.body.trim().length > 0) {
    params.push(["body", options.body.trim()]);
  }

  const query = params
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");

  return query.length > 0 ? `mailto:${to}?${query}` : `mailto:${to}`;
}
