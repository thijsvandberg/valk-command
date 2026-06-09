import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque, Space_Mono } from "next/font/google";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

// Console-style monospace used for the text-only Bridge wordmark.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Bridge",
    default: "Bridge",
  },
  description: "PO Command Center for Valk Platform",
  // Favicon + apple icon are generated dynamically by src/app/icon.tsx and
  // src/app/apple-icon.tsx (env-coloured), so no static icon refs here.
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1316",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${bricolage.variable} ${spaceMono.variable}`}>
        <Script id="theme-init" strategy="beforeInteractive" src="/theme-init.js" />
        <ClerkProvider>
          <ThemeProvider>
            <ServiceWorkerRegistrar />
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
