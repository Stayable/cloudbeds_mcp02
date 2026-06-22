import { requireUserOrRedirect } from "@/lib/session-access";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#fff" }}>
      <TopBar user={user} />
      <div style={{ display: "flex", flex: 1 }}>{children}</div>
    </div>
  );
}
