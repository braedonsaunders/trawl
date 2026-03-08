import { NextResponse } from "next/server";
import {
  getEmailDraftsWithLead,
  getEmailHistoryWithLead,
  type EmailWithLead,
} from "@/lib/db/queries/emails";
import { getEmailPlainText } from "@/lib/email/drafts";

function formatEmail(email: EmailWithLead) {
  return {
    id: email.id,
    leadId: email.lead_id,
    leadName: email.lead_name,
    toEmail: email.to_email,
    toName: email.to_name,
    subject: email.subject || "Untitled draft",
    body: getEmailPlainText(email),
    status: email.status,
    createdAt: email.created_at,
    openedAt: email.sent_at || email.replied_at,
  };
}

export async function GET() {
  try {
    return NextResponse.json({
      drafts: getEmailDraftsWithLead().map(formatEmail),
      history: getEmailHistoryWithLead().map(formatEmail),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/email/list]", error);
    return NextResponse.json(
      { error: "Failed to load email drafts", detail: message },
      { status: 500 }
    );
  }
}
