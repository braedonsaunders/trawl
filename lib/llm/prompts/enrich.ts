import type { PromptPair } from '@/lib/llm/types';

/**
 * Build the enrichment prompt for analyzing a company's website content.
 * Recommended: temperature 0.3, maxTokens 1000
 */
export function buildEnrichmentPrompt(
  name: string,
  website: string,
  rawContent: string
): PromptPair {
  const systemPrompt = `You are a B2B sales intelligence analyst. Your task is to extract a structured company profile from the provided website content.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "website_summary": "2-3 sentence summary of what the company does",
  "industry": "primary industry or sector",
  "company_size": "estimated size bucket: solo, micro (2-10), small (11-50), mid-market (51-200), large (201-500), enterprise (500+), or unknown",
  "employee_count_estimate": null,
  "employee_count_source": "",
  "services_needed": ["list of services/products this company likely needs from external suppliers"],
  "decision_maker_signals": "any clues about who makes purchasing decisions (titles, team page info, etc.)",
  "pain_points": "likely business challenges or pain points based on their industry and size",
  "tech_stack": ["any technologies, platforms, or tools mentioned or detected"],
  "social_links": {
    "linkedin": "url",
    "twitter": "url",
    "facebook": "url",
    "instagram": "url",
    "youtube": "url"
  },
  "potential_contacts": [
    {
      "name": "person or role name",
      "title": "job title or role",
      "email": "email address if present",
      "phone": "phone number if present",
      "linkedin_url": "linkedin url if present",
      "source": "where this was found, e.g. team page or contact page",
      "confidence": 0.0
    }
  ]
}

Rules:
- Prioritize explicit website evidence over inference
- Only set employee_count_estimate when the website explicitly states a count; otherwise use null
- Only set employee_count_source when the website explicitly states the count
- Only include potential_contacts when a named person or clear role-based contact point appears in the content
- Only include social link fields that are actually found in the content
- Be specific and factual; do not fabricate information
- If information is not available, use empty string or empty array as appropriate
- Do not include any text outside the JSON object`;

  const userPrompt = `Analyze the following website content for the company "${name}" (${website}) and extract a structured profile.

--- WEBSITE CONTENT ---
${rawContent.slice(0, 15000)}
--- END CONTENT ---`;

  return { systemPrompt, userPrompt };
}
