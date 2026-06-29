"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Live updates without a manual reload. Polls /api/state-version (a cheap DB-only
 * signature of the property's occupancy + codes + lock health) and calls
 * router.refresh() ONLY when it changes — so a guest checking in (room flips
 * green) or a room change (code/occupancy moves) shows up on its own, while
 * steady-state polling stays cheap and never touches Cloudbeds. Pauses while the
 * tab is hidden to avoid needless work.
 */
export default function AutoRefresh({ propertyId, intervalMs = 12000 }: { propertyId: string; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/state-version?propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" });
          if (res.ok) {
            const { v } = (await res.json()) as { v: string };
            if (last.current === null) last.current = v;
            else if (v !== last.current) {
              last.current = v;
              router.refresh();
            }
          }
        } catch {
          /* transient network/route error — retry next tick */
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }

    timer = setTimeout(tick, intervalMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [propertyId, intervalMs, router]);

  return null;
}
