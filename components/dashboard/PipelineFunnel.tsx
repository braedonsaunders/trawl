"use client";

import { cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  BarChart3,
  Mail,
  MessageSquare,
  UserCheck,
  ChevronRight,
} from "lucide-react";

interface PipelineFunnelProps {
  counts: {
    discovered: number;
    enriched: number;
    scored: number;
    contacted: number;
    replied: number;
    handed_off: number;
  };
}

const stages = [
  {
    key: "discovered" as const,
    label: "Discovered",
    icon: Search,
    color: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
    barColor: "bg-blue-500",
  },
  {
    key: "enriched" as const,
    label: "Enriched",
    icon: Sparkles,
    color: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-400",
    barColor: "bg-sky-500",
  },
  {
    key: "scored" as const,
    label: "Scored",
    icon: BarChart3,
    color: "bg-teal-500/10 text-teal-700 border-teal-500/20 dark:text-teal-400",
    barColor: "bg-teal-500",
  },
  {
    key: "contacted" as const,
    label: "Contacted",
    icon: Mail,
    color: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
    barColor: "bg-green-500",
  },
  {
    key: "replied" as const,
    label: "Replied",
    icon: MessageSquare,
    color: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
    barColor: "bg-amber-500",
  },
  {
    key: "handed_off" as const,
    label: "Handed Off",
    icon: UserCheck,
    color: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400",
    barColor: "bg-orange-500",
  },
];

export function PipelineFunnel({ counts }: PipelineFunnelProps) {
  const maxCount = Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-4">
      {/* Desktop: horizontal layout */}
      <div className="hidden items-end gap-1 md:flex">
        {stages.map((stage, i) => {
          const count = counts[stage.key];
          const Icon = stage.icon;
          const heightPercent = Math.max((count / maxCount) * 100, 8);

          return (
            <div key={stage.key} className="flex flex-1 items-end">
              <div className="flex w-full flex-col items-center gap-2">
                <span className="text-2xl font-bold">{count}</span>
                <div
                  className={cn(
                    "w-full rounded-t-md transition-all",
                    stage.barColor
                  )}
                  style={{ height: `${heightPercent}px`, minHeight: "8px", maxHeight: "120px" }}
                />
                <div
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-md border p-2",
                    stage.color
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{stage.label}</span>
                </div>
              </div>
              {i < stages.length - 1 && (
                <ChevronRight className="mx-0.5 mb-8 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical layout */}
      <div className="space-y-2 md:hidden">
        {stages.map((stage, i) => {
          const count = counts[stage.key];
          const Icon = stage.icon;
          const widthPercent = Math.max((count / maxCount) * 100, 5);

          return (
            <div key={stage.key}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3",
                  stage.color
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{stage.label}</span>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                    <div
                      className={cn("h-full rounded-full transition-all", stage.barColor)}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
