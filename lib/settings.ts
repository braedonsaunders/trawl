import {
  getCompanyProfile,
  upsertCompanyProfile,
} from "@/lib/db/queries/companies";
import {
  getProviderSetting,
  listProviderSettings,
  saveProviderSetting,
  type ProviderAuthMode,
  type ProviderId,
  type ProviderSettingRecord,
} from "@/lib/db/queries/provider-settings";
import {
  getAllSettings,
  initDefaultSettings,
  setSettings,
} from "@/lib/db/queries/settings";

export interface CompanyProfileSettings {
  website: string;
  name: string;
  description: string;
  industry: string;
  services: string;
}

export interface ContactSetting {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  tag: string;
}

export interface HandoffRuleSetting {
  id: string;
  condition: string;
  assignTo: string;
  priority: number;
}

export interface ProviderSettingsValue {
  provider: ProviderId;
  authMode: ProviderAuthMode;
  apiKey: string;
  baseUrl: string;
  organization: string;
  project: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  oauthScope: string;
  oauthAudience: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
  oauthIdToken: string;
  oauthTokenType: string;
  oauthExpiresAt: string | null;
  oauthConnectedAt: string | null;
}

export interface SettingsPayload {
  companyProfile: CompanyProfileSettings;
  integrations: {
    googleMapsApiKey: string;
    smtp: {
      host: string;
      port: string;
      user: string;
      pass: string;
      fromName: string;
    };
    imap: {
      host: string;
      port: string;
      user: string;
      pass: string;
    };
  };
  outreach: {
    dailySendCap: number;
    sendDelaySeconds: number;
    scoreThresholdHot: number;
    scoreThresholdWarm: number;
    enrichmentConcurrency: number;
    imapPollIntervalMinutes: number;
    maxCrawlPages: number;
    screenshotsDir: string;
    senderName: string;
    senderTitle: string;
  };
  handoffContacts: ContactSetting[];
  handoffRules: HandoffRuleSetting[];
  llm: {
    selectedProvider: ProviderId;
    selectedModel: string;
    providers: ProviderSettingsValue[];
  };
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function listToMultilineString(value: string | null): string {
  if (!value) {
    return "";
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.join("\n");
    }
  } catch {
    // Ignore invalid JSON and fall back to raw value.
  }

  return value;
}

function firstListItem(value: string | null): string {
  if (!value) {
    return "";
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[0] ?? "");
    }
  } catch {
    // Ignore invalid JSON and fall back to raw value.
  }

  return value;
}

