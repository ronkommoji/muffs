"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";

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
  preview: string | null;
  preview_role: string | null;
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
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const lastAssistantIdRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/messages");
    const data = await res.json();
    setSessions(data);
    if (!activeSession && data.length > 0) {
      setActiveSession(data[0].id);
    }
  }, [activeSession]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/messages?session_id=${sessionId}`);
    const data: Message[] = await res.json();
    setMessages(data);
    // Turn off typing indicator when a new assistant message arrives
    const lastAssistant = [...data].reverse().find((m) => m.role === "assistant");
    if (lastAssistant && lastAssistant.id !== lastAssistantIdRef.current) {
      lastAssistantIdRef.current = lastAssistant.id;
      setIsTyping(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 3000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    if (activeSession) {
      loadMessages(activeSession);
      const interval = setInterval(() => loadMessages(activeSession), 3000);
      return () => clearInterval(interval);
    }
  }, [activeSession, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function newSession() {
    await fetch("/api/sessions", { method: "POST" });
    await loadSessions();
  }

  async function send() {
    if (!input.trim() || !activeSession || sending) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    setIsTyping(true);
    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: activeSession, content }),
    }).catch(() => {});
    setSending(false);
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Session list */}
      <div className="w-64 flex flex-col border rounded-lg overflow-hidden shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Sessions</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newSession}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b text-sm hover:bg-muted transition-colors",
                activeSession === s.id && "bg-muted"
              )}
            >
              <div className="font-mono text-xs text-muted-foreground truncate">
                {s.id}
              </div>
              {s.preview && (
                <div className="text-xs text-foreground mt-0.5 truncate">
                  {s.preview}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(s.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
        <ScrollArea className="flex-1 p-4">
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
                {m.content}
                <div className="text-xs opacity-60 mt-1">
                  {new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </ScrollArea>

        <div className="border-t p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Muffs..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            disabled={!activeSession || sending}
          />
          <Button onClick={send} disabled={!activeSession || sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
