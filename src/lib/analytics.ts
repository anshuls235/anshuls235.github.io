import type { PublicConfig } from "./content";
export type EventName =
  | "page_view"
  | "project_view"
  | "project_link"
  | "cv_download"
  | "contact_action"
  | "social_click";
export interface EventDetails {
  project_id?: string;
  link_id?: string;
  platform?: string;
  path?: string;
}
export function privacyEnabled(
  nav: Pick<Navigator, "doNotTrack"> & {
    globalPrivacyControl?: boolean;
  } = navigator,
): boolean {
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}
export function createAnalytics(config: PublicConfig | null, enabled: boolean) {
  let session = "";
  let lastEvent = 0;
  let count = 0;
  let sessionExpires = 0;
  return (event: EventName, details: EventDetails = {}) => {
    if (!enabled || !config || privacyEnabled() || count >= 100) return;
    const now = Date.now();
    if (now - lastEvent < 200) return;
    lastEvent = now;
    count++;
    try {
      if (!session || now > sessionExpires) {
        session = crypto.randomUUID();
        sessionExpires = now + 30 * 60 * 1000;
      }
      const params = new URLSearchParams(location.search);
      const utm: Record<string, string> = {};
      for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
        const value = params.get(key);
        if (value && /^[a-zA-Z0-9_-]{1,64}$/.test(value)) utm[key] = value;
      }
      let referrer: string | undefined;
      try {
        if (document.referrer) {
          const url = new URL(document.referrer);
          if (url.origin !== location.origin) referrer = url.hostname;
        }
      } catch {
        /* Invalid referrers are ignored. */
      }
      const payload = {
        event_id: crypto.randomUUID(),
        session_id: session,
        event,
        path: details.path ?? location.pathname,
        ...details,
        ...(referrer ? { referrer } : {}),
        ...(Object.keys(utm).length ? { utm } : {}),
      };
      void fetch(`${config.url}/functions/v1/analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        keepalive: true,
        signal: AbortSignal.timeout(2500),
      }).catch(() => {});
    } catch {
      /* Navigation and rendering never depend on analytics. */
    }
  };
}
