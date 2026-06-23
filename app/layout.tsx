import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { VaultAuthRedirect } from "@/components/providers/VaultAuthRedirect";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "BillFlow",
  description: "Internal AI spend tracking",
  themeColor: "#353E5A",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} font-sans antialiased`} style={{ backgroundColor: "var(--bg-primary-solid)" }}>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
          <VaultAuthRedirect />
          <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary-solid)" }}>
            <div className="flex min-h-screen mx-auto" style={{ backgroundColor: "var(--bg-secondary_subtle)", borderRadius: "12px" }}>
              <Sidebar />
              <main className="flex-1 overflow-auto pt-14 md:pt-0" style={{ backgroundColor: "var(--bg-primary)" }}>
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
