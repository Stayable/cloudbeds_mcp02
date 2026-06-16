import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sessionCan } from "@/lib/session-access";
import { toActivityRow, filterEvents, toCsv } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { propertyId: string } }) {
  const user = await getSession();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!sessionCan(user, "activity.export", params.propertyId)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const events = await prisma.eventLog.findMany({ where: { propertyId: params.propertyId }, orderBy: { createdAt: "desc" }, take: 5000 });
  const rows = filterEvents(events.map(toActivityRow), {
    search: url.searchParams.get("search") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
  });

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${params.propertyId}.csv"`,
    },
  });
}
