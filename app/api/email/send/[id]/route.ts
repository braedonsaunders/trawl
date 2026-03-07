import { NextRequest, NextResponse } from "next/server";
import { getEmailById, updateEmailStatus, getSentToday } from "@/lib/db/queries/emails";
import { updateLeadStatus } from "@/lib/db/queries/leads";
import { getSetting } from "@/lib/db/queries/settings";
import { sendEmail } from "@/lib/email/smtp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emailId = parseInt(id, 10);

    if (isNaN(emailId)) {
      return NextResponse.json(
        { error: "Invalid email ID" },
        { status: 400 }
      );
    }

    const email = getEmailById(emailId);

    if (!email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    if (email.status !== "draft") {
      return NextResponse.json(
        { error: `Email is not in draft status (current: ${email.status})` },
        { status: 422 }
      );
    }

    // Check daily send cap
    const dailyCap = parseInt(getSetting("daily_send_cap") || "50", 10);
    const sentToday = getSentToday();

    if (sentToday >= dailyCap) {
      return NextResponse.json(
        {
          error: "Daily send cap reached",
          sent_today: sentToday,
          daily_cap: dailyCap,
        },
        { status: 429 }
      );
    }

    if (!email.to_email) {
      return NextResponse.json(
        { error: "No recipient email address set" },
        { status: 422 }
      );
    }

    // Send via SMTP
    const result = await sendEmail({
      to: email.to_email,
      toName: email.to_name || undefined,
      subject: email.subject || "",
      bodyHtml: email.body_html || "",
      bodyText: email.body_text || "",
    });

    // Update email status
    updateEmailStatus(emailId, "sent", {
      thread_id: result.messageId,
      sent_at: new Date().toISOString(),
    });

    // Update lead status
    updateLeadStatus(email.lead_id, "contacted");

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/send/[id]]", error);
    return NextResponse.json(
      { error: "Email send failed", detail: message },
      { status: 500 }
    );
  }
}
