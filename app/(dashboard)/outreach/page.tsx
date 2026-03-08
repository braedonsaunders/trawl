"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openMailtoUrls } from "@/lib/email/open-mailto";

interface EmailRecord {
  id: number;
  leadId: number;
  leadName: string;
  toEmail: string | null;
  toName: string | null;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  openedAt: string | null;
}

interface EmailListResponse {
  drafts?: EmailRecord[];
  history?: EmailRecord[];
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "opened":
      return "Opened in Mail";
    case "sent":
      return "Sent (Legacy)";
    case "replied":
      return "Replied (Legacy)";
    case "bounced":
      return "Bounced (Legacy)";
    default:
      return status.replace(/_/g, " ");
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "opened":
      return "bg-blue-100 text-blue-700";
    case "sent":
      return "bg-emerald-100 text-emerald-700";
    case "replied":
      return "bg-amber-100 text-amber-800";
    case "bounced":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function OutreachPage() {
  const [drafts, setDrafts] = useState<EmailRecord[]>([]);
  const [history, setHistory] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openingIds, setOpeningIds] = useState<Set<number>>(new Set());
  const [bulkOpening, setBulkOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchEmails();
  }, []);

  const draftableIds = useMemo(
    () => drafts.filter((draft) => Boolean(draft.toEmail)).map((draft) => draft.id),
    [drafts]
  );

  const missingRecipientCount = drafts.length - draftableIds.length;
  const allSelected =
    draftableIds.length > 0 && draftableIds.every((id) => selectedIds.has(id));

  async function fetchEmails() {
    setLoading(true);

    try {
      const res = await fetch("/api/email/list");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || "Failed to load drafts");
      }

      const data = (await res.json()) as EmailListResponse;
      const nextDrafts = data.drafts ?? [];
      const nextHistory = data.history ?? [];

      setDrafts(nextDrafts);
      setHistory(nextHistory);
      setSelectedIds(
        (current) =>
          new Set(
            [...current].filter((id) => nextDrafts.some((draft) => draft.id === id))
          )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }

  function setOpening(emailId: number, active: boolean) {
    setOpeningIds((current) => {
      const next = new Set(current);
      if (active) {
        next.add(emailId);
      } else {
        next.delete(emailId);
      }
      return next;
    });
  }

  function toggleSelect(emailId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allSelected) {
        return new Set();
      }

      return new Set(draftableIds);
    });
  }

  async function handleOpenSingle(emailId: number) {
    setOpening(emailId, true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/email/draft/${emailId}`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          payload.detail || payload.error || "Failed to prepare draft in mail app"
        );
      }

      await openMailtoUrls([payload.mailtoUrl]);
      setNotice("Draft opened in your default mail app.");
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(emailId);
        return next;
      });
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open draft");
    } finally {
      setOpening(emailId, false);
    }
  }

  async function handleOpenBatch(emailIds: number[]) {
    if (emailIds.length === 0) {
      return;
    }

    setBulkOpening(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/email/draft/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_ids: emailIds }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          payload.detail || payload.error || "Failed to prepare drafts in mail app"
        );
      }

      const urls = Array.isArray(payload.drafts)
        ? payload.drafts
            .map((draft: { mailtoUrl?: string }) => draft.mailtoUrl)
            .filter((url: string | undefined): url is string => Boolean(url))
        : [];

      await openMailtoUrls(urls);

      const skipped = typeof payload.skipped === "number" ? payload.skipped : 0;
      setNotice(
        skipped > 0
          ? `Opened ${urls.length} drafts in your mail app. ${skipped} drafts were skipped because they do not have a recipient email.`
          : `Opened ${urls.length} drafts in your default mail app.`
      );
      setSelectedIds(new Set());
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open drafts");
    } finally {
      setBulkOpening(false);
    }
  }

  async function handleDelete(emailId: number) {
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/email/${emailId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || "Failed to delete draft");
      }

      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(emailId);
        return next;
      });
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete draft");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Outreach Drafts</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Generate personalized drafts in Trawl, then open one or many of them in
          your default desktop mail app. Each selected lead opens as a separate
          compose window so you can make final edits before sending.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Ready To Open
              {drafts.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({drafts.length})
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              AI-generated drafts waiting to be opened in your mail client.
            </p>
          </div>

          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                {allSelected ? "Clear Selection" : "Select All Draftable"}
              </button>
              <button
                type="button"
                onClick={() => handleOpenBatch([...selectedIds])}
                disabled={selectedIds.size === 0 || bulkOpening}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkOpening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Draft Selected
              </button>
              <button
                type="button"
                onClick={() => handleOpenBatch(draftableIds)}
                disabled={draftableIds.length === 0 || bulkOpening}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkOpening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Draft All In Mail
              </button>
            </div>
          )}
        </div>

        {drafts.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No draft emails yet. Generate them from a lead page or from the leads
            table bulk actions.
          </div>
        ) : (
          <div className="divide-y">
            {drafts.map((draft) => {
              const isExpanded = expandedId === draft.id;
              const isOpening = openingIds.has(draft.id);

              return (
                <div key={draft.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(draft.id)}
                      onChange={() => toggleSelect(draft.id)}
                      disabled={!draft.toEmail}
                      className="mt-1 rounded border-input"
                      aria-label={`Select ${draft.leadName}`}
                    />

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : draft.id)
                        }
                        className="flex w-full items-start gap-3 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{draft.leadName}</p>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                draft.toEmail
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-amber-100 text-amber-800"
                              )}
                            >
                              {draft.toEmail ? draft.toEmail : "Recipient needed"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {draft.subject}
                          </p>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-4 rounded-xl bg-muted/40 p-4">
                          <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Lead
                              </p>
                              <p className="mt-1">{draft.leadName}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Recipient
                              </p>
                              <p className="mt-1">{draft.toEmail || "No email found yet"}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Subject
                              </p>
                              <p className="mt-1">{draft.subject}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Body
                              </p>
                              <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm leading-6 text-foreground">
                                {draft.body}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(draft.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenSingle(draft.id)}
                          disabled={isOpening || !draft.toEmail}
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isOpening ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          Open In Mail
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(draft.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {missingRecipientCount > 0 && (
          <div className="border-t px-6 py-3 text-sm text-amber-800">
            {missingRecipientCount} draft
            {missingRecipientCount === 1 ? "" : "s"} need a surfaced email address
            before they can be opened in your mail client.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Mail Activity</h2>
          <p className="text-sm text-muted-foreground">
            Drafts you already opened in your desktop mail app, plus any legacy
            records from the previous in-app send flow.
          </p>
        </div>

        {history.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No mail activity yet.
          </div>
        ) : (
          <div className="divide-y">
            {history.map((email) => {
              const isOpening = openingIds.has(email.id);

              return (
                <div
                  key={email.id}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{email.leadName}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusBadgeClass(email.status)
                        )}
                      >
                        {formatStatusLabel(email.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {email.subject}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {email.toEmail || "No recipient recorded"}
                      {email.openedAt
                        ? ` • ${new Date(email.openedAt).toLocaleString()}`
                        : ` • ${new Date(email.createdAt).toLocaleString()}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenSingle(email.id)}
                    disabled={isOpening || !email.toEmail}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isOpening ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Draft Again
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
