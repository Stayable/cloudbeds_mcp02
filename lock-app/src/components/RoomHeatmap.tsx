import Link from "next/link";
import type { RoomChip } from "@/lib/rooms";

function chipClass(ch: RoomChip, base: string): string {
  return `${base} rc-${ch.status}${ch.fault ? ` rc-fault-${ch.fault}` : ""}`;
}
function chipTitle(ch: RoomChip): string {
  return `Room ${ch.label} · ${ch.status}${ch.fault ? ` · lock ${ch.fault === "issue" ? "offline" : "low battery"}` : ""}`;
}

/**
 * Room-status heatmap, two renderings of the same chip data:
 *  - "square"   → small colored squares, no labels, not individually clickable
 *                 (Portfolio cards: the whole card is the click target).
 *  - "numbered" → labeled squares; when `propertyId` is set each links to that
 *                 room's detail page (per-property Dashboard).
 */
export default function RoomHeatmap({
  chips, variant, propertyId,
}: {
  chips: RoomChip[];
  variant: "square" | "numbered";
  propertyId?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="roomwell">
      {chips.map((ch) =>
        variant === "numbered" && propertyId ? (
          <Link key={ch.roomId} href={`/p/${propertyId}/rooms/${ch.roomId}`} className={chipClass(ch, "roomchip")} title={chipTitle(ch)}>
            {ch.label}
          </Link>
        ) : (
          <span key={ch.roomId} className={chipClass(ch, variant === "numbered" ? "roomchip" : "roomsq")} title={chipTitle(ch)}>
            {variant === "numbered" ? ch.label : ""}
          </span>
        ),
      )}
    </div>
  );
}

/** Compact color legend, shared by Portfolio and the Dashboard rooms section. */
export function RoomHeatmapLegend() {
  return (
    <div className="legend">
      <span className="legend-item"><span className="legend-swatch rc-ok" />Occupied · ok</span>
      <span className="legend-item"><span className="legend-swatch rc-warning" />Occupied · low battery</span>
      <span className="legend-item"><span className="legend-swatch rc-issue" />Occupied · offline</span>
      <span className="legend-item"><span className="legend-swatch rc-vacant" />Vacant</span>
      <span className="legend-item"><span className="legend-swatch rc-no-lock" />No lock assigned</span>
      <span className="legend-item"><span className="legend-swatch rc-vacant rc-fault-issue" />Ring = lock fault (red offline · orange low batt)</span>
    </div>
  );
}