function splitListInput(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fromProviderRecord(
  record: ProviderSettingRecord
): ProviderSettingsValue {
  return {
    provider: record.provider,
    authMode: record.auth_mode,
    apiKey: record.api_key,
    baseUrl: record.base_url,
    organization: record.organization,
    project: record.project,
    oauthClientId: record.oauth_client_id,
    oauthClientSecret: record.oauth_client_secret,
    oauthAuthorizeUrl: record.oauth_authorize_url,
    oauthTokenUrl: record.oauth_token_url,
    oauthScope: record.oauth_scope,
    oauthAudience: record.oauth_audience,
    oauthAccessToken: record.oauth_access_token,
    oauthRefreshToken: record.oauth_refresh_token,
    oauthIdToken: record.oauth_id_token,
    oauthTokenType: record.oauth_token_type,
    oauthExpiresAt: record.oauth_expires_at,
    oauthConnectedAt: record.oauth_connected_at,
  };
}

function toProviderRecord(
  provider: ProviderSettingsValue,
  current: ProviderSettingRecord
): ProviderSettingRecord {
  return {
    ...current,
    provider: provider.provider,
    auth_mode: provider.authMode,
    api_key: provider.apiKey,
    base_url: provider.baseUrl,
    organization: provider.organization,
    project: provider.project,
    oauth_client_id: provider.oauthClientId,
    oauth_client_secret: provider.oauthClientSecret,
    oauth_authorize_url: provider.oauthAuthorizeUrl,
    oauth_token_url: provider.oauthTokenUrl,
    oauth_scope: provider.oauthScope,
    oauth_audience: provider.oauthAudience,
    oauth_access_token: provider.oauthAccessToken,
    oauth_refresh_token: provider.oauthRefreshToken,
    oauth_id_token: provider.oauthIdToken,
    oauth_token_type: provider.oauthTokenType,
    oauth_expires_at: provider.oauthExpiresAt,
    oauth_connected_at: provider.oauthConnectedAt,
  };
}

export function getSettingsPayload(): SettingsPayload {
  initDefaultSettings();

  const settings = getAllSettings();
  const company = getCompanyProfile();
  const providers = listProviderSettings().map(fromProviderRecord);
  const selectedProvider =
    (settings.llm_provider as ProviderId | undefined) || "openai";

  return {
    companyProfile: {
      website: company?.website || "",
      name: company?.name || "",
      description: company?.description || "",
      industry: firstListItem(company?.industries_served || null),
      services: listToMultilineString(company?.services || null),
    },
    integrations: {
      googleMapsApiKey: settings.google_maps_api_key || "",
      smtp: {
        host: settings.smtp_host || "smtp.gmail.com",
        port: settings.smtp_port || "587",
        user: settings.smtp_user || "",
        pass: settings.smtp_pass || "",
        fromName: settings.smtp_from_name || "",
      },
      imap: {
        host: settings.imap_host || "imap.gmail.com",
        port: settings.imap_port || "993",
        user: settings.imap_user || "",
        pass: settings.imap_pass || "",
      },
    },
    outreach: {
      dailySendCap: parseInteger(settings.daily_send_cap, 50),
      sendDelaySeconds: parseInteger(settings.send_delay_seconds, 45),
      scoreThresholdHot: parseInteger(settings.hot_score_threshold, 70),
      scoreThresholdWarm: parseInteger(settings.warm_score_threshold, 40),
      enrichmentConcurrency: parseInteger(
        settings.enrichment_concurrency,
        2
      ),
      imapPollIntervalMinutes: parseInteger(
        settings.imap_poll_interval_minutes,
        15
      ),
      maxCrawlPages: parseInteger(settings.max_crawl_pages, 8),
      screenshotsDir: settings.screenshots_dir || "./data/screenshots",
      senderName: settings.sender_name || "",
      senderTitle: settings.sender_title || "Business Development",
    },
    handoffContacts: parseJsonArray<ContactSetting>(
      settings.handoff_contacts,
      []
    ),
    handoffRules: parseJsonArray<HandoffRuleSetting>(settings.handoff_rules, []),
    llm: {
      selectedProvider:
        selectedProvider === "anthropic" ? "anthropic" : "openai",
      selectedModel: settings.llm_model || "",
      providers,
    },
  };
}

export function saveSettingsPayload(payload: SettingsPayload): SettingsPayload {
  initDefaultSettings();

  setSettings({
    google_maps_api_key: payload.integrations.googleMapsApiKey,
    smtp_host: payload.integrations.smtp.host,
    smtp_port: payload.integrations.smtp.port,
    smtp_user: payload.integrations.smtp.user,
    smtp_pass: payload.integrations.smtp.pass,
    smtp_from_name: payload.integrations.smtp.fromName,
    imap_host: payload.integrations.imap.host,
    imap_port: payload.integrations.imap.port,
    imap_user: payload.integrations.imap.user,
    imap_pass: payload.integrations.imap.pass,
    llm_provider: payload.llm.selectedProvider,
    llm_model: payload.llm.selectedModel,
    daily_send_cap: String(payload.outreach.dailySendCap),
    send_delay_seconds: String(payload.outreach.sendDelaySeconds),
    hot_score_threshold: String(payload.outreach.scoreThresholdHot),
    warm_score_threshold: String(payload.outreach.scoreThresholdWarm),
    enrichment_concurrency: String(payload.outreach.enrichmentConcurrency),
    imap_poll_interval_minutes: String(
      payload.outreach.imapPollIntervalMinutes
    ),
    max_crawl_pages: String(payload.outreach.maxCrawlPages),
    screenshots_dir: payload.outreach.screenshotsDir,
    sender_name: payload.outreach.senderName,
    sender_title: payload.outreach.senderTitle,
    handoff_contacts: JSON.stringify(payload.handoffContacts),
    handoff_rules: JSON.stringify(payload.handoffRules),
  });

  for (const provider of payload.llm.providers) {
    const current = getProviderSetting(provider.provider);
    saveProviderSetting(toProviderRecord(provider, current));
  }

  const currentCompany = getCompanyProfile();
  const hasCompanyData = Object.values(payload.companyProfile).some((value) =>
    value.trim()
  );

  if (hasCompanyData || currentCompany) {
    upsertCompanyProfile({
      name: payload.companyProfile.name,
      website: payload.companyProfile.website,
      description: payload.companyProfile.description || null,
      services: JSON.stringify(splitListInput(payload.companyProfile.services)),
      industries_served: JSON.stringify(
        splitListInput(payload.companyProfile.industry).slice(0, 1)
      ),
      geographies: currentCompany?.geographies ?? null,
      differentiators: currentCompany?.differentiators ?? null,
      screenshots: currentCompany?.screenshots ?? null,
      raw_content: currentCompany?.raw_content ?? null,
      last_profiled_at: currentCompany?.last_profiled_at ?? null,
    });
  }

  return getSettingsPayload();
}
