import { z } from "zod";

const socialLinksSchema = z.object({
  linkedin: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  youtube: z.string().optional(),
});

const potentialContactSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
  source: z.string().optional(),
  confidence: z.number().nullable().optional(),
});

const contactResearchCandidateSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
  facility_name: z.string().optional(),
  source_label: z.string().optional(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  confidence: z.number().nullable().optional(),
});

export const enrichmentResultSchema = z.object({
  website_summary: z.string(),
  industry: z.string(),
  company_size: z.string(),
  employee_count_estimate: z.number().nullable(),
  employee_count_source: z.string(),
  services_needed: z.array(z.string()),
  decision_maker_signals: z.string(),
  pain_points: z.string(),
  tech_stack: z.array(z.string()),
  social_links: socialLinksSchema,
  potential_contacts: z.array(potentialContactSchema),
});

export const companyProfileResultSchema = z.object({
  company_name: z.string(),
  description: z.string(),
  industry: z.string(),
  services_offered: z.array(z.string()),
  geographies_served: z.array(z.string()),
  differentiators: z.array(z.string()),
  ideal_customer_summary: z.string(),
  buyer_search_queries: z.array(z.string()),
  target_signals: z.array(z.string()),
  exclusion_signals: z.array(z.string()),
});

export const discoverySearchPlanSchema = z.object({
  search_queries: z.array(z.string()).min(1).max(5),
  ideal_customer_summary: z.string(),
  target_signals: z.array(z.string()),
  exclusion_signals: z.array(z.string()),
});

export const discoveryShortlistResultSchema = z.object({
  prospects: z.array(
    z.object({
      google_place_id: z.string(),
      fit_score: z.number(),
      rationale: z.string(),
      match_signals: z.array(z.string()),
      caution_signals: z.array(z.string()),
    })
  ),
});

export const discoveryDeduplicationResultSchema = z.object({
  decisions: z.array(
    z.object({
      pair_key: z.string(),
      is_duplicate: z.boolean(),
      confidence: z.number(),
      rationale: z.string(),
    })
  ),
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
  subject_variants: z.array(z.string()),
  body_html: z.string(),
  body_text: z.string(),
});

export const handoffResultSchema = z.object({
  subject: z.string(),
  body_html: z.string(),
  body_text: z.string(),
});

export const contactResearchResultSchema = z.object({
  contacts: z.array(contactResearchCandidateSchema),
});
