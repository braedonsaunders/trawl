import type { PotentialContact, SocialLinks } from "@/lib/llm/types";

const GENERIC_CATEGORIES = new Set(["point_of_interest", "establishment"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function humanizeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function parseStoredStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(isNonEmptyString)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!isNonEmptyString(value)) {
    return [];
  }

  const trimmed = value.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(isNonEmptyString)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  return trimmed
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .flatMap((item) => {
      if (/[.?!]\s/.test(item)) {
        return item
          .split(/(?<=[.?!])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean);
      }

      if (item.includes(";")) {
        return item
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean);
      }

      return [item];
    });
}

export function formatLeadCategories(value: unknown): string[] {
  const categories = parseStoredStringArray(value);
  if (categories.length === 0) {
    return [];
  }

  const meaningfulCategories = categories.filter(
    (category) => !GENERIC_CATEGORIES.has(category.toLowerCase())
  );
  const source = meaningfulCategories.length > 0 ? meaningfulCategories : ["business"];

  return Array.from(new Set(source.map((category) => humanizeLabel(category))));
}

export function formatLeadIndustry(
  industry: unknown,
  categories?: unknown
): string {
  if (isNonEmptyString(industry) && !industry.trim().startsWith("[")) {
    return industry.trim();
  }

  return formatLeadCategories(
    isNonEmptyString(industry) ? industry : categories
  )[0] ?? "";
}

export function parseStoredSocialLinks(value: unknown): SocialLinks {
  if (!isNonEmptyString(value)) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<SocialLinks>((acc, [key, rawValue]) => {
      if (isNonEmptyString(rawValue)) {
        acc[key as keyof SocialLinks] = rawValue.trim();
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function parseStoredPotentialContacts(value: unknown): PotentialContact[] {
  if (!isNonEmptyString(value)) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => {
        return Boolean(item) && typeof item === "object" && !Array.isArray(item);
      })
      .map((item) => ({
        name: isNonEmptyString(item.name) ? item.name.trim() : undefined,
        title: isNonEmptyString(item.title) ? item.title.trim() : undefined,
        email: isNonEmptyString(item.email) ? item.email.trim() : undefined,
        phone: isNonEmptyString(item.phone) ? item.phone.trim() : undefined,
        linkedin_url: isNonEmptyString(item.linkedin_url)
          ? item.linkedin_url.trim()
          : undefined,
        source: isNonEmptyString(item.source) ? item.source.trim() : undefined,
        confidence:
          typeof item.confidence === "number" &&
          Number.isFinite(item.confidence)
            ? Math.min(1, Math.max(0, item.confidence))
            : null,
      }))
      .filter((item) => {
        return Boolean(
          item.name ||
            item.title ||
            item.email ||
            item.phone ||
            item.linkedin_url
        );
      });
  } catch {
    return [];
  }
}
