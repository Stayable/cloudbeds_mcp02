import { requireUserOrRedirect } from "@/lib/session-access";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { propertyId: string };
}) {
  const user = await requireUserOrRedirect();
  return (
    <div style={{ display: "flex", flex: 1 }}>
      <Sidebar user={user} currentProperty={params.propertyId} />
      <div style={{ flex: 1, padding: 24 }}>{children}</div>
    </div>
  );
}
