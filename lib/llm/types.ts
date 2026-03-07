import type { ProviderId } from "@/lib/db/queries/provider-settings";
import type { z } from "zod";

export interface EnrichmentResult {
  website_summary: string;
  industry: string;
  company_size: string;
  services_needed: string[];
  decision_maker_signals: string;
  pain_points: string;
  tech_stack: string[];
  social_links: Record<string, string>;
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
  subject_variants: [string, string, string];
  body_html: string;
  body_text: string;
}

export interface HandoffResult {
  subject: string;
  body_html: string;
  body_text: string;
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
