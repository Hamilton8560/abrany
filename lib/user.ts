import type { User } from "./repo";

/** Client-safe view of a user — never exposes the password hash or the raw AI key. */
export type PublicUser = {
  id: number;
  email: string;
  isOwner: boolean;
  provider: string;
  model: string;
  hasKey: boolean;
};

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    isOwner: !!u.is_owner,
    provider: u.ai_provider,
    model: u.ai_model,
    hasKey: !!u.ai_key || !!u.is_owner, // owner uses the server's built-in keys
  };
}
