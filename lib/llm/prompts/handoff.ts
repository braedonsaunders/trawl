import type { PromptPair } from '@/lib/llm/types';
import type { CompanyProfile } from '@/lib/llm/prompts/score';

export interface HandoffContact {
  name: string;
  email: string;
  title?: string;
}

/**
 * Build the handoff email prompt for warm introductions when a lead replies.
 * Recommended: temperature 0.5, maxTokens 600
 */
export function buildHandoffPrompt(
  originalEmail: string,
  replyText: string,
  handoffContact: HandoffContact,
  companyProfile: CompanyProfile
): PromptPair {
  const systemPrompt = `You are writing a warm handoff email to introduce a colleague to a lead who has replied to an outreach email.

Guidelines:
- Keep it to 4-6 sentences
- Be professional and warm
- Briefly summarize the lead's reply and context
- Clearly introduce the colleague who will be taking over
- Make the transition feel natural, not robotic

Respond ONLY with a valid JSON object matching this exact schema:
{
  "subject": "Re: original subject with handoff context",
  "body_html": "<p>HTML formatted handoff email</p>",
  "body_text": "Plain text version of the handoff email"
}

Do not include any text outside the JSON object.`;

  const userPrompt = `Write a warm handoff email with the following context.

Company: ${companyProfile.name}
Handoff To: ${handoffContact.name}${handoffContact.title ? ` (${handoffContact.title})` : ''} - ${handoffContact.email}

--- ORIGINAL OUTREACH EMAIL ---
${originalEmail}
--- END ORIGINAL EMAIL ---

--- LEAD'S REPLY ---
${replyText}
--- END REPLY ---`;

  return { systemPrompt, userPrompt };
}
