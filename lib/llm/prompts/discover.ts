import type { PromptPair } from "@/lib/llm/types";

export interface DiscoveryCompanyProfile {
  name: string;
  website: string;
  description: string;
  industry: string;
  services: string[];
  geographies: string[];
  differentiators: string[];
  ideal_customer_summary: string;
  buyer_search_queries: string[];
  buyer_target_signals: string[];
  buyer_exclusion_signals: string[];
}

export interface DiscoveryCandidate {
  google_place_id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  website: string;
  google_rating: number | null;
  google_review_count: number | null;
  categories: string[];
  primary_type: string;
  editorial_summary: string;
  business_status: string;
  distance_km: number | null;
}

export interface DiscoveryDuplicateBusiness {
  source_kind: "candidate" | "existing";
  lead_id?: number;
  google_place_id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  website: string;
  phone: string;
}

export interface DiscoveryDuplicatePair {
  pair_key: string;
  heuristic_confidence: number;
  heuristic_reasons: string[];
  candidate: DiscoveryDuplicateBusiness;
  other: DiscoveryDuplicateBusiness;
}

export function buildDiscoverySearchPlanPrompt(
  companyProfile: DiscoveryCompanyProfile,
  town: string
): PromptPair {
  const systemPrompt = `You are a B2B demand generation strategist. Your task is to turn a supplier's company profile into a small set of Google Maps Places search queries for finding likely buyers in a town.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "search_queries": ["short Google Maps query"],
  "ideal_customer_summary": "1-2 sentence description of the best-fit buyer",
  "target_signals": ["signals that make a business a strong prospect"],
  "exclusion_signals": ["signals that make a business a weak prospect or likely competitor"]
}

Rules:
- Return 2-5 distinct search_queries when possible; avoid near-duplicates
- Each search query must be short and concrete, usually 2-6 words
- Every search query must name a customer business, facility, operator, or industry segment that could appear on Google Maps
- If the supplier profile already includes buyer_search_queries, treat them as strong hints and improve or diversify them rather than ignoring them
- Prefer the business type the supplier most likely sells into, not the supplier's own service label
- Cover different realistic buyer angles such as facility type, buyer industry, or operation style when the profile supports them
- Optimize for filtering quality in Google Maps, not marketing language
- Avoid town names in the query because location is handled separately
- Avoid obvious competitor categories unless they are also realistic buyers
- Never return the supplier's own services, trades, certifications, job titles, or capability labels
- If a query could plausibly be the supplier's own services page title, it is wrong
- Bad query examples: supplier-side labels like "managed IT services", "roof repair", or "business consulting"
- Good query examples: customer-side labels like "property management company", "distribution center", or "medical clinic"
- Keep target and exclusion signals concise and factual
- Do not include any text outside the JSON object`;

  const userPrompt = `Supplier profile:
${JSON.stringify(companyProfile, null, 2)}

Town to search around:
${town}`;

  return { systemPrompt, userPrompt };
}

export function buildDiscoveryShortlistPrompt(input: {
  companyProfile: DiscoveryCompanyProfile;
  town: string;
  radiusKm: number;
  maxResults: number;
  searchQuery: string;
  candidates: DiscoveryCandidate[];
  coverage?: "top" | "all";
}): PromptPair {
  const {
    companyProfile,
    town,
    radiusKm,
    maxResults,
    searchQuery,
    candidates,
    coverage = "top",
  } = input;
  const resultRule =
    coverage === "all"
      ? `- Return exactly ${candidates.length} prospects, one for each candidate in the list
- Score weak-fit businesses low instead of omitting them`
      : `- Return at most ${maxResults} prospects`;

  const systemPrompt = `You are a B2B prospecting analyst. Your task is to review Google business data and shortlist the businesses most likely to buy from the supplier.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "prospects": [
    {
      "google_place_id": "must exactly match one of the provided candidate ids",
      "fit_score": 0,
      "rationale": "one short sentence tied to the provided data",
      "match_signals": ["specific positive signals from the data"],
      "caution_signals": ["specific risks or uncertainties from the data"]
    }
  ]
}

Rules:
- ${coverage === "all" ? "Review every candidate in the list" : "Only include the strongest candidates in the shortlist"}
${resultRule}
- Only use google_place_id values that appear in the candidate list
- Base decisions only on the supplied Google business data and supplier profile
- Prefer businesses that look operational, relevant, and commercially credible
- Down-rank clear mismatches, low-information listings, and likely competitors
- Keep scores between 0 and 100
- Keep rationale to one short sentence
- Return 1-3 match_signals and 0-3 caution_signals
- Keep signals concise and non-duplicative
- Do not include any text outside the JSON object`;

  const userPrompt = `Supplier profile:
${JSON.stringify(companyProfile, null, 2)}

Search parameters:
${JSON.stringify(
    {
      town,
      radius_km: radiusKm,
      search_query: searchQuery,
      max_results: maxResults,
      coverage,
    },
    null,
    2
  )}

Candidate businesses:
${JSON.stringify(candidates, null, 2)}`;

  return { systemPrompt, userPrompt };
}

export function buildDiscoveryDeduplicationPrompt(input: {
  pairs: DiscoveryDuplicatePair[];
}): PromptPair {
  const systemPrompt = `You are a sales operations analyst reviewing whether two local business records refer to the same company.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "decisions": [
    {
      "pair_key": "must exactly match one of the provided pair keys",
      "is_duplicate": true,
      "confidence": 0,
      "rationale": "short explanation grounded in the supplied fields"
    }
  ]
}

Rules:
- Decide whether each pair is the same business, location, or listing
- Different branches or locations should usually NOT be marked as duplicates unless the records clearly describe the same location
- Use only the supplied business data
- Confidence must be between 0 and 1
- Keep rationale concise
- Do not include any text outside the JSON object`;

  const userPrompt = `Business pairs to review:
${JSON.stringify(input.pairs, null, 2)}`;

  return { systemPrompt, userPrompt };
}
