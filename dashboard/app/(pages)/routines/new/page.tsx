"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

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

const RECURRENCE_OPTIONS = [
  { label: "Every day", cron: "0 8 * * *" },
  { label: "Weekdays", cron: "0 8 * * 1-5" },
  { label: "Every Monday", cron: "0 8 * * 1" },
  { label: "Custom cron", cron: "custom" },
];

type Step = 1 | 2 | 3 | 4 | 5;

export default function NewRoutinePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [time, setTime] = useState("08:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [recurrence, setRecurrence] = useState(RECURRENCE_OPTIONS[0].cron);
  const [customCron, setCustomCron] = useState("");
  const [intent, setIntent] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  function getCron(): string {
    if (recurrence === "custom") return customCron;
    const [hours, minutes] = time.split(":").map(Number);
    const base = RECURRENCE_OPTIONS.find((r) => r.cron === recurrence)!.cron;
    return base.replace(/^0 8/, `${minutes} ${hours}`);
  }

  function getScheduleDescription(): string {
    const option = RECURRENCE_OPTIONS.find((r) => r.cron === recurrence);
    return `${option?.label ?? "Custom"} at ${time} ${timezone}`;
  }

  async function generatePrompt() {
    setGenerating(true);
    const res = await fetch("/api/routines/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_intent: intent,
        schedule_description: getScheduleDescription(),
      }),
    });
    const data = await res.json();
    setGeneratedPrompt(data.prompt ?? "");
    setGenerating(false);
    setStep(3);
  }

  async function save() {
    setSaving(true);
    await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || intent.slice(0, 50),
        description: intent,
        schedule_cron: getCron(),
        timezone,
        system_prompt: generatedPrompt,
      }),
    });
    setSaving(false);
    router.push("/routines");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">New routine</h1>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1 — Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
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
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r.cron} value={r.cron}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recurrence === "custom" && (
              <div className="space-y-1.5">
                <Label>Cron expression</Label>
                <Input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 8 * * *"
                  className="font-mono"
                />
              </div>
            )}
            <Button className="w-full" onClick={() => setStep(2)}>
              Next <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2 — Intent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>What should Muffs do?</Label>
              <Textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Check my inbox, summarize unread emails, and send me the top 3 priorities."
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!intent.trim() || generating}
                onClick={generatePrompt}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Generating prompt...
                  </>
                ) : (
                  <>
                    Generate prompt <ArrowRight className="h-4 w-4 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 3 — Review prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Muffs generated this system prompt. Edit it if needed.
            </p>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(4)}>
                Looks good <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 4 — Name it</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Routine name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={intent.slice(0, 50)}
              />
            </div>
            <div className="text-sm space-y-1">
              <div className="text-muted-foreground">
                Runs:{" "}
                <span className="font-mono text-foreground">{getCron()}</span>{" "}
                ({timezone})
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button className="flex-1" disabled={saving} onClick={save}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve & schedule
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
