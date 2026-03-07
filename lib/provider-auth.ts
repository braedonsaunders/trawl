import { createHash, randomBytes } from "node:crypto";
import {
  getProviderSetting,
  setProviderOAuthTokens,
  type ProviderId,
  type ProviderSettingRecord,
} from "@/lib/db/queries/provider-settings";

export const ANTHROPIC_OAUTH_BETA_HEADER = "oauth-2025-04-20";

export interface PkceCodes {
  codeVerifier: string;
  codeChallenge: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function buildTokenHeaders(
  provider: ProviderId,
  includeJson = false
): Record<string, string> {
  const headers: Record<string, string> = includeJson
    ? { "Content-Type": "application/json" }
    : { "Content-Type": "application/x-www-form-urlencoded" };

  if (provider === "anthropic") {
    headers["anthropic-beta"] = ANTHROPIC_OAUTH_BETA_HEADER;
  }

  return headers;
}

async function tokenRequest(
  provider: ProviderId,
  tokenUrl: string,
  body: URLSearchParams
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: buildTokenHeaders(provider),
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${provider} OAuth token exchange failed (${response.status}): ${text}`
    );
  }

  const json = (await response.json()) as OAuthTokenResponse;

  if (!json.access_token) {
    throw new Error(`${provider} OAuth response did not include access_token`);
  }

  return json;
}

export function generateState(): string {
  return toBase64Url(randomBytes(32));
}

export function createPkceCodes(): PkceCodes {
  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(
    createHash("sha256").update(codeVerifier).digest()
  );

  return { codeVerifier, codeChallenge };
}

export function buildOAuthAuthorizationUrl(args: {
  provider: ProviderId;
  config: ProviderSettingRecord;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const { config, redirectUri, state, codeChallenge } = args;

  if (!config.oauth_client_id) {
    throw new Error(
      `${config.provider} OAuth requires an OAuth client ID in settings`
    );
  }

  if (!config.oauth_authorize_url) {
    throw new Error(
      `${config.provider} OAuth requires an authorization URL in settings`
    );
  }

  const url = new URL(config.oauth_authorize_url);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.oauth_client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", config.oauth_scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (config.oauth_audience) {
    url.searchParams.set("audience", config.oauth_audience);
  }

  return url.toString();
}

export async function exchangeOAuthCode(args: {
  provider: ProviderId;
  config: ProviderSettingRecord;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ProviderSettingRecord> {
  const { provider, config, code, codeVerifier, redirectUri } = args;

  if (!config.oauth_client_id) {
    throw new Error(
      `${provider} OAuth requires an OAuth client ID in settings`
    );
  }

  if (!config.oauth_token_url) {
    throw new Error(`${provider} OAuth requires a token URL in settings`);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.oauth_client_id,
    code_verifier: codeVerifier,
  });

  if (config.oauth_client_secret) {
    body.set("client_secret", config.oauth_client_secret);
  }

  const tokens = await tokenRequest(provider, config.oauth_token_url, body);

  return setProviderOAuthTokens(provider, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    id_token: tokens.id_token ?? null,
    token_type: tokens.token_type ?? null,
    expires_at: buildExpiresAt(tokens.expires_in),
  });
}

export async function refreshOAuthAccessToken(
  provider: ProviderId
): Promise<ProviderSettingRecord> {
  const config = getProviderSetting(provider);

  if (config.auth_mode !== "oauth") {
    return config;
  }

  if (!config.oauth_refresh_token) {
    return config;
  }

  if (!config.oauth_client_id) {
    throw new Error(
      `${provider} OAuth refresh requires an OAuth client ID in settings`
    );
  }

  if (!config.oauth_token_url) {
    throw new Error(`${provider} OAuth refresh requires a token URL in settings`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.oauth_refresh_token,
    client_id: config.oauth_client_id,
  });

  if (config.oauth_client_secret) {
    body.set("client_secret", config.oauth_client_secret);
  }

  const tokens = await tokenRequest(provider, config.oauth_token_url, body);

  return setProviderOAuthTokens(provider, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? config.oauth_refresh_token,
    id_token: tokens.id_token ?? config.oauth_id_token,
    token_type: tokens.token_type ?? config.oauth_token_type,
    expires_at: buildExpiresAt(tokens.expires_in),
  });
}
