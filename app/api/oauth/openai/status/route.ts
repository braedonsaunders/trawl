import { NextResponse } from "next/server";
import { getOpenAIOAuthStatus } from "@/lib/openai-oauth-server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getOpenAIOAuthStatus());
}
