import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunaby Control Center",
  description:
    "Operational dashboard for Lunaby AI Discord bot with modern UI design.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="gradient-bg min-h-screen">
        {children}
      </body>
    </html>
  );
}
