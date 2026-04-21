import { Suspense } from "react";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground p-8">Loading chat…</div>}>
      {children}
    </Suspense>
  );
}
