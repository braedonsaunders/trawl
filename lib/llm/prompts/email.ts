import type { PromptPair } from '@/lib/llm/types';
import type { CompanyProfile } from '@/lib/llm/prompts/score';

/**
 * Build the email generation prompt for cold outreach.
 * Recommended: temperature 0.7, maxTokens 1200
 */
export function buildEmailPrompt(
  companyProfile: CompanyProfile,
  leadEnrichment: Record<string, unknown>,
  fitScore: number,
  recommendedAngle: string,
  senderName: string,
  senderTitle: string
): PromptPair {
  const systemPrompt = `You are an expert B2B cold email copywriter. Write concise, non-spammy outreach emails that feel personal and relevant.

Guidelines:
- Keep the email under 150 words
- Lead with value, not a pitch
- Reference something specific about the prospect's business
- Include a soft, low-friction call to action
- Avoid buzzwords, exclamation marks, and salesy language
- The tone should be professional but conversational
- Do not use "[First Name]" placeholders; address the company naturally

Sender: ${senderName}, ${senderTitle} at ${companyProfile.name}
Supplier services: ${companyProfile.services.join(', ')}

Respond ONLY with a valid JSON object matching this exact schema:
{
  "subject_variants": ["subject line 1", "subject line 2", "subject line 3"],
  "body_html": "<p>HTML formatted email body</p>",
  "body_text": "Plain text version of the email body"
}

Do not include any text outside the JSON object.`;

  const userPrompt = `Write a cold outreach email for the following lead.

Fit Score: ${fitScore}/100
Recommended Angle: ${recommendedAngle}

--- LEAD ENRICHMENT DATA ---
${JSON.stringify(leadEnrichment, null, 2)}
--- END DATA ---`;

  return { systemPrompt, userPrompt };
}
