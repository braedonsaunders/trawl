"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Send,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailDraft {
  id: string;
  leadId: string;
  leadName: string;
  subject: string;
  body: string;
  createdAt: string;
}

interface SentEmail {
  id: string;
  leadName: string;
  subject: string;
  status: "sent" | "replied" | "bounced";
  sentAt: string;
}

export default function OutreachPage() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  useEffect(() => {
    fetchEmails();
  }, []);

  async function fetchEmails() {
    try {
      const res = await fetch("/api/email/list");
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts ?? []);
        setSentEmails(data.sent ?? []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(emailId: string) {
    setSendingId(emailId);
    try {
      const res = await fetch(`/api/email/send/${emailId}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchEmails();
      }
    } catch {
      // silently handle
    } finally {
      setSendingId(null);
    }
  }

  async function handleBulkSend() {
    setBulkSending(true);
    try {
      const res = await fetch("/api/email/send/batch", { method: "POST" });
      if (res.ok) {
        await fetchEmails();
      }
    } catch {
      // silently handle
    } finally {
      setBulkSending(false);
    }
  }

  async function handleDelete(emailId: string) {
    try {
      const res = await fetch(`/api/email/${emailId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchEmails();
      }
    } catch {
      // silently handle
    }
  }

  const statusBadgeColor: Record<string, string> = {
    sent: "bg-blue-100 text-blue-700",
    replied: "bg-green-100 text-green-700",
    bounced: "bg-red-100 text-red-700",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Email Outreach</h1>

      {/* Drafts Section */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Drafts
            {drafts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({drafts.length})
              </span>
            )}
          </h2>
          {drafts.length > 0 && (
            <button
              onClick={handleBulkSend}
              disabled={bulkSending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {bulkSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send All
            </button>
          )}
        </div>

        {drafts.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No draft emails. Generate emails from the lead detail page.
          </div>
        ) : (
          <div className="divide-y">
            {drafts.map((draft) => (
              <div key={draft.id} className="px-6 py-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() =>
                      setExpandedDraft(
                        expandedDraft === draft.id ? null : draft.id
                      )
                    }
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {expandedDraft === draft.id ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{draft.leadName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {draft.subject}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 ml-4">
                    <span className="text-xs text-muted-foreground mr-2">
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSend(draft.id)}
                      disabled={sendingId === draft.id}
                      className="rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10"
                      title="Send"
                    >
                      {sendingId === draft.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(draft.id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expandedDraft === draft.id && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-4">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      Preview
                    </p>
                    <p className="mb-1 text-sm font-medium">
                      Subject: {draft.subject}
                    </p>
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {draft.body}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent Emails Section */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Sent
            {sentEmails.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({sentEmails.length})
              </span>
            )}
          </h2>
        </div>

        {sentEmails.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No emails sent yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Lead
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Subject
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Sent
                  </th>
                </tr>
              </thead>
              <tbody>
                {sentEmails.map((email) => (
                  <tr
                    key={email.id}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-6 py-3 font-medium">
                      {email.leadName}
                    </td>
                    <td className="max-w-[300px] truncate px-6 py-3 text-muted-foreground">
                      {email.subject}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          statusBadgeColor[email.status] ??
                            "bg-gray-100 text-gray-600"
                        )}
                      >
                        {email.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(email.sentAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
