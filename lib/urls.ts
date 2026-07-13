/**
 * Public base URL of the app. Defaults to the current Railway URL; set APP_URL
 * once a custom domain is chosen and it overrides everywhere the server needs an
 * absolute link. Client-rendered pages should prefer `window.location.origin`
 * (via `clientBaseUrl`) so links always match the domain actually being used.
 */
export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://abrany-production.up.railway.app").replace(/\/+$/, "");
}

/** The origin to build share/verify links from — the live domain on the client. */
export function clientBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return appBaseUrl();
}
