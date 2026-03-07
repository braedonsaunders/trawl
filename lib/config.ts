import { getAllSettings, initDefaultSettings } from "@/lib/db/queries/settings";

export interface AppConfig {
  googleMapsApiKey: string;
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromName: string;
  };
  imap: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
}

function parsePort(value: string, fallback: number, label: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

export function getConfig(): AppConfig {
  initDefaultSettings();
  const settings = getAllSettings();

  return {
    googleMapsApiKey: settings.google_maps_api_key || "",
    smtp: {
      host: settings.smtp_host || "smtp.gmail.com",
      port: parsePort(settings.smtp_port || "587", 587, "smtp_port"),
      user: settings.smtp_user || "",
      pass: settings.smtp_pass || "",
      fromName: settings.smtp_from_name || "",
    },
    imap: {
      host: settings.imap_host || "imap.gmail.com",
      port: parsePort(settings.imap_port || "993", 993, "imap_port"),
      user: settings.imap_user || "",
      pass: settings.imap_pass || "",
    },
  };
}

export function requireConfig(...keys: (keyof AppConfig)[]): AppConfig {
  const config = getConfig();
  const missing: string[] = [];

  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value === "") {
      missing.push(key);
      continue;
    }

    if (typeof value === "object" && value !== null) {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (typeof subValue === "string" && subValue === "") {
          missing.push(`${key}.${subKey}`);
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(", ")}. Update the corresponding SQLite-backed settings before retrying.`
    );
  }

  return config;
}

export function resetConfigCache(): void {
  // Config is read directly from SQLite on each access.
}
