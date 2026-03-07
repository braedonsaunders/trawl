"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Key,
  Mail,
  Send,
  Brain,
  UserCheck,
  GitBranch,
  Save,
  Plus,
  Trash2,
  Loader2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyProfile {
  website: string;
  name: string;
  description: string;
  industry: string;
  services: string;
  [key: string]: string;
}

interface HandoffContact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  tag: string;
}

interface HandoffRule {
  id: string;
  condition: string;
  assignTo: string;
  priority: number;
}

interface SettingsData {
  companyProfile: CompanyProfile;
  apiKeys: Record<string, string>;
  smtp: Record<string, string>;
  imap: Record<string, string>;
  outreach: {
    dailySendCap: number;
    sendDelaySeconds: number;
    scoreThresholdHot: number;
    scoreThresholdWarm: number;
  };
  llm: {
    defaultModel: string;
  };
  handoffContacts: HandoffContact[];
  handoffRules: HandoffRule[];
}

const defaultSettings: SettingsData = {
  companyProfile: {
    website: "",
    name: "",
    description: "",
    industry: "",
    services: "",
  },
  apiKeys: {},
  smtp: {},
  imap: {},
  outreach: {
    dailySendCap: 50,
    sendDelaySeconds: 30,
    scoreThresholdHot: 70,
    scoreThresholdWarm: 40,
  },
  llm: {
    defaultModel: "gpt-4o-mini",
  },
  handoffContacts: [],
  handoffRules: [],
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiling, setProfiling] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings({ ...defaultSettings, ...data });
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch {
      // silently handle
    } finally {
      setSaving(false);
    }
  }

  async function handleProfileCompany() {
    if (!settings.companyProfile.website) return;
    setProfiling(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: settings.companyProfile.website }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          companyProfile: { ...prev.companyProfile, ...data.profile },
        }));
      }
    } catch {
      // silently handle
    } finally {
      setProfiling(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      await fetch("/api/email/test", { method: "POST" });
    } catch {
      // silently handle
    } finally {
      setTestingConnection(false);
    }
  }

  function updateOutreach(key: string, value: number) {
    setSettings((prev) => ({
      ...prev,
      outreach: { ...prev.outreach, [key]: value },
    }));
  }

  function updateProfileField(key: string, value: string) {
    setSettings((prev) => ({
      ...prev,
      companyProfile: { ...prev.companyProfile, [key]: value },
    }));
  }

  // Handoff Contacts management
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

  function updateContact(id: string, field: string, value: string) {
    setSettings((prev) => ({
      ...prev,
      handoffContacts: prev.handoffContacts.map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    }));
  }

  function removeContact(id: string) {
    setSettings((prev) => ({
      ...prev,
      handoffContacts: prev.handoffContacts.filter((c) => c.id !== id),
    }));
  }

  // Handoff Rules management
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

  function updateRule(id: string, field: string, value: string | number) {
    setSettings((prev) => ({
      ...prev,
      handoffRules: prev.handoffRules.map((r) =>
        r.id === id ? { ...r, [field]: value } : r
      ),
    }));
  }

  function removeRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      handoffRules: prev.handoffRules.filter((r) => r.id !== id),
    }));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </button>
      </div>

      {/* Company Profile */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Company Profile</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">
                Website URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="url"
                  value={settings.companyProfile.website}
                  onChange={(e) =>
                    updateProfileField("website", e.target.value)
                  }
                  placeholder="https://your-company.com"
                  className="h-10 w-full rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button
              onClick={handleProfileCompany}
              disabled={profiling || !settings.companyProfile.website}
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
            >
              {profiling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
              Profile My Company
            </button>
          </div>

          {/* Editable profile fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            {["name", "description", "industry", "services"].map((field) => (
              <div key={field}>
                <label className="mb-1.5 block text-sm font-medium capitalize">
                  {field}
                </label>
                {field === "description" || field === "services" ? (
                  <textarea
                    value={settings.companyProfile[field] ?? ""}
                    onChange={(e) => updateProfileField(field, e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <input
                    type="text"
                    value={settings.companyProfile[field] ?? ""}
                    onChange={(e) => updateProfileField(field, e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">API Keys</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          API keys are loaded from your <code>.env.local</code> file. Edit that
          file directly to update them.
        </p>
        <div className="space-y-2">
          {Object.entries(settings.apiKeys).length > 0 ? (
            Object.entries(settings.apiKeys).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-2.5"
              >
                <span className="text-sm font-medium">{key}</span>
                <span className="font-mono text-sm text-muted-foreground">
                  {value}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No API keys configured in environment.
            </p>
          )}
        </div>
      </section>

      {/* SMTP / IMAP */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">SMTP / IMAP</h2>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {testingConnection ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Test Connection
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Mail server configuration is read from your environment. Edit{" "}
          <code>.env.local</code> to update.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">SMTP</h3>
            <div className="space-y-1.5">
              {Object.entries(settings.smtp).length > 0 ? (
                Object.entries(settings.smtp).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="font-medium text-muted-foreground">
                      {key}:
                    </span>
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">IMAP</h3>
            <div className="space-y-1.5">
              {Object.entries(settings.imap).length > 0 ? (
                Object.entries(settings.imap).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="font-medium text-muted-foreground">
                      {key}:
                    </span>
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Outreach Config */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Send className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Outreach Config</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Daily Send Cap
            </label>
            <input
              type="number"
              value={settings.outreach.dailySendCap}
              onChange={(e) =>
                updateOutreach("dailySendCap", Number(e.target.value))
              }
              min={1}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Send Delay (seconds)
            </label>
            <input
              type="number"
              value={settings.outreach.sendDelaySeconds}
              onChange={(e) =>
                updateOutreach("sendDelaySeconds", Number(e.target.value))
              }
              min={0}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Hot Score Threshold
            </label>
            <input
              type="number"
              value={settings.outreach.scoreThresholdHot}
              onChange={(e) =>
                updateOutreach("scoreThresholdHot", Number(e.target.value))
              }
              min={0}
              max={100}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Warm Score Threshold
            </label>
            <input
              type="number"
              value={settings.outreach.scoreThresholdWarm}
              onChange={(e) =>
                updateOutreach("scoreThresholdWarm", Number(e.target.value))
              }
              min={0}
              max={100}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </section>

      {/* LLM Config */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">LLM Config</h2>
        </div>
        <div className="max-w-md">
          <label className="mb-1.5 block text-sm font-medium">
            Default Model
          </label>
          <input
            type="text"
            value={settings.llm.defaultModel}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                llm: { ...prev.llm, defaultModel: e.target.value },
              }))
            }
            placeholder="e.g. gpt-4o-mini"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      {/* Handoff Contacts */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Handoff Contacts</h2>
          </div>
          <button
            onClick={addContact}
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </button>
        </div>

        {settings.handoffContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No handoff contacts configured.
          </p>
        ) : (
          <div className="space-y-3">
            {settings.handoffContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
              >
                <div className="grid flex-1 gap-3 sm:grid-cols-5">
                  <input
                    type="text"
                    value={contact.name}
                    onChange={(e) =>
                      updateContact(contact.id, "name", e.target.value)
                    }
                    placeholder="Name"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={contact.title}
                    onChange={(e) =>
                      updateContact(contact.id, "title", e.target.value)
                    }
                    placeholder="Title"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) =>
                      updateContact(contact.id, "email", e.target.value)
                    }
                    placeholder="Email"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="tel"
                    value={contact.phone}
                    onChange={(e) =>
                      updateContact(contact.id, "phone", e.target.value)
                    }
                    placeholder="Phone"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={contact.tag}
                    onChange={(e) =>
                      updateContact(contact.id, "tag", e.target.value)
                    }
                    placeholder="Tag"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={() => removeContact(contact.id)}
                  className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Handoff Rules */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Handoff Rules</h2>
          </div>
          <button
            onClick={addRule}
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Rule
          </button>
        </div>

        {settings.handoffRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No routing rules configured.
          </p>
        ) : (
          <div className="space-y-3">
            {settings.handoffRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
              >
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    value={rule.condition}
                    onChange={(e) =>
                      updateRule(rule.id, "condition", e.target.value)
                    }
                    placeholder="Condition (e.g. score >= 80)"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    value={rule.assignTo}
                    onChange={(e) =>
                      updateRule(rule.id, "assignTo", e.target.value)
                    }
                    placeholder="Assign to (contact name or tag)"
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(e) =>
                      updateRule(rule.id, "priority", Number(e.target.value))
                    }
                    placeholder="Priority"
                    min={1}
                    className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
