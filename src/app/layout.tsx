import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://field-note-swart.vercel.app"),
  title: { default: "Fieldnote Atlas", template: "%s · Fieldnote Atlas" },
  description:
    "Issue intake and work-order tracking for small facilities teams: from a rough note to a resolved issue, with every decision visible.",
};

export const viewport: Viewport = {
  themeColor: "#f5f3ed",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
