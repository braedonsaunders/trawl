import { after, NextRequest, NextResponse } from "next/server";
import { startAgentRun, type AgentRunTracker } from "@/lib/agent/monitor";
import { getCompanyProfile } from "@/lib/db/queries/companies";
import {
  getAllLeads,
  getLeadByGooglePlaceId,
  type Lead,
  upsertLead,
} from "@/lib/db/queries/leads";
import {
  createSearchJob,
  getRecentSearchJobs,
  updateSearchJob,
} from "@/lib/db/queries/search-jobs";
import {
  searchPlaces,
  geocodePlace,
  getPlaceDetails,
  type PlaceLead,
} from "@/lib/google-maps/places";
import { callLLM } from "@/lib/llm/client";
import { queueLeadAnalysis } from "@/lib/leads/auto-analysis";
import {
  buildDiscoveryDeduplicationPrompt,
  buildDiscoverySearchPlanPrompt,
  buildDiscoveryShortlistPrompt,
  type DiscoveryCandidate,
  type DiscoveryCompanyProfile,
} from "@/lib/llm/prompts/discover";
import {
  discoveryDeduplicationResultSchema,
  discoverySearchPlanSchema,
  discoveryShortlistResultSchema,
} from "@/lib/llm/schemas";

interface SearchPlan {
  search_queries: string[];
  ideal_customer_summary: string;
  target_signals: string[];
  exclusion_signals: string[];
}

interface ShortlistedProspect {
  google_place_id: string;
  fit_score: number;
  rationale: string;
  match_signals: string[];
  caution_signals: string[];
}

type DedupeMode = "automatic" | "manual";

interface DiscoveryLeadPreview {
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

interface SurfacedLeadResult extends DiscoveryLeadPreview {
  id: number;
  alreadyInPipeline: boolean;
  matchedLeadId: number | null;
  dedupeReasons: string[];
  dedupeConfidence: number | null;
}

interface DuplicateReviewSuggestion {
  id: string;
  kind: "existing" | "internal";
  candidate: DiscoveryLeadPreview;
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

interface NormalizedEntity {
  sourceKind: "candidate" | "existing";
  leadId?: number;
  googlePlaceId: string;
  name: string;
  address: string;
  city: string;
  province: string;
  website: string;
  phone: string;
  fitScore: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  normalizedDomain: string;
  normalizedPhone: string;
  normalizedName: string;
  normalizedAddress: string;
  normalizedCity: string;
  normalizedProvince: string;
  nameTokens: string[];
}

interface PotentialDuplicatePair {
  pairKey: string;
  candidatePlaceId: string;
  targetKind: "existing" | "candidate";
  targetLeadId?: number;
  targetPlaceId: string;
  heuristicConfidence: number;
  heuristicReasons: string[];
  autoSafe: boolean;
  candidate: NormalizedEntity;
  other: NormalizedEntity;
}

interface FinalDuplicateDecision {
  pair: PotentialDuplicatePair;
  confidence: number;
  rationale: string;
  agentReviewed: boolean;
}

const BUSINESS_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "group",
  "solutions",
  "solution",
  "services",
  "service",
  "studio",
  "studios",
]);

const DISCOVERY_MAX_RESULTS = 100;
const SHORTLIST_BATCH_SIZE = 12;
const SHORTLIST_AGENT_REVIEW_CAP = 120;
const SHORTLIST_MIN_OUTPUT_TOKENS = 900;
const SHORTLIST_MAX_OUTPUT_TOKENS = 2400;
const SHORTLIST_OUTPUT_TOKENS_PER_CANDIDATE = 110;
const SHORTLIST_ERROR_DETAIL_LIMIT = 180;

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBusinessName(value: string | null | undefined): string {
  const tokens = normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !BUSINESS_SUFFIXES.has(token));

  return tokens.join(" ");
}

function normalizeAddress(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\blane\b/g, "ln")
    .replace(/\bhighway\b/g, "hwy")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value: string | null | undefined): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits;
}

function normalizeDomain(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();
  }
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  return (2 * overlap) / (leftSet.size + rightSet.size);
}

function normalizeCandidate(preview: DiscoveryLeadPreview): NormalizedEntity {
  const normalizedName = normalizeBusinessName(preview.name);

  return {
    sourceKind: "candidate",
    googlePlaceId: preview.googlePlaceId,
    name: preview.name,
    address: preview.address,
    city: preview.city,
    province: preview.province,
    website: preview.website,
    phone: preview.phone,
    fitScore: preview.fitScore,
    googleRating: preview.googleRating,
    googleReviewCount: preview.googleReviewCount,
    normalizedDomain: normalizeDomain(preview.website),
    normalizedPhone: normalizePhone(preview.phone),
    normalizedName,
    normalizedAddress: normalizeAddress(preview.address),
    normalizedCity: normalizeText(preview.city),
    normalizedProvince: normalizeText(preview.province),
    nameTokens: normalizedName.split(" ").filter(Boolean),
  };
}

function normalizeExistingLead(lead: Lead): NormalizedEntity {
  const normalizedName = normalizeBusinessName(lead.name);

  return {
    sourceKind: "existing",
    leadId: lead.id,
    googlePlaceId: lead.google_place_id,
    name: lead.name,
    address: lead.address || "",
    city: lead.city || "",
    province: lead.province || "",
    website: lead.website || "",
    phone: lead.phone || "",
    fitScore: null,
    googleRating: lead.google_rating,
    googleReviewCount: lead.google_review_count,
    normalizedDomain: normalizeDomain(lead.website),
    normalizedPhone: normalizePhone(lead.phone),
    normalizedName,
    normalizedAddress: normalizeAddress(lead.address),
    normalizedCity: normalizeText(lead.city),
    normalizedProvince: normalizeText(lead.province),
    nameTokens: normalizedName.split(" ").filter(Boolean),
  };
}

