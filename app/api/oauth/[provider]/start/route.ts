import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORTED_PROVIDERS,
  clearExpiredOAuthStates,
  createOAuthState,
  getProviderSetting,
  type ProviderId,
} from "@/lib/db/queries/provider-settings";
import {
  buildOAuthAuthorizationUrl,
  createPkceCodes,
  generateState,
} from "@/lib/provider-auth";

function isProviderId(value: string): value is ProviderId {
  return SUPPORTED_PROVIDERS.includes(value as ProviderId);
}

export async function GET(
  request: NextRequest,
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

    clearExpiredOAuthStates();

    const config = getProviderSetting(provider);
    const pkce = createPkceCodes();
    const state = generateState();
    const redirectPath = request.nextUrl.searchParams.get("returnTo") || "/settings";
    const redirectUri = new URL(
      `/api/oauth/${provider}/callback`,
      request.nextUrl.origin
    ).toString();

    createOAuthState({
      state,
      provider,
      code_verifier: pkce.codeVerifier,
      redirect_path: redirectPath,
    });

    const authUrl = buildOAuthAuthorizationUrl({
      provider,
      config,
      redirectUri,
      state,
      codeChallenge: pkce.codeChallenge,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/oauth/[provider]/start]", error);

    const fallback = new URL("/settings", request.nextUrl.origin);
    fallback.searchParams.set("oauthStatus", "error");
    const provider = request.nextUrl.pathname.split("/").slice(-2, -1)[0] || "unknown";
    fallback.searchParams.set("oauthProvider", provider);
    fallback.searchParams.set("oauthError", message.slice(0, 160));
    return NextResponse.redirect(fallback);
  }
}
