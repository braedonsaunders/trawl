import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import {
  getProviderSetting,
  type ProviderId,
  type ProviderSettingRecord,
} from "@/lib/db/queries/provider-settings";
import { getSetting } from "@/lib/db/queries/settings";
import {
  ANTHROPIC_OAUTH_BETA_HEADER,
  refreshOAuthAccessToken,
} from "@/lib/provider-auth";
import type { LLMCallOptions, LLMCallResult } from "@/lib/llm/types";

export interface ProviderModelOption {
  id: string;
  label: string;
  createdAt: string | null;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeProviderId(value: string | undefined): ProviderId {
  return value === "anthropic" ? "anthropic" : "openai";
}

function buildProviderError(provider: ProviderId, authMode: string): string {
  if (authMode === "oauth") {
    return `${provider} OAuth is selected but no access token is stored. Connect the provider in Settings and retry.`;
  }

  return `${provider} API key is not configured. Update the provider in Settings and retry.`;
}

async function getProviderConfigForUse(
  provider: ProviderId
): Promise<ProviderSettingRecord> {
  const config = getProviderSetting(provider);

  if (
    config.auth_mode === "oauth" &&
    config.oauth_expires_at &&
    config.oauth_refresh_token
  ) {
    const expiresAt = Date.parse(config.oauth_expires_at);
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 60_000) {
      return refreshOAuthAccessToken(provider);
    }
  }

  return config;
}

function getProviderToken(config: ProviderSettingRecord): string {
  if (config.auth_mode === "oauth") {
    if (!config.oauth_access_token) {
      throw new Error(buildProviderError(config.provider, config.auth_mode));
    }

    return config.oauth_access_token;
  }

  if (!config.api_key) {
    throw new Error(buildProviderError(config.provider, config.auth_mode));
  }

  return config.api_key;
}

function buildOpenAIProvider(config: ProviderSettingRecord) {
  return createOpenAI({
    baseURL: config.base_url,
    apiKey: getProviderToken(config),
    organization: config.organization || undefined,
    project: config.project || undefined,
  });
}

function buildAnthropicProvider(config: ProviderSettingRecord) {
  const oauthHeaders =
    config.auth_mode === "oauth"
      ? { "anthropic-beta": ANTHROPIC_OAUTH_BETA_HEADER }
      : undefined;

  return createAnthropic({
    baseURL: config.base_url,
    apiKey: config.auth_mode === "api_key" ? getProviderToken(config) : undefined,
    authToken:
      config.auth_mode === "oauth" ? getProviderToken(config) : undefined,
    headers: oauthHeaders,
  });
}

async function resolveLlmSelection(
  explicitProvider?: ProviderId,
  explicitModel?: string
): Promise<{ provider: ProviderId; model: string; config: ProviderSettingRecord }> {
  const provider = explicitProvider ?? normalizeProviderId(getSetting("llm_provider") || undefined);
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
  const provider =
    selection.provider === "anthropic"
      ? buildAnthropicProvider(selection.config)
      : buildOpenAIProvider(selection.config);

  const result = await generateText({
    model: provider(selection.model),
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
  const token = getProviderToken(config);
  const baseUrl = withoutTrailingSlash(config.base_url);
  const headers = new Headers();

  if (provider === "anthropic") {
    headers.set("anthropic-version", "2023-06-01");

    if (config.auth_mode === "oauth") {
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("anthropic-beta", ANTHROPIC_OAUTH_BETA_HEADER);
    } else {
      headers.set("x-api-key", token);
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
