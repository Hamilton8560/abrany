/**
 * Spaced-repetition scheduling (SM-2 lite). The coach's "periodic follow-ups":
 * lessons you've studied resurface on an expanding schedule, and weak ones come
 * back sooner. Self-rated (Again / Hard / Good / Easy) — no LLM cost per review.
 */

export type Rating = "again" | "hard" | "good" | "easy";

export type SrsState = {
  interval: number; // days until next review
  ease: number; // ease factor (>= 1.3)
  reps: number; // successful reps in a row
};

const MIN_EASE = 1.3;

/** Apply a rating to the current SRS state and return the next state. */
export function schedule(state: SrsState, rating: Rating): SrsState {
  let { interval, ease, reps } = state;

  switch (rating) {
    case "again":
      reps = 0;
      ease = Math.max(MIN_EASE, ease - 0.2);
      interval = 0; // due again today
      break;
    case "hard":
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      reps += 1;
      break;
    case "good":
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.max(1, Math.round(interval * ease));
      reps += 1;
      break;
    case "easy":
      ease = ease + 0.15;
      if (reps === 0) interval = 4;
      else interval = Math.max(1, Math.round(interval * ease * 1.3));
      reps += 1;
      break;
  }

  return { interval, ease, reps };
}

/** Days from today until the next review, for display ("due today", "in 3d"). */
export function dueLabel(days: number): string {
  if (days <= 0) return "due today";
  if (days === 1) return "in 1 day";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)}w`;
  return `in ${Math.round(days / 30)}mo`;
}
