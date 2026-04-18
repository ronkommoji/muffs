"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";

interface AgentEvent {
  id: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  payload: string | null;
  status: string | null;
  created_at: string;
}

type Filter = "all" | "tool_call" | "error";

function EventRow({ event }: { event: AgentEvent }) {
  const isError = event.status === "error";
  const payload = event.payload ? JSON.parse(event.payload) : null;

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className="shrink-0 pt-0.5">
        <Badge
          variant={isError ? "destructive" : "secondary"}
          className="text-xs"
        >
          {event.event_type}
        </Badge>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {event.tool_name && (
          <p className="font-mono text-sm font-medium truncate">{event.tool_name}</p>
        )}
        {payload && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {JSON.stringify(payload)}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {new Date(event.created_at).toLocaleTimeString()}
      </span>
    </div>
  );
}

export function ActivityFeed() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 200));
        setLastUpdated(new Date());
      } catch {}
    };

    return () => es.close();
  }, []);

  const filtered = events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "tool_call") return e.event_type === "tool_call";
    if (filter === "error") return e.status === "error";
    return true;
  });

  return (
    <Card className="overflow-hidden min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity Feed</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setLastUpdated(new Date())}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1 mt-2">
          {(["all", "tool_call", "error"] as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "tool_call" ? "Tool calls" : "Errors"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No activity yet. Waiting for agent events...
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto overflow-x-hidden">
            {filtered.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
