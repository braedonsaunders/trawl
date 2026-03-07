import { z } from "zod";

export const enrichmentResultSchema = z.object({
  website_summary: z.string(),
  industry: z.string(),
  company_size: z.string(),
  services_needed: z.array(z.string()),
  decision_maker_signals: z.string(),
  pain_points: z.string(),
  tech_stack: z.array(z.string()),
  social_links: z.record(z.string(), z.string()),
});

export const scoringResultSchema = z.object({
  fit_score: z.number(),
  fit_tier: z.enum(["hot", "warm", "cold"]),
  reasoning: z.string(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  recommended_angle: z.string(),
});

export const emailResultSchema = z.object({
  subject_variants: z.tuple([z.string(), z.string(), z.string()]),
  body_html: z.string(),
  body_text: z.string(),
});

export const handoffResultSchema = z.object({
  subject: z.string(),
  body_html: z.string(),
  body_text: z.string(),
});
