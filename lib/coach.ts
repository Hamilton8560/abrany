import { complete, type ChatMessage } from "./minimax";

/**
 * The Abrany coach persona + structured plan generation.
 * The coach is realistic: it right-sizes goals to real study time, sets honest
 * timelines, proposes checkpoints, and never over-promises.
 */

export const COACH_SYSTEM = `You are Abrany's personal training coach — a sharp, encouraging, and above all REALISTIC learning coach.

Your job: help the user train their mind by turning ambitions into achievable practice. Principles:
- Break big goals ("learn all of math", "learn Spanish", "master an instrument") into digestible, sequenced milestones sized to real, sustainable study time.
- Be honest about timelines and effort. Mastery takes concentrated, repeated practice over weeks and months — say so, kindly. Never over-promise "fluent in 2 weeks".
- Meet the user where they are. Ask about current level, available time per week, and motivation when it matters.
- Favor concrete next actions over vague advice. Suggest checkpoints and periodic self-assessments so progress is measurable.
- Keep replies focused and warm. Use short paragraphs and the occasional list. Avoid filler.

You are talking inside a training app where the user also runs Pomodoro focus sessions, logs what they did, and tracks goals. Reference that context naturally when useful.`;

export function planSystem(): string {
  return `${COACH_SYSTEM}

You are now generating a STRUCTURED LEARNING PLAN. Respond with ONLY a single JSON object, no prose, no markdown fences. Shape:
{
  "title": "short plan title",
  "summary": "2-3 sentence realistic overview: scope, rough time horizon, how to use this plan",
  "items": [
    { "title": "milestone title", "detail": "what to do and how to know you're done", "estimate": "e.g. '1-2 weeks' or '4 sessions'" }
  ]
}
Rules: 5 to 9 items, ordered from foundation to advanced. Estimates must be realistic and honest. Keep detail to 1-2 sentences.`;
}

export type GeneratedPlan = {
  title: string;
  summary: string;
  items: { title: string; detail: string; estimate: string }[];
};

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export async function generatePlan(goal: {
  title: string;
  description: string;
}): Promise<GeneratedPlan> {
  const raw = await complete({
    system: planSystem(),
    maxTokens: 2048,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Build a realistic learning plan for this goal.\n\nGoal: ${goal.title}\n${
          goal.description ? `Details: ${goal.description}` : ""
        }`,
      },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Coach returned an unparseable plan");
  }

  const p = parsed as Partial<GeneratedPlan>;
  const items = Array.isArray(p.items) ? p.items : [];
  const clean: GeneratedPlan = {
    title: (p.title || goal.title).toString().slice(0, 120),
    summary: (p.summary || "").toString().slice(0, 600),
    items: items
      .filter((it) => it && typeof it.title === "string" && it.title.trim())
      .slice(0, 12)
      .map((it) => ({
        title: it.title.toString().slice(0, 160),
        detail: (it.detail || "").toString().slice(0, 400),
        estimate: (it.estimate || "").toString().slice(0, 40),
      })),
  };
  if (!clean.items.length) throw new Error("Coach returned an empty plan");
  return clean;
}

export { type ChatMessage };
