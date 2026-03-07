import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { updateLeadStatus } from "@/lib/db/queries/leads";
import { updateEmailStatus } from "@/lib/db/queries/emails";
import { createConversation } from "@/lib/db/queries/conversations";
import { getSetting } from "@/lib/db/queries/settings";
import { pollForReplies } from "@/lib/email/imap";
import { sendEmail } from "@/lib/email/smtp";
import { callLLM } from "@/lib/llm/client";
import { buildHandoffPrompt } from "@/lib/llm/prompts/handoff";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import type { HandoffResult } from "@/lib/llm/types";

export async function POST() {
  try {
    const db = getDb();

    // Get all sent emails with thread IDs
    const sentEmails = db
      .prepare(
        "SELECT * FROM outreach_emails WHERE status = 'sent' AND thread_id IS NOT NULL"
      )
      .all() as Array<{
      id: number;
      lead_id: number;
      thread_id: string;
      subject: string;
      body_text: string;
      to_email: string;
    }>;

    const threadIds = sentEmails.map((e) => e.thread_id);

    if (threadIds.length === 0) {
      return NextResponse.json({
        replies_found: 0,
        handoffs_sent: 0,
        message: "No sent emails with thread IDs to poll",
      });
    }

    const replies = await pollForReplies(threadIds);

    let repliesFound = 0;
    let handoffsSent = 0;

    for (const reply of replies) {
      try {
        const originalEmail = sentEmails.find(
          (e) => e.thread_id === reply.threadId
        );
        if (!originalEmail) continue;

        repliesFound++;

        // Create inbound conversation record
        createConversation({
          lead_id: originalEmail.lead_id,
          email_id: originalEmail.id,
          direction: "inbound",
          sender: reply.from,
          body: reply.body,
        });

        updateLeadStatus(originalEmail.lead_id, "replied");
        updateEmailStatus(originalEmail.id, "replied", {
          replied_at: new Date().toISOString(),
        });

        // Look up handoff contact
        const handoffContactsJson = getSetting("handoff_contacts");
        if (!handoffContactsJson) continue;

        const handoffContacts = JSON.parse(handoffContactsJson);
        if (!handoffContacts.length) continue;

        const handoffContact = handoffContacts[0]; // Default to first contact
        const company = getCompanyProfile();

        // Generate AI bridge email
        const prompt = buildHandoffPrompt(
          originalEmail.body_text || "",
          reply.body,
          {
            name: handoffContact.name,
            email: handoffContact.email,
            title: handoffContact.title,
          },
          {
            name: company?.name || "",
            industry: "",
            services: company?.services ? JSON.parse(company.services) : [],
            description: company?.description || "",
          }
        );

        const { parsed: bridgeData } = await callLLM<HandoffResult>({
          ...prompt,
          temperature: 0.5,
          maxTokens: 600,
        });

        // Send bridge email with human CC'd
        await sendEmail({
          to: reply.from,
          subject: bridgeData.subject,
          bodyHtml: bridgeData.body_html,
          bodyText: bridgeData.body_text,
          cc: handoffContact.email,
        });

        // Create outbound conversation for bridge email
        createConversation({
          lead_id: originalEmail.lead_id,
          email_id: originalEmail.id,
          direction: "outbound",
          body: bridgeData.body_text,
          is_ai_response: true,
          handoff_tag: handoffContact.tag || "sales",
          handoff_to_email: handoffContact.email,
        });

        updateLeadStatus(originalEmail.lead_id, "handed_off");
        handoffsSent++;
      } catch (err) {
        console.error("[Inbox Poll] Error processing reply:", err);
      }
    }

    return NextResponse.json({
      replies_found: repliesFound,
      handoffs_sent: handoffsSent,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/inbox/poll]", error);
    return NextResponse.json(
      { error: "Inbox polling failed", detail: message },
      { status: 500 }
    );
  }
}
