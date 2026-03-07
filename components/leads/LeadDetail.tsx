"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

interface LeadData {
  id: string;
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
  pain_points: string[];
  services_needed: string[];
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
  id: string;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  timestamp: string;
  handoff_status: string | null;
}

interface LeadDetailProps {
  leadId: string;
}

export function LeadDetail({ leadId }: LeadDetailProps) {
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
  }, [leadId]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {lead.city}, {lead.state}
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
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
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
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {new URL(lead.website).hostname}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Location
                  </span>
                  <span className="font-medium">
                    {lead.city}, {lead.state}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enrichment Tab */}
        <TabsContent value="enrichment">
          {lead.llm_summary ? (
            <div className="grid gap-4 md:grid-cols-2">
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
                No score data yet. Run scoring to populate this tab.
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

function EmailsList({ emails }: { emails: EmailData[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
