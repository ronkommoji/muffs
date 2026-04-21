"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ChatSessionRow {
  id: string;
  created_at: string;
  status: string;
  title: string | null;
  first_message: string | null;
  preview: string | null;
  preview_role: string | null;
  kind?: string | null;
  token_count: number;
  context_percentage: number | null;
  context_max_tokens: number | null;
}

type ChatSessionsContextValue = {
  sessions: ChatSessionRow[];
  refreshSessions: () => Promise<ChatSessionRow[]>;
  search: string;
  setSearch: (q: string) => void;
  activeSessionId: string | null;
  selectSession: (id: string) => void;
  newChat: (kind?: "general" | "automation_creator") => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
};

const ChatSessionsContext = createContext<ChatSessionsContextValue | null>(null);

export function ChatSessionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [search, setSearch] = useState("");

  const refreshSessions = useCallback(async () => {
    const res = await fetch("/api/messages");
    const data = (await res.json()) as ChatSessionRow[];
    setSessions(data);
    return data;
  }, []);

  useEffect(() => {
    void refreshSessions();
    const interval = setInterval(() => void refreshSessions(), 3000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  const activeSessionId = useMemo(() => {
    if (!pathname.startsWith("/chat")) return null;
    const s = searchParams.get("session");
    return s && s.trim() ? s.trim() : null;
  }, [pathname, searchParams]);

  const selectSession = useCallback(
    (id: string) => {
      router.push(`/chat?session=${encodeURIComponent(id)}`);
    },
    [router]
  );

  const newChat = useCallback(
    async (kind: "general" | "automation_creator" = "general") => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id: string };
      router.push(`/chat?session=${encodeURIComponent(data.id)}`);
      await refreshSessions();
      return data.id;
    },
    [router, refreshSessions]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      const next = await refreshSessions();
      const cur = searchParams.get("session");
      if (cur === id) {
        const fall = next.find((s) => s.id !== id)?.id;
        if (fall) router.push(`/chat?session=${encodeURIComponent(fall)}`);
        else router.push("/chat");
      }
    },
    [refreshSessions, searchParams, router]
  );

  const value = useMemo(
    () => ({
      sessions,
      refreshSessions,
      search,
      setSearch,
      activeSessionId,
      selectSession,
      newChat,
      deleteSession,
    }),
    [
      sessions,
      refreshSessions,
      search,
      activeSessionId,
      selectSession,
      newChat,
      deleteSession,
    ]
  );

  return (
    <ChatSessionsContext.Provider value={value}>{children}</ChatSessionsContext.Provider>
  );
}

export function useChatSessions() {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx)
    throw new Error("useChatSessions must be used within ChatSessionsProvider");
  return ctx;
}
