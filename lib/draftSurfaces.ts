/**
 * The "Draft with AI" co-pilot's surface registry.
 *
 * One declarative entry per generation surface in the app. This module is
 * ISOMORPHIC — it imports nothing server-only, so both the API route (to build
 * the system prompt) and the client component (to label/collect the drafted
 * fields) read the SAME definitions. That keeps field keys from drifting.
 *
 * Dynamic option data (which employee, their level/language) is NOT here — it's
 * passed as free-text `context` at call time.
 */

export type DraftField = {
  /** Must match the parent form's state key so onApply can set it directly. */
  key: string;
  label: string;
  kind: "text" | "textarea" | "date";
  required?: boolean;
  /** Shown under the field in the review card; also fed to the model. */
  hint?: string;
};

export type DraftSurface = {
  id: string;
  /** Human noun used in the assistant's copy, e.g. "training assignment". */
  noun: string;
  /** Who the created thing is FOR — shapes whether SMART questions are about
   *  the user themselves or about an employee/team. */
  audience: "self" | "employee" | "team";
  /** The real form fields the finished draft fills. */
  fields: DraftField[];
  /** What a great result looks like — steers the model's drafting. */
  good: string;
  /** Surface-specific SMART emphasis (what "specific/measurable/…" means here). */
  smart: string;
};

export const SURFACES: Record<string, DraftSurface> = {
  assignment: {
    id: "assignment",
    noun: "training assignment for an employee",
    audience: "employee",
    fields: [
      { key: "title", label: "What they'll learn", kind: "text", required: true,
        hint: "A specific, concrete course title" },
      { key: "description", label: "Curriculum context for the AI", kind: "textarea",
        hint: "Level, focus areas, and what 'good' looks like" },
      { key: "note", label: "Note the employee sees", kind: "text",
        hint: "A short line of context or why it matters" },
      { key: "dueAt", label: "Due date", kind: "date",
        hint: "ISO date (YYYY-MM-DD) if there's a deadline" },
    ],
    good:
      "A sharply-scoped course the employee can actually complete: a concrete skill or " +
      "standard (not a vague topic), pitched at their real level, with a clear finish line.",
    smart:
      "Specific = the exact skill/standard/tool. Measurable = what 'passed' looks like " +
      "(a task they can do, a standard met). Achievable = their current level and time. " +
      "Relevant = their role and why now. Time-bound = the due date.",
  },

  program: {
    id: "program",
    noun: "reusable training program for a team",
    audience: "team",
    fields: [
      { key: "title", label: "Program title", kind: "text", required: true,
        hint: "The name of the reusable course" },
      { key: "description", label: "What it covers & who it's for", kind: "textarea",
        hint: "Audience, level, and the outcome the whole team should reach" },
    ],
    good:
      "A reusable, deployable course template with a clear audience and a single outcome " +
      "the whole team should reach — specific enough to generate a real curriculum from.",
    smart:
      "Specific = the exact competency the team gains. Measurable = the outcome that proves " +
      "it. Achievable = the typical starting level. Relevant = the role/context it serves. " +
      "Time-bound = the rough length (weeks) it should take.",
  },

  goal: {
    id: "goal",
    noun: "learning goal",
    audience: "self",
    fields: [
      { key: "title", label: "Goal", kind: "text", required: true,
        hint: "A concrete, outcome-shaped goal" },
      { key: "description", label: "Context", kind: "textarea",
        hint: "Current level, why it matters, time you can give it" },
    ],
    good:
      "An outcome-shaped goal (something you'll be able to DO), sized to real study time, " +
      "not a vague topic like 'learn math'.",
    smart:
      "Specific = the concrete outcome. Measurable = how you'll know you've got there. " +
      "Achievable = your current level and weekly time. Relevant = why it matters to you. " +
      "Time-bound = roughly by when.",
  },

  goalPlan: {
    id: "goalPlan",
    noun: "study plan for this goal",
    audience: "self",
    fields: [
      { key: "level", label: "Current level", kind: "text",
        hint: "One of: new / some / solid" },
      { key: "hoursPerWeek", label: "Hours per week", kind: "text",
        hint: "A realistic weekly number" },
      { key: "targetDate", label: "Target date", kind: "date",
        hint: "ISO date (YYYY-MM-DD) you're aiming for" },
      { key: "focus", label: "Focus", kind: "text",
        hint: "The specific outcome or angle you care about most" },
    ],
    good:
      "Honest intake that lets the coach build a realistic, outcome-first plan: a truthful " +
      "level, a weekly time you'll actually keep, and the specific thing you care about.",
    smart:
      "Specific = the focus/outcome. Measurable = the target date. Achievable = level + " +
      "hours/week you'll really sustain. Relevant = why this focus. Time-bound = the date.",
  },

  presentation: {
    id: "presentation",
    noun: "slide deck",
    audience: "self",
    fields: [
      { key: "topic", label: "Deck topic", kind: "textarea", required: true,
        hint: "The subject, the audience, and the one thing they should leave with" },
    ],
    good:
      "A focused deck brief: a clear subject, a named audience, and a single takeaway — " +
      "enough to build a tight 6–10 slide deck, not an everything-dump.",
    smart:
      "Specific = the subject. Measurable = the one takeaway. Achievable = fits ~6–10 slides. " +
      "Relevant = the audience it's for. Time-bound = the talk length if any.",
  },

  book: {
    id: "book",
    noun: "book",
    audience: "self",
    fields: [
      { key: "brief", label: "Book brief", kind: "textarea", required: true,
        hint: "Subject, who it's for, the tone, and what the reader gains" },
    ],
    good:
      "A brief that pins down subject, reader, tone, and the transformation the reader gets " +
      "— enough to outline 6–14 coherent chapters.",
    smart:
      "Specific = the subject/angle. Measurable = what the reader can do after. Achievable = " +
      "a realistic scope. Relevant = the intended reader. Time-bound = n/a (depth instead).",
  },

  studyGuide: {
    id: "studyGuide",
    noun: "study guide",
    audience: "self",
    fields: [
      { key: "topic", label: "What the guide covers", kind: "textarea", required: true,
        hint: "The specific material to revise" },
    ],
    good:
      "A tightly-scoped revision target — a specific body of material to master, not a broad " +
      "field. Narrow beats broad for a guide.",
    smart:
      "Specific = the exact material. Measurable = what you'll be able to recall/do. " +
      "Achievable = a scope you can revise in one pass. Relevant = why you're revising it. " +
      "Time-bound = the exam/deadline if any.",
  },
};

export function getSurface(id: string): DraftSurface | undefined {
  return SURFACES[id];
}
