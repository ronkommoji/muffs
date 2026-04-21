"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionDisplayName } from "@/lib/session-label";
import { SessionContextMiniRing } from "@/components/chat/session-context-mini";
import { useChatSessions } from "@/contexts/chat-sessions-context";
import { useMemo } from "react";

export function ChatSessionList() {
  const {
    sessions,
    search,
    setSearch,
    activeSessionId,
    selectSession,
    deleteSession,
  } = useChatSessions();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const label = sessionDisplayName(s).toLowerCase();
      const prev = (s.preview ?? "").toLowerCase();
      return label.includes(q) || prev.includes(q);
    });
  }, [sessions, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm bg-muted/40 border-transparent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-muted/20">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-6 text-center">No chats yet.</p>
        )}
        {filtered.map((s) => {
          const label = sessionDisplayName(s);
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-stretch border-b border-border/50 text-sm last:border-b-0 hover:bg-muted/80 transition-colors",
                activeSessionId === s.id && "bg-muted"
              )}
            >
              <button
                type="button"
                onClick={() => selectSession(s.id)}
                className="flex-1 text-left px-3 py-2.5 min-w-0"
              >
                <div className="text-sm font-medium leading-snug truncate">{label}</div>
                {s.preview && s.preview.trim() !== label.trim() && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {s.preview}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(s.created_at).toLocaleDateString()}
                </div>
              </button>
              <div className="flex items-center gap-0.5 pr-1 shrink-0">
                <SessionContextMiniRing
                  percentage={s.context_percentage}
                  totalTokens={s.token_count}
                  maxTokens={s.context_max_tokens}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Delete session"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSession(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
