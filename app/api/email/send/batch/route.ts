import { NextResponse } from "next/server";
import { getEmailDrafts, updateEmailStatus, getSentToday } from "@/lib/db/queries/emails";
import { updateLeadStatus } from "@/lib/db/queries/leads";
import { getSetting } from "@/lib/db/queries/settings";
import { sendEmail } from "@/lib/email/smtp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  try {
    const dailyCap = parseInt(getSetting("daily_send_cap") || "50", 10);
    const sendDelay = parseInt(getSetting("send_delay_seconds") || "45", 10);
    const sentToday = getSentToday();
    const remaining = Math.max(0, dailyCap - sentToday);

    if (remaining === 0) {
      return NextResponse.json({
        sent: 0,
        skipped: 0,
        cap_remaining: 0,
        message: "Daily send cap already reached",
      });
    }

    const drafts = getEmailDrafts();
    let sent = 0;
    let skipped = 0;

    for (const email of drafts) {
      if (sent >= remaining) {
        skipped++;
        continue;
      }

      if (!email.to_email) {
        skipped++;
        continue;
      }

      try {
        const result = await sendEmail({
          to: email.to_email,
          toName: email.to_name || undefined,
          subject: email.subject || "",
          bodyHtml: email.body_html || "",
          bodyText: email.body_text || "",
        });

        updateEmailStatus(email.id, "sent", {
          thread_id: result.messageId,
          sent_at: new Date().toISOString(),
        });

        updateLeadStatus(email.lead_id, "contacted");
        sent++;

        // Delay between sends
        if (sent < remaining && sent < drafts.length) {
          await sleep(sendDelay * 1000);
        }
      } catch (err) {
        console.error(`[Batch Send] Failed for email ${email.id}:`, err);
        skipped++;
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      cap_remaining: remaining - sent,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/email/send/batch]", error);
    return NextResponse.json(
      { error: "Batch send failed", detail: message },
      { status: 500 }
    );
  }
}
