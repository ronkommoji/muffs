"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart2,
  CalendarClock,
  Plus,
  Plug,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ChatSessionList } from "@/components/chat-session-list";
import { useChatSessions } from "@/contexts/chat-sessions-context";

const navItems = [
  { title: "Overview", url: "/overview", icon: BarChart2 },
  { title: "Integrations", url: "/integrations", icon: Plug },
  { title: "Routines", url: "/routines", icon: CalendarClock },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [title, setTitle] = useState("Muffs");
  const { newChat } = useChatSessions();

  useEffect(() => {
    fetch("/api/workspace/profile")
      .then((res) => res.json())
      .then((data: { assistantName?: string }) => {
        const n = (data.assistantName ?? "").trim();
        if (n) setTitle(n);
      })
      .catch(() => {});
  }, []);

  return (
    <Sidebar className="border-r border-border/60">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted ring-1 ring-border/30">
            <Image
              src="/muffs-avatar.png"
              alt=""
              width={36}
              height={36}
              className="object-cover"
              sizes="36px"
            />
          </div>
          <span className="min-w-0 flex-1 text-lg font-semibold tracking-tight truncate">
            {title}
          </span>
        </div>
        <Button
          className="mt-3 w-full justify-center gap-2 rounded-full shadow-sm"
          size="sm"
          onClick={() => void newChat("general")}
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col gap-0 px-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={active}
                      className="flex items-center gap-2 rounded-lg"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 px-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Chats
            </span>
          </div>
          <ChatSessionList />
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/60 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={pathname.startsWith("/settings")}
              className="rounded-lg"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
