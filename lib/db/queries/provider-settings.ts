import { getDb } from "../client";

export const SUPPORTED_PROVIDERS = ["openai", "anthropic"] as const;

export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];
export type ProviderAuthMode = "api_key" | "oauth";

export interface ProviderSettingRecord {
  provider: ProviderId;
  auth_mode: ProviderAuthMode;
  api_key: string;
  base_url: string;
  organization: string;
  project: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  oauth_authorize_url: string;
  oauth_token_url: string;
  oauth_scope: string;
  oauth_audience: string;
  oauth_access_token: string;
  oauth_refresh_token: string;
  oauth_id_token: string;
  oauth_token_type: string;
  oauth_expires_at: string | null;
  oauth_connected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProviderOAuthState {
  state: string;
  provider: ProviderId;
  code_verifier: string;
  redirect_path: string | null;
  created_at: string;
}

interface ProviderRow {
  provider: string;
  auth_mode: string | null;
  api_key: string | null;
  base_url: string | null;
  organization: string | null;
  project: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_authorize_url: string | null;
  oauth_token_url: string | null;
  oauth_scope: string | null;
  oauth_audience: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_id_token: string | null;
  oauth_token_type: string | null;
  oauth_expires_at: string | null;
  oauth_connected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const PROVIDER_DEFAULTS: Record<ProviderId, ProviderSettingRecord> = {
  openai: {
    provider: "openai",
    auth_mode: "api_key",
    api_key: "",
    base_url: "https://api.openai.com/v1",
    organization: "",
    project: "",
    oauth_client_id: "",
    oauth_client_secret: "",
    oauth_authorize_url: "https://auth.openai.com/authorize",
    oauth_token_url: "https://auth0.openai.com/oauth/token",
    oauth_scope:
      "openid profile email offline_access api.connectors.read api.connectors.invoke",
    oauth_audience: "",
    oauth_access_token: "",
    oauth_refresh_token: "",
    oauth_id_token: "",
    oauth_token_type: "",
    oauth_expires_at: null,
    oauth_connected_at: null,
    created_at: null,
    updated_at: null,
  },
  anthropic: {
    provider: "anthropic",
    auth_mode: "api_key",
    api_key: "",
    base_url: "https://api.anthropic.com/v1",
    organization: "",
    project: "",
    oauth_client_id: "",
    oauth_client_secret: "",
    oauth_authorize_url: "https://platform.claude.com/oauth/authorize",
    oauth_token_url: "https://platform.claude.com/v1/oauth/token",
    oauth_scope:
      "user:profile user:inference user:sessions:claude_code user:mcp_servers",
    oauth_audience: "",
    oauth_access_token: "",
    oauth_refresh_token: "",
    oauth_id_token: "",
    oauth_token_type: "",
    oauth_expires_at: null,
    oauth_connected_at: null,
    created_at: null,
    updated_at: null,
  },
};

function isProviderId(value: string): value is ProviderId {
  return SUPPORTED_PROVIDERS.includes(value as ProviderId);
}

function normalizeProviderRow(row: ProviderRow): ProviderSettingRecord {
  const provider = isProviderId(row.provider) ? row.provider : "openai";
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    auth_mode:
      row.auth_mode === "oauth" || row.auth_mode === "api_key"
        ? row.auth_mode
        : defaults.auth_mode,
    api_key: row.api_key ?? defaults.api_key,
    base_url: row.base_url ?? defaults.base_url,
    organization: row.organization ?? defaults.organization,
    project: row.project ?? defaults.project,
    oauth_client_id: row.oauth_client_id ?? defaults.oauth_client_id,
    oauth_client_secret:
      row.oauth_client_secret ?? defaults.oauth_client_secret,
    oauth_authorize_url:
      row.oauth_authorize_url ?? defaults.oauth_authorize_url,
    oauth_token_url: row.oauth_token_url ?? defaults.oauth_token_url,
    oauth_scope: row.oauth_scope ?? defaults.oauth_scope,
    oauth_audience: row.oauth_audience ?? defaults.oauth_audience,
    oauth_access_token: row.oauth_access_token ?? defaults.oauth_access_token,
    oauth_refresh_token:
      row.oauth_refresh_token ?? defaults.oauth_refresh_token,
    oauth_id_token: row.oauth_id_token ?? defaults.oauth_id_token,
    oauth_token_type: row.oauth_token_type ?? defaults.oauth_token_type,
    oauth_expires_at: row.oauth_expires_at ?? defaults.oauth_expires_at,
    oauth_connected_at:
      row.oauth_connected_at ?? defaults.oauth_connected_at,
    created_at: row.created_at ?? defaults.created_at,
    updated_at: row.updated_at ?? defaults.updated_at,
  };
}

export function listProviderSettings(): ProviderSettingRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM provider_settings ORDER BY provider")
    .all() as ProviderRow[];

  const byProvider = new Map<ProviderId, ProviderSettingRecord>();
  for (const row of rows) {
    const normalized = normalizeProviderRow(row);
    byProvider.set(normalized.provider, normalized);
  }

  return SUPPORTED_PROVIDERS.map(
    (provider) => byProvider.get(provider) ?? { ...PROVIDER_DEFAULTS[provider] }
  );
}

export function getProviderSetting(
  provider: ProviderId
): ProviderSettingRecord {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM provider_settings WHERE provider = ?")
    .get(provider) as ProviderRow | undefined;

  return row ? normalizeProviderRow(row) : { ...PROVIDER_DEFAULTS[provider] };
}

