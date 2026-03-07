"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search,
  Mail,
  Sparkles,
  BarChart3,
  XCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface Lead {
  id: string;
  name: string;
  city: string;
  industry: string;
  score: number | null;
  tier: "hot" | "warm" | "cold" | null;
  status: string;
  website: string | null;
  last_activity: string | null;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  per_page: number;
}

type SortField =
  | "name"
  | "city"
  | "industry"
  | "score"
  | "status"
  | "last_activity";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Discovered", value: "discovered" },
  { label: "Enriched", value: "enriched" },
  { label: "Scored", value: "scored" },
  { label: "Contacted", value: "contacted" },
  { label: "Replied", value: "replied" },
  { label: "Handed Off", value: "handed_off" },
  { label: "Disqualified", value: "disqualified" },
];

const TIER_OPTIONS = [
  { label: "All Tiers", value: "" },
  { label: "Hot", value: "hot" },
  { label: "Warm", value: "warm" },
  { label: "Cold", value: "cold" },
];

export function LeadsTable() {
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [hasWebsite, setHasWebsite] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    params.set("sort", sortField);
    params.set("dir", sortDir);
    if (statusFilter) params.set("status", statusFilter);
    if (tierFilter) params.set("tier", tierFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (hasWebsite) params.set("has_website", "true");

    try {
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      const data: LeadsResponse = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sortField, sortDir, statusFilter, tierFilter, cityFilter, hasWebsite]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, tierFilter, cityFilter, hasWebsite]);

  const totalPages = Math.ceil(total / perPage);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: string) => {
    if (selectedIds.size === 0) return;

    try {
      await fetch(`/api/leads/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          lead_ids: Array.from(selectedIds),
        }),
      });
      setSelectedIds(new Set());
      fetchLeads();
    } catch {
      // Error handling — could add toast notification
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  };

  const SortableHead = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      {children}
      <SortIcon field={field} />
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-40"
        />
        <Select
          options={TIER_OPTIONS}
          value={tierFilter}
          onChange={setTierFilter}
          className="w-32"
        />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-44 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hasWebsite}
            onChange={(e) => setHasWebsite(e.target.checked)}
            className="rounded border-input"
          />
          <Globe className="h-3.5 w-3.5" />
          Has website
        </label>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkAction("enrich")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Enrich Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkAction("score")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Score Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkAction("generate_emails")}
          >
            <Mail className="h-3.5 w-3.5" />
            Generate Emails
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => bulkAction("disqualify")}
          >
            <XCircle className="h-3.5 w-3.5" />
            Disqualify
          </Button>
        </div>
      )}

      {/* Table */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedIds.size === leads.length}
                  onChange={toggleSelectAll}
                  className="rounded border-input"
                />
              </TableHead>
              <SortableHead field="name">Name</SortableHead>
              <SortableHead field="city">City</SortableHead>
              <SortableHead field="industry">Industry</SortableHead>
              <SortableHead field="score">Score</SortableHead>
              <TableHead>Tier</TableHead>
              <SortableHead field="status">Status</SortableHead>
              <TableHead>Website</TableHead>
              <SortableHead field="last_activity">Last Activity</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Loading leads...
                  </p>
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-muted-foreground"
                >
                  No leads found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  data-state={selectedIds.has(lead.id) ? "selected" : undefined}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-input"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.city}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.industry}
                  </TableCell>
                  <TableCell>
                    {lead.score != null ? lead.score : "—"}
                  </TableCell>
                  <TableCell>
                    {lead.tier ? (
                      <ScoreBadge score={lead.score ?? 0} tier={lead.tier} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {lead.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {lead.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Visit
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.last_activity
                      ? new Date(lead.last_activity).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * perPage + 1}–
            {Math.min(page * perPage, total)} of {total} leads
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="icon"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
