import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stayable Lock App",
  description: "TTLock management — RISE8 / Stayable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
