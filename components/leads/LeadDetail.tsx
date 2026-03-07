"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import { cn } from "@/lib/utils";
import type { PotentialContact, SocialLinks } from "@/lib/llm/types";
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
  MessageSquare,
  ArrowUpRight,
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
  potential_contacts: PotentialContact[];
  // Score
  fit_score: number | null;
  fit_tier: "hot" | "warm" | "cold" | null;
  score_reasoning: string | null;
  strengths: string[];
  risks: string[];
  recommended_angle: string | null;
  // Emails
  emails: EmailData[];
  // Conversations
  conversations: ConversationMessage[];
}

interface EmailData {
  id: number;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface ConversationMessage {
  id: number;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  timestamp: string;
  handoff_status: string | null;
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

  useEffect(() => {
    async function fetchLead() {
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
    }
    fetchLead();
  }, [leadId, refreshKey]);

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
  const hasContacts = Boolean(
    lead.phone ||
      lead.website ||
      lead.potential_contacts.length > 0
  );
  const location = [lead.city, lead.state].filter(Boolean).join(", ");
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
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
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
          {hasContacts ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(lead.website || lead.phone || location) && (
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

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    Potential Contacts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lead.potential_contacts.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {lead.potential_contacts.map((contact, index) => {
                        const displayName =
                          contact.name || contact.title || "Unnamed contact";
                        const subtitle =
                          contact.name && contact.title ? contact.title : null;
                        const hasActions = Boolean(
                          contact.email ||
                            contact.phone ||
                            contact.linkedin_url
                        );

                        return (
                          <div
                            key={`${displayName}-${index}`}
                            className="rounded-lg border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{displayName}</p>
                                {subtitle && (
                                  <p className="text-sm text-muted-foreground">
                                    {subtitle}
                                  </p>
                                )}
                              </div>
                              {typeof contact.confidence === "number" && (
                                <Badge variant="outline">
                                  {Math.round(contact.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>

                            <div className="mt-3 space-y-2 text-sm">
                              {contact.email && (
                                <a
                                  href={getEmailHref(contact.email)}
                                  className="inline-flex items-center gap-2 text-primary hover:underline"
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
                                  className="inline-flex items-center gap-2 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  LinkedIn profile
                                </a>
                              )}
                              {!hasActions && (
                                <p className="text-muted-foreground">
                                  No direct contact method surfaced yet.
                                </p>
                              )}
                            </div>

                            {hasActions && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {contact.email && (
                                  <ActionLink
                                    href={getEmailHref(contact.email)}
                                    icon={Mail}
                                    label="Email"
                                  />
                                )}
                                {contact.phone && (
                                  <ActionLink
                                    href={getPhoneHref(contact.phone)}
                                    icon={Phone}
                                    label="Call"
                                  />
                                )}
                                {contact.linkedin_url && (
                                  <ActionLink
                                    href={toExternalHref(contact.linkedin_url)}
                                    icon={ExternalLink}
                                    label="Open LinkedIn"
                                    external
                                  />
                                )}
                              </div>
                            )}

                            {contact.source && (
                              <p className="mt-3 text-xs text-muted-foreground">
                                Source: {contact.source}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                      No individual contacts identified yet. Run enrichment to
                      extract decision-makers and contact details.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                No contact data yet. Run enrichment or add lead contact details
                to populate this tab.
              </CardContent>
            </Card>
          )}
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
          <EmailsList emails={lead.emails} />
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversations">
          <ConversationsView messages={lead.conversations} />
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

function EmailsList({ emails }: { emails: EmailData[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
      {emails.map((email) => {
        const isExpanded = expandedId === email.id;
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
                      ? `Sent ${new Date(email.sent_at).toLocaleDateString()}`
                      : `Created ${new Date(email.created_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    email.status === "sent"
                      ? "default"
                      : email.status === "draft"
                        ? "secondary"
                        : "outline"
                  }
                  className="capitalize"
                >
                  {email.status}
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

function ConversationsView({
  messages,
}: {
  messages: ConversationMessage[];
}) {
  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
          No conversations yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <Card
          key={msg.id}
          className={cn(
            msg.direction === "outbound" ? "ml-8" : "mr-8"
          )}
        >
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge
                  variant={msg.direction === "inbound" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {msg.direction === "inbound" ? "Received" : "Sent"}
                </Badge>
                {msg.handoff_status && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {msg.handoff_status}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.timestamp).toLocaleString()}
              </span>
            </div>
            <p className="mb-1 text-sm font-medium">{msg.subject}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {msg.body}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
