export const dynamic = "force-dynamic";

/** Property pages render inside the global app shell (sidebar + topbar live in
 *  the (app) layout). This layout is a passthrough; the sidebar derives the
 *  active property from the path. */
export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