function evaluatePotentialDuplicatePair(
  candidate: NormalizedEntity,
  other: NormalizedEntity,
  targetKind: "existing" | "candidate"
): PotentialDuplicatePair | null {
  if (candidate.googlePlaceId === other.googlePlaceId) {
    return {
      pairKey: `${targetKind}:${candidate.googlePlaceId}:${other.googlePlaceId}`,
      candidatePlaceId: candidate.googlePlaceId,
      targetKind,
      targetLeadId: other.leadId,
      targetPlaceId: other.googlePlaceId,
      heuristicConfidence: 0.99,
      heuristicReasons: ["Same Google Place ID"],
      autoSafe: true,
      candidate,
      other,
    };
  }

  const sameDomain =
    candidate.normalizedDomain &&
    candidate.normalizedDomain === other.normalizedDomain;
  const samePhone =
    candidate.normalizedPhone &&
    candidate.normalizedPhone === other.normalizedPhone;
  const nameExact =
    candidate.normalizedName &&
    candidate.normalizedName === other.normalizedName;
  const addressExact =
    candidate.normalizedAddress &&
    candidate.normalizedAddress === other.normalizedAddress;
  const sameCity =
    candidate.normalizedCity &&
    candidate.normalizedCity === other.normalizedCity;
  const sameProvince =
    candidate.normalizedProvince &&
    candidate.normalizedProvince === other.normalizedProvince;
  const nameSimilarity = tokenSimilarity(candidate.nameTokens, other.nameTokens);

  let score = 0;
  const reasons: string[] = [];

  if (sameDomain) {
    score += 0.44;
    reasons.push(`Same website domain (${candidate.normalizedDomain})`);
  }
  if (samePhone) {
    score += 0.42;
    reasons.push("Same phone number");
  }
  if (nameExact) {
    score += 0.22;
    reasons.push("Same normalized business name");
  } else if (nameSimilarity >= 0.85) {
    score += 0.16;
    reasons.push("Very similar business name");
  } else if (nameSimilarity >= 0.65) {
    score += 0.1;
    reasons.push("Similar business name");
  }
  if (addressExact) {
    score += 0.2;
    reasons.push("Same normalized address");
  }
  if (sameCity) {
    score += 0.08;
    reasons.push("Same city");
  }
  if (sameProvince) {
    score += 0.04;
  }

  if (sameDomain && samePhone) {
    score = Math.max(score, 0.95);
  }
  if (sameDomain && (nameExact || nameSimilarity >= 0.65) && (sameCity || addressExact)) {
    score = Math.max(score, 0.89);
  }
  if (samePhone && (nameExact || nameSimilarity >= 0.65) && (sameCity || addressExact)) {
    score = Math.max(score, 0.88);
  }
  if (nameExact && addressExact) {
    score = Math.max(score, 0.84);
  }

  if (score < 0.5) {
    return null;
  }

  return {
    pairKey: `${targetKind}:${candidate.googlePlaceId}:${other.googlePlaceId}`,
    candidatePlaceId: candidate.googlePlaceId,
    targetKind,
    targetLeadId: other.leadId,
    targetPlaceId: other.googlePlaceId,
    heuristicConfidence: Number(Math.min(score, 0.99).toFixed(2)),
    heuristicReasons: reasons,
    autoSafe: score >= 0.9,
    candidate,
    other,
  };
}

function compareCandidatePriority(
  left: DiscoveryLeadPreview,
  right: DiscoveryLeadPreview
): number {
  const fitDelta = right.fitScore - left.fitScore;
  if (fitDelta !== 0) {
    return fitDelta;
  }

  if (Boolean(right.website) !== Boolean(left.website)) {
    return Number(Boolean(right.website)) - Number(Boolean(left.website));
  }

  const reviewDelta =
    (right.googleReviewCount ?? 0) - (left.googleReviewCount ?? 0);
  if (reviewDelta !== 0) {
    return reviewDelta;
  }

  return (right.googleRating ?? 0) - (left.googleRating ?? 0);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

function buildLeadPreview(input: {
  candidate: DiscoveryCandidate;
  place: PlaceLead;
  prospect: ShortlistedProspect;
}): DiscoveryLeadPreview {
  const { candidate, place, prospect } = input;

  return {
    googlePlaceId: place.google_place_id,
    name: place.name,
    address: place.address,
    city: place.city,
    province: place.province,
    website: place.website,
    phone: place.phone,
    googleRating: place.google_rating,
    googleReviewCount: place.google_review_count,
    categories: candidate.categories,
    primaryType: candidate.primary_type,
    googleMapsUrl: place.google_maps_url,
    businessStatus: place.business_status,
    editorialSummary: place.editorial_summary,
    distanceKm: candidate.distance_km,
    fitScore: prospect.fit_score,
    fitTier: fitTierFromScore(prospect.fit_score),
    rationale: prospect.rationale,
    matchSignals: prospect.match_signals,
    cautionSignals: prospect.caution_signals,
  };
}

function persistDiscoveryLead(preview: DiscoveryLeadPreview): {
  lead: Lead;
  isNew: boolean;
} {
  const existingLead = getLeadByGooglePlaceId(preview.googlePlaceId);

  return {
    lead: upsertLead({
      google_place_id: preview.googlePlaceId,
      name: preview.name,
      address: preview.address,
      city: preview.city,
      province: preview.province,
      phone: preview.phone,
      website: preview.website,
      google_rating: preview.googleRating,
      google_review_count: preview.googleReviewCount,
      categories: JSON.stringify(preview.categories),
    }),
    isNew: !existingLead,
  };
}

function buildSurfacedLeadResult(
  preview: DiscoveryLeadPreview,
  options: {
    id: number;
    alreadyInPipeline: boolean;
    matchedLeadId?: number | null;
    dedupeReasons?: string[];
    dedupeConfidence?: number | null;
  }
): SurfacedLeadResult {
  return {
    ...preview,
    id: options.id,
    alreadyInPipeline: options.alreadyInPipeline,
    matchedLeadId: options.matchedLeadId ?? null,
    dedupeReasons: options.dedupeReasons ?? [],
    dedupeConfidence: options.dedupeConfidence ?? null,
  };
}

async function reviewDuplicatePairsWithAgent(
  pairs: PotentialDuplicatePair[]
): Promise<
  Map<
    string,
    {
      isDuplicate: boolean;
      confidence: number;
      rationale: string;
    }
  >
> {
  const reviewPairs = pairs
    .filter(
      (pair) =>
        !pair.autoSafe &&
        pair.heuristicConfidence >= 0.55 &&
        pair.heuristicConfidence < 0.88
    )
    .sort((left, right) => right.heuristicConfidence - left.heuristicConfidence)
    .slice(0, 12);

  if (reviewPairs.length === 0) {
    return new Map();
  }

  const prompt = buildDiscoveryDeduplicationPrompt({
    pairs: reviewPairs.map((pair) => ({
      pair_key: pair.pairKey,
      heuristic_confidence: pair.heuristicConfidence,
      heuristic_reasons: pair.heuristicReasons,
      candidate: {
        source_kind: pair.candidate.sourceKind,
        google_place_id: pair.candidate.googlePlaceId,
        name: pair.candidate.name,
        address: pair.candidate.address,
        city: pair.candidate.city,
        province: pair.candidate.province,
        website: pair.candidate.website,
        phone: pair.candidate.phone,
      },
      other: {
        source_kind: pair.other.sourceKind,
        lead_id: pair.other.leadId,
        google_place_id: pair.other.googlePlaceId,
        name: pair.other.name,
        address: pair.other.address,
        city: pair.other.city,
        province: pair.other.province,
        website: pair.other.website,
        phone: pair.other.phone,
      },
    })),
  });

  const { parsed } = await callLLM({
    ...prompt,
    schema: discoveryDeduplicationResultSchema,
    temperature: 0,
    maxTokens: 1200,
  });

  return new Map(
    parsed.decisions.map((decision) => [
      decision.pair_key,
      {
        isDuplicate: decision.is_duplicate,
        confidence: clampNumber(decision.confidence, 0, 0, 1),
        rationale: decision.rationale.trim(),
      },
    ])
  );
}

function finalizeDuplicateDecision(
  pair: PotentialDuplicatePair,
  agentDecision?: {
    isDuplicate: boolean;
    confidence: number;
    rationale: string;
  }
): FinalDuplicateDecision | null {
  if (pair.autoSafe) {
    return {
      pair,
      confidence: Math.max(pair.heuristicConfidence, agentDecision?.confidence ?? 0),
      rationale:
        agentDecision?.rationale || pair.heuristicReasons.join(". "),
      agentReviewed: Boolean(agentDecision),
    };
  }

  if (agentDecision) {
    if (!agentDecision.isDuplicate || agentDecision.confidence < 0.6) {
      return null;
    }

    return {
      pair,
      confidence: agentDecision.confidence,
      rationale: agentDecision.rationale || pair.heuristicReasons.join(". "),
      agentReviewed: true,
    };
  }

  if (pair.heuristicConfidence >= 0.78) {
    return {
      pair,
      confidence: pair.heuristicConfidence,
      rationale: pair.heuristicReasons.join(". "),
      agentReviewed: false,
    };
  }

  return null;
}

function createUnionFind(values: string[]) {
  const parent = new Map(values.map((value) => [value, value]));

  function find(value: string): string {
    const current = parent.get(value) ?? value;
    if (current === value) {
      return value;
    }

    const root = find(current);
    parent.set(value, root);
    return root;
  }

  function union(left: string, right: string) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  }

  return { find, union };
}

