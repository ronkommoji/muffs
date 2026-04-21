"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/preview");
      const data = (await res.json()) as { prompt?: string };
      setPreview(typeof data.prompt === "string" ? data.prompt : null);
    } catch {
      setPreview(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your assistant&apos;s identity, personality, and memory live in markdown files under the
          Muffs workspace (not in the database). Edit them in your editor or IDE.
        </p>
      </div>

      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>
          <code className="text-xs bg-muted px-1 py-0.5 rounded">workspace/memory/soul.md</code> —
          who the agent is (values, relationship).
        </li>
        <li>
          <code className="text-xs bg-muted px-1 py-0.5 rounded">workspace/memory/identity.md</code>{" "}
          — your name and assistant name (for the UI and prompt).
        </li>
        <li>
          <code className="text-xs bg-muted px-1 py-0.5 rounded">workspace/memory/personality.md</code>{" "}
          — tone, response length, boundaries.
        </li>
        <li>
          <code className="text-xs bg-muted px-1 py-0.5 rounded">workspace/memory/memory.md</code> —{" "}
          User Facts and Agent Notes.
        </li>
      </ul>

      <p className="text-sm text-muted-foreground">
        Default workspace root is{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">~/muffs-workspace</code> on macOS (see{" "}
        <code className="text-xs">MUFFS_WORKSPACE</code>). API keys and Sendblue credentials are read
        from environment variables only (not SQLite). Composio toolkits and session rotation can be
        set via <code className="text-xs">COMPOSIO_TOOLKITS</code>,{" "}
        <code className="text-xs">MUFFS_AUTO_ROTATE_SESSION</code>, or{" "}
        <code className="text-xs">workspace/user/preferences.json</code>.
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPreview()}>
            {loading ? "Loading…" : "Refresh system prompt preview"}
          </Button>
        </div>
        {preview !== null && (
          <pre className="text-xs bg-muted/50 border rounded-md p-3 max-h-[28rem] overflow-auto whitespace-pre-wrap">
            {preview}
          </pre>
        )}
      </div>
    </div>
  );
}
