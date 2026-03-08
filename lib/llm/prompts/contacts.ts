import type { PromptPair } from "@/lib/llm/types";

interface ContactResearchDocument {
  title: string;
  url: string;
  source: string;
  content: string;
}

export function buildContactResearchPrompt(input: {
  leadName: string;
  website: string | null;
  location: string;
  documents: ContactResearchDocument[];
}): PromptPair {
  const documentsText = input.documents
    .map((document, index) => {
      return [
        `Document ${index + 1}`,
        `Title: ${document.title}`,
        `Source: ${document.source}`,
        `URL: ${document.url}`,
        "Content:",
        document.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are a B2B contact researcher. Extract likely plant-level, facility-level, site-level, or local operations contacts from the supplied evidence.

Prioritize explicit evidence for these kinds of roles:
- Plant manager
- Site manager
- Operations manager
- Maintenance manager
- Reliability manager
- Engineering manager
- Procurement or purchasing manager
- EHS or safety manager
- Production manager
- Mill manager, terminal manager, facility manager

Rules:
- Only return contacts supported by the provided documents.
- Prefer contacts tied to the local facility or location over corporate HQ leadership.
- If a contact appears corporate-only and not local to the site, omit it.
- Keep source_url exactly equal to one of the provided URLs.
- Use empty strings for unavailable fields.
- Confidence should be between 0 and 1.
- Respond only with valid JSON matching this schema:
{
  "contacts": [
    {
      "name": "contact name if explicit",
      "title": "job title or role",
      "email": "email if explicit",
      "phone": "phone if explicit",
      "linkedin_url": "linkedin url if explicit",
      "facility_name": "facility, plant, mill, terminal, or site name if explicit",
      "source_label": "brief source label such as Company site, LinkedIn snippet, Local news, Permit document",
      "source_url": "the exact supporting URL",
      "notes": "why this person looks relevant to the local facility",
      "confidence": 0.0
    }
  ]
}`;

  const userPrompt = `Find plant-level or facility-level contacts for this lead.

Lead: ${input.leadName}
Website: ${input.website || "Unknown"}
Location: ${input.location || "Unknown"}

Evidence documents:

${documentsText}`;

  return { systemPrompt, userPrompt };
}
