WITH extracted AS (
  SELECT
    e.lead_id AS lead_id,
    NULLIF(TRIM(json_extract(j.value, '$.name')), '') AS name,
    NULLIF(TRIM(json_extract(j.value, '$.title')), '') AS title,
    NULLIF(TRIM(json_extract(j.value, '$.email')), '') AS email,
    NULLIF(TRIM(json_extract(j.value, '$.phone')), '') AS phone,
    NULLIF(TRIM(json_extract(j.value, '$.linkedin_url')), '') AS linkedin_url,
    NULLIF(TRIM(json_extract(j.value, '$.source')), '') AS raw_source,
    CASE
      WHEN json_type(j.value, '$.confidence') IN ('integer', 'real') THEN
        MIN(1.0, MAX(0.0, CAST(json_extract(j.value, '$.confidence') AS REAL)))
      ELSE NULL
    END AS confidence,
    COALESCE(e.enriched_at, CURRENT_TIMESTAMP) AS enriched_at
  FROM lead_enrichments e
  JOIN json_each(
    CASE
      WHEN json_valid(e.potential_contacts) THEN e.potential_contacts
      ELSE '[]'
    END
  ) AS j
)
INSERT INTO lead_contacts (
  lead_id,
  name,
  title,
  email,
  phone,
  linkedin_url,
  facility_name,
  source_type,
  source_label,
  source_url,
  notes,
  confidence,
  status,
  is_primary,
  created_at,
  updated_at
)
SELECT
  extracted.lead_id,
  extracted.name,
  extracted.title,
  extracted.email,
  extracted.phone,
  extracted.linkedin_url,
  NULL AS facility_name,
  'enrichment' AS source_type,
  CASE
    WHEN extracted.raw_source LIKE 'http%' THEN 'Legacy enrichment import'
    ELSE COALESCE(extracted.raw_source, 'Legacy enrichment import')
  END AS source_label,
  CASE
    WHEN extracted.raw_source LIKE 'http%' THEN extracted.raw_source
    ELSE NULL
  END AS source_url,
  'Backfilled from legacy enrichment contact data.' AS notes,
  extracted.confidence,
  'suggested' AS status,
  0 AS is_primary,
  extracted.enriched_at,
  extracted.enriched_at
FROM extracted
WHERE (
  extracted.name IS NOT NULL OR
  extracted.title IS NOT NULL OR
  extracted.email IS NOT NULL OR
  extracted.phone IS NOT NULL OR
  extracted.linkedin_url IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM lead_contacts existing
  WHERE existing.lead_id = extracted.lead_id
    AND (
      (
        extracted.email IS NOT NULL
        AND LOWER(TRIM(COALESCE(existing.email, ''))) = LOWER(extracted.email)
      ) OR (
        extracted.linkedin_url IS NOT NULL
        AND LOWER(TRIM(COALESCE(existing.linkedin_url, ''))) = LOWER(extracted.linkedin_url)
      ) OR (
        extracted.name IS NOT NULL
        AND extracted.title IS NOT NULL
        AND LOWER(TRIM(COALESCE(existing.name, ''))) = LOWER(extracted.name)
        AND LOWER(TRIM(COALESCE(existing.title, ''))) = LOWER(extracted.title)
      )
    )
);

UPDATE lead_enrichments
SET potential_contacts = NULL
WHERE COALESCE(TRIM(potential_contacts), '') <> '';
