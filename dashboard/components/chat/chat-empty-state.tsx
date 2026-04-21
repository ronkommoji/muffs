"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type ChatSuggestion = {
  id: string;
  label: string;
  /** Opens automation-creator session and prefills composer */
  mode: "automation" | "input_only";
  /** Text placed in the input (and sent is up to user) */
  draft: string;
};

const DEFAULT_SUGGESTIONS: ChatSuggestion[] = [
  {
    id: "routine",
    label: "Create a routine — build a scheduled automation",
    mode: "automation",
    draft:
      "I want a routine that runs on a schedule. Please help me describe what it should do and when it should run.",
  },
  {
    id: "calendar",
    label: "What's on my calendar today?",
    mode: "input_only",
    draft: "What's on my calendar today?",
  },
  {
    id: "inbox",
    label: "Summarize what I should focus on in my inbox",
    mode: "input_only",
    draft:
      "Look at my connected tools and summarize what I should focus on in my inbox today.",
  },
  {
    id: "remember",
    label: "Remember something for next time we chat",
    mode: "input_only",
    draft: "Please remember for future sessions: ",
  },
];

/** Shown when the session is already in Routine builder (automation_creator) — no redundant “open routine” row. */
const ROUTINE_BUILDER_SUGGESTIONS: ChatSuggestion[] = [
  {
    id: "rb-schedule",
    label: "Daily run — help me pick time and what to do",
    mode: "input_only",
    draft:
      "I want a daily scheduled routine. Help me choose a time and timezone, then describe what you should do each run so we can turn it into an automation.",
  },
  {
    id: "rb-weekly",
    label: "Weekly recap — same day/time each week",
    mode: "input_only",
    draft:
      "I want a weekly routine (same day and time each week). The recap should cover: ",
  },
  {
    id: "rb-sms",
    label: "Scheduled reminder — deliver the result by SMS",
    mode: "input_only",
    draft:
      "Set up a routine on a schedule where you run a small task and send me the result by SMS. I need: ",
  },
  {
    id: "rb-exact",
    label: "I have cron + instructions ready — draft the routine",
    mode: "input_only",
    draft:
      "Here's my automation:\n- When it should run (describe or cron if you know it): \n- What you should do each time: \nPlease turn this into a routine proposal.",
  },
];

interface ChatEmptyStateProps {
  isAutomationSession: boolean;
  onPickSuggestion: (s: ChatSuggestion) => void | Promise<void>;
}

export function ChatEmptyState({
  isAutomationSession,
  onPickSuggestion,
}: ChatEmptyStateProps) {
  const suggestions = isAutomationSession
    ? ROUTINE_BUILDER_SUGGESTIONS
    : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="relative mb-6 size-20 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted shadow-sm ring-1 ring-border/40">
        <Image
          src="/muffs-avatar.png"
          alt="Muffs"
          width={80}
          height={80}
          className="object-cover"
          priority
          sizes="80px"
        />
      </div>

      {isAutomationSession && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Routine builder
        </p>
      )}

      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl max-w-md">
        {isAutomationSession ? "Build your routine" : "Welcome to Muffs"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground max-w-md leading-relaxed">
        {isAutomationSession
          ? "Describe when it should run and what Muffs should do. Pick a starter or write your own below."
          : "Your personal AI companion. Pick a suggestion or type anything below."}
      </p>

      <div className="mt-10 w-full max-w-md">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isAutomationSession ? "Routine starters" : "Suggestions"}
        </p>
        <ul className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card/80 p-1 shadow-sm">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void onPickSuggestion(s)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors",
                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 leading-snug text-foreground">{s.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
