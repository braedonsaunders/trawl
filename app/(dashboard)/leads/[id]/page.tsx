"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Mail,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { openMailtoUrls } from "@/lib/email/open-mailto";
import { LeadDetail } from "@/components/leads/LeadDetail";

interface ActionFeedback {
  kind: "error" | "success";
  message: string;
  code?: string;
  provider?: string;
}

interface SavedContact {
  id: number;
  name: string | null;
  title: string | null;
  email: string | null;
  facility_name: string | null;
  source_type: "manual" | "research" | "enrichment";
  source_label: string | null;
  confidence: number | null;
  status: "active" | "suggested" | "archived";
  is_primary: boolean;
}

interface LeadContactResponse {
  name: string;
  contacts: SavedContact[];
}

interface RecipientOption {
  email: string;
  name: string;
  label: string;
  meta: string;
}

function buildRecipientOptions(lead: LeadContactResponse): RecipientOption[] {
  const uniqueContacts = new Map<string, RecipientOption>();
  const sortedSavedContacts = [...lead.contacts].sort((left, right) => {
    if (left.is_primary !== right.is_primary) {
      return Number(right.is_primary) - Number(left.is_primary);
    }

    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    if (left.source_type !== right.source_type) {
      if (left.source_type === "manual") {
        return -1;
      }
      if (right.source_type === "manual") {
        return 1;
      }
    }

    return (right.confidence ?? 0) - (left.confidence ?? 0);
  });

  for (const contact of sortedSavedContacts) {
    const email = contact.email?.trim();
    if (!email || uniqueContacts.has(email)) {
      continue;
    }

    const name = contact.name?.trim() || contact.title?.trim() || lead.name;
    const title = contact.title?.trim();
    const confidence =
      typeof contact.confidence === "number"
        ? `${Math.round(contact.confidence * 100)}% confidence`
        : null;
    const source =
      contact.source_label?.trim() ||
      (contact.source_type === "manual"
        ? "Manual contact"
        : contact.source_type === "research"
          ? "Deep find suggestion"
          : "Enrichment contact");
    const status =
      contact.status === "suggested" ? "Suggested" : "Saved contact";
    const primary = contact.is_primary ? "Primary" : null;

    uniqueContacts.set(email, {
      email,
      name,
      label: title ? `${name} (${title})` : name,
      meta: [
        email,
        contact.facility_name?.trim() || null,
        primary,
        status,
        confidence,
        source,
      ]
        .filter(Boolean)
        .join(" • "),
    });
  }

  return [...uniqueContacts.values()];
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(
    null
  );
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>(
    []
  );
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState("");
  const [recipientLeadName, setRecipientLeadName] = useState("");

  async function handleAction(endpoint: string, actionKey: string) {
    setActionLoading(actionKey);
    setActionFeedback(null);

    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        code?: string;
        provider?: string;
      };

      if (!response.ok) {
        setActionFeedback({
          kind: "error",
          message:
            payload.detail ||
            payload.error ||
            "The action failed. Check your settings and try again.",
          code: payload.code,
          provider: payload.provider,
        });
        return;
      }

      setRefreshKey((current) => current + 1);
    } catch {
      setActionFeedback({
        kind: "error",
        message: "The action failed. Check your connection and try again.",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleGenerateClick() {
    setActionLoading("email");
    setActionFeedback(null);

    try {
      const response = await fetch(`/api/leads/${leadId}`);
      const payload = (await response.json().catch(() => ({}))) as Partial<LeadContactResponse>;

      if (!response.ok) {
        throw new Error("Failed to load contacts for this lead.");
      }

      const lead = {
        name: typeof payload.name === "string" ? payload.name : "Lead",
        contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
      };
      const options = buildRecipientOptions(lead);

      if (options.length === 0) {
        setActionFeedback({
          kind: "error",
          message:
            "No saved contact emails are available for this lead yet. Add a contact, approve a suggestion, or run enrichment/deep find before generating a draft.",
        });
        return;
      }

      setRecipientLeadName(lead.name);
      setRecipientOptions(options);
      setSelectedRecipientEmail(options[0].email);
      setRecipientDialogOpen(true);
    } catch (error) {
      setActionFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load contacts for this lead.",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleGenerateDraft() {
    const selectedRecipient = recipientOptions.find(
      (option) => option.email === selectedRecipientEmail
    );

    if (!selectedRecipient) {
      setActionFeedback({
        kind: "error",
        message: "Choose a recipient before generating the draft.",
      });
      return;
    }

    setActionLoading("email");
    setActionFeedback(null);

    try {
      const generateResponse = await fetch(`/api/email/generate/${leadId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_email: selectedRecipient.email,
          to_name: selectedRecipient.name,
        }),
      });
      const generatePayload = (await generateResponse.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        code?: string;
        provider?: string;
        email_id?: number;
      };

      if (!generateResponse.ok) {
        setRecipientDialogOpen(false);
        setActionFeedback({
          kind: "error",
          message:
            generatePayload.detail ||
            generatePayload.error ||
            "Draft generation failed.",
          code: generatePayload.code,
          provider: generatePayload.provider,
        });
        return;
      }

      if (!generatePayload.email_id) {
        throw new Error("Draft was created without a valid email record.");
      }

      const draftResponse = await fetch(
        `/api/email/draft/${generatePayload.email_id}`,
        { method: "POST" }
      );
      const draftPayload = (await draftResponse.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        mailtoUrl?: string;
      };

      if (!draftResponse.ok || !draftPayload.mailtoUrl) {
        setRecipientDialogOpen(false);
        setRefreshKey((current) => current + 1);
        setActionFeedback({
          kind: "error",
          message:
            draftPayload.detail ||
            draftPayload.error ||
            "Draft was generated but could not be opened in your mail app automatically.",
        });
        return;
      }

      await openMailtoUrls([draftPayload.mailtoUrl]);
      setRecipientDialogOpen(false);
      setRefreshKey((current) => current + 1);
      setActionFeedback({
        kind: "success",
        message: `Draft opened in your mail app for ${selectedRecipient.email}.`,
      });
    } catch (error) {
      setRecipientDialogOpen(false);
      setActionFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Draft generation failed.",
      });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/leads")}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleAction(`/api/enrich/${leadId}`, "enrich")}
            disabled={actionLoading === "enrich"}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {actionLoading === "enrich" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrich + Score
          </button>

          <button
            onClick={() => void handleAction(`/api/score/${leadId}`, "score")}
            disabled={actionLoading === "score"}
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {actionLoading === "score" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Target className="h-4 w-4" />
            )}
            Re-score
          </button>

          <button
            onClick={() => void handleGenerateClick()}
            disabled={actionLoading === "email"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {actionLoading === "email" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Generate Draft
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={
            actionFeedback.kind === "error"
              ? "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              {actionFeedback.kind === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p>{actionFeedback.message}</p>
                {actionFeedback.code === "provider_auth_error" && (
                  <p className="mt-1 text-xs opacity-80">
                    {actionFeedback.provider
                      ? `${actionFeedback.provider} needs to be reconnected before drafts can be generated.`
                      : "The selected provider needs to be reconnected before drafts can be generated."}
                  </p>
                )}
              </div>
            </div>

            {(actionFeedback.code === "provider_auth_error" ||
              actionFeedback.code === "model_config_error") && (
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Settings className="h-4 w-4" />
                Open Settings
              </button>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={recipientDialogOpen}
        onOpenChange={(open) => {
          if (actionLoading === "email") {
            return;
          }
          setRecipientDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogClose onClick={() => setRecipientDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Choose Contact</DialogTitle>
            <DialogDescription>
              Pick which contact at {recipientLeadName || "this lead"} should
              receive the draft. Trawl will generate it and open it directly in
              your default mail app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Select
              value={selectedRecipientEmail}
              onChange={setSelectedRecipientEmail}
              options={recipientOptions.map((option) => ({
                value: option.email,
                label: option.label,
              }))}
            />

            {recipientOptions
              .filter((option) => option.email === selectedRecipientEmail)
              .map((option) => (
                <div
                  key={option.email}
                  className="rounded-lg border bg-muted/30 p-3 text-sm"
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-muted-foreground">{option.meta}</p>
                </div>
              ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRecipientDialogOpen(false)}
              disabled={actionLoading === "email"}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateDraft()}
              disabled={actionLoading === "email" || !selectedRecipientEmail}
            >
              {actionLoading === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Generate And Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadDetail leadId={leadId} refreshKey={refreshKey} />
    </div>
  );
}
