import { displayName, isFreeAiEnabled, type User } from "./repo";
import { orgAiFor } from "./minimax";

/** Client-safe view of a user — never exposes the password hash or the raw AI key. */
export type PublicUser = {
  id: number;
  email: string;
  isOwner: boolean;
  provider: string;
  model: string;
  hasKey: boolean;
  /** Owner has opened the built-in AI to everyone (global flag, same for all). */
  freeAiAccess: boolean;
  /** AI comes from the user's company (an org member inherits the org owner's access). */
  orgAi: boolean;
  /** This user can generate right now — own key, owner, company AI, or free access is on. */
  canUseAi: boolean;
  /** Language code content is generated in (see lib/languages). */
  language: string;
  /** Raw display name ('' if unset) and the resolved name used on certificates. */
  name: string;
  displayName: string;
  /** Email notification preferences (Settings → Email notifications). */
  notifyCertificates: boolean;
  notifyWeeklyReport: boolean;
};

export function publicUser(u: User): PublicUser {
  const freeAiAccess = isFreeAiEnabled();
  const hasKey = !!u.ai_key || !!u.is_owner; // owner uses the server's built-in keys
  const orgAi = !hasKey && !!orgAiFor(u.id);
  return {
    id: u.id,
    email: u.email,
    isOwner: !!u.is_owner,
    provider: u.ai_provider,
    model: u.ai_model,
    hasKey,
    freeAiAccess,
    orgAi,
    canUseAi: hasKey || orgAi || freeAiAccess,
    language: u.language || "en",
    name: u.name || "",
    displayName: displayName(u),
    notifyCertificates: u.notify_certificates !== 0,
    notifyWeeklyReport: u.notify_weekly_report !== 0,
  };
}
