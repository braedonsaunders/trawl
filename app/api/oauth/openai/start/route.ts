import { NextResponse } from "next/server";
import { startOpenAIOAuthFlow } from "@/lib/openai-oauth-server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const url = await startOpenAIOAuthFlow();
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