function parseList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean);
    }
  } catch {
    // Fall back to the raw value below.
  }

  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeCompanyProfile(): DiscoveryCompanyProfile | null {
  const company = getCompanyProfile();
  if (!company) {
    return null;
  }

  const services = parseList(company.services);
  const geographies = parseList(company.geographies);
  const differentiators = parseList(company.differentiators);
  const industries = parseList(company.industries_served);
  const industry = industries[0] || "";

  if (!company.name.trim() && !company.description?.trim() && services.length === 0) {
    return null;
  }

  return {
    name: company.name.trim(),
    website: company.website.trim(),
    description: company.description?.trim() || "",
    industry,
    services,
    geographies,
    differentiators,
  };
}

function mapSearchJob(job: ReturnType<typeof getRecentSearchJobs>[number]) {
  return {
    id: job.id,
    query: job.query,
    location: job.location,
    radiusKm: job.radius_km,
    resultsCount: job.results_count,
    status: job.status,
    createdAt: job.created_at,
  };
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return (
    2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function buildFallbackSearchPlan(
  companyProfile: DiscoveryCompanyProfile
): SearchPlan {
  const rawCandidates = [
    ...companyProfile.services,
    companyProfile.industry,
    ...companyProfile.differentiators,
    ...companyProfile.description
      .split(/[.;]|\band\b/)
      .map((entry) => entry.trim()),
    companyProfile.name,
  ];
  const stopPhrases = [
    "solutions",
    "service",
    "services",
    "provider",
    "manufacturing",
    "manufacturer",
    "industrial",
    "company",
    "business",
  ];
  const queryCandidates = rawCandidates
    .map((value) => value.replace(/[()]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((value) => {
      const normalized = value.toLowerCase();
      const queries = [value];
      for (const phrase of stopPhrases) {
        if (normalized.includes(phrase)) {
          const stripped = value
            .replace(new RegExp(`\\b${phrase}\\b`, "ig"), " ")
            .replace(/\s+/g, " ")
            .trim();
          if (stripped) {
            queries.push(stripped);
          }
        }
      }
      return queries;
    })
    .map((value) => truncate(value, 60))
    .filter((value) => value.split(/\s+/).length <= 6);
  const normalizedSeen = new Set<string>();
  const searchQueries: string[] = [];

  for (const query of queryCandidates) {
    const normalized = normalizeText(query);
    if (!normalized || normalizedSeen.has(normalized)) {
      continue;
    }
    normalizedSeen.add(normalized);
    searchQueries.push(query);
    if (searchQueries.length >= 4) {
      break;
    }
  }

  if (searchQueries.length === 0) {
    const querySource =
      companyProfile.services[0] ||
      companyProfile.industry ||
      companyProfile.description ||
      companyProfile.name;
    const fallbackQuery = truncate(querySource.replace(/\s+/g, " "), 60);
    if (fallbackQuery) {
      searchQueries.push(fallbackQuery);
    }
  }

  return {
    search_queries: searchQueries.length > 0 ? searchQueries : ["local businesses"],
    ideal_customer_summary:
      companyProfile.description ||
      `${companyProfile.name} is targeting businesses that align with its services.`,
    target_signals: companyProfile.services.slice(0, 4),
    exclusion_signals: [],
  };
}

function sanitizeSearchQueries(queries: string[]): string[] {
  const seen = new Set<string>();

  return queries
    .map((query) => truncate(query.replace(/\s+/g, " ").trim(), 60))
    .filter((query) => {
      const normalized = normalizeText(query);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .slice(0, 5);
}

function formatSearchJobQuery(searchQueries: string[]): string {
  if (searchQueries.length <= 1) {
    return searchQueries[0] || "local businesses";
  }

  return `${searchQueries[0]} +${searchQueries.length - 1} more`;
}

function heuristicProspectScore(candidate: DiscoveryCandidate): number {
  let score = 0;

  if (candidate.website) score += 15;
  if (candidate.editorial_summary) score += 10;
  if (candidate.business_status === "OPERATIONAL") score += 10;
  if (candidate.google_rating) score += candidate.google_rating * 10;
  if (candidate.google_review_count) {
    score += Math.min(candidate.google_review_count, 200) / 4;
  }
  if (candidate.distance_km != null) {
    score += Math.max(0, 15 - candidate.distance_km / 5);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function sortCandidatesByHeuristic(
  candidates: DiscoveryCandidate[]
): DiscoveryCandidate[] {
  return [...candidates]
    .filter((candidate) => candidate.business_status !== "CLOSED_PERMANENTLY")
    .sort((left, right) => {
      const scoreDelta =
        heuristicProspectScore(right) - heuristicProspectScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (right.google_review_count ?? 0) - (left.google_review_count ?? 0);
    });
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function estimateShortlistMaxTokens(candidateCount: number): number {
  return Math.min(
    SHORTLIST_MAX_OUTPUT_TOKENS,
    Math.max(
      SHORTLIST_MIN_OUTPUT_TOKENS,
      candidateCount * SHORTLIST_OUTPUT_TOKENS_PER_CANDIDATE
    )
  );
}

function getShortlistReviewCandidateCount(
  candidateCount: number,
  maxResults: number
): number {
  return Math.min(
    candidateCount,
    Math.max(maxResults * 2, SHORTLIST_BATCH_SIZE),
    SHORTLIST_AGENT_REVIEW_CAP
  );
}

function buildFallbackShortlist(
  candidates: DiscoveryCandidate[],
  maxResults: number
): ShortlistedProspect[] {
  return sortCandidatesByHeuristic(candidates)
    .slice(0, maxResults)
    .map((candidate) => ({
      google_place_id: candidate.google_place_id,
      fit_score: heuristicProspectScore(candidate),
      rationale:
        candidate.editorial_summary ||
        `${candidate.name} appears to be an active local business with enough commercial signals to review.`,
      match_signals: [
        candidate.primary_type || candidate.categories[0] || "",
        candidate.website ? "Has a website" : "",
        candidate.google_rating != null
          ? `${candidate.google_rating.toFixed(1)} Google rating`
          : "",
      ].filter(Boolean),
      caution_signals: [
        candidate.editorial_summary ? "" : "Limited business summary available",
        candidate.website ? "" : "No website listed",
        (candidate.google_review_count ?? 0) >= 10 ? "" : "Low review volume",
      ].filter(Boolean),
    }));
}

function normalizeShortlistBatch(
  candidates: DiscoveryCandidate[],
  prospects: ShortlistedProspect[]
): ShortlistedProspect[] {
  const candidateIds = new Set(
    candidates.map((candidate) => candidate.google_place_id)
  );
  const fallbackById = new Map(
    buildFallbackShortlist(candidates, candidates.length).map((prospect) => [
      prospect.google_place_id,
      prospect,
    ])
  );
  const normalizedById = new Map<string, ShortlistedProspect>();

  for (const prospect of prospects) {
    if (!candidateIds.has(prospect.google_place_id)) {
      continue;
    }

    const fallback = fallbackById.get(prospect.google_place_id);
    if (!fallback) {
      continue;
    }

    const normalized: ShortlistedProspect = {
      google_place_id: prospect.google_place_id,
      fit_score: clampNumber(prospect.fit_score, fallback.fit_score, 0, 100),
      rationale: truncate(
        prospect.rationale?.trim() || fallback.rationale,
        240
      ),
      match_signals: (() => {
        const signals = prospect.match_signals
          .map((signal) => signal.trim())
          .filter(Boolean)
          .slice(0, 3);
        return signals.length > 0 ? signals : fallback.match_signals;
      })(),
      caution_signals: (() => {
        const signals = prospect.caution_signals
          .map((signal) => signal.trim())
          .filter(Boolean)
          .slice(0, 3);
        return signals.length > 0 ? signals : fallback.caution_signals;
      })(),
    };
    const existing = normalizedById.get(prospect.google_place_id);
    if (!existing || existing.fit_score < normalized.fit_score) {
      normalizedById.set(prospect.google_place_id, normalized);
    }
  }

  for (const [googlePlaceId, fallback] of fallbackById) {
    if (!normalizedById.has(googlePlaceId)) {
      normalizedById.set(googlePlaceId, fallback);
    }
  }

  return candidates
    .map((candidate) => normalizedById.get(candidate.google_place_id))
    .filter((prospect): prospect is ShortlistedProspect => Boolean(prospect));
}

interface AgentShortlistResult {
  prospects: ShortlistedProspect[];
  model: string | null;
  reviewedCandidates: number;
  reviewTargetCount: number;
  batchCount: number;
  errors: string[];
}

interface ShortlistBatchResult {
  prospects: ShortlistedProspect[];
  model: string | null;
  reviewedCandidates: number;
  batchCount: number;
  errors: string[];
}

async function shortlistBatchWithAgent(input: {
  companyProfile: DiscoveryCompanyProfile;
  town: string;
  radiusKm: number;
  searchQuery: string;
  candidates: DiscoveryCandidate[];
}): Promise<ShortlistBatchResult> {
  const { candidates } = input;

  if (candidates.length === 0) {
    return {
      prospects: [],
      model: null,
      reviewedCandidates: 0,
      batchCount: 0,
      errors: [],
    };
  }

  try {
    const prompt = buildDiscoveryShortlistPrompt({
      companyProfile: input.companyProfile,
      town: input.town,
      radiusKm: input.radiusKm,
      maxResults: candidates.length,
      searchQuery: input.searchQuery,
      candidates,
      coverage: "all",
    });
    const { parsed, model } = await callLLM({
      ...prompt,
      schema: discoveryShortlistResultSchema,
      temperature: 0.2,
      maxTokens: estimateShortlistMaxTokens(candidates.length),
    });

    return {
      prospects: normalizeShortlistBatch(candidates, parsed.prospects),
      model,
      reviewedCandidates: candidates.length,
      batchCount: 1,
      errors: [],
    };
  } catch (error) {
    const message = toErrorMessage(error);

    if (candidates.length > 1) {
      const midpoint = Math.ceil(candidates.length / 2);
      const [leftResult, rightResult] = await Promise.all([
        shortlistBatchWithAgent({
          ...input,
          candidates: candidates.slice(0, midpoint),
        }),
        shortlistBatchWithAgent({
          ...input,
          candidates: candidates.slice(midpoint),
        }),
      ]);

      return {
        prospects: [...leftResult.prospects, ...rightResult.prospects],
        model: leftResult.model ?? rightResult.model,
        reviewedCandidates:
          leftResult.reviewedCandidates + rightResult.reviewedCandidates,
        batchCount: 1 + leftResult.batchCount + rightResult.batchCount,
        errors: [message, ...leftResult.errors, ...rightResult.errors],
      };
    }

    return {
      prospects: buildFallbackShortlist(candidates, candidates.length),
      model: null,
      reviewedCandidates: 0,
      batchCount: 1,
      errors: [message],
    };
  }
}

async function shortlistCandidatesWithAgent(input: {
  companyProfile: DiscoveryCompanyProfile;
  town: string;
  radiusKm: number;
  maxResults: number;
  searchQuery: string;
  candidates: DiscoveryCandidate[];
}): Promise<AgentShortlistResult> {
  const heuristicOrderedCandidates = sortCandidatesByHeuristic(input.candidates);
  const reviewTargetCount = getShortlistReviewCandidateCount(
    heuristicOrderedCandidates.length,
    input.maxResults
  );
  const reviewCandidates = heuristicOrderedCandidates.slice(0, reviewTargetCount);
  const batches = chunkValues(reviewCandidates, SHORTLIST_BATCH_SIZE);
  const fallbackById = new Map(
    buildFallbackShortlist(
      heuristicOrderedCandidates,
      heuristicOrderedCandidates.length
    ).map((prospect) => [prospect.google_place_id, prospect])
  );
  const heuristicRankById = new Map(
    heuristicOrderedCandidates.map((candidate, index) => [
      candidate.google_place_id,
      index,
    ])
  );
  const scoredById = new Map<string, ShortlistedProspect>();
  const errors: string[] = [];
  let model: string | null = null;
  let reviewedCandidates = 0;
  let batchCount = 0;

  for (const batch of batches) {
    const batchResult = await shortlistBatchWithAgent({
      companyProfile: input.companyProfile,
      town: input.town,
      radiusKm: input.radiusKm,
      searchQuery: input.searchQuery,
      candidates: batch,
    });

    model = model ?? batchResult.model;
    reviewedCandidates += batchResult.reviewedCandidates;
    batchCount += batchResult.batchCount;
    errors.push(...batchResult.errors);

    for (const prospect of batchResult.prospects) {
      scoredById.set(prospect.google_place_id, prospect);
    }
  }

  const prospects = heuristicOrderedCandidates
    .map(
      (candidate) =>
        scoredById.get(candidate.google_place_id) ??
        fallbackById.get(candidate.google_place_id)
    )
    .filter((prospect): prospect is ShortlistedProspect => Boolean(prospect))
    .sort((left, right) => {
      const fitDelta = right.fit_score - left.fit_score;
      if (fitDelta !== 0) {
        return fitDelta;
      }

      return (
        (heuristicRankById.get(left.google_place_id) ?? Number.MAX_SAFE_INTEGER) -
        (heuristicRankById.get(right.google_place_id) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, input.maxResults);

  return {
    prospects,
    model,
    reviewedCandidates,
    reviewTargetCount,
    batchCount,
    errors,
  };
}

function parseCategories(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function fitTierFromScore(score: number): "hot" | "warm" | "cold" {
  if (score >= 70) {
    return "hot";
  }

  if (score >= 40) {
    return "warm";
  }

  return "cold";
}

async function hydratePlacesWithDetails(
  placeIds: string[]
): Promise<Map<string, Awaited<ReturnType<typeof getPlaceDetails>>>> {
  const details = new Map<string, Awaited<ReturnType<typeof getPlaceDetails>>>();
  const concurrency = 5;

  for (let index = 0; index < placeIds.length; index += concurrency) {
    const batch = placeIds.slice(index, index + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (placeId) => {
        try {
          const place = await getPlaceDetails(placeId);
          return [placeId, place] as const;
        } catch {
          return [placeId, null] as const;
        }
      })
    );

    for (const [placeId, place] of batchResults) {
      if (place) {
        details.set(placeId, place);
      }
    }
  }

  return details;
}

export async function GET() {
  const companyProfile = normalizeCompanyProfile();
  const jobs = getRecentSearchJobs(20).map(mapSearchJob);

  return NextResponse.json({
    companyProfile,
    jobs,
  });
}

export async function POST(request: NextRequest) {
  let jobId: number | undefined;
  let runTracker: AgentRunTracker | null = null;

  try {
    const body = await request.json();
    const town =
      typeof body.town === "string"
        ? body.town.trim()
        : typeof body.location === "string"
          ? body.location.trim()
          : "";
    const radiusKm = clampNumber(body.radiusKm ?? body.radius_km, 25, 1, 250);
    const maxResults = clampNumber(
      body.maxResults ?? body.max_results,
      25,
      1,
      DISCOVERY_MAX_RESULTS
    );
    const dedupeMode: DedupeMode =
      body.dedupeMode === "manual" ? "manual" : "automatic";

    if (!town) {
      return NextResponse.json(
        { error: "Missing required field: town" },
        { status: 400 }
      );
    }

    const companyProfile = normalizeCompanyProfile();
    if (!companyProfile) {
      return NextResponse.json(
        {
          error:
            "Company profile is missing. Profile your business in Settings before running discovery.",
        },
        { status: 400 }
      );
    }

    runTracker = startAgentRun({
      kind: "discovery",
      title: `Discover in ${town}`,
      summary: "Planning search",
      metadata: {
        town,
        radiusKm,
        maxResults,
        dedupeMode,
      },
    });
    runTracker.info("Loaded company profile for discovery", {
      stage: "setup",
      detail: companyProfile.name || "Saved company profile",
    });

    let searchPlan = buildFallbackSearchPlan(companyProfile);
    try {
      runTracker.progress("Generating discovery search plan", {
        stage: "plan",
        detail: `Target town: ${town}`,
      });
      const prompt = buildDiscoverySearchPlanPrompt(companyProfile, town);
      const { parsed, model } = await callLLM({
        ...prompt,
        schema: discoverySearchPlanSchema,
        temperature: 0.2,
        maxTokens: 700,
      });
      const plannedQueries = sanitizeSearchQueries(parsed.search_queries);
      searchPlan = {
        search_queries:
          plannedQueries.length > 0 ? plannedQueries : searchPlan.search_queries,
        ideal_customer_summary:
          parsed.ideal_customer_summary.trim() ||
          searchPlan.ideal_customer_summary,
        target_signals: parsed.target_signals.filter(Boolean),
        exclusion_signals: parsed.exclusion_signals.filter(Boolean),
      };
      runTracker.success("Search plan generated", {
        stage: "plan",
        detail: `Model ${model}`,
      });
    } catch {
      // Fall back to a deterministic query if LLM planning is unavailable.
      runTracker.warning("Search planning fell back to deterministic query", {
        stage: "plan",
      });
    }

    const manualQuery =
      typeof body.query === "string" ? body.query.trim() : "";
    const searchQueries = sanitizeSearchQueries(
      manualQuery ? [manualQuery] : searchPlan.search_queries
    );
    const searchQuery = searchQueries[0] || "local businesses";
    runTracker.setSummary("Resolving search geography");
    runTracker.progress("Geocoding target town", {
      stage: "search",
      detail: town,
    });
    const geocodedTown = await geocodePlace(town);

    const job = createSearchJob({
      query: formatSearchJobQuery(searchQueries),
      location: geocodedTown.formattedAddress,
      radius_km: radiusKm,
    });
    jobId = job.id;
    runTracker.update({
      searchJobId: jobId,
      summary: "Searching Google business results",
      metadata: {
        town,
        resolvedTown: geocodedTown.formattedAddress,
        radiusKm,
        maxResults,
        searchQueries,
      },
    });
    runTracker.success("Search job created", {
      stage: "search",
      detail: geocodedTown.formattedAddress,
    });

    updateSearchJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    const perQueryMaxResults = manualQuery
      ? maxResults
      : Math.min(35, Math.max(maxResults, Math.ceil(maxResults * 1.25)));
    const placesById = new Map<string, PlaceLead>();

    for (const [index, query] of searchQueries.entries()) {
      runTracker.progress("Searching Google business data", {
        stage: "search",
        detail:
          searchQueries.length > 1
            ? `Query ${index + 1}/${searchQueries.length}: ${query}`
            : query,
      });

      const queryPlaces = await searchPlaces({
        query,
        location: geocodedTown.location,
        radiusKm,
        maxResults: perQueryMaxResults,
      });

      for (const place of queryPlaces) {
        if (!placesById.has(place.google_place_id)) {
          placesById.set(place.google_place_id, place);
        }
      }
    }

    const places = Array.from(placesById.values());

    if (places.length === 0) {
      updateSearchJob(jobId, {
        status: "complete",
        results_count: 0,
        completed_at: new Date().toISOString(),
      });
      runTracker.complete(`No businesses matched ${searchQuery}`);

      return NextResponse.json({
        runId: runTracker.runId,
        jobId,
        town,
        resolvedTown: geocodedTown.formattedAddress,
        radiusKm,
        maxResults,
        searchQuery,
        searchQueries,
        idealCustomerSummary: searchPlan.ideal_customer_summary,
        targetSignals: searchPlan.target_signals,
        exclusionSignals: searchPlan.exclusion_signals,
        surfacedCount: 0,
        newLeads: 0,
        existingLeads: 0,
        surfacedLeads: [],
        duplicateReviews: [],
        dedupeSummary: {
          mode: dedupeMode,
          matchedExisting: 0,
          autoMerged: 0,
          reviewRequired: 0,
          agentReviewedPairs: 0,
        },
      });
    }

    runTracker.success("Initial matches collected", {
      stage: "search",
      detail:
        searchQueries.length > 1
          ? `${places.length} unique businesses across ${searchQueries.length} queries`
          : `${places.length} businesses returned`,
    });
    runTracker.setSummary("Hydrating place details");
    runTracker.progress("Fetching richer Google place details", {
      stage: "details",
      detail: `${places.length} candidate businesses`,
    });
    const detailsById = await hydratePlacesWithDetails(
      places.map((place) => place.google_place_id)
    );

    const richPlaces = places.map((place) => {
      const details = detailsById.get(place.google_place_id);
      if (!details) {
        return place;
      }

      return {
        ...place,
        ...details,
        categories: details.categories || place.categories,
        google_maps_url: details.google_maps_url || place.google_maps_url,
        business_status: details.business_status || place.business_status,
        primary_type: details.primary_type || place.primary_type,
        editorial_summary:
          details.editorial_summary || place.editorial_summary,
        opening_hours: details.opening_hours || place.opening_hours,
        latitude: details.latitude ?? place.latitude,
        longitude: details.longitude ?? place.longitude,
      };
    });

    const boundedPlaces = richPlaces.filter((place) => {
      if (place.latitude == null || place.longitude == null) {
        return true;
      }

      return (
        distanceKm(geocodedTown.location, {
          latitude: place.latitude,
          longitude: place.longitude,
        }) <= radiusKm
      );
    });
    runTracker.success("Place details hydrated", {
      stage: "details",
      detail: `${boundedPlaces.length} businesses remain within radius`,
    });

    if (boundedPlaces.length === 0) {
      updateSearchJob(jobId, {
        status: "complete",
        results_count: 0,
        completed_at: new Date().toISOString(),
      });
      runTracker.complete(`No businesses remained within ${radiusKm} km`);

      return NextResponse.json({
        runId: runTracker.runId,
        jobId,
        town,
        resolvedTown: geocodedTown.formattedAddress,
        radiusKm,
        maxResults,
        searchQuery,
        idealCustomerSummary: searchPlan.ideal_customer_summary,
        targetSignals: searchPlan.target_signals,
        exclusionSignals: searchPlan.exclusion_signals,
        surfacedCount: 0,
        newLeads: 0,
        existingLeads: 0,
        surfacedLeads: [],
        duplicateReviews: [],
        dedupeSummary: {
          mode: dedupeMode,
          matchedExisting: 0,
          autoMerged: 0,
          reviewRequired: 0,
          agentReviewedPairs: 0,
        },
      });
    }

    const candidates: DiscoveryCandidate[] = boundedPlaces.map((place) => ({
      google_place_id: place.google_place_id,
      name: place.name,
      address: place.address,
      city: place.city,
      province: place.province,
      website: place.website,
      google_rating: place.google_rating,
      google_review_count: place.google_review_count,
      categories: parseCategories(place.categories).slice(0, 6),
      primary_type: place.primary_type,
      editorial_summary: truncate(place.editorial_summary, 240),
      business_status: place.business_status,
      distance_km:
        place.latitude != null && place.longitude != null
          ? Number(
              distanceKm(geocodedTown.location, {
                latitude: place.latitude,
                longitude: place.longitude,
              }).toFixed(1)
            )
          : null,
    }));

    let shortlisted = buildFallbackShortlist(candidates, maxResults);
    const shortlistReviewCount = getShortlistReviewCandidateCount(
      candidates.length,
      maxResults
    );

    runTracker.setSummary("Shortlisting prospects");
    runTracker.progress("Sending candidates to the LLM", {
      stage: "shortlist",
      detail:
        shortlistReviewCount < candidates.length
          ? `Top ${shortlistReviewCount} of ${candidates.length} candidates`
          : `${candidates.length} candidates`,
    });

    try {
      const shortlistResult = await shortlistCandidatesWithAgent({
        companyProfile,
        town: geocodedTown.formattedAddress,
        radiusKm,
        maxResults,
        searchQuery,
        candidates,
      });

      shortlisted = shortlistResult.prospects;

      if (shortlistResult.reviewedCandidates === 0) {
        const errorDetail = shortlistResult.errors[0]
          ? `; ${truncate(
              shortlistResult.errors[0],
              SHORTLIST_ERROR_DETAIL_LIMIT
            )}`
          : "";

        runTracker.warning("Shortlisting fell back to heuristics", {
          stage: "shortlist",
          detail: `${shortlisted.length} heuristic prospects${errorDetail}`,
          metadata: {
            errors: shortlistResult.errors,
            reviewedCandidates: shortlistResult.reviewedCandidates,
            reviewTargetCount: shortlistResult.reviewTargetCount,
            batchCount: shortlistResult.batchCount,
          },
        });
      } else if (shortlistResult.errors.length > 0) {
        runTracker.warning("Shortlisting partially fell back to heuristics", {
          stage: "shortlist",
          detail: `${shortlisted.length} prospects; reviewed ${shortlistResult.reviewedCandidates}/${shortlistResult.reviewTargetCount} candidates${shortlistResult.model ? ` with ${shortlistResult.model}` : ""}; ${truncate(
            shortlistResult.errors[0],
            SHORTLIST_ERROR_DETAIL_LIMIT
          )}`,
          metadata: {
            errors: shortlistResult.errors,
            reviewedCandidates: shortlistResult.reviewedCandidates,
            reviewTargetCount: shortlistResult.reviewTargetCount,
            batchCount: shortlistResult.batchCount,
            model: shortlistResult.model,
          },
        });
      } else {
        runTracker.success("Shortlist generated", {
          stage: "shortlist",
          detail: `${shortlisted.length} prospects with ${shortlistResult.model} (${shortlistResult.reviewedCandidates} candidates in ${shortlistResult.batchCount} batches)`,
        });
      }
    } catch (error) {
      const message = truncate(
        toErrorMessage(error),
        SHORTLIST_ERROR_DETAIL_LIMIT
      );

      runTracker.warning("Shortlisting fell back to heuristics", {
        stage: "shortlist",
        detail: `${shortlisted.length} heuristic prospects; ${message}`,
        metadata: {
          error: toErrorMessage(error),
          reviewTargetCount: shortlistReviewCount,
        },
      });
    }

    const candidateById = new Map(
      candidates.map((candidate) => [candidate.google_place_id, candidate])
    );
    const placeById = new Map(
      boundedPlaces.map((place) => [place.google_place_id, place])
    );

    const leadPreviews = shortlisted
      .map((prospect) => {
        const candidate = candidateById.get(prospect.google_place_id);
        const place = placeById.get(prospect.google_place_id);

        if (!candidate || !place) {
          return null;
        }

        return buildLeadPreview({
          candidate,
          place,
          prospect,
        });
      })
      .filter((lead): lead is DiscoveryLeadPreview => Boolean(lead));

    runTracker.setSummary("Deduplicating discovery results");
    runTracker.progress("Scoring duplicates against the pipeline", {
      stage: "dedupe",
      detail: `${leadPreviews.length} shortlisted prospects`,
    });

    const existingPipelineLeads = getAllLeads();
    const existingLeadById = new Map(
      existingPipelineLeads.map((lead) => [lead.id, lead])
    );
    const previewByPlaceId = new Map(
      leadPreviews.map((preview) => [preview.googlePlaceId, preview])
    );
    const normalizedCandidates = leadPreviews.map(normalizeCandidate);
    const normalizedExistingLeads = existingPipelineLeads.map(normalizeExistingLead);
    const potentialPairs: PotentialDuplicatePair[] = [];

    for (const candidate of normalizedCandidates) {
      for (const existingLead of normalizedExistingLeads) {
        const pair = evaluatePotentialDuplicatePair(
          candidate,
          existingLead,
          "existing"
        );
        if (pair) {
          potentialPairs.push(pair);
        }
      }
    }

    for (let index = 0; index < normalizedCandidates.length; index += 1) {
      for (let inner = index + 1; inner < normalizedCandidates.length; inner += 1) {
        const pair = evaluatePotentialDuplicatePair(
          normalizedCandidates[index],
          normalizedCandidates[inner],
          "candidate"
        );
        if (pair) {
          potentialPairs.push(pair);
        }
      }
    }

    let agentDecisionMap = new Map<
      string,
      { isDuplicate: boolean; confidence: number; rationale: string }
    >();
    try {
      agentDecisionMap = await reviewDuplicatePairsWithAgent(potentialPairs);
      if (agentDecisionMap.size > 0) {
        runTracker.success("Agent reviewed ambiguous duplicate pairs", {
          stage: "dedupe",
          detail: `${agentDecisionMap.size} pairs`,
        });
      }
    } catch {
      runTracker.warning("Duplicate review fell back to heuristics", {
        stage: "dedupe",
      });
    }

    const finalDecisions = potentialPairs
      .map((pair) =>
        finalizeDuplicateDecision(pair, agentDecisionMap.get(pair.pairKey))
      )
      .filter(
        (decision): decision is FinalDuplicateDecision => Boolean(decision)
      );

    const existingDecisionByCandidate = new Map<string, FinalDuplicateDecision>();
    const internalDecisions: FinalDuplicateDecision[] = [];

    for (const decision of finalDecisions) {
      if (decision.pair.targetKind === "existing") {
        const current = existingDecisionByCandidate.get(
          decision.pair.candidatePlaceId
        );
        if (!current || current.confidence < decision.confidence) {
          existingDecisionByCandidate.set(decision.pair.candidatePlaceId, decision);
        }
      } else {
        internalDecisions.push(decision);
      }
    }

    let newLeads = 0;
    const newLeadIds: number[] = [];
    let existingLeads = 0;
    let autoMerged = 0;
    const duplicateReviews: DuplicateReviewSuggestion[] = [];
    const surfacedLeads: SurfacedLeadResult[] = [];
    const handledCandidateIds = new Set<string>();

    const existingGroups = new Map<
      number,
      Array<{ preview: DiscoveryLeadPreview; decision: FinalDuplicateDecision }>
    >();
    for (const preview of leadPreviews) {
      const decision = existingDecisionByCandidate.get(preview.googlePlaceId);
      if (!decision || !decision.pair.targetLeadId) {
        continue;
      }

      const matchedLead = existingLeadById.get(decision.pair.targetLeadId);
      if (!matchedLead) {
        continue;
      }

      const group = existingGroups.get(matchedLead.id) ?? [];
      group.push({ preview, decision });
      existingGroups.set(matchedLead.id, group);
    }

    for (const [matchedLeadId, matches] of existingGroups) {
      const matchedLead = existingLeadById.get(matchedLeadId);
      if (!matchedLead) {
        continue;
      }

      matches.sort((left, right) =>
        compareCandidatePriority(left.preview, right.preview)
      );
      const primary = matches[0];
      const primaryNeedsReview =
        dedupeMode === "manual" && !primary.decision.pair.autoSafe;

      handledCandidateIds.add(primary.preview.googlePlaceId);

      if (primaryNeedsReview) {
        duplicateReviews.push({
          id: `existing:${matchedLeadId}:${primary.preview.googlePlaceId}`,
          kind: "existing",
          candidate: primary.preview,
          suggestedMatch: {
            type: "existing",
            leadId: matchedLead.id,
            googlePlaceId: matchedLead.google_place_id,
            name: matchedLead.name,
            address: matchedLead.address || "",
            city: matchedLead.city || "",
            province: matchedLead.province || "",
            website: matchedLead.website || "",
            phone: matchedLead.phone || "",
            fitScore: null,
          },
          confidence: primary.decision.confidence,
          reasons: primary.decision.pair.heuristicReasons,
          rationale: primary.decision.rationale,
          suggestedAction: "keep_existing",
        });
      } else {
        existingLeads += 1;
        surfacedLeads.push(
          buildSurfacedLeadResult(primary.preview, {
            id: matchedLead.id,
            alreadyInPipeline: true,
            matchedLeadId: matchedLead.id,
            dedupeReasons: primary.decision.pair.heuristicReasons,
            dedupeConfidence: primary.decision.confidence,
          })
        );
      }

      for (const match of matches.slice(1)) {
        handledCandidateIds.add(match.preview.googlePlaceId);
        if (dedupeMode === "manual" && !match.decision.pair.autoSafe) {
          duplicateReviews.push({
            id: `existing:${matchedLeadId}:${match.preview.googlePlaceId}`,
            kind: "existing",
            candidate: match.preview,
            suggestedMatch: {
              type: "existing",
              leadId: matchedLead.id,
              googlePlaceId: matchedLead.google_place_id,
              name: matchedLead.name,
              address: matchedLead.address || "",
              city: matchedLead.city || "",
              province: matchedLead.province || "",
              website: matchedLead.website || "",
              phone: matchedLead.phone || "",
              fitScore: null,
            },
            confidence: match.decision.confidence,
            reasons: match.decision.pair.heuristicReasons,
            rationale: match.decision.rationale,
            suggestedAction: "keep_existing",
          });
        } else {
          autoMerged += 1;
        }
      }
    }

    const remainingIds = leadPreviews
      .map((preview) => preview.googlePlaceId)
      .filter((id) => !handledCandidateIds.has(id));
    const unionFind = createUnionFind(remainingIds);
    const internalDecisionIndex = new Map<string, FinalDuplicateDecision[]>();

    for (const decision of internalDecisions) {
      const leftId = decision.pair.candidatePlaceId;
      const rightId = decision.pair.targetPlaceId;
      if (handledCandidateIds.has(leftId) || handledCandidateIds.has(rightId)) {
        continue;
      }

      unionFind.union(leftId, rightId);

      const leftGroup = internalDecisionIndex.get(leftId) ?? [];
      leftGroup.push(decision);
      internalDecisionIndex.set(leftId, leftGroup);

      const rightGroup = internalDecisionIndex.get(rightId) ?? [];
      rightGroup.push(decision);
      internalDecisionIndex.set(rightId, rightGroup);
    }

    const candidateGroups = new Map<string, string[]>();
    for (const candidateId of remainingIds) {
      const root = unionFind.find(candidateId);
      const group = candidateGroups.get(root) ?? [];
      group.push(candidateId);
      candidateGroups.set(root, group);
    }

    runTracker.setSummary("Saving surfaced leads");
    runTracker.progress("Writing unique discovery results into the pipeline", {
      stage: "save",
      detail: `${remainingIds.length} candidates after dedupe`,
    });

    for (const groupIds of candidateGroups.values()) {
      const groupPreviews = groupIds
        .map((candidateId) => previewByPlaceId.get(candidateId))
        .filter((preview): preview is DiscoveryLeadPreview => Boolean(preview))
        .sort(compareCandidatePriority);

      if (groupPreviews.length === 0) {
        continue;
      }

      const primary = groupPreviews[0];
      const { lead: savedLead, isNew } = persistDiscoveryLead(primary);
      if (isNew) {
        newLeads += 1;
      }
      if (isNew) {
        newLeadIds.push(savedLead.id);
      }
      surfacedLeads.push(
        buildSurfacedLeadResult(primary, {
          id: savedLead.id,
          alreadyInPipeline: false,
        })
      );

      for (const secondary of groupPreviews.slice(1)) {
        const relatedDecisions = (internalDecisionIndex.get(
          secondary.googlePlaceId
        ) ?? [])
          .filter((decision) => {
            const leftId = decision.pair.candidatePlaceId;
            const rightId = decision.pair.targetPlaceId;
            return (
              (leftId === secondary.googlePlaceId &&
                rightId === primary.googlePlaceId) ||
              (leftId === primary.googlePlaceId &&
                rightId === secondary.googlePlaceId)
            );
          })
          .sort((left, right) => right.confidence - left.confidence);

        const bestDecision = relatedDecisions[0];
        const needsReview =
          dedupeMode === "manual" && bestDecision && !bestDecision.pair.autoSafe;

        if (needsReview) {
          duplicateReviews.push({
            id: `internal:${primary.googlePlaceId}:${secondary.googlePlaceId}`,
            kind: "internal",
            candidate: secondary,
            suggestedMatch: {
              type: "candidate",
              leadId: savedLead.id,
              googlePlaceId: primary.googlePlaceId,
              name: primary.name,
              address: primary.address,
              city: primary.city,
              province: primary.province,
              website: primary.website,
              phone: primary.phone,
              fitScore: primary.fitScore,
            },
            confidence: bestDecision.confidence,
            reasons: bestDecision.pair.heuristicReasons,
            rationale: bestDecision.rationale,
            suggestedAction: "keep_primary",
          });
        } else {
          autoMerged += 1;
        }
      }
    }

    surfacedLeads.sort((left, right) => right.fitScore - left.fitScore);
    duplicateReviews.sort(
      (left, right) => right.candidate.fitScore - left.candidate.fitScore
    );

    const dedupeSummary: DedupeSummary = {
      mode: dedupeMode,
      matchedExisting: existingLeads,
      autoMerged,
      reviewRequired: duplicateReviews.length,
      agentReviewedPairs: agentDecisionMap.size,
    };

    updateSearchJob(jobId, {
      status: "complete",
      results_count: surfacedLeads.length,
      completed_at: new Date().toISOString(),
    });
    runTracker.success("Discovery dedupe complete", {
      stage: "dedupe",
      detail: `${existingLeads} existing, ${autoMerged} auto-merged, ${duplicateReviews.length} review`,
    });
    runTracker.complete(
      `Discovery complete: ${surfacedLeads.length} surfaced, ${newLeads} new, ${existingLeads} existing, ${duplicateReviews.length} review`
    );

    after(() => {
      queueLeadAnalysis(newLeadIds, "discover");
    });

    return NextResponse.json({
      runId: runTracker.runId,
      jobId,
      town,
      resolvedTown: geocodedTown.formattedAddress,
      radiusKm,
      maxResults,
      searchQuery,
      searchQueries,
      idealCustomerSummary: searchPlan.ideal_customer_summary,
      targetSignals: searchPlan.target_signals,
      exclusionSignals: searchPlan.exclusion_signals,
      surfacedCount: surfacedLeads.length,
      newLeads,
      existingLeads,
      surfacedLeads,
      duplicateReviews,
      dedupeSummary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    if (jobId != null) {
      try {
        updateSearchJob(jobId, {
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Swallow DB error during cleanup.
      }
    }

    runTracker?.fail(error, `Discovery failed: ${message}`);
    console.error("[POST /api/discover]", error);
    return NextResponse.json(
      { error: "Discovery failed", detail: message },
      { status: 500 }
    );
  }
}
