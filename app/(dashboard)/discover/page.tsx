"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Building2,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Radar,
  Rocket,
  Search,
  Star,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CompanyProfile {
  name: string;
  website: string;
  description: string;
  industry: string;
  services: string[];
  geographies: string[];
  differentiators: string[];
}

interface SearchJob {
  id: number;
  query: string;
  location: string;
  radiusKm: number | null;
  resultsCount: number;
  status: string;
  createdAt: string;
}

type DedupeMode = "automatic" | "manual";

interface DiscoveryLeadCandidate {
  googlePlaceId: string;
  name: string;
  address: string;
  city: string;
  province: string;
  website: string;
  phone: string;
  googleRating: number | null;
  googleReviewCount: number | null;
  categories: string[];
  primaryType: string;
  googleMapsUrl: string;
  businessStatus: string;
  editorialSummary: string;
  distanceKm: number | null;
  fitScore: number;
  fitTier: "hot" | "warm" | "cold";
  rationale: string;
  matchSignals: string[];
  cautionSignals: string[];
}

interface SurfacedLead extends DiscoveryLeadCandidate {
  id: number;
  alreadyInPipeline: boolean;
  matchedLeadId: number | null;
  dedupeReasons: string[];
  dedupeConfidence: number | null;
}

interface DuplicateReview {
  id: string;
  kind: "existing" | "internal";
  candidate: DiscoveryLeadCandidate;
  suggestedMatch: {
    type: "existing" | "candidate";
    leadId: number | null;
    googlePlaceId: string;
    name: string;
    address: string;
    city: string;
    province: string;
    website: string;
    phone: string;
    fitScore: number | null;
  };
  confidence: number;
  reasons: string[];
  rationale: string;
  suggestedAction: "keep_existing" | "keep_primary";
}

interface DedupeSummary {
  mode: DedupeMode;
  matchedExisting: number;
  autoMerged: number;
  reviewRequired: number;
  agentReviewedPairs: number;
}

interface DiscoveryResult {
  jobId: number;
  town: string;
  resolvedTown: string;
  radiusKm: number;
  maxResults: number;
  searchQuery: string;
  searchQueries: string[];
  idealCustomerSummary: string;
  targetSignals: string[];
  exclusionSignals: string[];
  surfacedCount: number;
  newLeads: number;
  existingLeads: number;
  surfacedLeads: SurfacedLead[];
  duplicateReviews: DuplicateReview[];
  dedupeSummary: DedupeSummary;
}

interface DiscoverContextResponse {
  companyProfile: CompanyProfile | null;
  jobs: SearchJob[];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statCardClassName(accent: string): string {
  return cn(
    "rounded-2xl border bg-card p-5 shadow-sm",
    accent
  );
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const DEDUPE_OPTIONS = [
  { label: "Automatic", value: "automatic" },
  { label: "Manual Review", value: "manual" },
];

export default function DiscoverPage() {
  const [town, setTown] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [maxResults, setMaxResults] = useState("25");
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>("automatic");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(
    null
  );
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [reviewActionId, setReviewActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchContext();
  }, []);

  async function fetchContext() {
    try {
      const response = await fetch("/api/discover?history=true");
      if (!response.ok) {
        throw new Error("Failed to load discovery context");
      }

      const data = (await response.json()) as DiscoverContextResponse;
      setCompanyProfile(data.companyProfile);
      setJobs(data.jobs ?? []);
      setError(null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load discovery context";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!town.trim()) {
      return;
    }

    setLaunching(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          town: town.trim(),
          radiusKm: Number(radiusKm),
          maxResults: Number(maxResults),
          dedupeMode,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.detail || payload.error || "Discovery request failed"
        );
      }

      setResult(payload as DiscoveryResult);
      await fetchContext();
    } catch (launchError) {
      const message =
        launchError instanceof Error
          ? launchError.message
          : "Discovery request failed";
      setError(message);
    } finally {
      setLaunching(false);
    }
  }

