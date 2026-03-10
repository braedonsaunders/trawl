export const LEAD_STATUS_OPTIONS = [
  { label: "Discovered", value: "discovered" },
  { label: "Enriched", value: "enriched" },
  { label: "Scored", value: "scored" },
  { label: "Contacted", value: "contacted" },
  { label: "Replied", value: "replied" },
  { label: "Handed Off", value: "handed_off" },
  { label: "Disqualified", value: "disqualified" },
  { label: "Ignored", value: "ignored" },
] as const;

export const LEAD_STATUS_VALUES = LEAD_STATUS_OPTIONS.map(
  (option) => option.value
);

export function isLeadStatus(value: string): boolean {
  return LEAD_STATUS_VALUES.includes(value as (typeof LEAD_STATUS_VALUES)[number]);
}

export function formatLeadStatus(value: string): string {
  const matched = LEAD_STATUS_OPTIONS.find((option) => option.value === value);
  return matched ? matched.label : value.replace(/_/g, " ");
}
