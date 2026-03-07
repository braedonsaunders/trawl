export interface AppConfig {
  googleMapsApiKey: string;
  openRouterApiKey: string;
  openRouterDefaultModel: string;
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

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);

  if (isNaN(smtpPort)) {
    throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
  }
  if (isNaN(imapPort)) {
    throw new Error(`Invalid IMAP_PORT: ${process.env.IMAP_PORT}`);
  }

  cachedConfig = {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterDefaultModel:
      process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-3-5-sonnet',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      fromName: process.env.SMTP_FROM_NAME || '',
    },
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: imapPort,
      user: process.env.IMAP_USER || '',
      pass: process.env.IMAP_PASS || '',
    },
  };

  return cachedConfig;
}

/**
 * Validate that required config values are present for a given operation.
 * Throws with a list of missing keys.
 */
export function requireConfig(...keys: (keyof AppConfig)[]): AppConfig {
  const config = getConfig();
  const missing: string[] = [];

  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value === '') {
      missing.push(key);
    } else if (typeof value === 'object') {
      // Check nested object for empty strings
      for (const [subKey, subValue] of Object.entries(value)) {
        if (typeof subValue === 'string' && subValue === '') {
          missing.push(`${key}.${subKey}`);
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}. ` +
        `Set the corresponding environment variables.`
    );
  }

  return config;
}

/**
 * Reset cached config. Useful for testing.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
