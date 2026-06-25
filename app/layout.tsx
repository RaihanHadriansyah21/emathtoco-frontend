import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import AuthGate from "./components/AuthGate";
import ClickSpark from "@/components/ui/ClickSpark";
import { BackendStatusProvider } from "@/lib/backend-store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "E-MATHTOCO",
  description: "Essay Mathematics Auto Correction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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

