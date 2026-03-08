"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Sparkles,
  Target,
  FileText,
  Users,
  Flame,
  Mail,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PipelineFunnel } from "@/components/dashboard/PipelineFunnel";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

interface DashboardData {
  totalLeads: number;
  hotLeads: number;
  draftCount: number;
  openedToday: number;
  contacted: number;
  pipeline: {
    discovered: number;
    enriched: number;
    scored: number;
    contacted: number;
    replied: number;
    handed_off: number;
  };
  recentActivity: {
    lead_name: string;
    lead_id?: string;
    action: string;
    timestamp: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchAction(
    endpoint: string,
    actionKey: string
  ) {
    setActionLoading(actionKey);
    try {
      await fetch(endpoint, { method: "POST" });
      await fetchDashboard();
    } catch {
      // silently handle
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      label: "Total Leads",
      value: data?.totalLeads ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Hot Leads",
      value: data?.hotLeads ?? 0,
      icon: Flame,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Drafts Ready",
      value: data?.draftCount ?? 0,
      icon: Mail,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Opened Today",
      value: data?.openedToday ?? 0,
      icon: MessageSquare,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </p>
                <div className={cn("rounded-lg p-2", stat.bg)}>
                  <Icon className={cn("h-5 w-5", stat.color)} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline Funnel */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Pipeline Funnel</h2>
        <PipelineFunnel counts={data?.pipeline ?? { discovered: 0, enriched: 0, scored: 0, contacted: 0, replied: 0, handed_off: 0 }} />
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Search className="h-4 w-4" />
            Run Search
          </Link>

          <button
            onClick={() =>
              handleBatchAction("/api/enrich/batch", "enrich")
            }
            disabled={actionLoading === "enrich"}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {actionLoading === "enrich" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrich + Score Pending
          </button>

          <button
            onClick={() =>
              handleBatchAction("/api/score/batch", "score")
            }
            disabled={actionLoading === "score"}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {actionLoading === "score" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Target className="h-4 w-4" />
            )}
            Re-score Enriched
          </button>

          <Link
            href="/outreach"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80"
          >
            <FileText className="h-4 w-4" />
            Review Drafts
          </Link>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Recent Leads</h2>
        <ActivityFeed activities={data?.recentActivity ?? []} />
      </div>
    </div>
  );
}
