"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";

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
}

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/routines");
    setRoutines(await res.json());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

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
      load();
    }
  }

  async function remove(id: number) {
    await fetch(`/api/routines/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Routines</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scheduled tasks Muffs runs automatically
          </p>
        </div>
        <Button render={<Link href="/routines/new" />} nativeButton={false}>
          <Plus className="h-4 w-4 mr-1.5" />
          New routine
        </Button>
      </div>

      {runError && (
        <p className="text-sm text-destructive" role="alert">
          {runError}
        </p>
      )}

      {routines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No routines yet.{" "}
          <Link href="/routines/new" className="underline">
            Create one.
          </Link>
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routines.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div>{r.name}</div>
                  {r.description && (
                    <div className="text-xs text-muted-foreground">
                      {r.description}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.schedule_cron}
                  <div className="text-muted-foreground">{r.timezone}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {r.last_run_at
                    ? new Date(r.last_run_at).toLocaleString()
                    : "Never"}
                </TableCell>
                <TableCell>
                  {runningId === r.id ? (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running
                    </Badge>
                  ) : r.last_run_status ? (
                    <Badge
                      variant={
                        r.last_run_status === "success"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {r.last_run_status}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.enabled === 1}
                    onCheckedChange={(v) => toggle(r.id, v)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => runNow(r.id)}
                      disabled={runningId !== null}
                      title={
                        runningId === r.id ? "Running…" : "Run now"
                      }
                      aria-busy={runningId === r.id}
                    >
                      {runningId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      render={
                        <Link
                          href={`/routines/${r.id}/edit`}
                          aria-label="Edit routine"
                        />
                      }
                      nativeButton={false}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove(r.id)}
                      disabled={runningId === r.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