export function saveProviderSetting(
  providerSetting: ProviderSettingRecord
): ProviderSettingRecord {
  const db = getDb();
  const provider = providerSetting.provider;
  const current = getProviderSetting(provider);
  const next = { ...current, ...providerSetting, provider };
  const params = {
    provider: next.provider,
    auth_mode: next.auth_mode,
    api_key: next.api_key,
    base_url: next.base_url,
    organization: next.organization,
    project: next.project,
    oauth_client_id: next.oauth_client_id,
    oauth_client_secret: next.oauth_client_secret,
    oauth_authorize_url: next.oauth_authorize_url,
    oauth_token_url: next.oauth_token_url,
    oauth_scope: next.oauth_scope,
    oauth_audience: next.oauth_audience,
    oauth_access_token: next.oauth_access_token,
    oauth_refresh_token: next.oauth_refresh_token,
    oauth_id_token: next.oauth_id_token,
    oauth_token_type: next.oauth_token_type,
    oauth_expires_at: next.oauth_expires_at,
    oauth_connected_at: next.oauth_connected_at,
  };

  db.prepare(`
    INSERT INTO provider_settings (
      provider,
      auth_mode,
      api_key,
      base_url,
      organization,
      project,
      oauth_client_id,
      oauth_client_secret,
      oauth_authorize_url,
      oauth_token_url,
      oauth_scope,
      oauth_audience,
      oauth_access_token,
      oauth_refresh_token,
      oauth_id_token,
      oauth_token_type,
      oauth_expires_at,
      oauth_connected_at,
      updated_at
    ) VALUES (
      @provider,
      @auth_mode,
      @api_key,
      @base_url,
      @organization,
      @project,
      @oauth_client_id,
      @oauth_client_secret,
      @oauth_authorize_url,
      @oauth_token_url,
      @oauth_scope,
      @oauth_audience,
      @oauth_access_token,
      @oauth_refresh_token,
      @oauth_id_token,
      @oauth_token_type,
      @oauth_expires_at,
      @oauth_connected_at,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(provider) DO UPDATE SET
      auth_mode = excluded.auth_mode,
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      organization = excluded.organization,
      project = excluded.project,
      oauth_client_id = excluded.oauth_client_id,
      oauth_client_secret = excluded.oauth_client_secret,
      oauth_authorize_url = excluded.oauth_authorize_url,
      oauth_token_url = excluded.oauth_token_url,
      oauth_scope = excluded.oauth_scope,
      oauth_audience = excluded.oauth_audience,
      oauth_access_token = excluded.oauth_access_token,
      oauth_refresh_token = excluded.oauth_refresh_token,
      oauth_id_token = excluded.oauth_id_token,
      oauth_token_type = excluded.oauth_token_type,
      oauth_expires_at = excluded.oauth_expires_at,
      oauth_connected_at = excluded.oauth_connected_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(params);

  return getProviderSetting(provider);
}

export interface OAuthTokenUpdate {
  access_token: string;
  refresh_token?: string | null;
  id_token?: string | null;
  token_type?: string | null;
  expires_at?: string | null;
  connected_at?: string | null;
}

export function setProviderOAuthTokens(
  provider: ProviderId,
  tokens: OAuthTokenUpdate
): ProviderSettingRecord {
  const current = getProviderSetting(provider);

  return saveProviderSetting({
    ...current,
    provider,
    auth_mode: "oauth",
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token ?? current.oauth_refresh_token,
    oauth_id_token: tokens.id_token ?? current.oauth_id_token,
    oauth_token_type: tokens.token_type ?? current.oauth_token_type,
    oauth_expires_at: tokens.expires_at ?? null,
    oauth_connected_at:
      tokens.connected_at ?? new Date().toISOString(),
  });
}

export function clearProviderOAuthTokens(
  provider: ProviderId
): ProviderSettingRecord {
  const current = getProviderSetting(provider);

  return saveProviderSetting({
    ...current,
    provider,
    oauth_access_token: "",
    oauth_refresh_token: "",
    oauth_id_token: "",
    oauth_token_type: "",
    oauth_expires_at: null,
    oauth_connected_at: null,
  });
}

export function createOAuthState(input: {
  state: string;
  provider: ProviderId;
  code_verifier: string;
  redirect_path?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO oauth_states (state, provider, code_verifier, redirect_path, created_at)
    VALUES (@state, @provider, @code_verifier, @redirect_path, CURRENT_TIMESTAMP)
    ON CONFLICT(state) DO UPDATE SET
      provider = excluded.provider,
      code_verifier = excluded.code_verifier,
      redirect_path = excluded.redirect_path,
      created_at = CURRENT_TIMESTAMP
  `).run({
    state: input.state,
    provider: input.provider,
    code_verifier: input.code_verifier,
    redirect_path: input.redirect_path ?? null,
  });
}

export function consumeOAuthState(state: string): ProviderOAuthState | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM oauth_states WHERE state = ?")
    .get(state) as
    | {
        state: string;
        provider: string;
        code_verifier: string;
        redirect_path: string | null;
        created_at: string;
      }
    | undefined;

  if (!row || !isProviderId(row.provider)) {
    return null;
  }

  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);

  return {
    state: row.state,
    provider: row.provider,
    code_verifier: row.code_verifier,
    redirect_path: row.redirect_path,
    created_at: row.created_at,
  };
}

export function clearExpiredOAuthStates(maxAgeHours = 1): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM oauth_states
    WHERE created_at < datetime('now', ?)
  `).run(`-${maxAgeHours} hours`);
}
