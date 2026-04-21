"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatSessions } from "@/contexts/chat-sessions-context";

interface Routine {
  id: number;
  name: string;
  description: string | null;
  schedule_cron: string;
  timezone: string;
  enabled: number;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  system_prompt: string;
}

interface RoutineRun {
  id: number;
  routine_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  output_excerpt: string | null;
  error: string | null;
}

export default function RoutinesPage() {
  const { newChat } = useChatSessions();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [runs, setRuns] = useState<RoutineRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/routines");
    const data = (await res.json()) as Routine[];
    setRoutines(data);
    return data;
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routines;
    return routines.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.schedule_cron.includes(q)
    );
  }, [routines, search]);

  const selected = useMemo(
    () => routines.find((r) => r.id === selectedId) ?? null,
    [routines, selectedId]
  );

  useEffect(() => {
    if (routines.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId !== null && routines.some((r) => r.id === selectedId)) return;
    setSelectedId(routines[0].id);
  }, [routines, selectedId]);

  const loadRuns = useCallback(async (routineId: number) => {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/routines/${routineId}/runs`);
      if (res.ok) {
        const data = (await res.json()) as RoutineRun[];
        setRuns(data);
      } else {
        setRuns([]);
      }
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setRuns([]);
      return;
    }
    void loadRuns(selectedId);
  }, [selectedId, loadRuns]);

  async function toggle(id: number, enabled: boolean) {
    await fetch(`/api/routines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
    });
    load();
  }

  async function runNow(id: number) {
    setRunError(null);
    setRunningId(id);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunError(
          typeof data?.error === "string" ? data.error : "Run failed"
        );
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunningId(null);
      await load();
      if (selectedId === id) void loadRuns(id);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this routine?")) return;
    await fetch(`/api/routines/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function startAutomationCreator() {
    await newChat("automation_creator");
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm lg:flex-row">
        <div className="flex w-full lg:w-[min(100%,22rem)] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-border/60 bg-muted/20">
          <div className="p-4 border-b border-border/60 flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Routines</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Scheduled automations · SMS via Sendblue
              </p>
            </div>
            <Button size="sm" className="shrink-0 rounded-full" onClick={() => void startAutomationCreator()}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
          <div className="p-3 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search routines…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm bg-background/80"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-4">
                No routines match.{" "}
                <button
                  type="button"
                  className="underline text-foreground"
                  onClick={() => void startAutomationCreator()}
                >
                  Create in chat
                </button>{" "}
                or use the{" "}
                <Link href="/routines/new" className="underline">
                  form wizard
                </Link>
                .
              </p>
            )}
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border/40 hover:bg-muted/60 transition-colors",
                  selectedId === r.id && "bg-muted/80"
                )}
              >
                <div className="font-medium text-sm leading-snug line-clamp-2">{r.name}</div>
                <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                  {r.schedule_cron} · {r.timezone}
                </div>
                {r.description && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {r.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {runError && (
            <p className="text-sm text-destructive px-4 pt-3 shrink-0" role="alert">
              {runError}
            </p>
          )}
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground p-8">
              Select a routine or create one.
            </div>
          ) : (
            <>
              <div className="p-4 md:p-6 border-b border-border/60 flex flex-wrap items-start justify-between gap-3 shrink-0">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {selected.schedule_cron} ({selected.timezone}) · SMS delivery
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    {selected.enabled === 1 ? (
                      <Badge className="rounded-full bg-emerald-600/90 hover:bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full">
                        Paused
                      </Badge>
                    )}
                    {selected.last_run_at && (
                      <span className="text-xs text-muted-foreground">
                        Last run {new Date(selected.last_run_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => runNow(selected.id)}
                    disabled={runningId !== null}
                  >
                    {runningId === selected.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                  <div className="flex items-center gap-2 rounded-full border border-border/80 px-2 py-1">
                    <span className="text-xs text-muted-foreground">Enabled</span>
                    <Switch
                      checked={selected.enabled === 1}
                      onCheckedChange={(v) => toggle(selected.id, v)}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full" render={<Link href={`/routines/${selected.id}/edit`} />} nativeButton={false}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive rounded-full"
                    onClick={() => void remove(selected.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Instructions
                  </h3>
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {selected.system_prompt}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Delivery
                  </h3>
                  <p className="text-sm rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    Results are sent by SMS through Sendblue using{" "}
                    <code className="text-xs">SENDBLUE_TO_NUMBER</code> and related env vars.
                  </p>
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                    Run history
                  </h3>
                  {runsLoading ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </p>
                  ) : runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {runs.map((run) => (
                        <li
                          key={run.id}
                          className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              {run.started_at
                                ? new Date(run.started_at).toLocaleString()
                                : ""}
                            </span>
                            <Badge
                              variant={run.status === "success" ? "secondary" : "destructive"}
                              className="text-[10px]"
                            >
                              {run.status}
                            </Badge>
                          </div>
                          {run.output_excerpt && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-4 whitespace-pre-wrap">
                              {run.output_excerpt}
                            </p>
                          )}
                          {run.error && (
                            <p className="text-xs text-destructive mt-1">{run.error}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
