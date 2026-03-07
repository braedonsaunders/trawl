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
  "company_size": "estimated size: solo, small (2-10), medium (11-50), large (50+), or unknown",
  "services_needed": ["list of services/products this company likely needs from external suppliers"],
  "decision_maker_signals": "any clues about who makes purchasing decisions (titles, team page info, etc.)",
  "pain_points": "likely business challenges or pain points based on their industry and size",
  "tech_stack": ["any technologies, platforms, or tools mentioned or detected"],
  "social_links": { "linkedin": "url", "twitter": "url", "facebook": "url" }
}

Rules:
- Only include social links that are actually found in the content
- Be specific and factual; do not fabricate information
- If information is not available, use empty string or empty array as appropriate
- Do not include any text outside the JSON object`;

  const userPrompt = `Analyze the following website content for the company "${name}" (${website}) and extract a structured profile.

--- WEBSITE CONTENT ---
${rawContent.slice(0, 15000)}
--- END CONTENT ---`;

  return { systemPrompt, userPrompt };
}
