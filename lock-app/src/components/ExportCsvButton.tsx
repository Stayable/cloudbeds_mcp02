"use client";

/** Downloads a pre-built CSV string as a file. The server builds the CSV (so the
 *  export matches exactly what's rendered, including any active filter); this just
 *  triggers the browser download. */
export default function ExportCsvButton({
  csv, filename, label = "Export CSV",
}: {
  csv: string;
  filename: string;
  label?: string;
}) {
  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="btn btn-navy" style={{ height: 34 }} onClick={download}>
      {label}
    </button>
  );
}
