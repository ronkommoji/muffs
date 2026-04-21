import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className={`${geist.className} h-full`}>
        <Providers>
          <div className="flex h-full min-h-0 w-full overflow-hidden">
            <AppSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="flex h-12 shrink-0 items-center border-b px-4 gap-2">
                <SidebarTrigger />
                <div className="ml-auto flex items-center">
                  <ThemeToggle />
                </div>
              </header>
              <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-6">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
