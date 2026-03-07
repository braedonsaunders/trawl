"use client";

import { useEffect, useState } from "react";
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
  Trash2,
  Waypoints,
} from "lucide-react";
import type { ProviderId } from "@/lib/db/queries/provider-settings";
import type {
  ContactSetting,
  HandoffRuleSetting,
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

  useEffect(() => {
    void fetchSettings();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    void refreshProviderModels(settings.llm.selectedProvider);
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

  async function saveSettings(nextSettings = settings) {
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save settings";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function refreshProviderModels(provider: ProviderId) {
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
      setErrorMessage(null);

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
      setErrorMessage(message);
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

  function updateContact(
    id: string,
    field: keyof ContactSetting,
    value: string
  ) {
    setSettings((prev) => ({
      ...prev,
      handoffContacts: prev.handoffContacts.map((contact) =>
        contact.id === id ? { ...contact, [field]: value } : contact
      ),
    }));
  }

  function updateRule(
    id: string,
    field: keyof HandoffRuleSetting,
    value: string | number
  ) {
    setSettings((prev) => ({
      ...prev,
      handoffRules: prev.handoffRules.map((rule) =>
        rule.id === id ? { ...rule, [field]: value } : rule
      ),
    }));
  }

  function addContact() {
    setSettings((prev) => ({
      ...prev,
      handoffContacts: [
        ...prev.handoffContacts,
        {
          id: crypto.randomUUID(),
          name: "",
          title: "",
          email: "",
          phone: "",
          tag: "",
        },
      ],
    }));
  }

  function addRule() {
    setSettings((prev) => ({
      ...prev,
      handoffRules: [
        ...prev.handoffRules,
        {
          id: crypto.randomUUID(),
          condition: "",
          assignTo: "",
          priority: prev.handoffRules.length + 1,
        },
      ],
    }));
  }

  function removeContact(id: string) {
    setSettings((prev) => ({
      ...prev,
      handoffContacts: prev.handoffContacts.filter((contact) => contact.id !== id),
    }));
  }

  function removeRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      handoffRules: prev.handoffRules.filter((rule) => rule.id !== id),
    }));
  }

  function beginOAuth(provider: ProviderId) {
    window.location.href = `/api/oauth/${provider}/start?returnTo=${encodeURIComponent(
      "/settings"
    )}`;
  }

  const selectedProvider = settings.llm.selectedProvider;
  const selectedProviderModels = providerModels[selectedProvider] || [];

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
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">LLM Routing</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Provider</label>
            <select
              value={settings.llm.selectedProvider}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  llm: {
                    ...prev.llm,
                    selectedProvider:
                      event.target.value === "anthropic" ? "anthropic" : "openai",
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
          <div className="lg:pt-[30px]">
            <button
              onClick={() => void refreshProviderModels(selectedProvider)}
              disabled={loadingModels[selectedProvider]}
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

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {settings.llm.providers.map((provider) => {
            const connected =
              provider.authMode === "oauth"
                ? Boolean(provider.oauthAccessToken)
                : Boolean(provider.apiKey);

            return (
              <div
                key={provider.provider}
                className="rounded-xl border bg-muted/20 p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold">
                      {providerLabel(provider.provider)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {provider.authMode === "oauth"
                        ? connected
                          ? "OAuth connected"
                          : "OAuth configured but not connected"
                        : connected
                          ? "API key configured"
                          : "API key missing"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      connected
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {connected ? "Ready" : "Needs setup"}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Auth Mode
                    </label>
                    <select
                      value={provider.authMode}
                      onChange={(event) =>
                        updateProvider(provider.provider, {
                          authMode:
                            event.target.value === "oauth" ? "oauth" : "api_key",
                        })
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="api_key">API Key</option>
                      <option value="oauth">OAuth</option>
                    </select>
                  </div>

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

                  {provider.authMode === "api_key" ? (
                    <div className="sm:col-span-2">
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
                  ) : (
                    <>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">
                          OAuth Client ID
                        </label>
                        <input
                          type="text"
                          value={provider.oauthClientId}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthClientId: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">
                          OAuth Client Secret
                        </label>
                        <input
                          type="password"
                          value={provider.oauthClientSecret}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthClientSecret: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium">
                          Authorization URL
                        </label>
                        <input
                          type="text"
                          value={provider.oauthAuthorizeUrl}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthAuthorizeUrl: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium">
                          Token URL
                        </label>
                        <input
                          type="text"
                          value={provider.oauthTokenUrl}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthTokenUrl: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium">
                          Scopes
                        </label>
                        <textarea
                          value={provider.oauthScope}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthScope: event.target.value,
                            })
                          }
                          rows={3}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium">
                          Audience
                        </label>
                        <input
                          type="text"
                          value={provider.oauthAudience}
                          onChange={(event) =>
                            updateProvider(provider.provider, {
                              oauthAudience: event.target.value,
                            })
                          }
                          placeholder="Optional"
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </>
                  )}
                </div>

                {provider.authMode === "oauth" ? (
                  <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {provider.oauthConnectedAt ? (
                        <span>
                          Connected {new Date(provider.oauthConnectedAt).toLocaleString()}
                          {provider.oauthExpiresAt
                            ? ` · expires ${new Date(provider.oauthExpiresAt).toLocaleString()}`
                            : ""}
                        </span>
                      ) : (
                        <span>No OAuth token stored yet.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => beginOAuth(provider.provider)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Connect OAuth
                      </button>
                      <button
                        onClick={() =>
                          updateProvider(provider.provider, {
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
                        Clear Token
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Integrations</h2>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
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

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">SMTP</h3>
            {(
              [
                ["host", "Host"],
                ["port", "Port"],
                ["user", "User"],
                ["pass", "Password"],
                ["fromName", "From Name"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1.5 block text-sm font-medium">{label}</label>
                <input
                  type={key === "pass" ? "password" : "text"}
                  value={settings.integrations.smtp[key]}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      integrations: {
                        ...prev.integrations,
                        smtp: {
                          ...prev.integrations.smtp,
                          [key]: event.target.value,
                        },
                      },
                    }))
                  }
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">IMAP</h3>
            {(
              [
                ["host", "Host"],
                ["port", "Port"],
                ["user", "User"],
                ["pass", "Password"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1.5 block text-sm font-medium">{label}</label>
                <input
                  type={key === "pass" ? "password" : "text"}
                  value={settings.integrations.imap[key]}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      integrations: {
                        ...prev.integrations,
                        imap: {
                          ...prev.integrations.imap,
                          [key]: event.target.value,
                        },
                      },
                    }))
                  }
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Outreach Controls</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["dailySendCap", "Daily Send Cap"],
              ["sendDelaySeconds", "Send Delay (seconds)"],
              ["scoreThresholdHot", "Hot Score Threshold"],
              ["scoreThresholdWarm", "Warm Score Threshold"],
              ["enrichmentConcurrency", "Enrichment Concurrency"],
              ["imapPollIntervalMinutes", "IMAP Poll Interval"],
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
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Handoff Contacts</h2>
        </div>

        <div className="space-y-3">
          {settings.handoffContacts.map((contact) => (
            <div
              key={contact.id}
              className="rounded-lg border bg-muted/20 p-4"
            >
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => removeContact(contact.id)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-5">
                {(
                  [
                    ["name", "Name"],
                    ["title", "Title"],
                    ["email", "Email"],
                    ["phone", "Phone"],
                    ["tag", "Tag"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="mb-1.5 block text-sm font-medium">{label}</label>
                    <input
                      type="text"
                      value={contact[field]}
                      onChange={(event) =>
                        updateContact(contact.id, field, event.target.value)
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={addContact}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Mail className="h-4 w-4" />
            Add Contact
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Handoff Rules</h2>
        </div>

        <div className="space-y-3">
          {settings.handoffRules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border bg-muted/20 p-4"
            >
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => removeRule(rule.id)}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_140px]">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Condition</label>
                  <input
                    type="text"
                    value={rule.condition}
                    onChange={(event) =>
                      updateRule(rule.id, "condition", event.target.value)
                    }
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Assign To</label>
                  <input
                    type="text"
                    value={rule.assignTo}
                    onChange={(event) =>
                      updateRule(rule.id, "assignTo", event.target.value)
                    }
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Priority</label>
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(event) =>
                      updateRule(rule.id, "priority", Number(event.target.value))
                    }
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addRule}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Waypoints className="h-4 w-4" />
            Add Rule
          </button>
        </div>
      </section>
    </div>
  );
}
