export default function Forbidden({ what }: { what?: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: "#041E42" }}>Not authorized</h1>
      <p>You don&apos;t have permission to view {what ?? "this page"}.</p>
    </div>
  );
}
