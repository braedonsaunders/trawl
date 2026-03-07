import { NextRequest, NextResponse } from "next/server";
import { getLeadList } from "@/lib/db/queries/leads";
import type { LeadListFilters } from "@/lib/db/queries/leads";
import { formatLeadIndustry } from "@/lib/leads/format";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(
      10_000,
      Math.max(
        1,
        parseInt(
          searchParams.get("per_page") || searchParams.get("limit") || "25",
          10
        )
      )
    );

    const filters: LeadListFilters = {
      status: searchParams.get("status") || undefined,
      city: searchParams.get("city") || undefined,
      tier: searchParams.get("tier") || undefined,
      hasWebsite: searchParams.get("has_website") === "true",
      sortBy:
        (searchParams.get("sort") as LeadListFilters["sortBy"]) ||
        "last_activity",
      sortOrder:
        (searchParams.get("dir") as LeadListFilters["sortOrder"]) ||
        (searchParams.get("order") as LeadListFilters["sortOrder"]) ||
        "desc",
    };

    const leads = getLeadList(filters).map((lead) => ({
      ...lead,
      industry: formatLeadIndustry(lead.industry),
    }));

    // Simple in-memory pagination over the filtered result set.
    const offset = (page - 1) * perPage;
    const total = leads.length;
    const paginated = leads.slice(offset, offset + perPage);

    return NextResponse.json({
      leads: paginated,
      total,
      page,
      per_page: perPage,
      data: paginated,
      pagination: {
        page,
        limit: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/leads]", error);
    return NextResponse.json(
      { error: "Failed to fetch leads", detail: message },
      { status: 500 }
    );
  }
}
