import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "valk-command",
  description: "PO Command Center for Valk Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
