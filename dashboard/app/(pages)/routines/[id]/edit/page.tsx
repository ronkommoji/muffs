"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Routine } from "@/lib/db";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

export default function EditRoutinePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleCron, setScheduleCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      setLoaded(false);
      setLoading(true);
      try {
        const res = await fetch(`/api/routines/${id}`);
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(res.status === 404 ? "Routine not found." : "Failed to load.");
          }
          return;
        }
        const r = (await res.json()) as Routine;
        if (cancelled) return;
        setName(r.name);
        setDescription(r.description ?? "");
        setScheduleCron(r.schedule_cron);
        setTimezone(r.timezone ?? "UTC");
        setSystemPrompt(r.system_prompt);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadError("Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/routines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          schedule_cron: scheduleCron.trim(),
          timezone,
          system_prompt: systemPrompt,
        }),
      });
      if (!res.ok) {
        setLoadError("Could not save changes.");
        setSaving(false);
        return;
      }
      router.push("/routines");
    } catch {
      setLoadError("Could not save changes.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center gap-2 text-muted-foreground py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading routine…
      </div>
    );
  }

  if (!loading && !loaded && loadError) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-destructive">{loadError}</p>
        <Button variant="outline" render={<Link href="/routines" />} nativeButton={false}>
          Back to routines
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Edit routine</h1>
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routine details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cron">Cron schedule</Label>
            <Input
              id="cron"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              className="font-mono text-sm"
              placeholder="0 8 * * *"
            />
            <p className="text-xs text-muted-foreground">
              Standard 5-field cron; pair with timezone below.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prompt">System prompt</Label>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              render={<Link href="/routines" />}
              nativeButton={false}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={saving || !name.trim() || !scheduleCron.trim()}
              onClick={save}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
