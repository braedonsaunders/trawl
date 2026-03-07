import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting, initDefaultSettings } from "@/lib/db/queries/settings";

export async function GET() {
  try {
    initDefaultSettings();
    const settings = getAllSettings();

    return NextResponse.json({ settings });
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
    const body: Record<string, string> = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Body must be a JSON object of key-value pairs" },
        { status: 400 }
      );
    }

    const entries = Object.entries(body);
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No settings provided" },
        { status: 400 }
      );
    }

    for (const [key, value] of entries) {
      if (typeof key !== "string" || typeof value !== "string") {
        return NextResponse.json(
          { error: `Invalid setting: key and value must be strings` },
          { status: 400 }
        );
      }
      setSetting(key, value);
    }

    const settings = getAllSettings();

    return NextResponse.json({
      updated: entries.length,
      settings,
    });
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
