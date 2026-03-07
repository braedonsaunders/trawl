ALTER TABLE lead_enrichments
ADD COLUMN employee_count_estimate INTEGER;

ALTER TABLE lead_enrichments
ADD COLUMN employee_count_source TEXT;

ALTER TABLE lead_enrichments
ADD COLUMN potential_contacts TEXT;
