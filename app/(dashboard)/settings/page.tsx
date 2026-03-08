"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  Building2,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { ProviderId } from "@/lib/db/queries/provider-settings";
import type {
  ProviderSettingsValue,
  SettingsPayload,
} from "@/lib/settings";

interface ProviderModelOption {
  id: string;
  label: string;
  createdAt: string | null;
}

const EMPTY_PROVIDER: Record<ProviderId, ProviderSettingsValue> = {
  openai: {
    provider: "openai",
    authMode: "api_key",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    organization: "",
    project: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthAuthorizeUrl: "https://auth.openai.com/authorize",
    oauthTokenUrl: "https://auth0.openai.com/oauth/token",
    oauthScope:
      "openid profile email offline_access api.connectors.read api.connectors.invoke",
    oauthAudience: "",
    oauthAccessToken: "",
    oauthRefreshToken: "",
    oauthIdToken: "",
    oauthTokenType: "",
    oauthExpiresAt: null,
    oauthConnectedAt: null,
  },
  anthropic: {
    provider: "anthropic",
    authMode: "api_key",
    apiKey: "",
    baseUrl: "https://api.anthropic.com/v1",
    organization: "",
    project: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthAuthorizeUrl: "https://platform.claude.com/oauth/authorize",
    oauthTokenUrl: "https://platform.claude.com/v1/oauth/token",
    oauthScope:
      "user:profile user:inference user:sessions:claude_code user:mcp_servers",
    oauthAudience: "",
    oauthAccessToken: "",
    oauthRefreshToken: "",
    oauthIdToken: "",
    oauthTokenType: "",
    oauthExpiresAt: null,
    oauthConnectedAt: null,
  },
};

const EMPTY_SETTINGS: SettingsPayload = {
  companyProfile: {
    website: "",
    name: "",
    description: "",
    industry: "",
    services: "",
  },
  integrations: {
    googleMapsApiKey: "",
    smtp: {
      host: "smtp.gmail.com",
      port: "587",
      user: "",
      pass: "",
      fromName: "",
    },
    imap: {
      host: "imap.gmail.com",
      port: "993",
      user: "",
      pass: "",
    },
  },
  outreach: {
    dailySendCap: 50,
    sendDelaySeconds: 45,
    scoreThresholdHot: 70,
    scoreThresholdWarm: 40,
    enrichmentConcurrency: 2,
    imapPollIntervalMinutes: 15,
    maxCrawlPages: 8,
    screenshotsDir: "./data/screenshots",
    senderName: "",
    senderTitle: "Business Development",
  },
  handoffContacts: [],
  handoffRules: [],
  llm: {
    selectedProvider: "openai",
    selectedModel: "",
    providers: [EMPTY_PROVIDER.openai, EMPTY_PROVIDER.anthropic],
  },
};

function normalizeSettings(payload: SettingsPayload): SettingsPayload {
  const providerMap = new Map(
    payload.llm.providers.map((provider) => [provider.provider, provider])
  );

  return {
    ...payload,
    llm: {
      ...payload.llm,
      selectedProvider:
        payload.llm.selectedProvider === "anthropic" ? "anthropic" : "openai",
      providers: [
        providerMap.get("openai") || EMPTY_PROVIDER.openai,
        providerMap.get("anthropic") || EMPTY_PROVIDER.anthropic,
      ],
    },
  };
}

function providerLabel(provider: ProviderId): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function providerHasOAuthConnection(provider: ProviderSettingsValue): boolean {
  return Boolean(provider.oauthConnectedAt || provider.oauthAccessToken.trim());
}

function providerUsesStoredCredentials(provider: ProviderSettingsValue): boolean {
  return Boolean(provider.apiKey.trim() || providerHasOAuthConnection(provider));
}

function providerModeButtonClass(active: boolean): string {
  return active
    ? "inline-flex items-center justify-center rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
    : "inline-flex items-center justify-center rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent";
}

