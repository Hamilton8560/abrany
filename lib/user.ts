import { isFreeAiEnabled, type User } from "./repo";

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
  /** This user can generate right now — own key, owner, or free access is on. */
  canUseAi: boolean;
  /** Language code content is generated in (see lib/languages). */
  language: string;
};

export function publicUser(u: User): PublicUser {
  const freeAiAccess = isFreeAiEnabled();
  const hasKey = !!u.ai_key || !!u.is_owner; // owner uses the server's built-in keys
  return {
    id: u.id,
    email: u.email,
    isOwner: !!u.is_owner,
    provider: u.ai_provider,
    model: u.ai_model,
    hasKey,
    freeAiAccess,
    canUseAi: hasKey || freeAiAccess,
    language: u.language || "en",
  };
}
