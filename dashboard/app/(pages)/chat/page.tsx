"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Puzzle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  SlashCommandMenu,
  filterSlashCommands,
  getSlashQuery,
} from "@/components/chat/slash-command-menu";
import { stripSimpleMarkdown } from "@/lib/plain-text";
import {
  parseRoutineProposal,
  isRoutineProposalContent,
  type RoutineProposalPayload,
} from "@/lib/routine-proposal";
import { useChatSessions } from "@/contexts/chat-sessions-context";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ChatEmptyState,
  type ChatSuggestion,
} from "@/components/chat/chat-empty-state";

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

interface Message {
  id: number;
  session_id: string;
  role: string;
  content: string;
  source: string;
  created_at: string;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");

  const {
    sessions,
    refreshSessions,
    selectSession,
    newChat,
    activeSessionId,
  } = useChatSessions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const lastAssistantIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const optimisticUserRef = useRef<Message | null>(null);

  const [proposalOpen, setProposalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState<RoutineProposalPayload | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);

  const sessionKind = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId)?.kind ?? "general";
  }, [sessions, activeSessionId]);

  const isRoutineBuilderMode = sessionKind === "automation_creator";

  const exitRoutineBuilderMode = useCallback(async () => {
    if (!activeSessionId || sessionKind !== "automation_creator") return;
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(activeSessionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "general" }),
      }
    );
    if (res.ok) await refreshSessions();
  }, [activeSessionId, sessionKind, refreshSessions]);

  useEffect(() => {
    if (sessionParam) return;
    let cancelled = false;
    void (async () => {
      const list = await refreshSessions();
      if (cancelled) return;
      if (list.length > 0) selectSession(list[0].id);
      else await newChat("general");
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionParam, refreshSessions, selectSession, newChat]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/messages?session_id=${sessionId}`);
    const data: Message[] = await res.json();
    const pending = optimisticUserRef.current;
    if (pending && pending.session_id !== sessionId) {
      optimisticUserRef.current = null;
    }
    const p = optimisticUserRef.current;
    const serverHasUser = (rows: Message[], text: string) =>
      rows.some((m) => m.id > 0 && m.role === "user" && m.content === text);
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
    slashQuery !== null && !slashDismissed ? filterSlashCommands(slashQuery) : [];
  const slashMenuOpen =
    slashQuery !== null && !slashDismissed && slashFiltered.length > 0;

  const effectiveSlashIndex = useMemo(() => {
    if (slashFiltered.length === 0) return 0;
    return Math.min(Math.max(0, slashIndex), slashFiltered.length - 1);
  }, [slashIndex, slashFiltered.length]);

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
    if (
      e.key === "Backspace" &&
      isRoutineBuilderMode &&
      !input.trim() &&
      !slashMenuOpen
    ) {
      e.preventDefault();
      void exitRoutineBuilderMode();
      return;
    }
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
      void send();
    }
  }

  function openProposalFromMessage(content: string) {
    const p = parseRoutineProposal(content);
    if (p) {
      setModalDraft(p);
      setProposalOpen(true);
    }
  }

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSuggestion(s: ChatSuggestion) {
    if (s.mode === "automation") {
      if (sessionKind !== "automation_creator") {
        const id = await newChat("automation_creator");
        if (!id) return;
      }
      setInput(s.draft);
    } else {
      setInput(s.draft);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function saveRoutineFromModal() {
    if (!modalDraft) return;
    setSavingRoutine(true);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modalDraft.name,
          description: modalDraft.description,
          schedule_cron: modalDraft.schedule_cron,
          timezone: modalDraft.timezone,
          system_prompt: modalDraft.system_prompt,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to create routine");
      }
      setProposalOpen(false);
      setModalDraft(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingRoutine(false);
    }
  }

  const showThread = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {!showThread && activeSessionId && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatEmptyState
              isAutomationSession={sessionKind === "automation_creator"}
              onPickSuggestion={handleSuggestion}
            />
          </div>
        )}
        {!activeSessionId && (
          <div className="flex min-h-0 flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {showThread && (
          <div className="p-4 md:px-8 md:py-6">
        {messages.map((m) => {
          if (m.role === "assistant" && isRoutineProposalContent(m.content)) {
            const parsed = parseRoutineProposal(m.content);
            return (
              <div key={m.id} className="flex mb-4 justify-start">
                <div className="max-w-[min(100%,32rem)] rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
                  <p className="font-medium text-foreground">Routine proposal</p>
                  <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                    {parsed?.name ?? "Automation"}
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-3"
                    onClick={() => openProposalFromMessage(m.content)}
                  >
                    Open
                  </Button>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {new Date(m.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={cn(
                "flex mb-3",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[min(85%,36rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border/80 text-foreground"
                )}
              >
                {m.role === "assistant"
                  ? stripSimpleMarkdown(m.content)
                  : m.content}
                <div className="text-[10px] opacity-70 mt-1.5">
                  {new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/95 p-3 backdrop-blur-sm md:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-border/80 bg-muted/30 shadow-inner">
            {isRoutineBuilderMode && (
              <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm"
                  title="Routine builder — Backspace clears when input is empty"
                >
                  <Puzzle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  Routine builder
                </span>
                <button
                  type="button"
                  className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Exit routine builder"
                  onClick={() => void exitRoutineBuilderMode()}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="relative">
              <SlashCommandMenu
                open={slashMenuOpen}
                items={slashFiltered}
                selectedIndex={effectiveSlashIndex}
              />
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                placeholder="Ask anything — Message Muffs…"
                onKeyDown={onInputKeyDown}
                disabled={!activeSessionId || sending}
                className={cn(
                  "min-h-12 border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
                  isRoutineBuilderMode ? "rounded-t-none rounded-b-2xl" : "rounded-2xl"
                )}
              />
            </div>
          </div>
          <Button
            size="lg"
            className="h-12 w-12 shrink-0 rounded-full"
            onClick={() => void send()}
            disabled={
              !activeSessionId || sending || !input.trim() || slashMenuOpen
            }
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Sheet open={proposalOpen} onOpenChange={setProposalOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col gap-0 overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{modalDraft?.name ?? "Automation"}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Review trigger, instructions, and delivery. Results go to SMS via Sendblue when the
              routine runs.
            </p>
          </SheetHeader>
          {modalDraft && (
            <div className="flex flex-col gap-4 py-4 px-1">
              <div>
                <Label>Trigger</Label>
                <p className="text-sm mt-1 font-mono bg-muted/60 rounded-md px-2 py-1.5">
                  {modalDraft.schedule_cron} ({modalDraft.timezone})
                </p>
              </div>
              <div>
                <Label>Instructions</Label>
                <Textarea
                  readOnly
                  className="mt-1 min-h-[140px] text-sm"
                  value={modalDraft.system_prompt}
                />
              </div>
              <div>
                <Label>Deliver results to</Label>
                <p className="text-sm mt-1 rounded-md border border-border/80 px-3 py-2 bg-muted/30">
                  SMS (Sendblue) — uses <code className="text-xs">SENDBLUE_TO_NUMBER</code> from
                  environment
                </p>
              </div>
            </div>
          )}
          <SheetFooter className="gap-2 sm:flex-row sm:justify-end border-t border-border/60 pt-4">
            <Button variant="outline" onClick={() => setProposalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRoutineFromModal()} disabled={savingRoutine}>
              {savingRoutine ? "Creating…" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
