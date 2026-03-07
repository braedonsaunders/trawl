"use client";

import { useEffect, useState } from "react";
import {
  Inbox,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  timestamp: string;
}

interface Conversation {
  leadId: string;
  leadName: string;
  replySnippet: string;
  handoffStatus: "none" | "pending" | "handed_off";
  messages: Message[];
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  useEffect(() => {
    fetchInbox();
  }, []);

  async function fetchInbox() {
    try {
      const res = await fetch("/api/inbox");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handlePoll() {
    setPolling(true);
    try {
      await fetch("/api/inbox/poll", { method: "POST" });
      await fetchInbox();
    } catch {
      // silently handle
    } finally {
      setPolling(false);
    }
  }

  const handoffBadge: Record<string, { label: string; className: string }> = {
    none: { label: "No handoff", className: "bg-gray-100 text-gray-600" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
    handed_off: {
      label: "Handed off",
      className: "bg-green-100 text-green-700",
    },
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Inbox &amp; Replies
        </h1>
        <button
          onClick={handlePoll}
          disabled={polling}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {polling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Poll Now
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            No conversations yet. Replies will appear here after you send
            outreach emails.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((convo) => {
            const badge = handoffBadge[convo.handoffStatus] ?? handoffBadge.none;
            const isExpanded = expandedLead === convo.leadId;

            return (
              <div
                key={convo.leadId}
                className="rounded-xl border bg-card shadow-sm"
              >
                {/* Conversation header */}
                <button
                  onClick={() =>
                    setExpandedLead(isExpanded ? null : convo.leadId)
                  }
                  className="flex w-full items-center gap-3 px-6 py-4 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{convo.leadName}</p>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {convo.replySnippet}
                    </p>
                  </div>
                </button>

                {/* Expanded thread */}
                {isExpanded && (
                  <div className="border-t px-6 py-4">
                    <div className="space-y-4">
                      {convo.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "rounded-lg p-4",
                            msg.direction === "inbound"
                              ? "bg-blue-50 ml-0 mr-12"
                              : "bg-muted/50 ml-12 mr-0"
                          )}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            {msg.direction === "inbound" ? (
                              <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium capitalize text-muted-foreground">
                              {msg.direction}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {msg.subject && (
                            <p className="mb-1 text-sm font-medium">
                              {msg.subject}
                            </p>
                          )}
                          <div className="whitespace-pre-wrap text-sm">
                            {msg.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
