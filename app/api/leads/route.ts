import { NextRequest, NextResponse } from "next/server";
import { getAllLeads } from "@/lib/db/queries/leads";
import type { LeadFilters } from "@/lib/db/queries/leads";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: LeadFilters = {
      status: searchParams.get("status") || undefined,
      city: searchParams.get("city") || undefined,
      tier: searchParams.get("tier") || undefined,
      sortBy: (searchParams.get("sort") as LeadFilters["sortBy"]) || "created_at",
      sortOrder: (searchParams.get("order") as LeadFilters["sortOrder"]) || "desc",
    };

    const leads = getAllLeads(filters);

    // Simple pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const offset = (page - 1) * limit;
    const total = leads.length;
    const paginated = leads.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
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
