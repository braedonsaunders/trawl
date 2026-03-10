import { after, NextRequest, NextResponse } from "next/server";
import {
  getLeadByGooglePlaceId,
  type Lead,
  upsertLead,
} from "@/lib/db/queries/leads";
import { queueLeadAnalysis } from "@/lib/leads/auto-analysis";

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

function buildSavedLeadResponse(
  candidate: DiscoveryLeadCandidate,
  savedLead: Lead
) {
  return {
    ...candidate,
    id: savedLead.id,
    alreadyInPipeline: false,
    matchedLeadId: null,
    dedupeReasons: [],
    dedupeConfidence: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action =
      body.action === "skip_candidate" ? "skip_candidate" : "save_candidate";

    if (action === "skip_candidate") {
      return NextResponse.json({ ok: true });
    }

    const candidate = body.candidate as Partial<DiscoveryLeadCandidate> | undefined;
    if (!candidate?.googlePlaceId || !candidate?.name) {
      return NextResponse.json(
        { error: "Missing candidate payload" },
        { status: 400 }
      );
    }

    const existingLead = getLeadByGooglePlaceId(candidate.googlePlaceId);
    const savedLead = upsertLead({
      google_place_id: candidate.googlePlaceId,
      name: candidate.name,
      address: candidate.address ?? "",
      city: candidate.city ?? "",
      province: candidate.province ?? "",
      phone: candidate.phone ?? "",
      website: candidate.website ?? "",
      google_rating:
        typeof candidate.googleRating === "number" ? candidate.googleRating : null,
      google_review_count:
        typeof candidate.googleReviewCount === "number"
          ? candidate.googleReviewCount
          : null,
      categories: JSON.stringify(Array.isArray(candidate.categories) ? candidate.categories : []),
    });

    if (!existingLead) {
      after(() => {
        queueLeadAnalysis([savedLead.id], "discover_dedupe");
      });
    }

    return NextResponse.json({
      ok: true,
      savedLead: buildSavedLeadResponse(
        {
          googlePlaceId: candidate.googlePlaceId,
          name: candidate.name,
          address: candidate.address ?? "",
          city: candidate.city ?? "",
          province: candidate.province ?? "",
          website: candidate.website ?? "",
          phone: candidate.phone ?? "",
          googleRating:
            typeof candidate.googleRating === "number" ? candidate.googleRating : null,
          googleReviewCount:
            typeof candidate.googleReviewCount === "number"
              ? candidate.googleReviewCount
              : null,
          categories: Array.isArray(candidate.categories) ? candidate.categories : [],
          primaryType: candidate.primaryType ?? "",
          googleMapsUrl: candidate.googleMapsUrl ?? "",
          businessStatus: candidate.businessStatus ?? "",
          editorialSummary: candidate.editorialSummary ?? "",
          distanceKm:
            typeof candidate.distanceKm === "number" ? candidate.distanceKm : null,
          fitScore: typeof candidate.fitScore === "number" ? candidate.fitScore : 0,
          fitTier:
            candidate.fitTier === "hot" ||
            candidate.fitTier === "warm" ||
            candidate.fitTier === "cold"
              ? candidate.fitTier
              : "cold",
          rationale: candidate.rationale ?? "",
          matchSignals: Array.isArray(candidate.matchSignals)
            ? candidate.matchSignals.map(String)
            : [],
          cautionSignals: Array.isArray(candidate.cautionSignals)
            ? candidate.cautionSignals.map(String)
            : [],
        },
        savedLead
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[POST /api/discover/dedupe]", error);
    return NextResponse.json(
      { error: "Failed to resolve discovery duplicate", detail: message },
      { status: 500 }
    );
  }
}
