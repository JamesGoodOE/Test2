import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registry — AI Governance & Compliance",
  description:
    "Discover, register and evidence AI systems for EU AI Act, ISO 42001 and DORA compliance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
