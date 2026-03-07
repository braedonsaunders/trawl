"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  BarChart3,
  Mail,
  MessageSquare,
  UserCheck,
  XCircle,
  Activity,
} from "lucide-react";

interface ActivityItem {
  lead_name: string;
  lead_id?: string;
  action: string;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  className?: string;
}

const actionIcons: Record<string, typeof Activity> = {
  discovered: Search,
  enriched: Sparkles,
  scored: BarChart3,
  contacted: Mail,
  email_sent: Mail,
  replied: MessageSquare,
  handed_off: UserCheck,
  disqualified: XCircle,
};

function getActionIcon(action: string) {
  const lowerAction = action.toLowerCase();
  for (const [key, Icon] of Object.entries(actionIcons)) {
    if (lowerAction.includes(key)) return Icon;
  }
  return Activity;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ activities, className }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className={cn("flex h-32 items-center justify-center text-sm text-muted-foreground", className)}>
        No recent activity.
      </div>
    );
  }

  return (
    <div className={cn("max-h-96 space-y-0 overflow-y-auto", className)}>
      {activities.map((item, i) => {
        const Icon = getActionIcon(item.action);

        return (
          <div
            key={`${item.timestamp}-${i}`}
            className="flex items-start gap-3 border-b px-1 py-3 last:border-0"
          >
            <div className="mt-0.5 rounded-full bg-muted p-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {item.lead_id ? (
                  <Link
                    href={`/leads/${item.lead_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.lead_name}
                  </Link>
                ) : (
                  <span className="font-medium">{item.lead_name}</span>
                )}{" "}
                <span className="text-muted-foreground">{item.action}</span>
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTimestamp(item.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
