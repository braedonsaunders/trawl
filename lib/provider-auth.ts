import { createHash, randomBytes } from "node:crypto";
import {
  getProviderSetting,
  setProviderOAuthTokens,
  type ProviderId,
  type ProviderSettingRecord,
} from "@/lib/db/queries/provider-settings";

export const ANTHROPIC_OAUTH_BETA_HEADER = "oauth-2025-04-20";

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_REDIRECT_URI = "http://localhost:1455/auth/callback";
const OPENAI_SCOPES = "openid profile email offline_access";

const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTH_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_SCOPES = "org:create_api_key user:profile user:inference";

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
  scope?: string;
}

interface AnthropicTokenResponse {
  access_token: string;
  refresh_token?: string;
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

export function buildExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function buildFormHeaders(provider?: ProviderId): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider === "anthropic") {
    headers["anthropic-beta"] = ANTHROPIC_OAUTH_BETA_HEADER;
  }

  return headers;
}

async function formTokenRequest(
  tokenUrl: string,
  body: URLSearchParams,
  provider?: ProviderId
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: buildFormHeaders(provider),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as OAuthTokenResponse;

  if (!json.access_token) {
    throw new Error("OAuth response did not include access_token");
  }

  return json;
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

function jsonStringify(value: Record<string, string | undefined>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined)
    )
  );
}

export function generateState(): string {
  return toBase64Url(randomBytes(32));
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = toBase64Url(randomBytes(32));
  const challenge = toBase64Url(
    createHash("sha256").update(verifier).digest()
  );

  return { verifier, challenge };
}

export function createPkceCodes(): PkceCodes {
  const { verifier, challenge } = createPkcePair();
  return {
    codeVerifier: verifier,
    codeChallenge: challenge,
  };
}

// ---------------------------------------------------------------------------
// Legacy generic OAuth helpers kept for route compatibility
// ---------------------------------------------------------------------------

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

  const tokens = await formTokenRequest(config.oauth_token_url, body, provider);

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

  const tokens = await formTokenRequest(config.oauth_token_url, body, provider);

  return setProviderOAuthTokens(provider, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? config.oauth_refresh_token,
    id_token: tokens.id_token ?? config.oauth_id_token,
    token_type: tokens.token_type ?? config.oauth_token_type,
    expires_at: buildExpiresAt(tokens.expires_in),
  });
}

// ---------------------------------------------------------------------------
// OpenAI OAuth (Codex CLI public client – localhost:1455 callback)
// ---------------------------------------------------------------------------

export function buildOpenAIAuthorizeUrl(
  state: string,
  challenge: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_CLIENT_ID,
    redirect_uri: OPENAI_REDIRECT_URI,
    scope: OPENAI_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
  });

  return `${OPENAI_AUTH_URL}?${params.toString()}`;
}

export async function exchangeOpenAICode(
  code: string,
  codeVerifier: string
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: OPENAI_REDIRECT_URI,
    client_id: OPENAI_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: buildFormHeaders(),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as OAuthTokenResponse;
}

export async function refreshOpenAIToken(
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: OPENAI_CLIENT_ID,
  });

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: buildFormHeaders(),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI token refresh failed (${response.status}): ${text}`);
  }

  return (await response.json()) as OAuthTokenResponse;
}

export async function exchangeOpenAITokenForApiKey(
  idToken: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token: "openai-api-key",
    subject_token: idToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    client_id: OPENAI_CLIENT_ID,
  });

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: buildFormHeaders(),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenAI token→API-key exchange failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export function parseJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const payload = Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(payload) as Record<string, unknown>;
}

export function extractChatGPTAccountId(
  accessToken: string
): string | undefined {
  try {
    const payload = parseJwtPayload(accessToken);
    const directId = payload.chatgpt_account_id;
    if (typeof directId === "string" && directId.length > 0) {
      return directId;
    }

    const authClaims = payload["https://api.openai.com/auth"] as
      | Record<string, unknown>
      | undefined;
    const nestedId = authClaims?.chatgpt_account_id;
    if (typeof nestedId === "string" && nestedId.length > 0) {
      return nestedId;
    }

    const organizations = payload.organizations;
    if (Array.isArray(organizations)) {
      const firstOrganization = organizations[0] as
        | Record<string, unknown>
        | undefined;
      const orgId = firstOrganization?.id;
      if (typeof orgId === "string" && orgId.length > 0) {
        return orgId;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function extractOpenAIAccountIdFromTokens(tokens: {
  access_token?: string;
  id_token?: string;
}): string | undefined {
  if (tokens.id_token) {
    const fromIdToken = extractChatGPTAccountId(tokens.id_token);
    if (fromIdToken) {
      return fromIdToken;
    }
  }

  if (tokens.access_token) {
    const fromAccessToken = extractChatGPTAccountId(tokens.access_token);
    if (fromAccessToken) {
      return fromAccessToken;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Anthropic OAuth (Claude CLI public client – code-paste flow)
// ---------------------------------------------------------------------------

export function buildAnthropicAuthorizeUrl(
  challenge: string,
  verifier: string
): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: "code",
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });

  return `${ANTHROPIC_AUTH_URL}?${params.toString()}`;
}

export async function exchangeAnthropicCode(
  code: string,
  state: string,
  codeVerifier: string
): Promise<AnthropicTokenResponse> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: jsonHeaders(),
    body: jsonStringify({
      code,
      state,
      grant_type: "authorization_code",
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as AnthropicTokenResponse;
}

export async function refreshAnthropicToken(
  refreshToken: string
): Promise<AnthropicTokenResponse> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: jsonHeaders(),
    body: jsonStringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic token refresh failed (${response.status}): ${text}`);
  }

  return (await response.json()) as AnthropicTokenResponse;
}
