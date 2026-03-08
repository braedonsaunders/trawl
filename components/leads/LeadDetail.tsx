"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import type { SocialLinks } from "@/lib/llm/types";
import { openMailtoUrls } from "@/lib/email/open-mailto";
import {
  Globe,
  Phone,
  MapPin,
  ExternalLink,
  Mail,
  ChevronDown,
  ChevronRight,
  Loader2,
  Building2,
  Users,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Plus,
  Pencil,
  Search,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";

interface FirmographicField {
  value: string;
  source_name: string | null;
  source_url: string | null;
  evidence_url: string | null;
  excerpt: string | null;
}

interface LeadData {
  id: number;
  name: string;
  city: string;
  state: string;
  phone: string | null;
  website: string | null;
  categories: string[];
  google_rating: number | null;
  google_review_count: number | null;
  status: string;
  // Enrichment
  llm_summary: string | null;
  industry: string | null;
  estimated_size: string | null;
  employee_count: string | null;
  employee_count_estimate: number | null;
  employee_count_source: string | null;
  employee_count_evidence: FirmographicField | null;
  annual_revenue: string | null;
  annual_revenue_evidence: FirmographicField | null;
  decision_maker_signals: string | null;
  pain_points: string[];
  services_needed: string[];
  social_links: SocialLinks;
  contacts: SavedContact[];
  // Score
  fit_score: number | null;
  fit_tier: "hot" | "warm" | "cold" | null;
  score_reasoning: string | null;
  strengths: string[];
  risks: string[];
  recommended_angle: string | null;
  // Emails
  emails: EmailData[];
}

interface SavedContact {
  id: number;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  facility_name: string | null;
  source_type: "manual" | "research" | "enrichment";
  source_label: string | null;
  source_url: string | null;
  notes: string | null;
  confidence: number | null;
  status: "active" | "suggested" | "archived";
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface EmailData {
  id: number;
  to_email: string | null;
  to_name: string | null;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface LeadDetailProps {
  leadId: string;
  refreshKey?: number;
}

function getWebsiteHost(website: string): string {
  try {
    return new URL(toExternalHref(website)).hostname;
  } catch {
    return website.replace(/^(https?:)?\/\//, "").replace(/\/.*$/, "");
  }
}

function toExternalHref(url: string): string {
  const trimmed = url.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("#") ||
    /^(mailto:|tel:)/i.test(trimmed)
  ) {
    return trimmed;
  }

  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  }

  return `https://${trimmed}`;
}

function getPhoneHref(phone: string): string {
  const sanitized = phone.replace(/[^\d+]/g, "");
  return `tel:${sanitized || phone.trim()}`;
}

function getEmailHref(email: string): string {
  return `mailto:${email.trim()}`;
}

export function LeadDetail({ leadId, refreshKey = 0 }: LeadDetailProps) {
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error("Failed to load lead");
      const data = await res.json();
      setLead(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchLead();
  }, [fetchLead, refreshKey]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
        {error ?? "Lead not found"}
      </div>
    );
  }

  const hasEnrichment = Boolean(
    lead.llm_summary ||
      lead.industry ||
      lead.estimated_size ||
      lead.employee_count ||
      lead.annual_revenue ||
      lead.decision_maker_signals ||
      lead.pain_points.length > 0 ||
      lead.services_needed.length > 0 ||
      Object.keys(lead.social_links).length > 0
  );
  const location = [lead.city, lead.state].filter(Boolean).join(", ");
  const hasCompanyContactCard = Boolean(lead.website || lead.phone || location);
  const socialEntries = Object.entries(lead.social_links).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {location || "—"}
            </span>
            {lead.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {lead.phone}
              </span>
            )}
          </div>
        </div>
        <Badge variant="secondary" className="capitalize">
          {lead.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="enrichment">Enrichment</TabsTrigger>
          <TabsTrigger value="score">Score</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4" />
                  Google Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lead.google_rating != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Rating
                    </span>
                    <span className="font-medium">
                      {lead.google_rating} / 5{" "}
                      <span className="text-muted-foreground">
                        ({lead.google_review_count} reviews)
                      </span>
                    </span>
                  </div>
                )}
                {lead.categories.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-sm text-muted-foreground">
                      Categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.categories.map((cat) => (
                        <Badge key={cat} variant="outline" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Contact Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lead.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="font-medium">{lead.phone}</span>
                  </div>
                )}
                {lead.website && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Website
                    </span>
                    <a
                      href={toExternalHref(lead.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {getWebsiteHost(lead.website)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Location
                  </span>
                  <span className="font-medium">{location || "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <div className="grid gap-4 md:grid-cols-2">
            {hasCompanyContactCard && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4" />
                    Company Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {lead.website && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                          Website
                        </span>
                        <a
                          href={toExternalHref(lead.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {getWebsiteHost(lead.website)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                          Phone
                        </span>
                        <a
                          href={getPhoneHref(lead.phone)}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {lead.phone}
                          <Phone className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                          Location
                        </span>
                        <span className="text-sm font-medium">{location}</span>
                      </div>
                    )}
                  </div>

                  {(lead.website || lead.phone) && (
                    <div className="flex flex-wrap gap-2">
                      {lead.website && (
                        <ActionLink
                          href={toExternalHref(lead.website)}
                          icon={Globe}
                          label="Visit Website"
                          external
                        />
                      )}
                      {lead.phone && (
                        <ActionLink
                          href={getPhoneHref(lead.phone)}
                          icon={Phone}
                          label="Call Business"
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className={hasCompanyContactCard ? "md:col-span-2" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Contact Directory
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ContactsDirectory
                  leadId={lead.id}
                  contacts={lead.contacts}
                  onRefresh={fetchLead}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enrichment Tab */}
        <TabsContent value="enrichment">
          {hasEnrichment ? (
            <div className="grid gap-4 md:grid-cols-2">
              {lead.llm_summary && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Lightbulb className="h-4 w-4" />
                      AI Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{lead.llm_summary}</p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lead.industry && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Industry
                      </span>
                      <span className="font-medium">{lead.industry}</span>
                    </div>
                  )}
                  {lead.estimated_size && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Estimated Size
                      </span>
                      <span className="font-medium">{lead.estimated_size}</span>
                    </div>
                  )}
                  {lead.employee_count && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Employee Count
                      </span>
                      <span className="font-medium">{lead.employee_count}</span>
                    </div>
                  )}
                  {lead.annual_revenue && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Annual Revenue
                      </span>
                      <span className="font-medium">{lead.annual_revenue}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4" />
                    Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lead.pain_points.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                        Pain Points
                      </p>
                      <ul className="space-y-1">
                        {lead.pain_points.map((p, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm"
                          >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lead.services_needed.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                        Services Needed
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.services_needed.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(lead.decision_maker_signals ||
                lead.employee_count_evidence ||
                lead.annual_revenue_evidence) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Buying Signals</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {lead.decision_maker_signals && (
                      <div>
                        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                          Decision Maker Signals
                        </p>
                        <p className="text-sm leading-relaxed">
                          {lead.decision_maker_signals}
                        </p>
                      </div>
                    )}
                    {lead.employee_count_evidence && (
                      <div>
                        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                          Employee Count Source
                        </p>
                        <div className="space-y-1">
                          <p className="text-sm leading-relaxed">
                            {lead.employee_count_evidence.source_name ||
                              "Public web source"}
                          </p>
                          {lead.employee_count_evidence.excerpt && (
                            <p className="text-xs text-muted-foreground">
                              {lead.employee_count_evidence.excerpt}
                            </p>
                          )}
                          {(lead.employee_count_evidence.evidence_url ||
                            lead.employee_count_evidence.source_url) && (
                            <a
                              href={
                                toExternalHref(
                                  lead.employee_count_evidence.evidence_url ||
                                    lead.employee_count_evidence.source_url ||
                                    "#"
                                )
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {lead.annual_revenue_evidence && (
                      <div>
                        <p className="mb-1.5 text-sm font-medium text-muted-foreground">
                          Revenue Source
                        </p>
                        <div className="space-y-1">
                          <p className="text-sm leading-relaxed">
                            {lead.annual_revenue_evidence.source_name ||
                              "Public web source"}
                          </p>
                          {lead.annual_revenue_evidence.excerpt && (
                            <p className="text-xs text-muted-foreground">
                              {lead.annual_revenue_evidence.excerpt}
                            </p>
                          )}
                          {(lead.annual_revenue_evidence.evidence_url ||
                            lead.annual_revenue_evidence.source_url) && (
                            <a
                              href={
                                toExternalHref(
                                  lead.annual_revenue_evidence.evidence_url ||
                                    lead.annual_revenue_evidence.source_url ||
                                    "#"
                                )
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {socialEntries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Social Presence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {socialEntries.map(([network, url]) => (
                        <a
                          key={network}
                          href={toExternalHref(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent"
                        >
                          {network}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          ) : (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                No enrichment data yet. Run enrichment to populate this tab.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Score Tab */}
        <TabsContent value="score">
          {lead.fit_score != null && lead.fit_tier ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="md:col-span-2">
                <CardContent className="flex items-center gap-6 pt-6">
                  <div className="text-center">
                    <div className="text-5xl font-bold">{lead.fit_score}</div>
                    <div className="mt-1">
                      <ScoreBadge score={lead.fit_score} tier={lead.fit_tier} />
                    </div>
                  </div>
                  {lead.score_reasoning && (
                    <div className="flex-1 border-l pl-6">
                      <p className="mb-1 text-sm font-medium text-muted-foreground">
                        Reasoning
                      </p>
                      <p className="text-sm leading-relaxed">
                        {lead.score_reasoning}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {lead.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    Risks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {lead.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {lead.recommended_angle && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ArrowUpRight className="h-4 w-4" />
                      Recommended Angle
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">
                      {lead.recommended_angle}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                No score data yet. Run enrichment + score or re-score to populate this tab.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Emails Tab */}
        <TabsContent value="emails">
          <EmailsList emails={lead.emails} onRefresh={fetchLead} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ActionLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
  external?: boolean;
}

function ActionLink({
  href,
  icon: Icon,
  label,
  external = false,
}: ActionLinkProps) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

interface ContactFormState {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  facility_name: string;
  notes: string;
  is_primary: boolean;
}

interface ContactSeed {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facility_name?: string | null;
  notes?: string | null;
  is_primary?: boolean;
}

interface DirectoryFeedback {
  kind: "error" | "success";
  message: string;
}

const EMPTY_CONTACT_FORM_STATE: ContactFormState = {
  name: "",
  title: "",
  email: "",
  phone: "",
  linkedin_url: "",
  facility_name: "",
  notes: "",
  is_primary: false,
};

function createContactFormState(contact?: ContactSeed): ContactFormState {
  return {
    name: contact?.name ?? "",
    title: contact?.title ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    linkedin_url: contact?.linkedin_url ?? "",
    facility_name: contact?.facility_name ?? "",
    notes: contact?.notes ?? "",
    is_primary: Boolean(contact?.is_primary),
  };
}

function getContactDisplayName(contact: {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  return (
    contact.name?.trim() ||
    contact.title?.trim() ||
    contact.email?.trim() ||
    contact.phone?.trim() ||
    "Unnamed contact"
  );
}

function formatContactConfidence(confidence: number | null | undefined): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return null;
  }

  return `${Math.round(confidence * 100)}% confidence`;
}

function getContactSourceLabel(contact: SavedContact): string {
  if (contact.source_label?.trim()) {
    return contact.source_label.trim();
  }

  switch (contact.source_type) {
    case "research":
      return "Deep find";
    case "enrichment":
      return "Enrichment";
    default:
      return "Manual";
  }
}

async function getResponseDetail(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
  };

  if (typeof payload.detail === "string" && payload.detail.trim().length > 0) {
    return payload.detail;
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }

  return fallback;
}

function ContactsDirectory({
  leadId,
  contacts,
  onRefresh,
}: {
  leadId: number;
  contacts: SavedContact[];
  onRefresh: () => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SavedContact | null>(null);
  const [formState, setFormState] = useState<ContactFormState>(
    EMPTY_CONTACT_FORM_STATE
  );
  const [feedback, setFeedback] = useState<DirectoryFeedback | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activeContacts = contacts.filter((contact) => contact.status === "active");
  const suggestedContacts = contacts.filter(
    (contact) => contact.status === "suggested"
  );

  function resetDialog() {
    setDialogOpen(false);
    setEditingContact(null);
    setFormState(EMPTY_CONTACT_FORM_STATE);
  }

  function openNewContactDialog(seed?: ContactSeed) {
    setEditingContact(null);
    setFormState(createContactFormState(seed));
    setDialogOpen(true);
  }

  function openEditDialog(contact: SavedContact) {
    setEditingContact(contact);
    setFormState(createContactFormState(contact));
    setDialogOpen(true);
  }

  async function refreshDirectory(successMessage: string) {
    await onRefresh();
    setFeedback({
      kind: "success",
      message: successMessage,
    });
  }

  async function updateExistingContact(
    contactId: number,
    payload: Record<string, unknown>,
    options: {
      busyKey: string;
      successMessage: string;
      errorMessage: string;
    }
  ) {
    setBusyKey(options.busyKey);
    setFeedback(null);

    try {
      const response = await fetch(`/api/leads/${leadId}/contacts/${contactId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getResponseDetail(response, options.errorMessage));
      }

      await refreshDirectory(options.successMessage);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : options.errorMessage,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      ![
        formState.name,
        formState.title,
        formState.email,
        formState.phone,
        formState.linkedin_url,
      ].some((value) => value.trim().length > 0)
    ) {
      setFeedback({
        kind: "error",
        message:
          "Add at least one contact field such as name, title, email, phone, or LinkedIn URL.",
      });
      return;
    }

    setBusyKey("save-contact");
    setFeedback(null);

    const payload = {
      name: formState.name,
      title: formState.title,
      email: formState.email,
      phone: formState.phone,
      linkedin_url: formState.linkedin_url,
      facility_name: formState.facility_name,
      notes: formState.notes,
      is_primary: formState.is_primary,
    };

    try {
      const response = await fetch(
        editingContact
          ? `/api/leads/${leadId}/contacts/${editingContact.id}`
          : `/api/leads/${leadId}/contacts`,
        {
          method: editingContact ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getResponseDetail(
            response,
            editingContact ? "Failed to update contact." : "Failed to add contact."
          )
        );
      }

      resetDialog();
      await refreshDirectory(
        editingContact ? "Contact updated." : "Contact added."
      );
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : editingContact
              ? "Failed to update contact."
              : "Failed to add contact.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleApprove(contact: SavedContact) {
    await updateExistingContact(
      contact.id,
      { status: "active" },
      {
        busyKey: `approve-${contact.id}`,
        successMessage: "Contact approved and added to the active directory.",
        errorMessage: "Failed to approve contact.",
      }
    );
  }

  async function handleMakePrimary(contact: SavedContact) {
    await updateExistingContact(
      contact.id,
      { is_primary: true, status: "active" },
      {
        busyKey: `primary-${contact.id}`,
        successMessage: "Primary contact updated.",
        errorMessage: "Failed to set primary contact.",
      }
    );
  }

  async function handleDismiss(contact: SavedContact) {
    if (!window.confirm(`Dismiss ${getContactDisplayName(contact)} from this lead?`)) {
      return;
    }

    await updateExistingContact(
      contact.id,
      { status: "archived" },
      {
        busyKey: `dismiss-${contact.id}`,
        successMessage: "Suggestion dismissed.",
        errorMessage: "Failed to dismiss contact suggestion.",
      }
    );
  }

  async function handleDelete(contact: SavedContact) {
    if (!window.confirm(`Delete ${getContactDisplayName(contact)} from this lead?`)) {
      return;
    }

    setBusyKey(`delete-${contact.id}`);
    setFeedback(null);

    try {
      const response = await fetch(`/api/leads/${leadId}/contacts/${contact.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getResponseDetail(response, "Failed to delete contact."));
      }

      await refreshDirectory("Contact removed.");
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete contact.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeepFind() {
    setBusyKey("deep-find");
    setFeedback(null);

    try {
      const response = await fetch(`/api/leads/${leadId}/contacts/deep-find`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        contacts_found?: number;
        contacts_saved?: number;
      };

      if (!response.ok) {
        throw new Error(
          payload.detail || payload.error || "Deep contact research failed."
        );
      }

      await onRefresh();

      const found = typeof payload.contacts_found === "number" ? payload.contacts_found : 0;
      const saved = typeof payload.contacts_saved === "number" ? payload.contacts_saved : 0;

      setFeedback({
        kind: "success",
        message:
          saved > 0
            ? `Deep find saved ${saved} contact suggestion${saved === 1 ? "" : "s"} for review.`
            : found > 0
              ? "Deep find completed, but every strong match was already in the directory."
              : "Deep find completed without a strong local facility contact match.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Deep contact research failed.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  function renderContactCard(contact: SavedContact) {
    const confidence = formatContactConfidence(contact.confidence);
    const isBusy = busyKey != null;

    return (
      <div key={contact.id} className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {getContactDisplayName(contact)}
            </p>
            {contact.name && contact.title && (
              <p className="text-sm text-muted-foreground">{contact.title}</p>
            )}
            {contact.facility_name && (
              <p className="text-xs text-muted-foreground">
                {contact.facility_name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {contact.is_primary && <Badge>Primary</Badge>}
            <Badge variant={contact.status === "suggested" ? "outline" : "secondary"}>
              {contact.status === "suggested" ? "Suggested" : "Active"}
            </Badge>
            <Badge variant="outline">{getContactSourceLabel(contact)}</Badge>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {contact.email && (
            <a
              href={getEmailHref(contact.email)}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a
              href={getPhoneHref(contact.phone)}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {contact.phone}
            </a>
          )}
          {contact.linkedin_url && (
            <a
              href={toExternalHref(contact.linkedin_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              LinkedIn profile
            </a>
          )}
          {contact.source_url && (
            <a
              href={toExternalHref(contact.source_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Search className="h-3.5 w-3.5" />
              View source
            </a>
          )}
          {(confidence || contact.notes) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {confidence && <p>{confidence}</p>}
              {contact.notes && <p>{contact.notes}</p>}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contact.status === "suggested" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleApprove(contact)}
              disabled={isBusy}
            >
              {busyKey === `approve-${contact.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
          )}
          {!contact.is_primary && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleMakePrimary(contact)}
              disabled={isBusy}
            >
              {busyKey === `primary-${contact.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Star className="h-3.5 w-3.5" />
              )}
              Make Primary
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openEditDialog(contact)}
            disabled={isBusy}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              void (contact.status === "suggested"
                ? handleDismiss(contact)
                : handleDelete(contact))
            }
            disabled={isBusy}
          >
            {busyKey === `dismiss-${contact.id}` ||
            busyKey === `delete-${contact.id}` ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {contact.status === "suggested" ? "Dismiss" : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Manage lead contacts</p>
          <p className="text-sm text-muted-foreground">
            Add manual contacts, approve research suggestions, and run a deeper
            public-web search for local plant or facility decision makers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => openNewContactDialog()}
            disabled={busyKey != null}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleDeepFind()}
            disabled={busyKey != null}
          >
            {busyKey === "deep-find" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Deep Find Contacts
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={
            feedback.kind === "error"
              ? "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Saved Contacts</h3>
          <span className="text-xs text-muted-foreground">
            {activeContacts.length} active
          </span>
        </div>
        {activeContacts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {activeContacts.map((contact) => renderContactCard(contact))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No saved contacts yet. Add one manually or run enrichment/deep find.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Suggested Contacts</h3>
          <span className="text-xs text-muted-foreground">
            {suggestedContacts.length} pending review
          </span>
        </div>
        {suggestedContacts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {suggestedContacts.map((contact) => renderContactCard(contact))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No suggested contacts waiting for review.
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (busyKey === "save-contact") {
            return;
          }

          if (!open) {
            resetDialog();
            return;
          }

          setDialogOpen(true);
        }}
      >
        <DialogContent>
          <DialogClose onClick={resetDialog} />
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
            <DialogDescription>
              Saved contacts appear in the lead recipient picker and can be
              marked as the primary outreach contact.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Jordan Smith"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formState.title}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Plant Manager"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formState.email}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="jordan@company.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={formState.phone}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="(555) 555-1234"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Facility</label>
                <Input
                  value={formState.facility_name}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      facility_name: event.target.value,
                    }))
                  }
                  placeholder="Hamilton Plant"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">LinkedIn URL</label>
                <Input
                  value={formState.linkedin_url}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      linkedin_url: event.target.value,
                    }))
                  }
                  placeholder="https://www.linkedin.com/in/..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={formState.notes}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Local facility details, source notes, or buying context."
                rows={4}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setFormState((current) => ({
                  ...current,
                  is_primary: !current.is_primary,
                }))
              }
              className={buttonVariants({
                variant: formState.is_primary ? "default" : "outline",
                size: "sm",
              })}
            >
              <Star className="h-3.5 w-3.5" />
              {formState.is_primary ? "Primary Contact" : "Mark As Primary"}
            </button>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={resetDialog}
                disabled={busyKey === "save-contact"}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busyKey === "save-contact"}>
                {busyKey === "save-contact" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {editingContact ? "Save Changes" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatEmailStatus(status: string): string {
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

function EmailsList({
  emails,
  onRefresh,
}: {
  emails: EmailData[];
  onRefresh: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenDraft(emailId: number) {
    setOpeningId(emailId);
    setError(null);

    try {
      const res = await fetch(`/api/email/draft/${emailId}`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          payload.detail || payload.error || "Failed to open draft in mail app"
        );
      }

      await openMailtoUrls([payload.mailtoUrl]);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open draft");
    } finally {
      setOpeningId(null);
    }
  }

  if (emails.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
          No emails generated yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {emails.map((email) => {
        const isExpanded = expandedId === email.id;
        const isOpening = openingId === email.id;
        return (
          <Card key={email.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left"
              onClick={() => setExpandedId(isExpanded ? null : email.id)}
            >
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {email.sent_at
                      ? `Opened ${new Date(email.sent_at).toLocaleDateString()}`
                      : `Created ${new Date(email.created_at).toLocaleDateString()}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {email.to_email || "Recipient email not found"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    email.status === "opened" || email.status === "sent"
                      ? "default"
                      : email.status === "draft"
                        ? "secondary"
                        : "outline"
                  }
                  className="capitalize"
                >
                  {formatEmailStatus(email.status)}
                </Badge>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>
            {isExpanded && (
              <CardContent className="border-t pt-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDraft(email.id)}
                    disabled={isOpening || !email.to_email}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {isOpening ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    {email.status === "opened" ? "Draft Again" : "Open In Mail"}
                  </button>
                  {!email.to_email && (
                    <span className="text-xs text-amber-700">
                      A recipient email needs to be surfaced before this draft can
                      be opened in your mail app.
                    </span>
                  )}
                </div>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: email.body }}
                />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
