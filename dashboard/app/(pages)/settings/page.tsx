"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";

const APP_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testError, setTestError] = useState("");
  const [autoRotate, setAutoRotate] = useState(true);
  const [copied, setCopied] = useState(false);

  async function loadSettings() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setAutoRotate(data.auto_rotate_session !== "false");
  }

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    const res = await fetch("/api/settings/preview");
    const data = await res.json();
    setPreview(data.prompt ?? "");
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
    loadPreview();
  }, [loadPreview]);

  function set(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, auto_rotate_session: autoRotate ? "true" : "false" }),
    });
    setSaving(false);
    setSaved(true);
    loadPreview();
    setTimeout(() => setSaved(false), 2000);
  }

  async function testSendblue() {
    setTestStatus("testing");
    setTestError("");
    const res = await fetch("/api/settings/sendblue-test", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setTestStatus("ok");
    } else {
      setTestStatus("fail");
      setTestError(data.error ?? "Unknown error");
    }
    setTimeout(() => setTestStatus("idle"), 6000);
  }

  const webhookUrl = `${APP_URL}/api/webhook/sendblue`;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Tabs defaultValue="personality">
        <TabsList>
          <TabsTrigger value="personality">Personality</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="sendblue">Sendblue</TabsTrigger>
        </TabsList>

        {/* Personality tab */}
        <TabsContent value="personality" className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label>Personality notes</Label>
            <Textarea
              value={settings.personality_notes ?? ""}
              onChange={(e) => set("personality_notes", e.target.value)}
              placeholder="Be a bit more casual with me in the mornings."
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Response style</Label>
            <Select
              value={settings.response_style ?? "Concise"}
              onValueChange={(v) => v && set("response_style", v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Concise">Concise</SelectItem>
                <SelectItem value="Balanced">Balanced</SelectItem>
                <SelectItem value="Detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tone adjustments</Label>
            <Textarea
              value={settings.tone_adjustments ?? ""}
              onChange={(e) => set("tone_adjustments", e.target.value)}
              placeholder="You can use light humor but keep it dry."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Off-limits topics</Label>
            <Textarea
              value={settings.off_limits_topics ?? ""}
              onChange={(e) => set("off_limits_topics", e.target.value)}
              placeholder="Things Muffs should never bring up unprompted."
              rows={2}
            />
          </div>

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                What Muffs is reading
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <pre className="text-xs whitespace-pre-wrap font-mono max-h-64 overflow-auto">
                  {preview}
                </pre>
              )}
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4 mr-1.5" />
            ) : null}
            {saved ? "Saved" : "Save changes"}
          </Button>
        </TabsContent>

        {/* Memory tab */}
        <TabsContent value="memory" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Memory is stored in{" "}
            <code className="font-mono text-xs bg-muted px-1 rounded">
              agent/memory/memory.md
            </code>
            . Edit the file directly or use the Settings page below.
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">User Facts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                Set by /setup. Muffs reads but does not overwrite this section.
                Edit the memory.md file directly to change these.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Agent Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Notes Muffs has written to herself. These accumulate automatically
                over time. Edit memory.md directly to correct or remove entries.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session tab */}
        <TabsContent value="session" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How sessions work</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Each conversation with Muffs runs inside a session. Sessions
                have a context window limit — the amount of conversation history
                Claude can hold at once.
              </p>
              <p>
                When the limit approaches, Muffs can automatically start a new
                session so you never hit a wall. You can also start fresh any
                time with{" "}
                <code className="font-mono text-xs bg-muted px-1 rounded">
                  /new
                </code>
                .
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">Auto-rotate session</div>
              <div className="text-xs text-muted-foreground">
                Start a new session when context window is near full (~90%)
              </div>
            </div>
            <Switch
              checked={autoRotate}
              onCheckedChange={(v) => {
                setAutoRotate(v);
                fetch("/api/settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ auto_rotate_session: v ? "true" : "false" }),
                });
              }}
            />
          </div>
        </TabsContent>

        {/* Sendblue tab */}
        <TabsContent value="sendblue" className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label>API Key ID</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={settings.sendblue_api_key ?? ""}
                onChange={(e) => set("sendblue_api_key", e.target.value)}
                placeholder="sb-api-key-id"
              />
              <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>API Secret Key</Label>
            <Input
              type={showKey ? "text" : "password"}
              value={settings.sendblue_api_secret ?? ""}
              onChange={(e) => set("sendblue_api_secret", e.target.value)}
              placeholder="sb-api-secret-key"
            />
          </div>
          <div className="space-y-1.5">
            <Label>From number (Sendblue number)</Label>
            <Input
              value={settings.sendblue_from ?? ""}
              onChange={(e) => set("sendblue_from", e.target.value)}
              placeholder="+15551234567"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To number (your iPhone)</Label>
            <Input
              value={settings.sendblue_to ?? ""}
              onChange={(e) => set("sendblue_to", e.target.value)}
              placeholder="+15559876543"
            />
          </div>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">Webhook setup</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p>
                <strong>Step 1.</strong> Copy your webhook URL:
              </p>
              <div className="flex items-center gap-2 bg-background rounded border p-2">
                <code className="text-xs flex-1 truncate">{webhookUrl}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p>
                <strong>Step 2.</strong> Go to your Sendblue dashboard → Settings
                → Webhooks
              </p>
              <p>
                <strong>Step 3.</strong> Paste the URL into the &quot;Inbound
                Message Webhook&quot; field and save.
              </p>
              <p>
                <strong>Step 4.</strong> Click Test Connection below to verify.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={testSendblue}
                  disabled={testStatus === "testing"}
                >
                  {testStatus === "testing" && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Test Connection
                </Button>
                {testStatus === "ok" && (
                  <Badge variant="secondary">Connected</Badge>
                )}
                {testStatus === "fail" && (
                  <div className="flex flex-col gap-1">
                    <Badge variant="destructive">Failed</Badge>
                    {testError && (
                      <p className="text-xs text-destructive max-w-xs">{testError}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>
            {saved ? <Check className="h-4 w-4 mr-1.5" /> : null}
            {saved ? "Saved" : "Save credentials"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
