"use client";

import { usePathname } from "next/navigation";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isChat =
    pathname === "/chat" || (pathname?.startsWith("/chat/") ?? false);
  const isRoutines =
    pathname === "/routines" ||
    (pathname?.startsWith("/routines/") ?? false);

  if (isChat || isRoutines) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      {children}
    </div>
  );
}
