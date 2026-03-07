import { randomUUID } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import {
  getProviderSetting,
  saveProviderSetting,
  type ProviderId,
  type ProviderSettingRecord,
} from "@/lib/db/queries/provider-settings";
import { getSetting } from "@/lib/db/queries/settings";
import {
  ANTHROPIC_OAUTH_BETA_HEADER,
  buildExpiresAt,
  extractChatGPTAccountId,
  refreshAnthropicToken,
  refreshOpenAIToken,
} from "@/lib/provider-auth";
import type { LLMCallOptions, LLMCallResult } from "@/lib/llm/types";

export interface ProviderModelOption {
  id: string;
  label: string;
  createdAt: string | null;
}

const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const OPENAI_OAUTH_CODEX_MODELS = new Set([
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
]);
const DEFAULT_OPENAI_OAUTH_MODEL = "gpt-5.3-codex";

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeProviderId(value: string | undefined): ProviderId {
  return value === "anthropic" ? "anthropic" : "openai";
}

function buildProviderError(provider: ProviderId): string {
  return `${provider} credentials are not configured. Add an API key or connect via OAuth in Settings and retry.`;
}

function hasStoredApiKey(config: ProviderSettingRecord): boolean {
  return Boolean(config.api_key.trim());
}

function hasStoredOAuthToken(config: ProviderSettingRecord): boolean {
  return Boolean(config.oauth_access_token.trim());
}

async function refreshStoredProviderToken(
  config: ProviderSettingRecord
): Promise<ProviderSettingRecord> {
  if (!config.oauth_refresh_token) {
    return config;
  }

  if (config.provider === "openai") {
    const tokens = await refreshOpenAIToken(config.oauth_refresh_token);

    return saveProviderSetting({
      ...config,
      provider: "openai",
      auth_mode: "oauth",
      oauth_access_token: tokens.access_token,
      oauth_refresh_token: tokens.refresh_token ?? config.oauth_refresh_token,
      oauth_id_token: tokens.id_token ?? config.oauth_id_token,
      oauth_token_type: tokens.token_type ?? config.oauth_token_type,
      oauth_expires_at: buildExpiresAt(tokens.expires_in),
      oauth_connected_at:
        config.oauth_connected_at ?? new Date().toISOString(),
    });
  }

  const tokens = await refreshAnthropicToken(config.oauth_refresh_token);

  return saveProviderSetting({
    ...config,
    provider: "anthropic",
    auth_mode: "oauth",
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token ?? config.oauth_refresh_token,
    oauth_token_type: tokens.token_type ?? config.oauth_token_type,
    oauth_expires_at:
      buildExpiresAt(tokens.expires_in) ?? config.oauth_expires_at,
    oauth_connected_at: config.oauth_connected_at ?? new Date().toISOString(),
  });
}

async function getProviderConfigForUse(
  provider: ProviderId
): Promise<ProviderSettingRecord> {
  const config = getProviderSetting(provider);

  if (hasStoredApiKey(config) || !hasStoredOAuthToken(config)) {
    return config;
  }

  if (!config.oauth_expires_at || !config.oauth_refresh_token) {
    return config;
  }

  const expiresAt = Date.parse(config.oauth_expires_at);
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 60_000) {
    return refreshStoredProviderToken(config);
  }

  return config;
}

function getProviderToken(config: ProviderSettingRecord): string {
  if (hasStoredApiKey(config)) {
    return config.api_key;
  }

  if (hasStoredOAuthToken(config)) {
    return config.oauth_access_token;
  }

  throw new Error(buildProviderError(config.provider));
}

