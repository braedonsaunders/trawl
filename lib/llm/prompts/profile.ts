import type { PromptPair } from "@/lib/llm/types";

/**
 * Build the company-profile prompt for profiling the user's own business.
 * Recommended: temperature 0.2-0.3, maxTokens 1000
 */
export function buildCompanyProfilePrompt(
  website: string,
  rawContent: string
): PromptPair {
  const systemPrompt = `You are a B2B sales intelligence analyst. Your task is to extract a supplier's own company profile from the provided website content.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "company_name": "official company name as presented on the site",
  "description": "2-3 sentence summary of what the company does and who it serves",
  "industry": "primary industry or sector",
  "services_offered": ["customer-facing services, capabilities, or product lines the company explicitly offers"],
  "geographies_served": ["regions, provinces, states, or markets explicitly served"],
  "differentiators": ["clear differentiators, certifications, or strengths explicitly stated on the site"]
}

Rules:
- "services_offered" must describe what the company sells or delivers to customers
- Do NOT include things the company might buy from vendors or outsource
- Do NOT include internal tools, CRM, payroll, insurance, marketing, recruiting, software licenses, fleet management, raw material purchasing, or generic back-office functions unless the company explicitly sells those
- Prefer explicit services named on the site over broad guesses
- Keep items concise and deduplicated
- Only include geographies and differentiators that are explicitly stated or strongly evidenced in the content
- If information is unavailable, use empty string or empty array as appropriate
- Do not include any text outside the JSON object`;

  const userPrompt = `Extract the company's own profile from the following website content for ${website}.

--- WEBSITE CONTENT ---
${rawContent.slice(0, 20000)}
--- END CONTENT ---`;

  return { systemPrompt, userPrompt };
}
