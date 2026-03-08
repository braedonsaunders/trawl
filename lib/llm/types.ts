import type { ProviderId } from "@/lib/db/queries/provider-settings";
import type { z } from "zod";

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
}

export interface PotentialContact {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  source?: string;
  confidence?: number | null;
}

export interface EnrichmentResult {
  website_summary: string;
  industry: string;
  company_size: string;
  employee_count_estimate: number | null;
  employee_count_source: string;
  services_needed: string[];
  decision_maker_signals: string;
  pain_points: string;
  tech_stack: string[];
  social_links: SocialLinks;
  potential_contacts: PotentialContact[];
}

export interface ScoringResult {
  fit_score: number;
  fit_tier: "hot" | "warm" | "cold";
  reasoning: string;
  strengths: string[];
  risks: string[];
  recommended_angle: string;
}

export interface EmailResult {
  subject_variants: string[];
  body_html: string;
  body_text: string;
}

export interface HandoffResult {
  subject: string;
  body_html: string;
  body_text: string;
}

export interface ContactResearchCandidate {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  facility_name?: string;
  source_label?: string;
  source_url?: string;
  notes?: string;
  confidence?: number | null;
}

export interface ContactResearchResult {
  contacts: ContactResearchCandidate[];
}

export interface LLMCallOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  provider?: ProviderId;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCallResult<T = unknown> {
  parsed: T;
  model: string;
  provider: ProviderId;
}

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}
