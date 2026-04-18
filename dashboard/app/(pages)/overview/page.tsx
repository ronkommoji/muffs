import { getDb } from "@/lib/db";
import { MetricsCards } from "@/components/overview/metrics-cards";
import { ActivityFeed } from "@/components/overview/activity-feed";

export const dynamic = "force-dynamic";

function getMetrics() {
  const db = getDb();
  const totalRuns = (
    db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }
  ).c;
  const activeSessions = (
    db
      .prepare("SELECT COUNT(*) as c FROM sessions WHERE status='active'")
      .get() as { c: number }
  ).c;
  const tokenData = db
    .prepare("SELECT SUM(token_count) as tokens FROM sessions")
    .get() as { tokens: number | null };
  const totalTokens = tokenData.tokens ?? 0;
  const costData = db
    .prepare(
      "SELECT SUM(json_extract(payload, '$.cost_usd')) as total_cost FROM agent_events WHERE event_type='result'"
    )
    .get() as { total_cost: number | null };
  const estimatedCost = +(costData.total_cost ?? 0).toFixed(4);

  const recentRuns = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM sessions WHERE created_at >= datetime('now','-7 days')"
      )
      .get() as { c: number }
  ).c;

  return { totalRuns, activeSessions, totalTokens, estimatedCost, recentRuns };
}

export default function OverviewPage() {
  const metrics = getMetrics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agent activity and metrics
        </p>
      </div>
      <MetricsCards metrics={metrics} />
      <ActivityFeed />
    </div>
  );
}
