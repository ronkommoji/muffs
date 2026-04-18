"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  CalendarClock,
  MessageSquare,
  Plug,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Overview", url: "/overview", icon: BarChart2 },
  { title: "Integrations", url: "/integrations", icon: Plug },
  { title: "Routines", url: "/routines", icon: CalendarClock },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <span className="text-lg font-semibold tracking-tight">Muffs</span>
        <span className="text-xs text-muted-foreground">your AI companion</span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={active}
                      className="flex items-center gap-2"
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
      </SidebarContent>
    </Sidebar>
  );
}
