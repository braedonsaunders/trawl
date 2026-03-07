import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  tier: "hot" | "warm" | "cold";
  className?: string;
}

const tierConfig = {
  hot: {
    bg: "bg-red-500/15",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-500/20",
    label: "Hot",
  },
  warm: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-500/20",
    label: "Warm",
  },
  cold: {
    bg: "bg-blue-500/15",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-500/20",
    label: "Cold",
  },
} as const;

export function ScoreBadge({ score, tier, className }: ScoreBadgeProps) {
  const config = tierConfig[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      <span className="font-bold">{score}</span>
      <span>{config.label}</span>
    </span>
  );
}
