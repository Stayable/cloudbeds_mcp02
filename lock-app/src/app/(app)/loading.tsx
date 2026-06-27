import LoadingOverlay from "@/components/LoadingOverlay";

/** Shown while an in-app route segment is loading (Next App Router Suspense fallback). */
export default function Loading() {
  return <LoadingOverlay label="Loading…" />;
}
