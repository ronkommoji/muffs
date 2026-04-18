"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, Hash, Zap } from "lucide-react";

interface Metrics {
  totalRuns: number;
  activeSessions: number;
  totalTokens: number;
  estimatedCost: number;
  recentRuns: number;
}

export function MetricsCards({ metrics }: { metrics: Metrics }) {
  const cards = [
    {
      title: "Total Runs",
      value: metrics.totalRuns.toString(),
      sub: `${metrics.recentRuns} last 7 days`,
      icon: Activity,
    },
    {
      title: "Estimated Cost",
      value: `$${metrics.estimatedCost.toFixed(4)}`,
      sub: "based on token usage",
      icon: DollarSign,
    },
    {
      title: "Total Tokens",
      value: metrics.totalTokens.toLocaleString(),
      sub: "across all sessions",
      icon: Hash,
    },
    {
      title: "Active Sessions",
      value: metrics.activeSessions.toString(),
      sub: "currently running",
      icon: Zap,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
