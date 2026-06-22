import { requireUserOrRedirect } from "@/lib/session-access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#fff" }}>
      {/* TopBar added in Task 7 */}
      <div style={{ display: "flex", flex: 1 }}>{children}</div>
    </div>
  );
}
