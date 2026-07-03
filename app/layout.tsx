import type { Metadata } from "next";
import { connection } from "next/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import AuthGate from "./components/AuthGate";
import ClickSpark from "@/components/ui/ClickSpark";
import { BackendStatusProvider } from "@/lib/backend-store";

export const metadata: Metadata = {
  title: "E-MATHTOCO",
  description: "Essay Mathematics Auto Correction",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  return (
    <html
      lang="id"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="emathoco-theme">
          <BackendStatusProvider>
            <AuthGate>
              <ClickSpark
                sparkColor="#06b6d4"
                sparkSize={12}
                sparkRadius={20}
                sparkCount={8}
                duration={500}
                className="flex flex-col flex-1 min-h-full"
              >
                {children}
              </ClickSpark>
            </AuthGate>
          </BackendStatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
