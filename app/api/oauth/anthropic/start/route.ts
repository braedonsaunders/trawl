import { NextResponse } from "next/server";
import {
  buildAnthropicAuthorizeUrl,
  createPkcePair,
} from "@/lib/provider-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { verifier, challenge } = createPkcePair();
    const url = buildAnthropicAuthorizeUrl(challenge, verifier);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
