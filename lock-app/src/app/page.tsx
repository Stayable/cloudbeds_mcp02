import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <main style={{ padding: 24 }}>
      <h1>Signed in as {user.email}</h1>
      <p>Role: {user.roleName} · scope: {user.scopeType}</p>
    </main>
  );
}