  async function handleDuplicateResolution(
    review: DuplicateReview,
    action: "save_candidate" | "skip_candidate"
  ) {
    setReviewActionId(`${review.id}:${action}`);
    setError(null);

    try {
      let savedLead: SurfacedLead | null = null;

      if (action === "save_candidate") {
        const response = await fetch("/api/discover/dedupe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            candidate: review.candidate,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.detail || payload.error || "Failed to save duplicate review"
          );
        }

        savedLead = payload.savedLead as SurfacedLead;
      }

      setResult((current) => {
        if (!current) {
          return current;
        }

        const matchedExistingIncrement =
          action === "skip_candidate" && review.kind === "existing" ? 1 : 0;
        const nextSurfacedLeads = savedLead
          ? [...current.surfacedLeads, savedLead].sort(
              (left, right) => right.fitScore - left.fitScore
            )
          : current.surfacedLeads;

        return {
          ...current,
          surfacedLeads: nextSurfacedLeads,
          surfacedCount: savedLead
            ? current.surfacedCount + 1
            : current.surfacedCount,
          newLeads: savedLead ? current.newLeads + 1 : current.newLeads,
          existingLeads: current.existingLeads + matchedExistingIncrement,
          duplicateReviews: current.duplicateReviews.filter(
            (entry) => entry.id !== review.id
          ),
          dedupeSummary: {
            ...current.dedupeSummary,
            matchedExisting:
              current.dedupeSummary.matchedExisting + matchedExistingIncrement,
            reviewRequired: Math.max(
              0,
              current.dedupeSummary.reviewRequired - 1
            ),
          },
        };
      });

      if (savedLead) {
        await fetchContext();
      }
    } catch (resolutionError) {
      const message =
        resolutionError instanceof Error
          ? resolutionError.message
          : "Failed to resolve duplicate review";
      setError(message);
    } finally {
      setReviewActionId(null);
    }
  }

  const profileReady = Boolean(companyProfile);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border bg-card shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_40%)]" />
        <div className="relative grid gap-6 px-6 py-7 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-8">
          <div className="space-y-5">
            <Badge variant="secondary" className="w-fit">
              Discover Launch
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Launch a prospect sweep from one town.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Type the town, radius, and cap. Trawl builds the search query
                from your business profile, pulls richer Google business data,
                and surfaces the strongest local prospects.
              </p>
            </div>

            {companyProfile ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-border/70 bg-background/80 shadow-none backdrop-blur">
                  <CardHeader className="pb-3">
                    <CardDescription>Supplier Context</CardDescription>
                    <CardTitle className="text-base">
                      {companyProfile.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {companyProfile.description ? (
                      <p className="leading-6">{companyProfile.description}</p>
                    ) : (
                      <p>No company description saved yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {companyProfile.industry ? (
                        <Badge variant="outline">
                          {formatLabel(companyProfile.industry)}
                        </Badge>
                      ) : null}
                      {companyProfile.website ? (
                        <a
                          href={companyProfile.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Website
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-background/80 shadow-none backdrop-blur">
                  <CardHeader className="pb-3">
                    <CardDescription>Signals Driving Search</CardDescription>
                    <CardTitle className="text-base">
                      What the AI will use
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {companyProfile.services.length > 0 ? (
                        companyProfile.services.slice(0, 6).map((service) => (
                          <Badge key={service} variant="secondary">
                            {service}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Add services in Settings to sharpen targeting.
                        </p>
                      )}
                    </div>
                    {companyProfile.differentiators.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Differentiators:{" "}
                        {companyProfile.differentiators.slice(0, 3).join(" • ")}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-dashed border-amber-300 bg-amber-50/60 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-amber-950">
                    Company profile required
                  </CardTitle>
                  <CardDescription className="text-amber-900/80">
                    Discovery now uses your saved business description and
                    services to generate the Google query automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-amber-950">
                  <Link href="/settings" className="text-primary hover:underline">
                    Open Settings to profile your company
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-border/70 bg-background/90 shadow-none backdrop-blur">
            <CardHeader>
              <CardDescription>Launch Parameters</CardDescription>
              <CardTitle className="text-xl">Run discovery</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLaunch} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Town
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={town}
                      onChange={(event) => setTown(event.target.value)}
                      placeholder="Toronto"
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Radius (km)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={250}
                      value={radiusKm}
                      onChange={(event) => setRadiusKm(event.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Max results
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={maxResults}
                      onChange={(event) => setMaxResults(event.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Discovery dedupe
                  </label>
                  <Select
                    value={dedupeMode}
                    onChange={(value) => setDedupeMode(value as DedupeMode)}
                    options={DEDUPE_OPTIONS}
                    className="h-11"
                  />
                </div>

                <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Search query is now generated for you. The AI uses your saved
                  business description, services, and Google business signals to
                  filter toward likely buyers. Dedupe mode is{" "}
                  <span className="font-medium text-foreground">
                    {dedupeMode === "manual" ? "manual review" : "automatic"}
                  </span>
                  , so discovery can either auto-collapse likely duplicates or
                  hold edge cases for review.
                </div>

                {error ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={launching || !town.trim() || !profileReady}
                >
                  {launching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {launching ? "Launching discovery..." : "Launch discovery"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {result ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <CardDescription>Latest launch</CardDescription>
                <CardTitle className="text-xl">
                  {result.searchQuery}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={statCardClassName("border-blue-200/80 bg-blue-50/70")}>
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Radar className="h-4 w-4" />
                      Surfaced
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-blue-950">
                      {result.surfacedCount}
                    </p>
                  </div>
                  <div className={statCardClassName("border-emerald-200/80 bg-emerald-50/70")}>
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <Target className="h-4 w-4" />
                      New leads
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-emerald-950">
                      {result.newLeads}
                    </p>
                  </div>
                  <div className={statCardClassName("border-slate-200/80 bg-slate-50/80")}>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Building2 className="h-4 w-4" />
                      Already tracked
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">
                      {result.existingLeads}
                    </p>
                  </div>
                  <div className={statCardClassName("border-amber-200/80 bg-amber-50/80")}>
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                      <Search className="h-4 w-4" />
                      Review
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-amber-950">
                      {result.dedupeSummary.reviewRequired}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/25 p-4 text-sm text-muted-foreground">
                  Smart dedupe ran in{" "}
                  <span className="font-medium text-foreground">
                    {result.dedupeSummary.mode === "manual"
                      ? "manual review"
                      : "automatic"}
                  </span>
                  . It matched {result.dedupeSummary.matchedExisting} prospects
                  to existing leads, auto-merged {result.dedupeSummary.autoMerged}{" "}
                  likely duplicates, and sent {result.dedupeSummary.reviewRequired}{" "}
                  cases to review. Agent review checked{" "}
                  {result.dedupeSummary.agentReviewedPairs} ambiguous pairs.
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Search coverage
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.searchQueries.map((query) => (
                        <Badge key={query} variant="secondary">
                          {query}
                        </Badge>
                      ))}
                    </div>
                    <p className="pt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Ideal customer
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {result.idealCustomerSummary}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {result.resolvedTown} within {result.radiusKm} km.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Positive signals
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {result.targetSignals.length > 0 ? (
                          result.targetSignals.map((signal) => (
                            <Badge key={signal} variant="secondary">
                              {signal}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No explicit signals returned.
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Exclusion signals
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {result.exclusionSignals.length > 0 ? (
                          result.exclusionSignals.map((signal) => (
                            <Badge key={signal} variant="outline">
                              {signal}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No exclusions returned.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b bg-muted/20">
                <CardDescription>Recent searches</CardDescription>
                <CardTitle className="text-xl">History</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No discovery runs yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {jobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="rounded-2xl border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {job.query}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {job.location}
                              {job.radiusKm ? ` • ${job.radiusKm} km` : ""}
                            </p>
                          </div>
                          <Badge variant="outline">{job.status}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {job.resultsCount} surfaced • {formatDate(job.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {result.duplicateReviews.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Duplicate review queue
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Review the records discovery held back before they enter the
                    pipeline.
                  </p>
                </div>
                <Badge variant="outline">
                  {result.duplicateReviews.length} pending
                </Badge>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {result.duplicateReviews.map((review) => {
                  const primaryActionLabel =
                    review.kind === "existing" ? "Keep existing" : "Keep suggested";
                  const secondaryActionLabel =
                    review.kind === "existing" ? "Add anyway" : "Keep both";
                  const primaryActionId = `${review.id}:skip_candidate`;
                  const secondaryActionId = `${review.id}:save_candidate`;

                  return (
                    <Card key={review.id} className="h-full border-amber-200/80">
                      <CardHeader className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-lg">
                                {review.candidate.name}
                              </CardTitle>
                              <Badge variant="outline">
                                {formatConfidence(review.confidence)} duplicate match
                              </Badge>
                            </div>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <span>{review.candidate.address}</span>
                              {review.candidate.distanceKm != null ? (
                                <span>• {review.candidate.distanceKm} km away</span>
                              ) : null}
                            </CardDescription>
                          </div>
                          <Badge variant={review.candidate.fitTier}>
                            {review.candidate.fitScore}
                          </Badge>
                        </div>

                        <div className="rounded-2xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                          Suggested match:{" "}
                          <span className="font-medium text-foreground">
                            {review.suggestedMatch.name}
                          </span>
                          {review.suggestedMatch.city ? ` in ${review.suggestedMatch.city}` : ""}
                          {review.suggestedMatch.leadId ? (
                            <>
                              {" "}
                              <Link
                                href={`/leads/${review.suggestedMatch.leadId}`}
                                className="text-primary hover:underline"
                              >
                                Open lead
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <p className="text-sm leading-6 text-foreground">
                          {review.rationale}
                        </p>

                        {review.reasons.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Match reasons
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {review.reasons.map((reason) => (
                                <Badge key={reason} variant="secondary">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            onClick={() =>
                              void handleDuplicateResolution(
                                review,
                                "skip_candidate"
                              )
                            }
                            disabled={reviewActionId !== null}
                          >
                            {reviewActionId === primaryActionId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {primaryActionLabel}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void handleDuplicateResolution(
                                review,
                                "save_candidate"
                              )
                            }
                            disabled={reviewActionId !== null}
                          >
                            {reviewActionId === secondaryActionId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {secondaryActionLabel}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Surfaced prospects
                </h2>
                <p className="text-sm text-muted-foreground">
                  AI-shortlisted businesses after smart dedupe filtered out the
                  most likely duplicates.
                </p>
              </div>
              <Badge variant="secondary">{result.surfacedCount} results</Badge>
            </div>

            {result.surfacedLeads.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No prospects matched this launch. Try a wider radius or a
                  different town.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {result.surfacedLeads.map((lead) => (
                  <Card key={lead.googlePlaceId} className="h-full">
                    <CardHeader className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{lead.name}</CardTitle>
                            {lead.alreadyInPipeline ? (
                              <Badge variant="outline">
                                {lead.matchedLeadId ? "Matched existing lead" : "Already in pipeline"}
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription className="flex flex-wrap items-center gap-2">
                            <span>{lead.address}</span>
                            {lead.distanceKm != null ? (
                              <span>• {lead.distanceKm} km away</span>
                            ) : null}
                          </CardDescription>
                        </div>
                        <Badge variant={lead.fitTier}>{lead.fitScore}</Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {lead.primaryType ? (
                          <Badge variant="secondary">
                            {formatLabel(lead.primaryType)}
                          </Badge>
                        ) : null}
                        {lead.categories.slice(0, 3).map((category) => (
                          <Badge key={category} variant="outline">
                            {formatLabel(category)}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <p className="text-sm leading-6 text-foreground">
                        {lead.rationale}
                      </p>

                      {lead.editorialSummary ? (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {lead.editorialSummary}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {lead.googleRating != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-4 w-4 text-amber-500" />
                            {lead.googleRating.toFixed(1)}
                          </span>
                        ) : null}
                        {lead.googleReviewCount != null ? (
                          <span>{lead.googleReviewCount} reviews</span>
                        ) : null}
                        {lead.businessStatus ? (
                          <span>{formatLabel(lead.businessStatus)}</span>
                        ) : null}
                      </div>

                      {lead.matchSignals.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Match signals
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {lead.matchSignals.map((signal) => (
                              <Badge key={signal} variant="secondary">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {lead.cautionSignals.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Caution signals
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {lead.cautionSignals.map((signal) => (
                              <Badge key={signal} variant="outline">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {lead.dedupeReasons.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Dedupe signals
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {lead.dedupeReasons.map((reason) => (
                              <Badge key={reason} variant="outline">
                                {reason}
                              </Badge>
                            ))}
                            {lead.dedupeConfidence != null ? (
                              <Badge variant="secondary">
                                {formatConfidence(lead.dedupeConfidence)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-4 text-sm">
                        {lead.matchedLeadId ? (
                          <Link
                            href={`/leads/${lead.matchedLeadId}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Building2 className="h-4 w-4" />
                            Open lead
                          </Link>
                        ) : null}
                        {lead.website ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Globe className="h-4 w-4" />
                            Website
                          </a>
                        ) : null}
                        {lead.googleMapsUrl ? (
                          <a
                            href={lead.googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Google Maps
                          </a>
                        ) : null}
                        {lead.phone ? (
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Phone className="h-4 w-4" />
                            {lead.phone}
                          </a>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {!loading && !result ? (
        <Card>
          <CardHeader className="border-b bg-muted/20">
            <CardDescription>Recent searches</CardDescription>
            <CardTitle className="text-xl">History</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center text-muted-foreground">
                <Search className="h-6 w-6" />
                <p className="text-sm">
                  No searches yet. Launch a town sweep above.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Query
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Location
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Radius
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Results
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">
                        Ran
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {job.query}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {job.location}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {job.radiusKm ? `${job.radiusKm} km` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {job.resultsCount}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{job.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
