import { NextRequest, NextResponse } from "next/server";
import type { SettingsPayload } from "@/lib/settings";
import { getSettingsPayload, saveSettingsPayload } from "@/lib/settings";

export async function GET() {
  try {
    return NextResponse.json(getSettingsPayload());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/settings]", error);
    return NextResponse.json(
      { error: "Failed to fetch settings", detail: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as SettingsPayload;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Body must be a JSON object" },
        { status: 400 }
      );
    }

    const settings = saveSettingsPayload(body);
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[PUT /api/settings]", error);
    return NextResponse.json(
      { error: "Failed to update settings", detail: message },
      { status: 500 }
    );
  }
}
