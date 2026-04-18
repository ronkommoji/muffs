"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle, Plug, Search } from "lucide-react";

interface Integration {
  slug: string;
  name: string;
  connected: boolean;
}

// Maps Composio toolkit slug → { displayName, clearbit domain }
const INTEGRATION_META: Record<string, { name: string; domain: string }> = {
  // Google
  "gmail":              { name: "Gmail",           domain: "gmail.com" },
  "googlecalendar":     { name: "Google Calendar", domain: "calendar.google.com" },
  "googledrive":        { name: "Google Drive",    domain: "drive.google.com" },
  "googledocs":         { name: "Google Docs",     domain: "docs.google.com" },
  "googlesheets":       { name: "Google Sheets",   domain: "sheets.google.com" },
  // Productivity
  "notion":             { name: "Notion",          domain: "notion.so" },
  "slack":              { name: "Slack",           domain: "slack.com" },
  "outlook":            { name: "Outlook",         domain: "outlook.com" },
  "linear":             { name: "Linear",          domain: "linear.app" },
  "jira":               { name: "Jira",            domain: "atlassian.com" },
  "trello":             { name: "Trello",          domain: "trello.com" },
  "airtable":           { name: "Airtable",        domain: "airtable.com" },
  // Dev
  "github":             { name: "GitHub",          domain: "github.com" },
  "supabase":           { name: "Supabase",        domain: "supabase.com" },
  // CRM / Marketing
  "hubspot":            { name: "HubSpot",         domain: "hubspot.com" },
  // Social / Media
  "twitter":            { name: "X (Twitter)",     domain: "twitter.com" },
  "linkedin":           { name: "LinkedIn",        domain: "linkedin.com" },
  "youtube":            { name: "YouTube",         domain: "youtube.com" },
  "discord":            { name: "Discord",         domain: "discord.com" },
  "spotify":            { name: "Spotify",         domain: "spotify.com" },
  // AI / Search
  "perplexityai":       { name: "Perplexity AI",   domain: "perplexity.ai" },
  "serpapi":            { name: "SerpAPI",          domain: "serpapi.com" },
  "firecrawl":          { name: "Firecrawl",       domain: "firecrawl.dev" },
  "composio":           { name: "Composio",        domain: "composio.dev" },
  // More
  "figma":              { name: "Figma",           domain: "figma.com" },
  "zoom":               { name: "Zoom",            domain: "zoom.us" },
  "dropbox":            { name: "Dropbox",         domain: "dropbox.com" },
  "stripe":             { name: "Stripe",          domain: "stripe.com" },
  // Legacy hyphenated slugs
  "google-calendar":    { name: "Google Calendar", domain: "calendar.google.com" },
  "google-drive":       { name: "Google Drive",    domain: "drive.google.com" },
};

// Canonical list shown in the grid (Composio-style slugs only, no legacy)
const KNOWN_INTEGRATIONS = [
  "gmail", "googlecalendar", "googledrive", "googledocs", "googlesheets",
  "notion", "slack", "outlook", "linear", "jira", "trello", "airtable",
  "github", "supabase", "hubspot",
  "twitter", "linkedin", "youtube", "discord", "spotify",
  "perplexityai",
  "figma", "zoom", "dropbox", "stripe",
];

function IntegrationIcon({ slug }: { slug: string }) {
  const meta = INTEGRATION_META[slug];
  if (!meta) return <Plug className="h-5 w-5 text-muted-foreground" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${meta.domain}&sz=64`}
      alt={meta.name}
      width={20}
      height={20}
    />
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/integrations");
    const data = await res.json();
    setIntegrations(data.items ?? []);
    setLoading(false);
    return data.items ?? [] as Integration[];
  }

  useEffect(() => {
    load();
  }, []);

  async function connect(slug: string) {
    setConnecting(slug);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug }),
    });
    const data = await res.json();
    if (data.redirect_url) {
      window.open(data.redirect_url, "_blank");
    }
    setConnecting(null);

    // Poll every 2s until the integration shows as connected (up to 3 min)
    if (pollRef.current) clearInterval(pollRef.current);
    const deadline = Date.now() + 3 * 60 * 1000;
    pollRef.current = setInterval(async () => {
      const res = await fetch("/api/integrations");
      const d = await res.json();
      const items: Integration[] = d.items ?? [];
      setIntegrations(items);
      const connected = items.find((i) => i.slug === slug)?.connected;
      if (connected || Date.now() > deadline) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setLoading(false);
      }
    }, 2000);
  }

  async function disconnect(slug: string) {
    await fetch("/api/integrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slug }),
    });
    load();
  }

  const connected = integrations.filter((i) => i.connected);
  const all = [
    ...new Set([...integrations.map((i) => i.slug), ...KNOWN_INTEGRATIONS]),
  ]
    .filter((slug) =>
      search
        ? slug.toLowerCase().includes(search.toLowerCase()) ||
          (INTEGRATION_META[slug]?.name ?? "").toLowerCase().includes(search.toLowerCase())
        : true
    )
    .map((slug) => ({
      slug,
      name: INTEGRATION_META[slug]?.name ?? slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      connected: integrations.find((i) => i.slug === slug)?.connected ?? false,
    }))
    .sort((a, b) => Number(b.connected) - Number(a.connected));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect apps and services for Muffs to use
        </p>
      </div>

      {connected.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Connected
          </h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {connected.map((i) => (
              <Card key={i.slug}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IntegrationIcon slug={i.slug} />
                      <CardTitle className="text-sm">{i.name}</CardTitle>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => disconnect(i.slug)}
                  >
                    Disconnect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {all.map((i) => (
              <Card key={i.slug} className={i.connected ? "border-green-500/40 bg-green-500/5" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IntegrationIcon slug={i.slug} />
                    <CardTitle className="text-sm">{i.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {i.connected ? (
                    <Badge className="bg-green-500/15 text-green-600 border-green-500/30 gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={connecting === i.slug}
                      onClick={() => connect(i.slug)}
                    >
                      {connecting === i.slug ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
