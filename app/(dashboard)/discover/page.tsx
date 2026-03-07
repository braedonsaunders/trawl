"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  leadsFound: number;
  duplicatesSkipped: number;
}

interface SearchJob {
  id: string;
  query: string;
  location: string;
  resultsCount: number;
  status: string;
  createdAt: string;
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState("25");
  const [maxResults, setMaxResults] = useState("100");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/discover?history=true");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch {
      // silently handle
    } finally {
      setJobsLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setResult(null);

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim(),
          radius: Number(radius),
          maxResults: Number(maxResults),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult({
          leadsFound: data.leadsFound ?? 0,
          duplicatesSkipped: data.duplicatesSkipped ?? 0,
        });
        await fetchJobs();
      }
    } catch {
      // silently handle
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Discover Leads</h1>

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">
              Search Query
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. food processing plant"
                className="h-10 w-full rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Simcoe, Ontario"
                className="h-10 w-full rounded-lg border bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Radius
              </label>
              <select
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="10">10 km</option>
                <option value="25">25 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Max Results
              </label>
              <input
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                min={1}
                max={500}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>

          {result && (
            <p className="text-sm text-muted-foreground">
              Found{" "}
              <span className="font-semibold text-foreground">
                {result.leadsFound}
              </span>{" "}
              leads
              {result.duplicatesSkipped > 0 && (
                <span>
                  {" "}
                  ({result.duplicatesSkipped} duplicates skipped)
                </span>
              )}
            </p>
          )}
        </div>
      </form>

      {/* Recent Search Jobs */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Recent Searches</h2>
        </div>

        {jobsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No searches yet. Run your first search above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Query
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Location
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Results
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-6 py-3 font-medium">{job.query}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {job.location || "---"}
                    </td>
                    <td className="px-6 py-3">{job.resultsCount}</td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          job.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : job.status === "running"
                              ? "bg-blue-100 text-blue-700"
                              : job.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
