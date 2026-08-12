import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Fonts are SELF-HOSTED (src/fonts, latin subset) rather than fetched by
 * next/font/google at build time. next/font/google downloads from
 * fonts.googleapis.com during the build and caches the result in .next/cache —
 * so a build with a cold cache depends on that fetch succeeding. When the Vercel
 * build cache expired (2026-08-13, five weeks after the previous deploy) the
 * fetch returned something the loader couldn't parse and the build died with
 * "An error occurred in `next/font`. TypeError: Cannot read properties of null".
 * Local files make the build hermetic — same faces, no network, no cache
 * dependency. Variable names are unchanged, so globals.css needs no edits.
 */
const display = localFont({
  variable: "--font-display",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  src: [
    { path: "../fonts/space-grotesk-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/space-grotesk-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/space-grotesk-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/space-grotesk-700.woff2", weight: "700", style: "normal" },
  ],
});

const body = localFont({
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  src: [
    { path: "../fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
});

const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
  src: [
    { path: "../fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Stayable Lock App",
  description: "TTLock access management — RISE8 / Stayable",
  icons: { icon: "/brand/favicon.webp" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
