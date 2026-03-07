import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/google-maps/places";
import { upsertLead } from "@/lib/db/queries/leads";
import { createSearchJob, updateSearchJob } from "@/lib/db/queries/search-jobs";

export async function POST(request: NextRequest) {
  let jobId: number | undefined;

  try {
    const body = await request.json();
    const { query, location, radius_km, max_results } = body;

    if (!query || !location || radius_km == null) {
      return NextResponse.json(
        { error: "Missing required fields: query, location, radius_km" },
        { status: 400 }
      );
    }

    // Create search job
    const job = createSearchJob({ query, location, radius_km });
    jobId = job.id;
    updateSearchJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // For searchPlaces we need lat/lng - use a simple geocoding approach
    // The location string is passed as the query context
    const places = await searchPlaces({
      query: `${query} in ${location}`,
      location: { latitude: 0, longitude: 0 }, // Will be overridden by textQuery
      radiusKm: radius_km,
      maxResults: max_results ?? 100,
    });

    let leadsFound = 0;
    let duplicatesSkipped = 0;

    for (const place of places) {
      try {
        upsertLead({
          google_place_id: place.google_place_id,
          name: place.name,
          address: place.address,
          city: place.city,
          province: place.province,
          phone: place.phone,
          website: place.website,
          google_rating: place.google_rating,
          google_review_count: place.google_review_count,
          categories: place.categories,
        });
        leadsFound++;
      } catch {
        // If it's a duplicate (UNIQUE constraint), count it
        duplicatesSkipped++;
      }
    }

    updateSearchJob(jobId, {
      status: "complete",
      results_count: leadsFound,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      job_id: jobId,
      leads_found: leadsFound,
      duplicates_skipped: duplicatesSkipped,
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
        // Swallow DB error during cleanup
      }
    }

    console.error("[POST /api/discover]", error);
    return NextResponse.json(
      { error: "Discovery failed", detail: message },
      { status: 500 }
    );
  }
}
