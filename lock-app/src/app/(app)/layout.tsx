import { requireUserOrRedirect } from "@/lib/session-access";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, padding: 24, background: "#fff" }}>{children}</main>
    </div>
  );
}
