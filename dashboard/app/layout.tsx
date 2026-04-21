import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

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
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
