import { getDb } from "../client";

export interface Score {
  id: number;
  lead_id: number;
  fit_score: number;
  fit_tier: string;
  reasoning: string | null;
  strengths: string | null;
  risks: string | null;
  recommended_angle: string | null;
  scored_at: string | null;
  model_used: string | null;
}

export interface UpsertScoreData {
  fit_score: number;
  fit_tier: string;
  reasoning?: string | null;
  strengths?: string | null;
  risks?: string | null;
  recommended_angle?: string | null;
  scored_at?: string | null;
  model_used?: string | null;
}

export function getScore(leadId: number): Score | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM lead_scores WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
    .get(leadId);
  return (row as Score) ?? null;
}

export function upsertScore(leadId: number, data: UpsertScoreData): Score {
  const db = getDb();

  const existing = getScore(leadId);

  const params = {
    lead_id: leadId,
    fit_score: data.fit_score,
    fit_tier: data.fit_tier,
    reasoning: data.reasoning ?? null,
    strengths: data.strengths ?? null,
    risks: data.risks ?? null,
    recommended_angle: data.recommended_angle ?? null,
    scored_at: data.scored_at ?? new Date().toISOString(),
    model_used: data.model_used ?? null,
  };

  if (existing) {
    db.prepare(`
      UPDATE lead_scores SET
        fit_score = @fit_score,
        fit_tier = @fit_tier,
        reasoning = @reasoning,
        strengths = @strengths,
        risks = @risks,
        recommended_angle = @recommended_angle,
        scored_at = @scored_at,
        model_used = @model_used
      WHERE id = @id
    `).run({ ...params, id: existing.id });

    return getScore(leadId)!;
  }

  return db.prepare(`
    INSERT INTO lead_scores (lead_id, fit_score, fit_tier, reasoning, strengths, risks, recommended_angle, scored_at, model_used)
    VALUES (@lead_id, @fit_score, @fit_tier, @reasoning, @strengths, @risks, @recommended_angle, @scored_at, @model_used)
    RETURNING *
  `).get(params) as Score;
}
