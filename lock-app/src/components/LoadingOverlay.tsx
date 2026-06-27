/**
 * Full-viewport translucent mask + centered spinner. Sits above everything and
 * captures pointer events, so the page is unresponsive while it's shown. Has no
 * hooks, so it works both as a Next `loading.tsx` fallback (route navigation) and
 * inside client components (e.g. while a server action is pending).
 */
export default function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="spinner" />
      <div className="overlay-label">{label}</div>
    </div>
  );
}
