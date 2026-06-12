export const metadata = {
  title: "Stayable Lock Middleware",
  description: "Headless TTLock <-> Cloudbeds webhook service — RISE8 / Stayable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