async function buildOpenAIOAuthLanguageModel(
  config: ProviderSettingRecord,
  model: string
): Promise<LanguageModel> {
  let accessToken = config.oauth_access_token;
  if (!accessToken) {
    throw new Error(buildProviderError("openai"));
  }

  let refreshToken = config.oauth_refresh_token || undefined;
  let accountId = extractChatGPTAccountId(accessToken);
  let expiresAt = config.oauth_expires_at
    ? Date.parse(config.oauth_expires_at)
    : 0;

  const codexFetch = async (
    requestInput: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (refreshToken && expiresAt > 0 && Date.now() >= expiresAt) {
      try {
        const tokens = await refreshOpenAIToken(refreshToken);
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token ?? refreshToken;
        expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
        accountId = extractChatGPTAccountId(tokens.access_token) ?? accountId;

        const current = getProviderSetting("openai");
        saveProviderSetting({
          ...current,
          provider: "openai",
          auth_mode: "oauth",
          oauth_access_token: accessToken,
          oauth_refresh_token: refreshToken ?? current.oauth_refresh_token,
          oauth_id_token: tokens.id_token ?? current.oauth_id_token,
          oauth_token_type: tokens.token_type ?? current.oauth_token_type,
          oauth_expires_at: new Date(expiresAt).toISOString(),
          oauth_connected_at:
            current.oauth_connected_at ?? new Date().toISOString(),
        });
      } catch {
        // Keep using the currently stored token.
      }
    }

    const headers = new Headers();
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => headers.set(key, value));
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          if (value !== undefined) {
            headers.set(key, String(value));
          }
        }
      } else {
        for (const [key, value] of Object.entries(init.headers)) {
          if (value !== undefined) {
            headers.set(key, String(value));
          }
        }
      }
    }

    headers.delete("authorization");
    headers.delete("Authorization");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("originator", "trawl");
    headers.set("user-agent", "trawl/1.0.0");
    if (!headers.get("session_id")) {
      headers.set("session_id", randomUUID());
    }

    if (accountId) {
      headers.set("ChatGPT-Account-Id", accountId);
    }

    const parsed =
      requestInput instanceof URL
        ? requestInput
        : new URL(
            typeof requestInput === "string"
              ? requestInput
              : requestInput.url
          );

    const targetUrl =
      parsed.pathname.includes("/v1/responses") ||
      parsed.pathname.includes("/chat/completions")
        ? new URL(CODEX_API_ENDPOINT)
        : parsed;

    return globalThis.fetch(targetUrl, { ...init, headers });
  };

  const resolvedModel = OPENAI_OAUTH_CODEX_MODELS.has(model)
    ? model
    : DEFAULT_OPENAI_OAUTH_MODEL;

  const client = createOpenAI({
    apiKey: "trawl-oauth-dummy-key",
    fetch: codexFetch,
  });

  return client(resolvedModel);
}

async function buildAnthropicOAuthLanguageModel(
  config: ProviderSettingRecord,
  model: string
): Promise<LanguageModel> {
  let accessToken = config.oauth_access_token;
  if (!accessToken) {
    throw new Error(buildProviderError("anthropic"));
  }

  let refreshToken = config.oauth_refresh_token || undefined;
  let expiresAt = config.oauth_expires_at
    ? Date.parse(config.oauth_expires_at)
    : 0;

  const anthropicOAuthFetch = async (
    requestInput: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (refreshToken && (!accessToken || (expiresAt > 0 && Date.now() >= expiresAt))) {
      try {
        const tokens = await refreshAnthropicToken(refreshToken);
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token ?? refreshToken;
        if (tokens.expires_in) {
          expiresAt = Date.now() + tokens.expires_in * 1000;
        }

        const current = getProviderSetting("anthropic");
        saveProviderSetting({
          ...current,
          provider: "anthropic",
          auth_mode: "oauth",
          oauth_access_token: accessToken,
          oauth_refresh_token: refreshToken ?? current.oauth_refresh_token,
          oauth_token_type: tokens.token_type ?? current.oauth_token_type,
          oauth_expires_at:
            expiresAt > 0
              ? new Date(expiresAt).toISOString()
              : current.oauth_expires_at,
          oauth_connected_at:
            current.oauth_connected_at ?? new Date().toISOString(),
        });
      } catch {
        // Keep using the currently stored token.
      }
    }

    const requestHeaders = new Headers();

    if (requestInput instanceof Request) {
      requestInput.headers.forEach((value, key) => {
        requestHeaders.set(key, value);
      });
    }

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          requestHeaders.set(key, value);
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          if (value !== undefined) {
            requestHeaders.set(key, String(value));
          }
        }
      } else {
        for (const [key, value] of Object.entries(init.headers)) {
          if (value !== undefined) {
            requestHeaders.set(key, String(value));
          }
        }
      }
    }

    const incomingBeta = requestHeaders.get("anthropic-beta") || "";
    const incomingBetas = incomingBeta
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const mergedBetas = [
      ...new Set([
        ANTHROPIC_OAUTH_BETA_HEADER,
        "interleaved-thinking-2025-05-14",
        ...incomingBetas,
      ]),
    ].join(",");

    requestHeaders.set("authorization", `Bearer ${accessToken}`);
    requestHeaders.set("anthropic-beta", mergedBetas);
    requestHeaders.set("user-agent", "claude-cli/2.1.2 (external, cli)");
    requestHeaders.delete("x-api-key");

    let finalInput: RequestInfo | URL = requestInput;
    let requestUrl: URL | null = null;
    try {
      if (typeof requestInput === "string" || requestInput instanceof URL) {
        requestUrl = new URL(requestInput.toString());
      } else if (requestInput instanceof Request) {
        requestUrl = new URL(requestInput.url);
      }
    } catch {
      requestUrl = null;
    }

    if (
      requestUrl &&
      requestUrl.pathname === "/v1/messages" &&
      !requestUrl.searchParams.has("beta")
    ) {
      requestUrl.searchParams.set("beta", "true");
      finalInput =
        requestInput instanceof Request
          ? new Request(requestUrl.toString(), requestInput)
          : requestUrl;
    }

    return globalThis.fetch(finalInput, {
      ...init,
      headers: requestHeaders,
    });
  };

  const client = createAnthropic({
    apiKey: "",
    fetch: anthropicOAuthFetch,
  });

  return client(model);
}

