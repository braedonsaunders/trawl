import type { PromptPair } from '@/lib/llm/types';

export interface CompanyProfile {
  name: string;
  industry: string;
  services: string[];
  description: string;
}

/**
 * Build the scoring prompt for evaluating lead fit.
 * Recommended: temperature 0.2, maxTokens 800
 */
export function buildScoringPrompt(
  companyProfile: CompanyProfile,
  leadEnrichment: Record<string, unknown>
): PromptPair {
  const systemPrompt = `You are a B2B sales fit analyst. Your task is to score how well a prospective lead matches a supplier's ideal customer profile.

SUPPLIER PROFILE:
- Company: ${companyProfile.name}
- Industry: ${companyProfile.industry}
- Services Offered: ${companyProfile.services.join(', ')}
- Description: ${companyProfile.description}

Score the lead from 0 to 100 based on:
- Industry alignment and relevance
- Likelihood they need the supplier's services
- Company size, employee count, and potential deal value
- Accessibility of decision makers or specific contact paths
- Overall strategic fit

Respond ONLY with a valid JSON object matching this exact schema:
{
  "fit_score": 0-100,
  "fit_tier": "hot" | "warm" | "cold",
  "reasoning": "2-3 sentence explanation of the score",
  "strengths": ["specific reasons this is a good fit"],
  "risks": ["potential concerns or obstacles"],
  "recommended_angle": "suggested approach or value proposition for outreach"
}

Tier thresholds:
- hot: 70-100 (strong fit, prioritize outreach)
- warm: 40-69 (moderate fit, worth pursuing)
- cold: 0-39 (low fit, deprioritize)

Do not include any text outside the JSON object.`;

  const userPrompt = `Evaluate the following lead's fit with the supplier profile described above.

--- LEAD ENRICHMENT DATA ---
${JSON.stringify(leadEnrichment, null, 2)}
--- END DATA ---`;

  return { systemPrompt, userPrompt };
}
