"use client";

import { useState } from "react";
import { Download, Loader2, Users } from "lucide-react";
import { LeadsTable } from "@/components/leads/LeadsTable";

export default function LeadsPage() {
  const [exporting, setExporting] = useState(false);

  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await fetch("/api/leads?per_page=10000");
      if (!res.ok) return;
      const data = await res.json();
      const leads = data.leads ?? [];

      const headers = [
        "Name",
        "City",
        "Industry",
        "Score",
        "Status",
        "Website",
        "Last Activity",
      ];
      const rows = leads.map(
        (l: {
          name: string;
          city: string;
          industry: string;
          score: number | null;
          status: string;
          website: string | null;
          last_activity: string | null;
        }) => [
          l.name,
          l.city ?? "",
          l.industry ?? "",
          l.score?.toString() ?? "",
          l.status,
          l.website ?? "",
          l.last_activity ?? "",
        ]
      );

      const csv = [headers, ...rows]
        .map((r) => r.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trawl-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently handle
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </button>
      </div>

      <LeadsTable />
    </div>
  );
}
