import { usersDueWeeklyReport, weeklyDigest, markWeeklyReportSent, displayName } from "./repo";
import { sendWeeklyReportEmail } from "./email";
import { appBaseUrl } from "./urls";

/**
 * Weekly progress digest emails. Same self-scheduling pattern as lib/worker.ts:
 * a process-global interval, unref'd so it never keeps the server alive on its
 * own, bootstrapped lazily (ensureWeeklyReportScheduler) the first time an
 * authenticated page renders.
 *
 * Checked hourly rather than computed on a fixed weekly clock: usersDueWeeklyReport()
 * selects anyone opted in whose last email was 7+ days ago (or never), so it's
 * self-correcting after downtime and naturally spreads sends across whoever signed
 * up on whatever day — no cron string to get wrong.
 */

const CHECK_MS = 60 * 60 * 1000; // hourly

type Global = typeof globalThis & { __abranyWeeklyTimer?: ReturnType<typeof setInterval> };
const g = globalThis as Global;

async function tick() {
  const due = usersDueWeeklyReport();
  for (const u of due) {
    const stats = weeklyDigest(u.id);
    try {
      await sendWeeklyReportEmail({
        to: u.email,
        name: displayName(u),
        focusMin: Math.round(stats.focusSec / 60),
        sessionCount: stats.sessionCount,
        sectionsCompleted: stats.sectionsCompleted,
        certificatesEarned: stats.certificatesEarned,
        appUrl: `${appBaseUrl()}/app`,
      });
    } finally {
      // mark sent even on failure — avoids hammering a bad address hourly; a
      // real fix means opted-in users get next week's issue, not a retry storm
      markWeeklyReportSent(u.id);
    }
  }
}

export function ensureWeeklyReportScheduler(): void {
  if (g.__abranyWeeklyTimer) return;
  g.__abranyWeeklyTimer = setInterval(() => {
    tick().catch((err) => console.error("[weeklyReport] tick failed:", err));
  }, CHECK_MS);
  g.__abranyWeeklyTimer.unref?.();
  // also run once shortly after boot, so a long-idle server doesn't wait a full hour
  setTimeout(() => tick().catch((err) => console.error("[weeklyReport] initial tick failed:", err)), 15_000).unref?.();
}
