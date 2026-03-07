import { NextRequest, NextResponse } from "next/server";
import {
  SUPPORTED_PROVIDERS,
  consumeOAuthState,
  getProviderSetting,
  type ProviderId,
} from "@/lib/db/queries/provider-settings";
import { exchangeOAuthCode } from "@/lib/provider-auth";

function isProviderId(value: string): value is ProviderId {
  return SUPPORTED_PROVIDERS.includes(value as ProviderId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const redirect = new URL("/settings", request.nextUrl.origin);

  try {
    if (!isProviderId(provider)) {
      redirect.searchParams.set("oauthStatus", "error");
      redirect.searchParams.set("oauthProvider", provider);
      redirect.searchParams.set("oauthError", "Unsupported provider");
      return NextResponse.redirect(redirect);
    }

    const error = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    redirect.searchParams.set("oauthProvider", provider);

    if (error) {
      redirect.searchParams.set("oauthStatus", "error");
      redirect.searchParams.set("oauthError", error);
      return NextResponse.redirect(redirect);
    }

    if (!code || !state) {
      redirect.searchParams.set("oauthStatus", "error");
      redirect.searchParams.set("oauthError", "Missing code or state");
      return NextResponse.redirect(redirect);
    }

    const storedState = consumeOAuthState(state);
    if (!storedState || storedState.provider !== provider) {
      redirect.searchParams.set("oauthStatus", "error");
      redirect.searchParams.set("oauthError", "Invalid OAuth state");
      return NextResponse.redirect(redirect);
    }

    const config = getProviderSetting(provider);
    const redirectUri = new URL(
      `/api/oauth/${provider}/callback`,
      request.nextUrl.origin
    ).toString();

    await exchangeOAuthCode({
      provider,
      config,
      code,
      codeVerifier: storedState.code_verifier,
      redirectUri,
    });

    const successRedirect = new URL(
      storedState.redirect_path || "/settings",
      request.nextUrl.origin
    );
    successRedirect.searchParams.set("oauthStatus", "success");
    successRedirect.searchParams.set("oauthProvider", provider);
    return NextResponse.redirect(successRedirect);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[GET /api/oauth/[provider]/callback]", error);
    redirect.searchParams.set("oauthStatus", "error");
    redirect.searchParams.set("oauthProvider", provider);
    redirect.searchParams.set("oauthError", message.slice(0, 160));
    return NextResponse.redirect(redirect);
  }
}