async function buildLanguageModel(
  provider: ProviderId,
  model: string,
  config: ProviderSettingRecord
): Promise<LanguageModel> {
  if (provider === "openai") {
    if (hasStoredApiKey(config)) {
      const client = createOpenAI({
        baseURL: config.base_url,
        apiKey: config.api_key,
        organization: config.organization || undefined,
        project: config.project || undefined,
      });

      return client(model);
    }

    if (hasStoredOAuthToken(config)) {
      return buildOpenAIOAuthLanguageModel(config, model);
    }

    throw new Error(buildProviderError(provider));
  }

  if (hasStoredApiKey(config)) {
    const client = createAnthropic({
      baseURL: config.base_url,
      apiKey: config.api_key,
    });

    return client(model);
  }

  if (hasStoredOAuthToken(config)) {
    return buildAnthropicOAuthLanguageModel(config, model);
  }

  throw new Error(buildProviderError(provider));
}

async function resolveLlmSelection(
  explicitProvider?: ProviderId,
  explicitModel?: string
): Promise<{ provider: ProviderId; model: string; config: ProviderSettingRecord }> {
  const provider =
    explicitProvider ?? normalizeProviderId(getSetting("llm_provider") || undefined);
  const model = explicitModel || (getSetting("llm_model") || "").trim();

  if (!model) {
    throw new Error(
      `No model is selected for ${provider}. Choose a model in Settings and retry.`
    );
  }

  const config = await getProviderConfigForUse(provider);

  return { provider, model, config };
}

export async function callLLM<T>(
  options: LLMCallOptions<T>
): Promise<LLMCallResult<T>> {
  const selection = await resolveLlmSelection(options.provider, options.model);
  const languageModel = await buildLanguageModel(
    selection.provider,
    selection.model,
    selection.config
  );

  const result = await generateText({
    model: languageModel,
    system: options.systemPrompt,
    prompt: options.userPrompt,
    output: Output.object({ schema: options.schema }),
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens ?? 1000,
  });

  return {
    parsed: result.output,
    model: result.response.modelId || selection.model,
    provider: selection.provider,
  };
}

export async function listProviderModels(
  provider: ProviderId
): Promise<ProviderModelOption[]> {
  const config = await getProviderConfigForUse(provider);

  if (
    provider === "openai" &&
    !hasStoredApiKey(config) &&
    hasStoredOAuthToken(config)
  ) {
    return Array.from(OPENAI_OAUTH_CODEX_MODELS)
      .map((model) => ({
        id: model,
        label: model,
        createdAt: null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const token = getProviderToken(config);
  const baseUrl = withoutTrailingSlash(config.base_url);
  const headers = new Headers();

  if (provider === "anthropic") {
    headers.set("anthropic-version", "2023-06-01");

    if (hasStoredApiKey(config)) {
      headers.set("x-api-key", token);
    } else {
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("anthropic-beta", ANTHROPIC_OAUTH_BETA_HEADER);
    }
  } else {
    headers.set("Authorization", `Bearer ${token}`);

    if (config.organization) {
      headers.set("OpenAI-Organization", config.organization);
    }

    if (config.project) {
      headers.set("OpenAI-Project", config.project);
    }
  }

  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch ${provider} models (${response.status}): ${body}`
    );
  }

  const data = (await response.json()) as {
    data?: Array<{
      id?: string;
      display_name?: string;
      created_at?: string;
      created?: number;
    }>;
  };

  const models = Array.isArray(data.data) ? data.data : [];

  return models
    .map((model) => ({
      id: model.id || "",
      label: model.display_name || model.id || "",
      createdAt:
        typeof model.created === "number"
          ? new Date(model.created * 1000).toISOString()
          : model.created_at || null,
    }))
    .filter((model) => Boolean(model.id))
    .sort((a, b) => a.label.localeCompare(b.label));
}
