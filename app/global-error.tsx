"use client"; // Error boundaries must be Client Components

/**
 * Last-resort boundary: catches anything the root layout throws (including a
 * hydration/translation crash that slipped past the DOM guard) so users get a
 * clear recovery action instead of a blank, stuck-loading page. It replaces the
 * root layout when active, so it must ship its own <html>/<body> and can't rely
 * on the app's stylesheet — everything here is inline.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0f",
          color: "#f5f5f7",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.12em", color: "#ff5a3c" }}>
            ABRANY
          </div>
          <h2 style={{ margin: "14px 0 8px", fontSize: 22, fontWeight: 800 }}>
            Something interrupted the page
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: "#a1a1aa" }}>
            This can happen if a browser translation ran mid-render. Your data is safe — reload to
            continue.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "11px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              background: "#ff5a3c",
              color: "#0b0b0f",
            }}
          >
            Reload
          </button>
          {error?.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#52525b" }}>ref {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
