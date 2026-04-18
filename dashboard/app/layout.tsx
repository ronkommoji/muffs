import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Muffs",
  description: "Your personal AI companion dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${geist.className} h-full`}>
        <TooltipProvider>
          <SidebarProvider>
            <div className="flex h-full w-full">
              <AppSidebar />
              <div className="flex flex-1 flex-col min-h-screen min-w-0">
                <header className="flex h-12 items-center border-b px-4 shrink-0">
                  <SidebarTrigger />
                </header>
                <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden">{children}</main>
              </div>
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
