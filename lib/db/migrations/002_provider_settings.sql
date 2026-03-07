CREATE TABLE IF NOT EXISTS provider_settings (
  provider TEXT PRIMARY KEY,
  auth_mode TEXT NOT NULL DEFAULT 'api_key' CHECK(auth_mode IN ('api_key', 'oauth')),
  api_key TEXT,
  base_url TEXT,
  organization TEXT,
  project TEXT,
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  oauth_authorize_url TEXT,
  oauth_token_url TEXT,
  oauth_scope TEXT,
  oauth_audience TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_id_token TEXT,
  oauth_token_type TEXT,
  oauth_expires_at DATETIME,
  oauth_connected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_created_at
  ON oauth_states(created_at);

INSERT OR IGNORE INTO provider_settings (
  provider,
  auth_mode,
  base_url,
  oauth_authorize_url,
  oauth_token_url,
  oauth_scope
) VALUES (
  'openai',
  'api_key',
  'https://api.openai.com/v1',
  'https://auth.openai.com/authorize',
  'https://auth0.openai.com/oauth/token',
  'openid profile email offline_access api.connectors.read api.connectors.invoke'
);

INSERT OR IGNORE INTO provider_settings (
  provider,
  auth_mode,
  base_url,
  oauth_authorize_url,
  oauth_token_url,
  oauth_scope
) VALUES (
  'anthropic',
  'api_key',
  'https://api.anthropic.com/v1',
  'https://platform.claude.com/oauth/authorize',
  'https://platform.claude.com/v1/oauth/token',
  'user:profile user:inference user:sessions:claude_code user:mcp_servers'
);