function providerMethodCardClass(active: boolean): string {
  return active
    ? "rounded-2xl border border-primary/30 bg-primary/5 p-5"
    : "rounded-2xl border border-border/70 bg-background/70 p-5";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload>(EMPTY_SETTINGS);
  const [providerModels, setProviderModels] = useState<
    Partial<Record<ProviderId, ProviderModelOption[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiling, setProfiling] = useState(false);
  const [loadingModels, setLoadingModels] = useState<
    Partial<Record<ProviderId, boolean>>
  >({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openAIOAuthStatus, setOpenAIOAuthStatus] = useState<
    "idle" | "waiting" | "complete" | "error"
  >("idle");
  const [openAIOAuthError, setOpenAIOAuthError] = useState<string | null>(null);
  const openAIOAuthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [anthropicOAuthPhase, setAnthropicOAuthPhase] = useState<
    "idle" | "waiting" | "exchanging" | "complete" | "error"
  >("idle");
  const [anthropicOAuthCode, setAnthropicOAuthCode] = useState("");
  const [anthropicOAuthError, setAnthropicOAuthError] = useState<string | null>(
    null
  );

  const stopOpenAIOAuthPolling = useCallback(() => {
    if (openAIOAuthPollRef.current) {
      clearInterval(openAIOAuthPollRef.current);
      openAIOAuthPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, []);

  useEffect(() => {
    return () => {
      stopOpenAIOAuthPolling();
    };
  }, [stopOpenAIOAuthPolling]);

  useEffect(() => {
    if (loading) {
      return;
    }

    void refreshProviderModels(settings.llm.selectedProvider, { silent: true });
  }, [loading, settings.llm.selectedProvider]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauthStatus");
    const oauthProvider = params.get("oauthProvider");
    const oauthError = params.get("oauthError");

    if (oauthStatus === "success" && oauthProvider) {
      setStatusMessage(`${providerLabel(oauthProvider as ProviderId)} OAuth connected.`);
      setErrorMessage(null);
      void fetchSettings();
    } else if (oauthStatus === "error") {
      setErrorMessage(
        oauthError
          ? `OAuth failed: ${oauthError}`
          : "OAuth connection failed."
      );
    }

    if (oauthStatus) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || "Failed to load settings");
      }

      const payload = (await response.json()) as SettingsPayload;
      setSettings(normalizeSettings(payload));
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load settings";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(nextSettings = settings): Promise<boolean> {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Failed to save settings");
      }

      setSettings(normalizeSettings(payload as SettingsPayload));
      setStatusMessage("Settings saved.");
      setErrorMessage(null);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save settings";
      setErrorMessage(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function refreshProviderModels(
    provider: ProviderId,
    options: { silent?: boolean } = {}
  ) {
    const providerConfig =
      settings.llm.providers.find((entry) => entry.provider === provider) ||
      EMPTY_PROVIDER[provider];

    if (!providerUsesStoredCredentials(providerConfig)) {
      setProviderModels((prev) => ({ ...prev, [provider]: [] }));
      if (!options.silent) {
        setErrorMessage(
          `Add an API key or connect OAuth for ${providerLabel(provider)} before loading models.`
        );
      }
      return;
    }

    setLoadingModels((prev) => ({ ...prev, [provider]: true }));
    try {
      const response = await fetch(`/api/llm/models/${provider}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.detail || payload.error || `Failed to load ${providerLabel(provider)} models`
        );
      }

      const models = Array.isArray(payload.models)
        ? (payload.models as ProviderModelOption[])
        : [];

      setProviderModels((prev) => ({ ...prev, [provider]: models }));
      if (!options.silent) {
        setErrorMessage(null);
      }

      setSettings((prev) => {
        if (
          prev.llm.selectedProvider === provider &&
          !prev.llm.selectedModel &&
          models.length > 0
        ) {
          return {
            ...prev,
            llm: {
              ...prev.llm,
              selectedModel: models[0].id,
            },
          };
        }

        return prev;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load models";
      if (!options.silent) {
        setErrorMessage(message);
      }
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }

  async function handleProfileCompany() {
    if (!settings.companyProfile.website.trim()) {
      return;
    }

    setProfiling(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: settings.companyProfile.website }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Failed to profile company");
      }

      const services = parseList(String(payload.services || ""));
      const industries = parseList(String(payload.industries_served || ""));

      setSettings((prev) => ({
        ...prev,
        companyProfile: {
          website: payload.website || prev.companyProfile.website,
          name: payload.name || prev.companyProfile.name,
          description: payload.description || prev.companyProfile.description,
          industry: industries[0] || prev.companyProfile.industry,
          services: services.join("\n") || prev.companyProfile.services,
        },
      }));
      setStatusMessage("Company profile updated.");
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to profile company";
      setErrorMessage(message);
    } finally {
      setProfiling(false);
    }
  }

  function updateProvider(
    providerId: ProviderId,
    patch: Partial<ProviderSettingsValue>
  ) {
    setSettings((prev) => ({
      ...prev,
      llm: {
        ...prev.llm,
        providers: prev.llm.providers.map((provider) =>
          provider.provider === providerId ? { ...provider, ...patch } : provider
        ),
      },
    }));
  }

  async function prepareProviderForOAuth(providerId: ProviderId): Promise<boolean> {
    const nextSettings = normalizeSettings({
      ...settings,
      llm: {
        ...settings.llm,
        providers: settings.llm.providers.map((provider) =>
          provider.provider === providerId
            ? { ...provider, authMode: "oauth" }
            : provider
        ),
      },
    });

    setSettings(nextSettings);
    return saveSettings(nextSettings);
  }

  async function startOpenAIOAuth() {
    const saved = await prepareProviderForOAuth("openai");
    if (!saved) {
      return;
    }

    stopOpenAIOAuthPolling();
    setOpenAIOAuthStatus("waiting");
    setOpenAIOAuthError(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/oauth/openai/start", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Failed to start OpenAI OAuth");
      }

      window.open(payload.url, "_blank");

      openAIOAuthPollRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch("/api/oauth/openai/status");
          const statusPayload = (await statusResponse.json()) as {
            status?: "pending" | "complete" | "error";
            error?: string;
          };

          if (statusPayload.status === "complete") {
            stopOpenAIOAuthPolling();
            setOpenAIOAuthStatus("complete");
            setOpenAIOAuthError(null);
            setStatusMessage("OpenAI OAuth connected.");
            setErrorMessage(null);
            await fetchSettings();
            void refreshProviderModels("openai", { silent: true });
          } else if (statusPayload.status === "error") {
            const message = statusPayload.error || "OAuth flow failed";
            stopOpenAIOAuthPolling();
            setOpenAIOAuthStatus("error");
            setOpenAIOAuthError(message);
            setErrorMessage(`OpenAI OAuth failed: ${message}`);
          }
        } catch {
          // Ignore transient poll failures while the browser flow is active.
        }
      }, 2000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start OpenAI OAuth";
      setOpenAIOAuthStatus("error");
      setOpenAIOAuthError(message);
      setErrorMessage(message);
    }
  }

  async function startAnthropicOAuth() {
    const saved = await prepareProviderForOAuth("anthropic");
    if (!saved) {
      return;
    }

    setAnthropicOAuthPhase("waiting");
    setAnthropicOAuthError(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/oauth/anthropic/start", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Failed to start Anthropic OAuth");
      }

      window.open(payload.url, "_blank");
      setStatusMessage(
        "Anthropic authorization opened. Paste the returned code below."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start Anthropic OAuth";
      setAnthropicOAuthPhase("error");
      setAnthropicOAuthError(message);
      setErrorMessage(message);
    }
  }

  async function exchangeAnthropicOAuth() {
    if (!anthropicOAuthCode.trim()) {
      return;
    }

    setAnthropicOAuthPhase("exchanging");
    setAnthropicOAuthError(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/oauth/anthropic/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: anthropicOAuthCode.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to exchange Anthropic code");
      }

      setAnthropicOAuthPhase("complete");
      setAnthropicOAuthCode("");
      setAnthropicOAuthError(null);
      setStatusMessage("Anthropic OAuth connected.");
      setErrorMessage(null);
      await fetchSettings();
      void refreshProviderModels("anthropic", { silent: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to exchange Anthropic code";
      setAnthropicOAuthPhase("error");
      setAnthropicOAuthError(message);
      setErrorMessage(message);
    }
  }

  const selectedProvider = settings.llm.selectedProvider;
  const selectedProviderModels = providerModels[selectedProvider] || [];
  const selectedProviderConfig =
    settings.llm.providers.find(
      (provider) => provider.provider === selectedProvider
    ) || EMPTY_PROVIDER[selectedProvider];
  const selectedProviderCanLoadModels =
    providerUsesStoredCredentials(selectedProviderConfig);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            App configuration, credentials, provider auth, and model selection all
            live in SQLite now.
          </p>
        </div>
        <button
          onClick={() => void saveSettings()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Company Profile</h2>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">Website URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="url"
                  value={settings.companyProfile.website}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      companyProfile: {
                        ...prev.companyProfile,
                        website: event.target.value,
                      },
                    }))
                  }
                  placeholder="https://your-company.com"
                  className="h-10 w-full rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button
              onClick={() => void handleProfileCompany()}
              disabled={profiling || !settings.companyProfile.website.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {profiling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Profile Company
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <input
                type="text"
                value={settings.companyProfile.name}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    companyProfile: {
                      ...prev.companyProfile,
                      name: event.target.value,
                    },
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Industry</label>
              <input
                type="text"
                value={settings.companyProfile.industry}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    companyProfile: {
                      ...prev.companyProfile,
                      industry: event.target.value,
                    },
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Description</label>
              <textarea
                value={settings.companyProfile.description}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    companyProfile: {
                      ...prev.companyProfile,
                      description: event.target.value,
                    },
                  }))
                }
                rows={4}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                Services
              </label>
              <textarea
                value={settings.companyProfile.services}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    companyProfile: {
                      ...prev.companyProfile,
                      services: event.target.value,
                    },
                  }))
                }
                rows={4}
                placeholder={"One service per line"}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">LLM Routing</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick the runtime provider and model here. Configure API key or
                OAuth for both OpenAI and Anthropic directly below.
              </p>
            </div>
            <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm">
              <div className="font-medium">Current runtime</div>
              <div className="text-muted-foreground">
                {providerLabel(selectedProvider)} via{" "}
                {selectedProviderConfig.authMode === "oauth"
                  ? "OAuth"
                  : "API key"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/20 p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold">Runtime Selection</h3>
              <p className="text-sm text-muted-foreground">
                Load live models after credentials are configured, or type a model
                id manually.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Provider
                </label>
                <select
                  value={settings.llm.selectedProvider}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        selectedProvider:
                          event.target.value === "anthropic"
                            ? "anthropic"
                            : "openai",
                        selectedModel: "",
                      },
                    }))
                  }
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Model</label>
                {selectedProviderModels.length > 0 ? (
                  <select
                    value={settings.llm.selectedModel}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        llm: {
                          ...prev.llm,
                          selectedModel: event.target.value,
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a model</option>
                    {selectedProviderModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.llm.selectedModel}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        llm: {
                          ...prev.llm,
                          selectedModel: event.target.value,
                        },
                      }))
                    }
                    placeholder={`Load ${providerLabel(selectedProvider)} models or enter one manually`}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
              <div className="xl:pt-[30px]">
                <button
                  onClick={() => void refreshProviderModels(selectedProvider)}
                  disabled={
                    loadingModels[selectedProvider] || !selectedProviderCanLoadModels
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {loadingModels[selectedProvider] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Load Models
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {selectedProviderCanLoadModels
                ? `Models will load from the configured ${providerLabel(
                    selectedProvider
                  )} account.`
                : `Add an API key or connect OAuth for ${providerLabel(
                    selectedProvider
                  )} in the provider cards below before loading models.`}
            </p>
          </div>

          <div className="grid gap-6">
            {settings.llm.providers.map((provider) => {
              const apiKeyConfigured = Boolean(provider.apiKey.trim());
              const oauthConnected = providerHasOAuthConnection(provider);
              const connected = providerUsesStoredCredentials(provider);
              const openAIWaiting =
                provider.provider === "openai" && openAIOAuthStatus === "waiting";
              const anthropicWaiting =
                provider.provider === "anthropic" &&
                (anthropicOAuthPhase === "waiting" ||
                  anthropicOAuthPhase === "exchanging");

              return (
                <div
                  key={provider.provider}
                  className="rounded-2xl border bg-background/60 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                          {providerLabel(provider.provider)}
                        </h3>
                        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          API Key
                        </span>
                        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          OAuth
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose the auth path Trawl should use when this provider is
                        selected.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          connected
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {connected ? "Ready" : "Needs setup"}
                      </span>
                      <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        Using {provider.authMode === "oauth" ? "OAuth" : "API key"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={provider.baseUrl}
                        onChange={(event) =>
                          updateProvider(provider.provider, {
                            baseUrl: event.target.value,
                          })
                        }
                        className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {provider.provider === "openai" ? (
                      <>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium">
                            Organization
                          </label>
                          <input
                            type="text"
                            value={provider.organization}
                            onChange={(event) =>
                              updateProvider(provider.provider, {
                                organization: event.target.value,
                              })
                            }
                            className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium">
                            Project
                          </label>
                          <input
                            type="text"
                            value={provider.project}
                            onChange={(event) =>
                              updateProvider(provider.provider, {
                                project: event.target.value,
                              })
                            }
                            className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className={providerMethodCardClass(provider.authMode === "api_key")}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                            <h4 className="text-sm font-semibold">API Key</h4>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Use a provider-issued key directly for model access.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            updateProvider(provider.provider, {
                              authMode: "api_key",
                            })
                          }
                          className={providerModeButtonClass(
                            provider.authMode === "api_key"
                          )}
                        >
                          Use API Key
                        </button>
                      </div>

                      <div className="mt-4">
                        <label className="mb-1.5 block text-sm font-medium">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={provider.apiKey}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              apiKey: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        {apiKeyConfigured
                          ? "API key is stored in SQLite."
                          : "No API key stored yet."}
                      </p>
                    </div>

                    <div className={providerMethodCardClass(provider.authMode === "oauth")}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                            <h4 className="text-sm font-semibold">OAuth</h4>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {provider.provider === "openai"
                              ? "Uses the same localhost callback flow as Steward and Codex."
                              : "Uses the same Anthropic code-paste flow as Steward."}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            updateProvider(provider.provider, {
                              authMode: "oauth",
                            })
                          }
                          className={providerModeButtonClass(
                            provider.authMode === "oauth"
                          )}
                        >
                          Use OAuth
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            oauthConnected
                              ? "bg-emerald-500/15 text-emerald-300"
                              : openAIWaiting || anthropicWaiting
                                ? "bg-primary/10 text-primary"
                              : "bg-muted px-2.5 py-1 text-muted-foreground"
                          }`}
                        >
                          {oauthConnected
                            ? "Connected"
                            : openAIWaiting
                              ? "Waiting for callback"
                              : anthropicWaiting
                                ? anthropicOAuthPhase === "exchanging"
                                  ? "Exchanging code"
                                  : "Awaiting code"
                                : "Not connected"}
                        </span>
                        <span className="text-muted-foreground">
                          {provider.oauthConnectedAt
                            ? `Connected ${new Date(
                                provider.oauthConnectedAt
                              ).toLocaleString()}${
                                provider.oauthExpiresAt
                                  ? ` · expires ${new Date(
                                      provider.oauthExpiresAt
                                    ).toLocaleString()}`
                                  : ""
                              }`
                            : provider.provider === "openai"
                              ? "OpenAI opens a browser window and completes at http://localhost:1455/auth/callback."
                              : "Anthropic opens a browser window and returns a code#state value to paste here."}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {provider.provider === "openai" ? (
                          <button
                            onClick={() => void startOpenAIOAuth()}
                            disabled={openAIWaiting}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                          >
                            {openAIWaiting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                            {openAIWaiting ? "Waiting..." : "Connect OpenAI"}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => void startAnthropicOAuth()}
                              disabled={anthropicOAuthPhase === "exchanging"}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              {anthropicOAuthPhase === "exchanging" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}
                              {anthropicWaiting ? "Open Again" : "Connect Anthropic"}
                            </button>
                            {(anthropicOAuthPhase === "waiting" ||
                              anthropicOAuthPhase === "exchanging") && (
                              <div className="flex min-w-[260px] flex-1 flex-wrap gap-2">
                                <input
                                  type="text"
                                  value={anthropicOAuthCode}
                                  onChange={(event) =>
                                    setAnthropicOAuthCode(event.target.value)
                                  }
                                  placeholder="Paste code#state"
                                  className="h-10 min-w-[220px] flex-1 rounded-lg border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <button
                                  onClick={() => void exchangeAnthropicOAuth()}
                                  disabled={
                                    !anthropicOAuthCode.trim() ||
                                    anthropicOAuthPhase === "exchanging"
                                  }
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                                >
                                  {anthropicOAuthPhase === "exchanging" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : null}
                                  Submit Code
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        <button
                          onClick={() =>
                            updateProvider(provider.provider, {
                              apiKey:
                                provider.authMode === "oauth" ? "" : provider.apiKey,
                              oauthAccessToken: "",
                              oauthRefreshToken: "",
                              oauthIdToken: "",
                              oauthTokenType: "",
                              oauthExpiresAt: null,
                              oauthConnectedAt: null,
                            })
                          }
                          className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                        >
                          Clear OAuth
                        </button>
                      </div>

                      {provider.provider === "openai" && openAIOAuthError ? (
                        <p className="mt-3 text-sm text-destructive">
                          {openAIOAuthError}
                        </p>
                      ) : null}

                      {provider.provider === "anthropic" && anthropicOAuthError ? (
                        <p className="mt-3 text-sm text-destructive">
                          {anthropicOAuthError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Integrations</h2>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Google Maps</h3>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                API Key
              </label>
              <input
                type="password"
                value={settings.integrations.googleMapsApiKey}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: {
                      ...prev.integrations,
                      googleMapsApiKey: event.target.value,
                    },
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/30 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Desktop Email App</h3>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Trawl now opens generated drafts in the default mail application on
              this computer. SMTP delivery, inbox polling, and auto-routing are
              no longer part of the outreach workflow.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use the Outreach screen to open one or many personalized drafts as
              native compose windows, then make final edits and send from your own
              mail client.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Outreach Defaults</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["scoreThresholdHot", "Hot Score Threshold"],
              ["scoreThresholdWarm", "Warm Score Threshold"],
              ["enrichmentConcurrency", "Enrichment Concurrency"],
              ["maxCrawlPages", "Max Crawl Pages"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium">{label}</label>
              <input
                type="number"
                value={settings.outreach[key]}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    outreach: {
                      ...prev.outreach,
                      [key]: Number(event.target.value),
                    },
                  }))
                }
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
          <div className="xl:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">
              Screenshots Directory
            </label>
            <input
              type="text"
              value={settings.outreach.screenshotsDir}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  outreach: {
                    ...prev.outreach,
                    screenshotsDir: event.target.value,
                  },
                }))
              }
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Sender Name</label>
            <input
              type="text"
              value={settings.outreach.senderName}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  outreach: {
                    ...prev.outreach,
                    senderName: event.target.value,
                  },
                }))
              }
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Sender Title</label>
            <input
              type="text"
              value={settings.outreach.senderTitle}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  outreach: {
                    ...prev.outreach,
                    senderTitle: event.target.value,
                  },
                }))
              }
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          Sender name and title influence the personalized draft copy that Trawl
          generates before opening it in your mail app.
        </div>
      </section>
    </div>
  );
}
