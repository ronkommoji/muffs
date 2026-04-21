"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SlashCommandMenu,
  filterSlashCommands,
  getSlashQuery,
} from "@/components/chat/slash-command-menu";
import { sessionDisplayName } from "@/lib/session-label";
import { stripSimpleMarkdown } from "@/lib/plain-text";
import { SessionContextMiniRing } from "@/components/chat/session-context-mini";

function TypingIndicator() {
  return (
    <div className="flex mb-3 justify-start">
      <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

interface Session {
  id: string;
  created_at: string;
  status: string;
  title: string | null;
  first_message: string | null;
  preview: string | null;
  preview_role: string | null;
  token_count: number;
  context_percentage: number | null;
  context_max_tokens: number | null;
}

interface Message {
  id: number;
  session_id: string;
  role: string;
  content: string;
  source: string;
  created_at: string;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const lastAssistantIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Negative id = optimistic until server list includes the same user text */
  const optimisticUserRef = useRef<Message | null>(null);

  const activeSessionId = useMemo(() => {
    if (selectedSessionId && sessions.some((s) => s.id === selectedSessionId)) {
      return selectedSessionId;
    }
    return sessions[0]?.id ?? null;
  }, [sessions, selectedSessionId]);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/messages");
    const data: Session[] = await res.json();
    setSessions(data);
    return data;
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadSessions();
    }, 0);
    const interval = setInterval(loadSessions, 3000);
    return () => {
      window.clearTimeout(id);
      clearInterval(interval);
    };
  }, [loadSessions]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/messages?session_id=${sessionId}`);
    const data: Message[] = await res.json();
    const pending = optimisticUserRef.current;
    if (pending && pending.session_id !== sessionId) {
      optimisticUserRef.current = null;
    }
    const p = optimisticUserRef.current;
    const serverHasUser = (rows: Message[], text: string) =>
      rows.some(
        (m) => m.id > 0 && m.role === "user" && m.content === text
      );
    let next: Message[];
    if (p && p.session_id === sessionId && !serverHasUser(data, p.content)) {
      next = [...data, p].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else {
      next = data;
      if (p && p.session_id === sessionId && serverHasUser(data, p.content)) {
        optimisticUserRef.current = null;
      }
    }
    setMessages(next);
    const lastAssistant = [...next].reverse().find((m) => m.role === "assistant");
    if (lastAssistant && lastAssistant.id !== lastAssistantIdRef.current) {
      lastAssistantIdRef.current = lastAssistant.id;
      setIsTyping(false);
    }
  }, []);

  useEffect(() => {
    optimisticUserRef.current = null;
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    const id = window.setTimeout(() => {
      void loadMessages(activeSessionId);
    }, 0);
    const interval = setInterval(() => loadMessages(activeSessionId), 3000);
    return () => {
      window.clearTimeout(id);
      clearInterval(interval);
    };
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const slashQuery = getSlashQuery(input);
  const slashFiltered =
    slashQuery !== null && !slashDismissed
      ? filterSlashCommands(slashQuery)
      : [];
  const slashMenuOpen =
    slashQuery !== null && !slashDismissed && slashFiltered.length > 0;

  const effectiveSlashIndex = useMemo(() => {
    if (slashFiltered.length === 0) return 0;
    return Math.min(Math.max(0, slashIndex), slashFiltered.length - 1);
  }, [slashIndex, slashFiltered.length]);

  async function newSession() {
    const res = await fetch("/api/sessions", { method: "POST" });
    const data = (await res.json()) as { id: string };
    await loadSessions();
    setSelectedSessionId(data.id);
  }

  async function deleteSession(id: string) {
    if (!window.confirm("Delete this session and all its messages?")) return;
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    await loadSessions();
  }

  function applySlashCommand(cmd: string) {
    setInput(`${cmd} `);
    setSlashDismissed(true);
  }

  async function send() {
    if (!input.trim() || !activeSessionId || sending) return;
    if (slashMenuOpen) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    setSlashDismissed(false);

    const optimistic: Message = {
      id: -Date.now(),
      session_id: activeSessionId,
      role: "user",
      content,
      source: "dashboard",
      created_at: new Date().toISOString(),
    };
    optimisticUserRef.current = optimistic;
    setMessages((prev) =>
      [...prev.filter((m) => m.id >= 0), optimistic].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    );

    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 90_000);

    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: activeSessionId, content }),
    }).catch(() => {
      setIsTyping(false);
      optimisticUserRef.current = null;
      void loadMessages(activeSessionId);
    });
    setSending(false);
  }

  function onInputChange(value: string) {
    setSlashDismissed(false);
    setSlashIndex(0);
    setInput(value);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (slashMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) =>
          Math.min(i + 1, Math.max(0, slashFiltered.length - 1))
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = slashFiltered[effectiveSlashIndex];
        if (item) applySlashCommand(item.command);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      send();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border min-h-0">
        <div className="flex shrink-0 items-center justify-between border-b p-3">
          <span className="text-sm font-medium">Sessions</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newSession}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {sessions.map((s) => {
            const label = sessionDisplayName(s);
            return (
            <div
              key={s.id}
              className={cn(
                "flex items-stretch border-b text-sm hover:bg-muted/80 transition-colors",
                activeSessionId === s.id && "bg-muted"
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedSessionId(s.id)}
                className="flex-1 text-left px-3 py-2.5 min-w-0"
              >
                <div className="text-sm font-medium leading-snug truncate">
                  {label}
                </div>
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex mb-3",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {m.role === "assistant"
                  ? stripSimpleMarkdown(m.content)
                  : m.content}
                <div className="text-xs opacity-60 mt-1">
                  {new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        <div className="flex shrink-0 gap-2 border-t p-3">
          <div className="relative flex-1 min-w-0">
            <SlashCommandMenu
              open={slashMenuOpen}
              items={slashFiltered}
              selectedIndex={effectiveSlashIndex}
            />
            <Input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Message Muffs..."
              onKeyDown={onInputKeyDown}
              disabled={!activeSessionId || sending}
            />
          </div>
          <Button
            onClick={send}
            disabled={
              !activeSessionId || sending || !input.trim() || slashMenuOpen
            }
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
