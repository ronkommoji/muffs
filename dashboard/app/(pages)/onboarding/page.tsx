"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Loader2 } from "lucide-react";
import { getPublicAppUrl } from "@/lib/config";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [toolkits, setToolkits] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : getPublicAppUrl();
  const webhookUrl = `${appUrl}/api/webhook/sendblue`;

  async function finish() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName,
          agentName,
          timezone,
          composioToolkits: toolkits,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "Could not save onboarding.");
        setSaving(false);
        return;
      }
      router.replace("/overview");
      router.refresh();
    } catch {
      alert("Network error — try again.");
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-6 py-10">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Step {step + 1} of 5</p>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Muffs</h1>
      </div>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Local setup</CardTitle>
            <CardDescription>
              Clone the repo, create a Python virtualenv, run{" "}
              <code className="text-xs bg-muted px-1 rounded">python -m pip install -e .</code> then{" "}
              <code className="text-xs bg-muted px-1 rounded">muffs-setup</code> once (or{" "}
              <code className="text-xs bg-muted px-1 rounded">make install</code>
              ), copy{" "}
              <code className="text-xs bg-muted px-1 rounded">.env.example</code> to{" "}
              <code className="text-xs bg-muted px-1 rounded">.env</code>. You will need at least:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <code className="text-foreground/90">ANTHROPIC_API_KEY</code> — Claude Agent SDK
              </li>
              <li>
                <code className="text-foreground/90">COMPOSIO_API_KEY</code> — tool integrations
              </li>
            </ul>
            <p>
              Initialize the database (see README), then run <code className="text-xs">muffs-agent</code> to
              start both the API and dashboard. Composio and Sendblue can be wired in the next steps.
            </p>
            <Button className="w-full" onClick={() => setStep(1)}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>You & your agent</CardTitle>
            <CardDescription>
              These names are stored in <code className="text-xs">memory.md</code> and{" "}
              <code className="text-xs">soul.md</code> and used in the system prompt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="userName">Your name</Label>
              <Input
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Alex"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agentName">What should we call the agent?</Label>
              <Input
                id="agentName"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Muffs"
                autoComplete="off"
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
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!userName.trim() || !agentName.trim()}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Composio connectors</CardTitle>
            <CardDescription>
              The agent mounts Composio toolkits as MCP tools (same project as your{" "}
              <code className="text-xs">COMPOSIO_API_KEY</code>). Use the Composio CLI to connect
              accounts locally, then list the toolkit slugs you want here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed space-y-2">
              <p className="text-muted-foreground">Terminal — install and authenticate:</p>
              <p>npm install -g @composio/cli</p>
              <p>composio login</p>
              <p>composio link gmail</p>
              <p className="text-muted-foreground pt-1">
                Repeat <code className="text-foreground">composio link &lt;slug&gt;</code> for each
                service (see Dashboard → Integrations for OAuth fallback).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toolkits">Toolkit slugs for this agent</Label>
              <Textarea
                id="toolkits"
                value={toolkits}
                onChange={(e) => setToolkits(e.target.value)}
                placeholder="gmail,googlecalendar"
                rows={2}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated, no spaces (e.g. <code>slack,github,notion</code>). Saved to the
                shared database — the Python process also reads{" "}
                <code className="text-xs">COMPOSIO_TOOLKITS</code> from the environment when set.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Sendblue (optional)</CardTitle>
            <CardDescription>
              For iMessage, deploy this dashboard to a public HTTPS URL (VPS, Fly.io, etc.), add your
              Sendblue credentials under Settings, then register the webhook below in the Sendblue
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2 rounded-md border p-2 font-mono text-xs break-all">
              <span className="flex-1">{webhookUrl}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(webhookUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-muted-foreground">
              Set <code className="text-xs">NEXT_PUBLIC_APP_URL</code> to this origin on your server so
              URLs stay correct. Local dev usually needs an ngrok or Cloudflare tunnel because Sendblue
              must POST HTTPS to you.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(4)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Start the agent</CardTitle>
            <CardDescription>
              From the repo root (with venv active), run <code className="text-xs">muffs-agent</code> once.
              It starts the Python API on port <strong>8141</strong> and this dashboard on{" "}
              <strong>3141</strong> by default (uncommon ports to avoid clashes with other apps).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">muffs-agent</div>
            <p className="text-muted-foreground">
              Advanced: <code className="text-xs">muffs-agent --agent-only</code> or{" "}
              <code className="text-xs">--dashboard-only</code>; override ports with{" "}
              <code className="text-xs">MUFFS_AGENT_PORT</code> / <code className="text-xs">MUFFS_DASHBOARD_PORT</code>.
            </p>
            <Button className="w-full" disabled={saving} onClick={() => void finish()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                "Save & go to dashboard"
              )}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(3)}>
              Back
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              After this, you can still edit memory in{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
