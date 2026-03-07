import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORTED_PROVIDERS,
  type ProviderId,
} from "@/lib/db/queries/provider-settings";
import { listProviderModels } from "@/lib/llm/client";

function isProviderId(value: string): value is ProviderId {
  return SUPPORTED_PROVIDERS.includes(value as ProviderId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;

    if (!isProviderId(provider)) {
      return NextResponse.json(
        { error: "Unsupported provider" },
        { status: 400 }
      );
    }

    const models = await listProviderModels(provider);
    return NextResponse.json({ provider, models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/llm/models/[provider]]", error);
    return NextResponse.json(
      { error: "Failed to fetch provider models", detail: message },
      { status: 500 }
    );
  }
}
