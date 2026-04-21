"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatSessionsProvider } from "@/contexts/chat-sessions-context";
import { cn } from "@/lib/utils";

function MainChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || (pathname?.startsWith("/chat/") ?? false);
  return (
    <main
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isChat ? "p-0" : "p-6"
      )}
    >
      {children}
    </main>
  );
}

function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <ChatSessionsProvider>
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <AppSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header className="flex h-12 shrink-0 items-center border-b border-border/60 px-4 gap-2 bg-background/80 backdrop-blur-sm">
            <SidebarTrigger />
            <div className="ml-auto flex items-center">
              <ThemeToggle />
            </div>
          </header>
          <MainChrome>{children}</MainChrome>
        </div>
      </div>
    </ChatSessionsProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [onboardingOk, setOnboardingOk] = useState<boolean | null>(null);

  const isOnboarding = pathname === "/onboarding" || pathname?.startsWith("/onboarding/");

  useEffect(() => {
    if (isOnboarding) {
      setOnboardingOk(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/status");
        const data = (await res.json()) as { completed?: boolean };
        if (!cancelled) setOnboardingOk(!!data.completed);
      } catch {
        if (!cancelled) setOnboardingOk(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnboarding]);

  useEffect(() => {
    if (onboardingOk === false && !isOnboarding) {
      router.replace("/onboarding");
    }
  }, [onboardingOk, isOnboarding, router]);

  if (isOnboarding) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    );
  }

  if (onboardingOk === false || onboardingOk === null) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <AppChrome>{children}</AppChrome>
    </Suspense>
  );
}
