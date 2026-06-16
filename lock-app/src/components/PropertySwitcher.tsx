"use client";
import { useRouter, usePathname } from "next/navigation";

interface Props {
  properties: { id: string; name: string }[];
  current?: string;
}

/** Section currently in the URL (rooms|devices|activity), default rooms. */
function sectionOf(pathname: string): string {
  const m = pathname.match(/\/p\/[^/]+\/([^/?]+)/);
  return m?.[1] ?? "rooms";
}

export default function PropertySwitcher({ properties, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const section = sectionOf(pathname);
  return (
    <select
      value={current ?? ""}
      onChange={(e) => router.push(`/p/${e.target.value}/${section}`)}
      style={{ width: "100%", padding: 8, borderRadius: 6, background: "#FDDA24", color: "#041E42", fontWeight: 700, border: "none" }}
    >
      <option value="" disabled>Select property…</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
