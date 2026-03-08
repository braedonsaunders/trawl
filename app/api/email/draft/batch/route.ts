import { NextRequest, NextResponse } from "next/server";
import {
  getEmailDrafts,
  getEmailsByIds,
  updateEmailStatus,
} from "@/lib/db/queries/emails";
import { updateLeadStatus } from "@/lib/db/queries/leads";
import { buildMailtoUrl, getEmailPlainText } from "@/lib/email/drafts";

interface BatchDraftRequest {
  email_ids?: number[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as BatchDraftRequest;
    const requestedIds = Array.isArray(body.email_ids)
      ? body.email_ids.filter((id) => Number.isFinite(id))
      : [];

    const emails =
      requestedIds.length > 0 ? getEmailsByIds(requestedIds) : getEmailDrafts();

    const openedAt = new Date().toISOString();
    const drafts: Array<{ emailId: number; mailtoUrl: string }> = [];
    const skipped: Array<{ emailId: number; reason: string }> = [];

    for (const email of emails) {
      if (!email.to_email) {
        skipped.push({
          emailId: email.id,
          reason: "Missing recipient email address",
        });
        continue;
      }

      drafts.push({
        emailId: email.id,
        mailtoUrl: buildMailtoUrl({
          to: email.to_email,
          subject: email.subject,
          body: getEmailPlainText(email),
        }),
      });

      updateEmailStatus(email.id, "opened", { sent_at: openedAt });
      updateLeadStatus(email.lead_id, "contacted");
    }

    return NextResponse.json({
      success: true,
      opened: drafts.length,
      skipped: skipped.length,
      openedAt,
      drafts,
      skippedDrafts: skipped,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/draft/batch]", error);
    return NextResponse.json(
      { error: "Failed to prepare desktop mail drafts", detail: message },
      { status: 500 }
    );
  }
}
