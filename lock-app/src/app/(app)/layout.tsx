import { requireUserOrRedirect } from "@/lib/session-access";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopBar user={user} />
      <div className="demo-strip">
        <strong>DEMO DATA</strong> — locks shown are placeholders. Live status appears once locks are registered to the Stayable TTLock account.
      </div>
      <div style={{ display: "flex", flex: 1 }}>{children}</div>
    </div>
  );
}
