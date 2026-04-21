"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <SidebarProvider className="h-svh min-h-0 overflow-hidden">
          {children}
        </SidebarProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
