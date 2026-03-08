import { NextResponse } from "next/server";
import { getEmailById, updateEmailStatus } from "@/lib/db/queries/emails";
import { updateLeadStatus } from "@/lib/db/queries/leads";
import { buildMailtoUrl, getEmailPlainText } from "@/lib/email/drafts";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emailId = Number.parseInt(id, 10);

    if (!Number.isFinite(emailId)) {
      return NextResponse.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const email = getEmailById(emailId);
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    if (!email.to_email) {
      return NextResponse.json(
        { error: "No recipient email address found for this draft" },
        { status: 422 }
      );
    }

    const openedAt = new Date().toISOString();
    const mailtoUrl = buildMailtoUrl({
      to: email.to_email,
      subject: email.subject,
      body: getEmailPlainText(email),
    });

    updateEmailStatus(emailId, "opened", { sent_at: openedAt });
    updateLeadStatus(email.lead_id, "contacted");

    return NextResponse.json({
      success: true,
      emailId,
      openedAt,
      mailtoUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/draft/[id]]", error);
    return NextResponse.json(
      { error: "Failed to prepare desktop mail draft", detail: message },
      { status: 500 }
    );
  }
}
