"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle, Plug, Search } from "lucide-react";

interface CatalogItem {
  slug: string;
  name: string;
  connected: boolean;
  logo_url?: string | null;
  description?: string | null;
  tools_count?: number | null;
}

/** Favicon fallback when Composio does not return a logo URL */
const ICON_FALLBACK: Record<string, { name: string; domain: string }> = {
  gmail: { name: "Gmail", domain: "gmail.com" },
  googlecalendar: { name: "Google Calendar", domain: "calendar.google.com" },
  googledrive: { name: "Google Drive", domain: "drive.google.com" },
  googledocs: { name: "Google Docs", domain: "docs.google.com" },
  googlesheets: { name: "Google Sheets", domain: "sheets.google.com" },
  notion: { name: "Notion", domain: "notion.so" },
  slack: { name: "Slack", domain: "slack.com" },
  github: { name: "GitHub", domain: "github.com" },
};

const SEARCH_DEBOUNCE_MS = 350;

function slugToLabel(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function IntegrationIcon({
  slug,
  logoUrl,
  label,
}: {
  slug: string;
  logoUrl?: string | null;
  label: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 rounded object-contain shrink-0"
      />
    );
  }
  const meta = ICON_FALLBACK[slug.toLowerCase()];
  if (meta) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://www.google.com/s2/favicons?domain=${meta.domain}&sz=64`}
        alt={meta.name}
        width={20}
        height={20}
        className="shrink-0"
      />
    );
  }
  return (
    <Plug
      className="h-5 w-5 text-muted-foreground shrink-0"
      aria-label={label}
    />
  );
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef<number>(0);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        params.set("limit", "48");
        const res = await fetch(`/api/integrations?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        setItems((data.items ?? []) as CatalogItem[]);
        setConnectedSlugs(
          new Set(
            (data.connected_slugs ?? []).map((s: string) => s.toLowerCase()),
          ),
        );
        setNextCursor(data.next_cursor ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("cursor", nextCursor);
      params.set("limit", "48");
      const res = await fetch(`/api/integrations?${params.toString()}`);
      const data = await res.json();
      const raw = (data.items ?? []) as CatalogItem[];
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.slug.toLowerCase()));
        const appended = raw.filter((r) => !seen.has(r.slug.toLowerCase()));
        return [...prev, ...appended];
      });
      setConnectedSlugs(
        new Set(
          (data.connected_slugs ?? []).map((s: string) => s.toLowerCase()),
        ),
      );
      setNextCursor(data.next_cursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [debouncedSearch, nextCursor, loadingMore]);

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

    if (pollRef.current) clearInterval(pollRef.current);
    pollStartedRef.current = 0;
    const target = slug.toLowerCase();
    const pollMs = 3 * 60 * 1000;
    pollRef.current = setInterval(async () => {
      try {
        if (pollStartedRef.current === 0) {
          pollStartedRef.current = performance.now();
        }
        const r = await fetch("/api/integrations/connection-state");
        const d = await r.json();
        const slugs: string[] = (d.connected_slugs ?? []).map((s: string) =>
          s.toLowerCase(),
        );
        setConnectedSlugs(new Set(slugs));
        const elapsed = performance.now() - pollStartedRef.current;
        if (slugs.includes(target) || elapsed > pollMs) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, 2000);
  }

  async function disconnect(slug: string) {
    await fetch("/api/integrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slug }),
    });
    setConnectedSlugs((prev) => {
      const n = new Set(prev);
      n.delete(slug.toLowerCase());
      return n;
    });
  }

  const fromCatalog = items.map((i) => ({
    ...i,
    connected: connectedSlugs.has(i.slug.toLowerCase()),
  }));
  const seenSlugs = new Set(fromCatalog.map((i) => i.slug.toLowerCase()));
  const syntheticConnected: CatalogItem[] = [];
  for (const s of connectedSlugs) {
    if (!seenSlugs.has(s)) {
      syntheticConnected.push({
        slug: s,
        name: slugToLabel(s),
        connected: true,
        logo_url: null,
        description: null,
        tools_count: null,
      });
    }
  }
  const gridItems = [...fromCatalog, ...syntheticConnected].sort(
    (a, b) => Number(b.connected) - Number(a.connected),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Search and connect Composio toolkits (OAuth). For the Python agent to load
          those tools over MCP, set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">COMPOSIO_TOOLKITS</code>{" "}
          to matching slugs (check each card; slug is shown from Composio), then restart
          the agent.
        </p>
      </div>

      <div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search Composio toolkits (name, slug, description)…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {gridItems.map((i) => (
                <Card
                  key={i.slug}
                  className={
                    i.connected ? "border-green-500/40 bg-green-500/5" : ""
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2">
                      <IntegrationIcon
                        slug={i.slug}
                        logoUrl={i.logo_url}
                        label={i.name}
                      />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm leading-tight">
                          {i.name}
                        </CardTitle>
                        <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                          {i.slug}
                        </p>
                      </div>
                    </div>
                    {i.description ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
                        {i.description}
                      </p>
                    ) : null}
                    {typeof i.tools_count === "number" ? (
                      <p className="text-[10px] text-muted-foreground">
                        {i.tools_count} tools
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {i.connected ? (
                      <>
                        <Badge className="w-full justify-center bg-green-500/15 text-green-600 border-green-500/30 gap-1 py-1.5">
                          <CheckCircle className="h-3 w-3" />
                          Connected
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => disconnect(i.slug)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={connecting === i.slug}
                        onClick={() => connect(i.slug)}
                      >
                        {connecting === i.slug ? "Connecting…" : "Connect"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {nextCursor ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => loadMore()}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
