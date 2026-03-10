import { LiveRunMonitor } from "@/components/agent/LiveRunMonitor";

export default function RunsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border bg-card shadow-sm">
        <div className="grid gap-4 px-6 py-7 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Activity Feed
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Watch the system work live.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Trawl now records discovery plans, Playwright crawls, firmographic
              lookups, enrichment model calls, and scoring steps. Keep this
              page open while a run is in flight to see what the system is
              visiting and doing.
            </p>
          </div>

          <div className="rounded-3xl border bg-muted/30 p-5">
            <p className="text-sm font-medium text-foreground">What you will see</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Discovery planning and Google business search phases</li>
              <li>Website pages visited during Playwright crawls</li>
              <li>Public source lookups for revenue and employee counts</li>
              <li>LLM enrichment and scoring steps with current status</li>
            </ul>
          </div>
        </div>
      </section>

      <LiveRunMonitor
        title="Activity"
        description="Runs refresh automatically. Active work polls faster, recent completed runs stay visible for review."
        limit={16}
        eventLimit={8}
      />
    </div>
  );
}
